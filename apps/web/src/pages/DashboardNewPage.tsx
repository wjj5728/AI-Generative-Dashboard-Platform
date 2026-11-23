import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircleOutlined,
  LoadingOutlined,
  SaveOutlined,
  StopOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Empty,
  Input,
  Progress,
  Radio,
  Space,
  Tag,
  Typography,
  message,
} from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createSpecStreamCompiler } from '@json-render/core';
import type {
  GenerateDashboardRequest,
  GenerateStreamMetaEvent,
  JsonRenderSpec,
  PageDocument,
  ValidationReport,
} from '@ai-dashboard/contracts';
import { apiClient, ApiClientError } from '../api/client';
import { DebugInspector } from '../components/DebugInspector';
import {
  DashboardRenderer,
  type DashboardRuntimeSnapshot,
} from '../renderer/DashboardRenderer';

const EXAMPLE_PROMPTS: Array<{
  label: string;
  scenario: GenerateDashboardRequest['scenario'];
  prompt: string;
}> = [
  {
    label: '游戏广告投放看板',
    scenario: 'game-ads',
    prompt:
      '生成一个游戏广告投放数据看板，包含总消耗、收入、ROI、新增用户、每日趋势、充值区间分布、渠道占比和数据明细。',
  },
  {
    label: '买量流量分析看板',
    scenario: 'traffic-analysis',
    prompt:
      '生成一个流量渠道分析看板，重点对比各投放渠道消耗与收入、渠道流量占比、获客成本 CPA、转化漏斗和渠道明细。',
  },
  {
    label: '商业化收入分析看板',
    scenario: 'revenue-analysis',
    prompt:
      '生成一个游戏收入分析看板，包含充值收入、付费用户数、ARPU、ARPPU、每日收入走势和各充值档位金额与人数分布。',
  },
  {
    label: '横向 Row 并排看板',
    scenario: 'auto',
    prompt:
      '生成一个流量渠道分析看板，使用横向并排布局展示各渠道对比、流量占比和转化漏斗。',
  },
  {
    label: '纵向 Column 堆叠看板',
    scenario: 'auto',
    prompt:
      '生成一个游戏收入分析看板，采用纵向竖排堆叠布局从上到下依次展示核心收入指标、趋势图与充值档位分布。',
  },
];

interface StreamFeedItem {
  id: string;
  kind: 'stage' | 'element';
  text: string;
}

export const DashboardNewPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const abortRef = useRef<AbortController | null>(null);
  const rafRef = useRef<number | null>(null);

  const [prompt, setPrompt] = useState(EXAMPLE_PROMPTS[0].prompt);
  const [scenario, setScenario] =
    useState<GenerateDashboardRequest['scenario']>('auto');
  const [streamDelayMs, setStreamDelayMs] = useState<number>(260);
  const [generatedDoc, setGeneratedDoc] = useState<PageDocument | null>(null);
  const [providerName, setProviderName] = useState<string>('');
  const [validation, setValidation] = useState<ValidationReport | null>(null);
  const [runtimeSnapshot, setRuntimeSnapshot] =
    useState<DashboardRuntimeSnapshot | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // SSE streaming state
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamProgress, setStreamProgress] = useState(0);
  const [streamStageText, setStreamStageText] = useState('');
  const [streamFeed, setStreamFeed] = useState<StreamFeedItem[]>([]);
  const [streamPatches, setStreamPatches] = useState<string[]>([]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  const handleStopStream = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setIsStreaming(false);
    setStreamStageText('已手动中止流式生成');
    message.info('已中止流式生成');
  };

  const handleGenerateStream = async () => {
    if (!prompt.trim() || isStreaming) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsStreaming(true);
    setErrorMsg(null);
    setValidation(null);
    setGeneratedDoc(null);
    setStreamProgress(5);
    setStreamStageText('正在建立 SSE 流式连接...');
    setStreamFeed([]);
    setStreamPatches([]);

    const compiler = createSpecStreamCompiler<JsonRenderSpec>({
      root: '',
      elements: {},
    });
    let docMeta: GenerateStreamMetaEvent | null = null;
    let latestCompiledUi: JsonRenderSpec = { root: '', elements: {} };

    const flushCompiledSpec = () => {
      rafRef.current = null;
      if (!docMeta || !latestCompiledUi.root) return;
      // Official useUIStream pattern: shallow top-level copy so @json-render/react's
      // useElementSignatures + React.memo skips unchanged subtrees without structuredClone
      setGeneratedDoc({
        contractVersion: docMeta.contractVersion,
        catalogVersion: docMeta.catalogVersion,
        title: docMeta.title,
        description: docMeta.description,
        variables: docMeta.variables,
        queries: docMeta.queries,
        ui: {
          root: latestCompiledUi.root,
          elements: { ...latestCompiledUi.elements },
        },
      });
    };

    const scheduleSpecFlush = () => {
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(flushCompiledSpec);
    };

    try {
      await apiClient.generateDashboardStream(
        { prompt, scenario, streamDelayMs },
        {
          onStage: (evt) => {
            setStreamProgress(evt.progress);
            setStreamStageText(evt.message);
            setStreamFeed((prev) => [
              { id: `stage-${evt.step}-${prev.length}`, kind: 'stage', text: evt.message },
              ...prev.slice(0, 24),
            ]);
          },
          onMeta: (meta) => {
            docMeta = meta;
            setProviderName(meta.provider);
            setGeneratedDoc({
              contractVersion: meta.contractVersion,
              catalogVersion: meta.catalogVersion,
              title: meta.title,
              description: meta.description,
              variables: meta.variables,
              queries: meta.queries,
              ui: { root: '', elements: {} },
            });
          },
          onPatch: (evt) => {
            const line = JSON.stringify(evt.patch);
            setStreamPatches((prev) => [...prev, line]);
            const { result } = compiler.push(`${line}\n`);
            latestCompiledUi = result;

            const pct = Math.min(
              92,
              35 + Math.round((evt.index / Math.max(1, evt.total)) * 57),
            );
            setStreamProgress(pct);

            if (evt.patch.path.startsWith('/elements/') && !evt.patch.path.endsWith('/-')) {
              setStreamStageText(
                `流式构建组件 [${evt.index}/${evt.total}]：${evt.componentType ?? ''} (${evt.elementId ?? ''})`,
              );
              setStreamFeed((prev) => [
                {
                  id: `el-${evt.index}`,
                  kind: 'element',
                  text: `+ ${evt.componentType ?? 'Element'} · ${evt.elementId ?? ''}`,
                },
                ...prev.slice(0, 24),
              ]);
            }

            // Batch DOM commits per animation frame (merges element creation + parent link)
            if (docMeta && result.root) {
              scheduleSpecFlush();
            }
          },
          onComplete: (evt) => {
            if (rafRef.current !== null) {
              cancelAnimationFrame(rafRef.current);
              rafRef.current = null;
            }
            setProviderName(evt.provider);
            setGeneratedDoc(evt.pageDocument);
            setValidation(evt.validation);
            setStreamProgress(100);
            setStreamStageText('SSE 流式生成完成，已通过服务端校验');
            message.success(`SSE 流式生成完成（Provider: ${evt.provider}）`);
          },
          onError: (evt) => {
            setErrorMsg(evt.message);
            if (evt.details) {
              setValidation(evt.details as ValidationReport);
            }
          },
        },
        controller.signal,
      );
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      if (err instanceof ApiClientError && err.details) {
        setValidation(err.details as ValidationReport);
      }
      const text = err instanceof Error ? err.message : '流式生成失败';
      setErrorMsg(text);
    } finally {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      setIsStreaming(false);
      abortRef.current = null;
    }
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!generatedDoc) throw new Error('请先生成 Dashboard');
      return apiClient.createDashboard({
        pageDocument: generatedDoc,
        changeDescription: `AI generated from prompt: ${prompt.slice(0, 80)}`,
      });
    },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['dashboards'] });
      message.success(`已保存 Dashboard (${saved.id})，正在打开独立链接...`);
      navigate(`/dashboards/${saved.id}`);
    },
    onError: (err: Error) => {
      message.error(`保存失败：${err.message}`);
    },
  });

  const canSave = Boolean(generatedDoc && validation?.valid && !isStreaming);

  return (
    <div>
      <div className="page-header-bar">
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            AI Generative Dashboard Studio
          </Typography.Title>
          <Typography.Text type="secondary">
            输入自然语言需求 → 服务端通过 SSE 流式推送 RFC 6902 SpecStream Patch → json-render 实时渐进渲染与数据绑定
          </Typography.Text>
        </div>
        <Space>
          {isStreaming && (
            <Tag color="processing" icon={<LoadingOutlined />} data-testid="sse-streaming-badge">
              SSE 流式输出中 ({streamProgress}%)
            </Tag>
          )}
          {providerName && <Tag color="purple">Provider: {providerName}</Tag>}
          <Button
            type="primary"
            icon={<SaveOutlined />}
            disabled={!canSave}
            loading={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
            data-testid="btn-save-dashboard"
          >
            保存并生成独立 URL
          </Button>
        </Space>
      </div>

      <div className="split-workspace">
        {/* Left Control Column */}
        <div className="bi-card" style={{ position: 'sticky', top: 74 }}>
          <div className="bi-card-header">
            <div>
              <div className="bi-card-title">自然语言流式生成 (SSE)</div>
              <div className="bi-card-subtitle">
                默认 Mock AI 模拟 SSE 逐组件流式推送，无需 API Key
              </div>
            </div>
          </div>

          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <div>
              <div className="bi-filter-label" style={{ marginBottom: 6 }}>
                快捷示例 Prompt：
              </div>
              <Space wrap size={[6, 6]}>
                {EXAMPLE_PROMPTS.map((item) => (
                  <Button
                    key={item.label}
                    size="small"
                    disabled={isStreaming}
                    onClick={() => {
                      setPrompt(item.prompt);
                      setScenario(item.scenario);
                    }}
                  >
                    {item.label}
                  </Button>
                ))}
              </Space>
            </div>

            <div>
              <div className="bi-filter-label" style={{ marginBottom: 6 }}>
                Mock 场景模式：
              </div>
              <Radio.Group
                size="small"
                optionType="button"
                disabled={isStreaming}
                value={scenario}
                onChange={(e) => setScenario(e.target.value)}
                options={[
                  { label: '自动识别', value: 'auto' },
                  { label: '游戏投放', value: 'game-ads' },
                  { label: '流量分析', value: 'traffic-analysis' },
                  { label: '收入分析', value: 'revenue-analysis' },
                ]}
              />
            </div>

            <div>
              <div className="bi-filter-label" style={{ marginBottom: 6 }}>
                SSE 流式输出速率：
              </div>
              <Radio.Group
                size="small"
                optionType="button"
                disabled={isStreaming}
                value={streamDelayMs}
                onChange={(e) => setStreamDelayMs(Number(e.target.value))}
                options={[
                  { label: '慢速演示 (420ms)', value: 420 },
                  { label: '舒缓默认 (260ms)', value: 260 },
                  { label: '快速 (100ms)', value: 100 },
                ]}
              />
            </div>

            <div>
              <div className="bi-filter-label" style={{ marginBottom: 6 }}>
                业务需求描述：
              </div>
              <Input.TextArea
                rows={4}
                disabled={isStreaming}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="例如：生成一个游戏广告投放数据看板，包含总消耗、收入、ROI、新增用户、每日趋势、充值区间分布、渠道占比和数据明细。"
                data-testid="prompt-input"
              />
            </div>

            <Space style={{ width: '100%' }} direction="vertical" size="small">
              <Button
                type="primary"
                size="large"
                block
                icon={<ThunderboltOutlined />}
                loading={isStreaming}
                disabled={!prompt.trim()}
                onClick={() => void handleGenerateStream()}
                data-testid="btn-generate-dashboard"
              >
                {isStreaming ? 'SSE 流式生成中...' : '流式生成 Dashboard (SSE)'}
              </Button>
              {isStreaming && (
                <Button
                  danger
                  block
                  size="small"
                  icon={<StopOutlined />}
                  onClick={handleStopStream}
                  data-testid="btn-stop-stream"
                >
                  停止流式输出
                </Button>
              )}
            </Space>

            {(isStreaming || streamFeed.length > 0) && (
              <div
                style={{
                  background: 'rgba(6, 10, 20, 0.72)',
                  border: '1px solid rgba(56, 189, 248, 0.2)',
                  borderRadius: 10,
                  padding: '10px 12px',
                }}
                data-testid="sse-progress-panel"
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 4,
                    fontSize: 12,
                  }}
                >
                  <span style={{ color: '#38bdf8', fontWeight: 600 }}>
                    SSE SpecStream 实时进度
                  </span>
                  <span className="bi-tabular" style={{ color: '#94a3b8' }}>
                    {streamPatches.length} patches
                  </span>
                </div>
                <Progress
                  percent={streamProgress}
                  size="small"
                  status={errorMsg ? 'exception' : isStreaming ? 'active' : 'success'}
                  strokeColor={{ from: '#0ea5e9', to: '#34d399' }}
                />
                {streamStageText && (
                  <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                    {streamStageText}
                  </div>
                )}
                {streamFeed.length > 0 && (
                  <div
                    style={{
                      marginTop: 8,
                      maxHeight: 136,
                      overflowY: 'auto',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    {streamFeed.map((item) => (
                      <div
                        key={item.id}
                        style={{
                          fontSize: 11,
                          fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                          color: item.kind === 'element' ? '#7dd3fc' : '#94a3b8',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {item.text}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {errorMsg && (
              <Alert
                type="error"
                showIcon
                message="流式生成失败"
                description={errorMsg}
              />
            )}

            {generatedDoc && validation?.valid && !isStreaming && (
              <Alert
                type="success"
                showIcon
                icon={<CheckCircleOutlined />}
                message="Schema 已通过服务端 14 项安全与契约校验"
                description={`包含 ${Object.keys(generatedDoc.ui.elements).length} 个受控组件节点、${Object.keys(generatedDoc.queries).length} 个语义 DataSource 查询。`}
              />
            )}
          </Space>
        </div>

        {/* Right Live Preview Column */}
        <div style={{ minWidth: 0 }}>
          {generatedDoc && generatedDoc.ui.root ? (
            <div data-testid="generated-preview">
              <DashboardRenderer
                pageDocument={generatedDoc}
                isStreaming={isStreaming}
                onRuntimeStateChange={setRuntimeSnapshot}
              />
            </div>
          ) : (
            <div
              className="bi-card"
              style={{
                minHeight: 420,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Empty
                description={
                  isStreaming
                    ? streamStageText || '正在接收 SSE SpecStream 流式数据...'
                    : '在左侧输入业务需求并点击“流式生成 Dashboard (SSE)”，实时观看 json-render 渐进组装效果'
                }
              />
            </div>
          )}
        </div>
      </div>

      {/* Bottom Developer Debug Tabs */}
      <DebugInspector
        pageDocument={generatedDoc}
        runtimeSnapshot={runtimeSnapshot}
        validation={validation}
        streamPatches={streamPatches}
      />
    </div>
  );
};
