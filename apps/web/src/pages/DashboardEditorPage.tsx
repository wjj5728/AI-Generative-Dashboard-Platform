import React, { useCallback, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  DragOutlined,
  EyeOutlined,
  HistoryOutlined,
  RollbackOutlined,
  SaveOutlined,
  ThunderboltOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Input,
  Popconfirm,
  Skeleton,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { diffToPatches, type JsonPatch } from '@json-render/core';
import {
  moveElementInSpec,
  removeElementFromSpec,
  switchContainerLayoutInSpec,
  type DashboardRevisionSummary,
  type MoveTarget,
  type PageDocument,
  type QuickContainerLayoutMode,
  type ValidationReport,
} from '@ai-dashboard/contracts';
import { validatePageDocument } from '@ai-dashboard/component-catalog';
import { apiClient, ApiClientError } from '../api/client';
import {
  DashboardRenderer,
  type DashboardRuntimeSnapshot,
} from '../renderer/DashboardRenderer';

const QUICK_EDIT_INSTRUCTIONS = [
  '将趋势图移动到顶部',
  '新增 ROI 卡片',
  '将饼图改成柱状图',
  '删除充值分布',
  '切换为双栏布局',
  '切换为横向 Row 布局',
  '切换为纵向 Column 布局',
];

export const DashboardEditorPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const [instruction, setInstruction] = useState('');
  const [dragMode, setDragMode] = useState(true);
  const [candidateDoc, setCandidateDoc] = useState<PageDocument | null>(null);
  const [undoStack, setUndoStack] = useState<PageDocument[]>([]);
  const [patches, setPatches] = useState<JsonPatch[]>([]);
  const [changeSummary, setChangeSummary] = useState<string>('');
  const [validation, setValidation] = useState<ValidationReport | null>(null);
  const [runtimeSnapshot, setRuntimeSnapshot] =
    useState<DashboardRuntimeSnapshot | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  const {
    data: dashboard,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['dashboard', id],
    queryFn: () => apiClient.getDashboard(id!),
    enabled: Boolean(id),
  });

  const { data: revisions = [], refetch: refetchRevisions } = useQuery({
    queryKey: ['dashboard-revisions', id],
    queryFn: () => apiClient.listRevisions(id!),
    enabled: Boolean(id),
  });

  const applyLocalDocumentChange = useCallback(
    (nextDoc: PageDocument, summary: string) => {
      if (!dashboard) return;
      const prevWorking = candidateDoc ?? dashboard.pageDocument;
      const report = validatePageDocument(nextDoc);
      setValidation(report);

      if (!report.valid) {
        message.error(
          `布局变更未通过 Schema 校验：${report.errors[0]?.message ?? '结构异常'}`,
        );
        return;
      }

      const fullPatches = diffToPatches(
        dashboard.pageDocument.ui as unknown as Record<string, unknown>,
        nextDoc.ui as unknown as Record<string, unknown>,
      );

      setUndoStack((prev) => [...prev.slice(-19), prevWorking]);
      setCandidateDoc(fullPatches.length > 0 ? nextDoc : null);
      setPatches(fullPatches);
      setChangeSummary(summary);
      setEditError(null);
      message.success(summary);
    },
    [dashboard, candidateDoc],
  );

  const handleDragMove = useCallback(
    (sourceId: string, target: MoveTarget) => {
      if (!dashboard) return;
      const current = candidateDoc ?? dashboard.pageDocument;
      const result = moveElementInSpec(current.ui, sourceId, target);
      if (!result.changed) return;
      applyLocalDocumentChange(
        { ...current, ui: result.spec },
        result.description,
      );
    },
    [dashboard, candidateDoc, applyLocalDocumentChange],
  );

  const handleSwitchContainerLayout = useCallback(
    (containerId: string, mode: QuickContainerLayoutMode) => {
      if (!dashboard) return;
      const current = candidateDoc ?? dashboard.pageDocument;
      const result = switchContainerLayoutInSpec(current.ui, containerId, mode);
      if (!result.changed) return;
      applyLocalDocumentChange(
        { ...current, ui: result.spec },
        result.description,
      );
    },
    [dashboard, candidateDoc, applyLocalDocumentChange],
  );

  const handleRemoveElement = useCallback(
    (elementId: string) => {
      if (!dashboard) return;
      const current = candidateDoc ?? dashboard.pageDocument;
      const result = removeElementFromSpec(current.ui, elementId);
      if (!result.changed) return;
      applyLocalDocumentChange(
        { ...current, ui: result.spec },
        result.description,
      );
    },
    [dashboard, candidateDoc, applyLocalDocumentChange],
  );

  const handleUndoStep = () => {
    if (!dashboard || undoStack.length === 0) return;
    const prevDoc = undoStack[undoStack.length - 1];
    const nextStack = undoStack.slice(0, -1);
    setUndoStack(nextStack);

    const remainingPatches = diffToPatches(
      dashboard.pageDocument.ui as unknown as Record<string, unknown>,
      prevDoc.ui as unknown as Record<string, unknown>,
    );
    setCandidateDoc(remainingPatches.length > 0 ? prevDoc : null);
    setPatches(remainingPatches);
    setChangeSummary(remainingPatches.length > 0 ? '已撤销上一步编辑' : '');
    message.info('已撤销上一步修改');
  };

  const aiEditMutation = useMutation({
    mutationFn: (text: string) => {
      if (!dashboard) throw new Error('Dashboard 未加载');
      return apiClient.aiEditDashboard(dashboard.id, {
        instruction: text,
        currentDocument: candidateDoc ?? dashboard.pageDocument,
      });
    },
    onSuccess: (res) => {
      if (!dashboard) return;
      const prevWorking = candidateDoc ?? dashboard.pageDocument;
      const fullPatches = diffToPatches(
        dashboard.pageDocument.ui as unknown as Record<string, unknown>,
        res.candidateDocument.ui as unknown as Record<string, unknown>,
      );
      setUndoStack((prev) => [...prev.slice(-19), prevWorking]);
      setEditError(null);
      setCandidateDoc(res.candidateDocument);
      setPatches(fullPatches.length > 0 ? fullPatches : res.patches);
      setChangeSummary(res.changeSummary);
      setValidation(res.validation);
      message.success(`AI 候选修改已生成：${res.changeSummary}`);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'AI 修改失败';
      setEditError(msg);
      if (err instanceof ApiClientError && err.details) {
        setValidation(err.details as ValidationReport);
      }
    },
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!dashboard || !candidateDoc) throw new Error('没有待保存的修改');
      return apiClient.updateDashboard(dashboard.id, {
        baseRevision: dashboard.currentRevision,
        pageDocument: candidateDoc,
        changeDescription: changeSummary || `Edited: ${instruction || 'Visual layout change'}`,
      });
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['dashboard', id], updated);
      void queryClient.invalidateQueries({ queryKey: ['dashboards'] });
      void refetchRevisions();
      setCandidateDoc(null);
      setUndoStack([]);
      setPatches([]);
      setChangeSummary('');
      setInstruction('');
      message.success(`已保存为新版本 v${updated.currentRevision}`);
    },
    onError: (err: unknown) => {
      if (err instanceof ApiClientError && err.status === 409) {
        message.error('版本冲突 (409)：该看板已被其他会话更新，请刷新后重试');
        void queryClient.invalidateQueries({ queryKey: ['dashboard', id] });
        return;
      }
      message.error(`保存失败：${err instanceof Error ? err.message : String(err)}`);
    },
  });

  const publishMutation = useMutation({
    mutationFn: () => apiClient.publishDashboard(id!),
    onSuccess: (updated) => {
      queryClient.setQueryData(['dashboard', id], updated);
      void queryClient.invalidateQueries({ queryKey: ['dashboards'] });
      message.success(`版本 v${updated.publishedRevision} 已发布`);
    },
    onError: (err: Error) => {
      message.error(`发布失败：${err.message}`);
    },
  });

  const rollbackMutation = useMutation({
    mutationFn: (targetRevision: number) => {
      if (!dashboard) throw new Error('Dashboard 未加载');
      return apiClient.rollbackDashboard(dashboard.id, {
        targetRevision,
        baseRevision: dashboard.currentRevision,
        changeDescription: `回滚到历史版本 v${targetRevision}`,
      });
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['dashboard', id], updated);
      void queryClient.invalidateQueries({ queryKey: ['dashboards'] });
      void refetchRevisions();
      setCandidateDoc(null);
      setUndoStack([]);
      setPatches([]);
      setChangeSummary('');
      message.success(`已回滚并生成新版本 v${updated.currentRevision}`);
    },
    onError: (err: Error) => {
      message.error(`回滚失败：${err.message}`);
    },
  });

  const dragEditConfig = useMemo(
    () => ({
      enabled: dragMode,
      onMove: handleDragMove,
      onSwitchLayout: handleSwitchContainerLayout,
      onRemove: handleRemoveElement,
    }),
    [dragMode, handleDragMove, handleSwitchContainerLayout, handleRemoveElement],
  );

  if (isLoading) {
    return (
      <div className="bi-card">
        <Skeleton active paragraph={{ rows: 10 }} />
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <Alert
        type="error"
        showIcon
        message="无法加载 Dashboard 编辑器"
        description={error instanceof Error ? error.message : 'Dashboard 不存在'}
      />
    );
  }

  const activeDoc = candidateDoc ?? dashboard.pageDocument;

  return (
    <div data-testid="dashboard-editor">
      <div className="page-header-bar">
        <Space wrap size="middle">
          <Link to={`/dashboards/${dashboard.id}`}>
            <Button icon={<ArrowLeftOutlined />} size="small">
              返回查看页
            </Button>
          </Link>
          <div>
            <Space size="small" align="center" wrap>
              <Typography.Title level={4} style={{ margin: 0 }}>
                编辑：{dashboard.title}
              </Typography.Title>
              <Tag color="blue" data-testid="editor-revision-tag">
                当前 v{dashboard.currentRevision}
              </Tag>
              {candidateDoc && <Tag color="magenta">存在未保存修改</Tag>}
              {dashboard.publishedRevision && (
                <Tag color="green">已发布 v{dashboard.publishedRevision}</Tag>
              )}
            </Space>
          </div>
        </Space>

        <Space wrap>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px',
              borderRadius: 8,
              border: '1px solid rgba(56, 189, 248, 0.3)',
              background: dragMode ? 'rgba(14, 165, 233, 0.14)' : 'transparent',
              fontSize: 12,
            }}
          >
            <DragOutlined style={{ color: '#38bdf8' }} />
            <span>拖拽布局</span>
            <Switch
              size="small"
              checked={dragMode}
              onChange={setDragMode}
              data-testid="toggle-drag-mode"
            />
          </span>
          <Link to={`/dashboards/${dashboard.id}`}>
            <Button icon={<EyeOutlined />}>打开独立 URL</Button>
          </Link>
          {undoStack.length > 0 && (
            <Button
              icon={<UndoOutlined />}
              onClick={handleUndoStep}
              data-testid="btn-undo-step"
            >
              撤销 ({undoStack.length})
            </Button>
          )}
          {candidateDoc && (
            <Button
              onClick={() => {
                setCandidateDoc(null);
                setUndoStack([]);
                setPatches([]);
                setChangeSummary('');
                message.info('已放弃全部未保存修改');
              }}
              data-testid="btn-discard-edit"
            >
              重置
            </Button>
          )}
          <Button
            type="primary"
            icon={<SaveOutlined />}
            disabled={!candidateDoc}
            loading={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
            data-testid="btn-save-revision"
          >
            保存新版本 (v{dashboard.currentRevision + 1})
          </Button>
          <Button
            icon={<CheckCircleOutlined />}
            loading={publishMutation.isPending}
            onClick={() => publishMutation.mutate()}
            data-testid="btn-publish-editor"
          >
            发布
          </Button>
        </Space>
      </div>

      <div className="split-workspace">
        {/* Left AI + Drag Guidance Panel */}
        <div className="bi-card" style={{ position: 'sticky', top: 74 }}>
          <div className="bi-card-header">
            <div>
              <div className="bi-card-title">自然语言 + 拖拽布局编辑</div>
              <div className="bi-card-subtitle">
                右侧直接拖拽重排/跨容器移动，或输入指令生成受控 Schema Patch
              </div>
            </div>
          </div>

          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            {dragMode && (
              <Alert
                type="info"
                showIcon
                icon={<DragOutlined />}
                message="拖拽布局已开启"
                description="拖动组件顶部手柄可在同容器排序或跨 Row / Column / Grid 移动；也可点击容器右上角一键切换 Row / Col / 2列 / 3列，全程不调用 LLM。"
              />
            )}

            <div>
              <div className="bi-filter-label" style={{ marginBottom: 6 }}>
                常用 AI 编辑指令：
              </div>
              <Space wrap size={[6, 6]}>
                {QUICK_EDIT_INSTRUCTIONS.map((cmd) => (
                  <Button
                    key={cmd}
                    size="small"
                    onClick={() => setInstruction(cmd)}
                  >
                    {cmd}
                  </Button>
                ))}
              </Space>
            </div>

            <Input.TextArea
              rows={4}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="输入自然语言修改指令，例如：新增 ROI 卡片 / 将趋势图移动到顶部 / 切换为横向 Row 布局"
              data-testid="ai-edit-input"
            />

            <Button
              type="primary"
              block
              icon={<ThunderboltOutlined />}
              disabled={!instruction.trim()}
              loading={aiEditMutation.isPending}
              onClick={() => aiEditMutation.mutate(instruction)}
              data-testid="btn-run-ai-edit"
            >
              AI 生成候选修改并预览
            </Button>

            {editError && (
              <Alert type="error" showIcon message="AI 修改失败" description={editError} />
            )}

            {candidateDoc && (
              <Alert
                type="success"
                showIcon
                message="候选修改已就绪（尚未写入数据库）"
                description={
                  <div>
                    <div>{changeSummary}</div>
                    <div style={{ marginTop: 4, fontSize: 12 }}>
                      共产生 {patches.length} 条 RFC 6902 JSON Patch，点击右上角“保存新版本”落库。
                    </div>
                  </div>
                }
              />
            )}
          </Space>
        </div>

        {/* Right Interactive Drag-and-Drop Live Preview */}
        <div style={{ minWidth: 0 }}>
          <DashboardRenderer
            pageDocument={activeDoc}
            dragEdit={dragEditConfig}
            onRuntimeStateChange={setRuntimeSnapshot}
          />
        </div>
      </div>

      {/* Bottom Tabs: Patch Diff, Before/After Schema, Revision History */}
      <div className="bi-card" style={{ marginTop: 20 }}>
        <Tabs
          items={[
            {
              key: 'diff',
              label: `修改前后对比 & JSON Patch (${patches.length})`,
              children: (
                <div className="bi-grid bi-grid--equal-2" style={{ gap: 14 }}>
                  <div>
                    <div className="bi-filter-label" style={{ marginBottom: 6 }}>
                      RFC 6902 JSON Patch（增量补丁）：
                    </div>
                    <pre className="code-viewer">
                      {patches.length > 0
                        ? JSON.stringify(patches, null, 2)
                        : '// 拖拽组件或执行 AI 修改后将在此实时显示补丁'}
                    </pre>
                  </div>
                  <div>
                    <div className="bi-filter-label" style={{ marginBottom: 6 }}>
                      当前渲染 UI Spec（{candidateDoc ? '候选预览' : `已保存 v${dashboard.currentRevision}`}）：
                    </div>
                    <pre className="code-viewer">
                      {JSON.stringify(activeDoc.ui, null, 2)}
                    </pre>
                  </div>
                </div>
              ),
            },
            {
              key: 'before-after',
              label: 'Before / After PageDocument',
              children: (
                <div className="bi-grid bi-grid--equal-2" style={{ gap: 14 }}>
                  <div>
                    <div className="bi-filter-label" style={{ marginBottom: 6 }}>
                      Before（已保存 v{dashboard.currentRevision}）：
                    </div>
                    <pre className="code-viewer">
                      {JSON.stringify(dashboard.pageDocument, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <div className="bi-filter-label" style={{ marginBottom: 6 }}>
                      After（候选修改）：
                    </div>
                    <pre className="code-viewer">
                      {candidateDoc
                        ? JSON.stringify(candidateDoc, null, 2)
                        : '// 暂无未保存修改'}
                    </pre>
                  </div>
                </div>
              ),
            },
            {
              key: 'revisions',
              label: (
                <span>
                  <HistoryOutlined style={{ marginRight: 5 }} />
                  历史版本与回滚 ({revisions.length})
                </span>
              ),
              children: (
                <Table<DashboardRevisionSummary>
                  rowKey="id"
                  size="small"
                  pagination={false}
                  dataSource={revisions}
                  columns={[
                    {
                      title: '版本号',
                      dataIndex: 'revision',
                      width: 110,
                      render: (rev: number) => (
                        <Space size={4}>
                          <Tag color={rev === dashboard.currentRevision ? 'cyan' : 'default'}>
                            v{rev}
                          </Tag>
                          {rev === dashboard.publishedRevision && (
                            <Tag color="green">线上</Tag>
                          )}
                        </Space>
                      ),
                    },
                    {
                      title: '变更说明',
                      dataIndex: 'changeDescription',
                    },
                    {
                      title: '创建时间',
                      dataIndex: 'createdAt',
                      width: 190,
                      render: (val: string) => new Date(val).toLocaleString('zh-CN'),
                    },
                    {
                      title: '操作',
                      width: 140,
                      render: (_, rev) =>
                        rev.revision === dashboard.currentRevision ? (
                          <Tag color="blue">当前版本</Tag>
                        ) : (
                          <Popconfirm
                            title={`确认回滚到 v${rev.revision}？`}
                            description="回滚会基于历史快照创建新的不可变 Revision，不会破坏历史记录。"
                            onConfirm={() => rollbackMutation.mutate(rev.revision)}
                          >
                            <Button
                              size="small"
                              icon={<RollbackOutlined />}
                              loading={rollbackMutation.isPending}
                            >
                              回滚到此版本
                            </Button>
                          </Popconfirm>
                        ),
                    },
                  ]}
                />
              ),
            },
            {
              key: 'runtime',
              label: 'Runtime State & Validation',
              children: (
                <pre className="code-viewer">
                  {JSON.stringify(
                    {
                      validation,
                      variables: runtimeSnapshot?.state?.variables,
                      queryLog: runtimeSnapshot?.queryLog,
                    },
                    null,
                    2,
                  )}
                </pre>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
};
