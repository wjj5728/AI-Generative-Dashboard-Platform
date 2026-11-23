import React, { useMemo, useState } from 'react';
import {
  ApiOutlined,
  AppstoreOutlined,
  CheckCircleOutlined,
  CodeOutlined,
  CopyOutlined,
  DatabaseOutlined,
  SafetyCertificateOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Checkbox,
  Collapse,
  Descriptions,
  Input,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd';
import { useQuery } from '@tanstack/react-query';
import {
  ALLOWED_ACTIONS,
  CATALOG_VERSION,
  CONTRACT_VERSION,
  MAX_SPEC_DEPTH,
  MAX_SPEC_NODES,
  type ComponentMetadata,
  type DataSourceMetadata,
} from '@ai-dashboard/contracts';
import { apiClient } from '../api/client';

const SAMPLE_PAGE_DOCUMENT = {
  contractVersion: CONTRACT_VERSION,
  catalogVersion: CATALOG_VERSION,
  title: '游戏广告投放数据看板',
  description: '后端返回的标准 PageDocument 最小完整示例',
  variables: {
    gameId: {
      type: 'string',
      defaultValue: 'all',
      label: '投放游戏',
    },
    dateRange: {
      type: 'dateRange',
      defaultValue: 'last14days',
      label: '时间周期',
    },
  },
  queries: {
    games: {
      resource: 'ads.games',
      params: {},
      targetState: '/data/games',
    },
    summary: {
      resource: 'ads.summary',
      params: {
        gameId: { $var: 'gameId' },
        dateRange: { $var: 'dateRange' },
      },
      targetState: '/data/summary',
    },
  },
  ui: {
    root: 'root',
    elements: {
      root: {
        type: 'Column',
        props: { gap: 'md', width: 'full' },
        children: ['toolbar-panel', 'kpi-row'],
      },
      'toolbar-panel': {
        type: 'DashboardPanel',
        props: { padding: 'md', tone: 'elevated' },
        children: ['filter-game'],
      },
      'filter-game': {
        type: 'SelectFilter',
        props: {
          label: '投放游戏',
          variable: 'gameId',
          value: { $bindState: '/variables/gameId' },
          options: { $state: '/data/games' },
          width: 200,
        },
        children: [],
      },
      'kpi-row': {
        type: 'Row',
        props: { gap: 'md', equalWidth: true, wrap: true, width: 'full' },
        children: ['stat-cost', 'stat-roi'],
      },
      'stat-cost': {
        type: 'StatCard',
        props: {
          title: '总消耗',
          value: { $state: '/data/summary/totalCost' },
          delta: { $state: '/data/summary/costDelta' },
          format: 'currency',
          accent: 'cyan',
          queryKey: 'summary',
        },
        children: [],
      },
      'stat-roi': {
        type: 'StatCard',
        props: {
          title: '综合 ROI',
          value: { $state: '/data/summary/roi' },
          delta: { $state: '/data/summary/roiDelta' },
          format: 'ratio',
          accent: 'amber',
          queryKey: 'summary',
        },
        children: [],
      },
    },
  },
};

const SAMPLE_SSE_STREAM = `event: stage
data: {"step":"catalog","message":"已加载 23 个受控组件与 6 个授权 DataSource 元数据","progress":12}

event: stage
data: {"step":"planning","message":"正在解析业务意图并规划布局与查询绑定...","progress":26}

event: meta
data: {"provider":"your-llm","contractVersion":"${CONTRACT_VERSION}","catalogVersion":"${CATALOG_VERSION}","title":"游戏投放看板","variables":{"gameId":{"type":"string","defaultValue":"all"}},"queries":{"summary":{"resource":"ads.summary","params":{"gameId":{"$var":"gameId"}},"targetState":"/data/summary"}}}

event: stage
data: {"step":"spec","message":"开始流式构建 json-render UI Spec","progress":35}

event: patch
data: {"patch":{"op":"add","path":"/root","value":"root"},"index":1,"total":6,"elementId":"root","componentType":"Column"}

event: patch
data: {"patch":{"op":"add","path":"/elements/root","value":{"type":"Column","props":{"gap":"md","width":"full"},"children":[]}},"index":2,"total":6,"elementId":"root","componentType":"Column"}

event: patch
data: {"patch":{"op":"add","path":"/elements/stat-cost","value":{"type":"StatCard","props":{"title":"总消耗","value":{"$state":"/data/summary/totalCost"},"format":"currency","queryKey":"summary"},"children":[]}},"index":3,"total":6,"elementId":"stat-cost","componentType":"StatCard"}

event: patch
data: {"patch":{"op":"add","path":"/elements/root/children/-","value":"stat-cost"},"index":4,"total":6,"elementId":"stat-cost","componentType":"StatCard"}

event: complete
data: {"provider":"your-llm","pageDocument":{...},"validation":{"valid":true,"errors":[],"warnings":[]}}

event: stage
data: {"step":"done","message":"Dashboard 流式生成完成","progress":100}`;

const SAMPLE_QUERY_BATCH_REQ = {
  queries: [
    {
      key: 'summary',
      resource: 'ads.summary',
      params: { gameId: 'game-001', dateRange: 'last14days' },
    },
    {
      key: 'daily',
      resource: 'ads.daily',
      params: { gameId: 'game-001', dateRange: 'last14days' },
    },
  ],
  bypassCache: true,
};

const SAMPLE_QUERY_BATCH_RES = {
  ok: true,
  data: {
    results: {
      summary: {
        status: 'success',
        cached: false,
        durationMs: 4,
        data: {
          totalCost: 562410.5,
          revenue: 697389.02,
          roi: 1.24,
          newUsers: 20185,
          costDelta: 0.084,
        },
      },
      daily: {
        status: 'error',
        error: {
          code: 'FORBIDDEN',
          message: '单条查询失败不得导致整个 batch 失败，前端会在对应卡片显示局部错误与重试按钮',
        },
      },
    },
  },
};

const API_ENDPOINTS = [
  {
    method: 'GET',
    path: '/api/dashboards',
    page: '/dashboards',
    desc: '获取看板列表（按 updatedAt 倒序）',
    req: '无',
    res: '{ dashboards: DashboardSummary[] }',
    codes: '200, 401',
  },
  {
    method: 'POST',
    path: '/api/dashboards',
    page: '/dashboards/new',
    desc: '持久化新建 Dashboard（写入 Revision 1，忽略客户端传入的 ownerId）',
    req: '{ pageDocument, changeDescription? }',
    res: '{ dashboard: DashboardDetail } (201)',
    codes: '201, 400, 401, 403, 422',
  },
  {
    method: 'GET',
    path: '/api/dashboards/:id',
    page: '/dashboards/:id, /edit',
    desc: '读取持久化 PageDocument（严禁触发 LLM；不得返回运行时业务数据）',
    req: 'Path: id',
    res: '{ dashboard: DashboardDetail }',
    codes: '200, 401, 404',
  },
  {
    method: 'PUT',
    path: '/api/dashboards/:id',
    page: '/dashboards/:id/edit',
    desc: '保存新 Revision（强制乐观锁 baseRevision === currentRevision）',
    req: '{ baseRevision: number, pageDocument, changeDescription? }',
    res: '{ dashboard: DashboardDetail }',
    codes: '200, 400, 401, 403, 404, 409, 422',
  },
  {
    method: 'DELETE',
    path: '/api/dashboards/:id',
    page: '/dashboards',
    desc: '删除 Dashboard 及其全部历史 Revision',
    req: 'Path: id',
    res: '{ deleted: true, id }',
    codes: '200, 401, 403, 404',
  },
  {
    method: 'POST',
    path: '/api/dashboards/generate-stream',
    page: '/dashboards/new',
    desc: 'SSE 流式生成 PageDocument（依次推送 stage / meta / patch / complete）',
    req: '{ prompt, scenario?, streamDelayMs? }',
    res: 'text/event-stream (SSE)',
    codes: '200 (SSE), 400, 401, 403',
  },
  {
    method: 'POST',
    path: '/api/dashboards/generate',
    page: 'API / 非流式调用',
    desc: '一次性返回校验通过的候选 PageDocument（非流式兼容接口）',
    req: '{ prompt, scenario? }',
    res: '{ provider, pageDocument, validation }',
    codes: '200, 400, 401, 403, 422',
  },
  {
    method: 'POST',
    path: '/api/dashboards/:id/ai-edit',
    page: '/dashboards/:id/edit',
    desc: 'AI 增量修改，返回候选文档与 RFC 6902 patches（禁止自动落库）',
    req: '{ instruction, currentDocument? }',
    res: '{ provider, candidateDocument, patches, changeSummary, validation }',
    codes: '200, 400, 401, 403, 404, 422',
  },
  {
    method: 'POST',
    path: '/api/dashboards/:id/publish',
    page: '/dashboards/:id, /edit',
    desc: '发布当前版本（status="published", publishedRevision=currentRevision）',
    req: '{}',
    res: '{ dashboard: DashboardDetail }',
    codes: '200, 401, 403, 404',
  },
  {
    method: 'GET',
    path: '/api/dashboards/:id/revisions',
    page: '/dashboards/:id/edit',
    desc: '获取不可变历史版本列表（按 revision 倒序）',
    req: 'Path: id',
    res: '{ revisions: DashboardRevisionSummary[] }',
    codes: '200, 401, 404',
  },
  {
    method: 'GET',
    path: '/api/dashboards/:id/revisions/:revision',
    page: '历史快照查看',
    desc: '获取指定版本号的完整 PageDocument 快照',
    req: 'Path: id, revision',
    res: '{ revision: DashboardRevisionDetail }',
    codes: '200, 400, 401, 404',
  },
  {
    method: 'POST',
    path: '/api/dashboards/:id/rollback',
    page: '/dashboards/:id/edit',
    desc: '基于历史快照创建新的 Revision（不破坏历史，须校验 baseRevision）',
    req: '{ targetRevision, baseRevision, changeDescription? }',
    res: '{ dashboard: DashboardDetail }',
    codes: '200, 400, 401, 403, 404, 409',
  },
  {
    method: 'GET',
    path: '/api/catalog/components',
    page: 'Catalog / AI / 文档页',
    desc: '返回前端当前支持的 Component Catalog 元数据与版本号',
    req: '无',
    res: '{ contractVersion, catalogVersion, components }',
    codes: '200, 401',
  },
  {
    method: 'GET',
    path: '/api/catalog/datasources',
    page: 'Catalog / AI / 文档页',
    desc: '返回当前用户有权限访问的 DataSource 公开元数据（严禁暴露 handler）',
    req: '无',
    res: '{ datasources: DataSourceMetadata[] }',
    codes: '200, 401',
  },
  {
    method: 'POST',
    path: '/api/data/query-batch',
    page: '所有渲染器页面',
    desc: '批量/局部执行语义数据源查询，单条独立返回成功或错误，支持 bypassCache',
    req: '{ queries: QueryBatchItem[], bypassCache?: boolean }',
    res: '{ results: Record<key, QueryBatchItemResult> }',
    codes: '200, 400, 401',
  },
];

const VALIDATION_RULES = [
  { id: 1, name: '协议版本校验', code: 'INVALID_CONTRACT_VERSION', rule: `contractVersion 必须严格等于 "${CONTRACT_VERSION}"` },
  { id: 2, name: '组件目录版本校验', code: 'INVALID_CATALOG_VERSION', rule: `catalogVersion 必须严格等于 "${CATALOG_VERSION}"` },
  { id: 3, name: '组件白名单校验', code: 'UNKNOWN_COMPONENT', rule: 'ui.elements[id].type 必须存在于 Component Catalog 注册表中' },
  { id: 4, name: '组件 Props 类型校验', code: 'INVALID_COMPONENT_PROPS', rule: '每个组件的 props 必须通过对应 Zod Schema（允许字面量或 $state / $bindState）' },
  { id: 5, name: '根节点校验', code: 'SPEC_MISSING_ROOT / ROOT_NOT_FOUND', rule: 'ui.root 必须非空且存在于 ui.elements 中' },
  { id: 6, name: '子节点与环路检测', code: 'SPEC_MISSING_CHILD / CIRCULAR_REFERENCE', rule: '所有 children / slots 引用必须存在，且 DFS 遍历禁止任何环路' },
  { id: 7, name: '最大嵌套深度限制', code: 'MAX_DEPTH_EXCEEDED', rule: `组件树从 root 起最大嵌套深度不超过 ${MAX_SPEC_DEPTH} 层` },
  { id: 8, name: '最大节点数限制', code: 'MAX_NODES_EXCEEDED', rule: `ui.elements 节点总数不超过 ${MAX_SPEC_NODES} 个` },
  { id: 9, name: 'DataSource 注册校验', code: 'UNKNOWN_DATASOURCE', rule: 'queries[*].resource 必须是服务端已注册的语义数据源 ID' },
  { id: 10, name: '查询参数校验', code: 'INVALID_QUERY_PARAMS', rule: 'queries[*].params 解析默认值后必须通过对应 DataSource 的 paramsSchema' },
  { id: 11, name: '数据字段与类型匹配', code: 'UNKNOWN_DATA_FIELD / DATA_FIELD_TYPE_MISMATCH', rule: '$state 绑定的字段必须存在于数据源元数据中，且数值图表/进度字段必须是数值类型、图表/表格必须绑定 array 数据源' },
  { id: 12, name: '变量引用校验', code: 'UNKNOWN_VARIABLE_REF / UNKNOWN_VARIABLE_BINDING', rule: 'queries 中的 $var 与 UI 中的 /variables/* 必须已在 PageDocument.variables 声明' },
  { id: 13, name: '动作白名单与内容安全', code: 'DISALLOWED_ACTION / FORBIDDEN_CONTENT', rule: `仅允许动作 [${ALLOWED_ACTIONS.join(', ')}]；禁止 <script>、javascript:、eval()、new Function()、原始 SQL、原型污染键及内联函数` },
  { id: 14, name: '数据源访问权限校验', code: 'FORBIDDEN_DATASOURCE_ACCESS', rule: '当前服务端鉴权用户的 roles 必须覆盖所有引用数据源的 requiredRoles' },
];

const INTEGRATION_CHECKLIST = [
  '所有 JSON 接口统一返回 { ok: true, data } 或 { ok: false, error: { code, message, details? } }',
  '服务端身份由鉴权中间件解析，完全忽略客户端请求体中传入的 ownerId',
  'PageDocument.contractVersion 与 catalogVersion 严格与前端保持一致（2.0.0）',
  'GET /api/dashboards/:id 仅返回持久化 Schema，不调用 LLM，且不持久化 ui.state 运行时数据',
  'POST /api/dashboards/generate-stream 设置 text/event-stream 与 X-Accel-Buffering: no，按拓扑序推送 patch，并监听响应流关闭中止任务',
  '每个数据绑定卡片的 props 中正确提供 queryKey，与 PageDocument.queries 的键名一致，以启用单卡局部刷新与 Loading/Error 状态展示',
  'POST /api/data/query-batch 独立处理每条查询错误，并支持 bypassCache: true 穿透后端缓存',
  'PUT /api/dashboards/:id 与 rollback 接口严格校验 baseRevision，版本冲突返回 HTTP 409 REVISION_CONFLICT',
];

export const BackendIntegrationRulesPage: React.FC = () => {
  const [compSearch, setCompSearch] = useState('');
  const [compCategory, setCompCategory] = useState<string>('all');
  const [checkedItems, setCheckedItems] = useState<string[]>([]);

  const { data: compCatalog } = useQuery({
    queryKey: ['catalog-components'],
    queryFn: () => apiClient.getComponentCatalog(),
  });

  const { data: dsCatalog } = useQuery({
    queryKey: ['catalog-datasources'],
    queryFn: () => apiClient.getDataSourceCatalog(),
  });

  const components = useMemo(
    () => compCatalog?.components ?? [],
    [compCatalog?.components],
  );
  const datasources = useMemo(
    () => dsCatalog?.datasources ?? [],
    [dsCatalog?.datasources],
  );

  const filteredComponents = useMemo(() => {
    const q = compSearch.trim().toLowerCase();
    return components.filter((c) => {
      if (compCategory !== 'all' && c.category !== compCategory) return false;
      if (!q) return true;
      return (
        c.type.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.useCases.some((u) => u.toLowerCase().includes(q))
      );
    });
  }, [components, compSearch, compCategory]);

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      message.success(`已复制 ${label}`);
    } catch {
      message.info(`复制失败，请手动选中复制（${label}）`);
    }
  };

  return (
    <div data-testid="backend-integration-rules-page">
      <div className="page-header-bar">
        <div>
          <Space align="center" size="small" wrap>
            <Typography.Title level={3} style={{ margin: 0 }}>
              前端协议与后端接入规范（Integration Spec）
            </Typography.Title>
            <Tag color="cyan">Contract v{CONTRACT_VERSION}</Tag>
            <Tag color="blue">Catalog v{CATALOG_VERSION}</Tag>
            <Tag color="purple">json-render v0.23.2</Tag>
          </Space>
          <Typography.Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
            完整梳理前端渲染器、组件目录、数据绑定、局部刷新、SSE 流式协议、拖拽 Patch 与持久化版本规则，实时同步当前运行时 Catalog 元数据，供后端研发直接对照接入。
          </Typography.Text>
        </div>
        <Space wrap>
          <Button
            icon={<CopyOutlined />}
            onClick={() =>
              void copyText(
                JSON.stringify(SAMPLE_PAGE_DOCUMENT, null, 2),
                'PageDocument 示例 JSON',
              )
            }
          >
            复制 PageDocument 模板
          </Button>
          <Button
            type="primary"
            icon={<CopyOutlined />}
            onClick={() =>
              void copyText(SAMPLE_SSE_STREAM, 'SSE 事件流示例')
            }
          >
            复制 SSE 协议示例
          </Button>
        </Space>
      </div>

      {/* Quick Contract Overview */}
      <div className="bi-grid bi-grid--equal-4" style={{ gap: 12, marginBottom: 18 }}>
        <div className="bi-stat-card" style={{ borderTopColor: '#38bdf8' }}>
          <div className="bi-stat-title">注册组件数（实时读取）</div>
          <div className="bi-stat-value" data-testid="rules-component-count">
            {components.length}
          </div>
          <div className="bi-stat-sub">Layout / Display / Filter / Action</div>
        </div>
        <div className="bi-stat-card" style={{ borderTopColor: '#34d399' }}>
          <div className="bi-stat-title">语义数据源数（实时读取）</div>
          <div className="bi-stat-value" data-testid="rules-datasource-count">
            {datasources.length}
          </div>
          <div className="bi-stat-sub">仅公开元数据，Handler 严格留在后端</div>
        </div>
        <div className="bi-stat-card" style={{ borderTopColor: '#818cf8' }}>
          <div className="bi-stat-title">Schema 安全约束</div>
          <div className="bi-stat-value">14 项</div>
          <div className="bi-stat-sub">
            最大深度 {MAX_SPEC_DEPTH} · 最大节点 {MAX_SPEC_NODES}
          </div>
        </div>
        <div className="bi-stat-card" style={{ borderTopColor: '#fbbf24' }}>
          <div className="bi-stat-title">白名单运行时 Action</div>
          <div className="bi-stat-value">{ALLOWED_ACTIONS.length}</div>
          <div className="bi-stat-sub">{ALLOWED_ACTIONS.join(' / ')}</div>
        </div>
      </div>

      <div className="bi-card">
        <Tabs
          defaultActiveKey="api"
          size="large"
          items={[
            {
              key: 'api',
              label: (
                <span>
                  <ApiOutlined style={{ marginRight: 6 }} />
                  1. 接口清单与响应规范
                </span>
              ),
              children: (
                <Space direction="vertical" size="large" style={{ width: '100%' }}>
                  <Alert
                    type="info"
                    showIcon
                    message="前端 HTTP 通信总则（apps/web/src/api/client.ts）"
                    description="所有非流式接口必须返回统一 JSON 信封：{ ok: true, data } 或 { ok: false, error: { code, message, details? } }。前端通过 HTTP 状态码与 error.code 精确分支处理（如 409 触发版本冲突提示、422 渲染 ValidationReport 错误明细）。"
                  />

                  <div className="bi-grid bi-grid--equal-2" style={{ gap: 14 }}>
                    <div>
                      <div className="bi-card-title" style={{ marginBottom: 8 }}>
                        统一成功响应格式
                      </div>
                      <pre className="code-viewer">{`{
  "ok": true,
  "data": { ... }
}`}</pre>
                    </div>
                    <div>
                      <div className="bi-card-title" style={{ marginBottom: 8 }}>
                        统一错误响应格式（400 / 401 / 403 / 404 / 409 / 422 / 500）
                      </div>
                      <pre className="code-viewer">{`{
  "ok": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Revision conflict: expected baseRevision 1, got 2",
    "details": { "baseRevision": 1, "currentRevision": 2 }
  }
}`}</pre>
                    </div>
                  </div>

                  <div>
                    <div className="bi-card-title" style={{ marginBottom: 8 }}>
                      前端依赖的全部后端接口（{API_ENDPOINTS.length} 个）
                    </div>
                    <Table
                      rowKey={(r) => `${r.method}-${r.path}`}
                      size="small"
                      pagination={false}
                      scroll={{ x: 'max-content' }}
                      dataSource={API_ENDPOINTS}
                      columns={[
                        {
                          title: 'Method',
                          dataIndex: 'method',
                          width: 90,
                          render: (m: string) => {
                            const color =
                              m === 'GET'
                                ? 'cyan'
                                : m === 'POST'
                                  ? 'green'
                                  : m === 'PUT'
                                    ? 'gold'
                                    : 'red';
                            return <Tag color={color}>{m}</Tag>;
                          },
                        },
                        {
                          title: '路径',
                          dataIndex: 'path',
                          width: 280,
                          render: (p: string) => (
                            <code style={{ color: '#7dd3fc' }}>{p}</code>
                          ),
                        },
                        { title: '调用页面', dataIndex: 'page', width: 165 },
                        { title: '后端职责与约束', dataIndex: 'desc' },
                        {
                          title: '请求体',
                          dataIndex: 'req',
                          width: 210,
                          render: (v: string) => <code style={{ fontSize: 11 }}>{v}</code>,
                        },
                        {
                          title: '状态码',
                          dataIndex: 'codes',
                          width: 150,
                          render: (v: string) => (
                            <span className="bi-tabular" style={{ fontSize: 12 }}>
                              {v}
                            </span>
                          ),
                        },
                      ]}
                    />
                  </div>
                </Space>
              ),
            },
            {
              key: 'schema',
              label: (
                <span>
                  <SafetyCertificateOutlined style={{ marginRight: 6 }} />
                  2. PageDocument 与 14 项校验
                </span>
              ),
              children: (
                <Space direction="vertical" size="large" style={{ width: '100%' }}>
                  <Alert
                    type="warning"
                    showIcon
                    message="客户端兼容性与安全红线"
                    description="DashboardRenderer 渲染前会强制检查 contractVersion === '2.0.0'、catalogVersion === '2.0.0' 以及所有节点 type 是否已注册；不兼容时直接阻断渲染并提示错误。数据库持久化时禁止保存运行时业务数据（ui.state）。"
                  />

                  <div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 8,
                      }}
                    >
                      <div className="bi-card-title">
                        标准 PageDocument 最小完整结构（可直接给后端/LLM 参考）
                      </div>
                      <Button
                        size="small"
                        icon={<CopyOutlined />}
                        onClick={() =>
                          void copyText(
                            JSON.stringify(SAMPLE_PAGE_DOCUMENT, null, 2),
                            'PageDocument JSON',
                          )
                        }
                      >
                        复制 JSON
                      </Button>
                    </div>
                    <pre className="code-viewer" data-testid="sample-page-doc-code">
                      {JSON.stringify(SAMPLE_PAGE_DOCUMENT, null, 2)}
                    </pre>
                  </div>

                  <div>
                    <div className="bi-card-title" style={{ marginBottom: 8 }}>
                      14 项服务端强制校验规则（validatePageDocument）
                    </div>
                    <Table
                      rowKey="id"
                      size="small"
                      pagination={false}
                      scroll={{ x: 'max-content' }}
                      dataSource={VALIDATION_RULES}
                      columns={[
                        { title: '#', dataIndex: 'id', width: 52 },
                        { title: '校验项', dataIndex: 'name', width: 170 },
                        {
                          title: '错误码',
                          dataIndex: 'code',
                          width: 260,
                          render: (c: string) => (
                            <Tag color="volcano" style={{ fontFamily: 'monospace' }}>
                              {c}
                            </Tag>
                          ),
                        },
                        { title: '强制规则说明', dataIndex: 'rule' },
                      ]}
                    />
                  </div>
                </Space>
              ),
            },
            {
              key: 'components',
              label: (
                <span>
                  <AppstoreOutlined style={{ marginRight: 6 }} />
                  3. 组件目录与布局规则 ({components.length})
                </span>
              ),
              children: (
                <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                  <Alert
                    type="info"
                    showIcon
                    message="受控设计 Token 与自然语言 Row / Column 选型规则"
                    description={
                      <div>
                        <div>
                          • <strong>禁止自由 CSS</strong>：所有布局组件仅接受受控 Token（
                          <code>gap/padding: none|xs|sm|md|lg|xl</code>、
                          <code>align: start|center|end|stretch</code>、
                          <code>justify: start|center|end|between|around</code>、
                          <code>width: auto|full|1/2|1/3|2/3|1/4|3/4</code>）。
                        </div>
                        <div>
                          • <strong>自然语言自动判断 Row / Column</strong>：横向/水平/并排/左右布局 → 优先使用{' '}
                          <code>Row</code>（并设置 <code>equalWidth: true, wrap: true</code>）；纵向/垂直/竖排/堆叠 → 优先使用{' '}
                          <code>Column</code>（<code>width: &quot;full&quot;</code>）；多栏复杂大屏可使用{' '}
                          <code>DashboardGrid</code>（<code>equal-2 / equal-3 / equal-4 / sidebar-main / sidebar-main-sidebar</code>）。
                        </div>
                        <div>
                          • <strong>稳定节点 ID</strong>：每个元素 key（如 <code>stat-cost</code>、
                          <code>chart-daily-trend</code>）必须在整个版本生命周期保持语义稳定，供前端拖拽排序与 RFC 6902 Patch 定位。
                        </div>
                      </div>
                    }
                  />

                  <Space wrap>
                    <Input.Search
                      allowClear
                      placeholder="按组件名、用途搜索（如 Row / StatCard / LineChart）"
                      style={{ width: 320 }}
                      value={compSearch}
                      onChange={(e) => setCompSearch(e.target.value)}
                      data-testid="rules-component-search"
                    />
                    <Space size={6} wrap>
                      {['all', 'layout', 'display', 'filter', 'action'].map((cat) => (
                        <Button
                          key={cat}
                          size="small"
                          type={compCategory === cat ? 'primary' : 'default'}
                          onClick={() => setCompCategory(cat)}
                        >
                          {cat === 'all'
                            ? '全部'
                            : cat === 'layout'
                              ? '布局 Layout'
                              : cat === 'display'
                                ? '业务展示 Display'
                                : cat === 'filter'
                                  ? '筛选 Filter'
                                  : '操作 Action'}
                        </Button>
                      ))}
                    </Space>
                  </Space>

                  <Table<ComponentMetadata>
                    rowKey="type"
                    size="small"
                    pagination={{ pageSize: 12, hideOnSinglePage: true }}
                    scroll={{ x: 'max-content' }}
                    dataSource={filteredComponents}
                    expandable={{
                      expandedRowRender: (comp) => (
                        <div className="bi-grid bi-grid--equal-2" style={{ gap: 12 }}>
                          <div>
                            <div className="bi-filter-label" style={{ marginBottom: 4 }}>
                              Props 字段说明：
                            </div>
                            <pre className="code-viewer">
                              {JSON.stringify(comp.propsDescription, null, 2)}
                            </pre>
                          </div>
                          <div>
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                marginBottom: 4,
                              }}
                            >
                              <span className="bi-filter-label">标准 Spec 示例：</span>
                              <Button
                                size="small"
                                type="link"
                                onClick={() =>
                                  void copyText(
                                    JSON.stringify(comp.exampleSpec, null, 2),
                                    `${comp.type} Spec 示例`,
                                  )
                                }
                              >
                                复制示例
                              </Button>
                            </div>
                            <pre className="code-viewer">
                              {JSON.stringify(comp.exampleSpec, null, 2)}
                            </pre>
                          </div>
                        </div>
                      ),
                    }}
                    columns={[
                      {
                        title: '组件类型 (type)',
                        dataIndex: 'type',
                        width: 165,
                        render: (t: string) => (
                          <code style={{ color: '#38bdf8', fontWeight: 600 }}>{t}</code>
                        ),
                      },
                      {
                        title: '分类',
                        dataIndex: 'category',
                        width: 100,
                        render: (cat: string) => {
                          const color =
                            cat === 'layout'
                              ? 'blue'
                              : cat === 'display'
                                ? 'green'
                                : cat === 'filter'
                                  ? 'gold'
                                  : 'purple';
                          return <Tag color={color}>{cat}</Tag>;
                        },
                      },
                      {
                        title: '数据输入形态',
                        dataIndex: 'dataInputType',
                        width: 115,
                        render: (v?: string) => <Tag>{v ?? 'none'}</Tag>,
                      },
                      {
                        title: '支持子节点',
                        dataIndex: 'slots',
                        width: 110,
                        render: (slots: string[]) =>
                          slots.length > 0 ? (
                            <Tag color="cyan">{slots.join(', ')}</Tag>
                          ) : (
                            <span style={{ color: '#64748b' }}>叶子节点</span>
                          ),
                      },
                      { title: '说明', dataIndex: 'description' },
                      {
                        title: '典型场景',
                        dataIndex: 'useCases',
                        render: (u: string[]) => u.join('；'),
                      },
                    ]}
                  />
                </Space>
              ),
            },
            {
              key: 'data-binding',
              label: (
                <span>
                  <DatabaseOutlined style={{ marginRight: 6 }} />
                  4. 数据绑定、局部刷新与 DataSource ({datasources.length})
                </span>
              ),
              children: (
                <Space direction="vertical" size="large" style={{ width: '100%' }}>
                  <Descriptions
                    bordered
                    size="small"
                    column={1}
                    title="前端 json-render StateStore 路径与绑定语法约定"
                  >
                    <Descriptions.Item label="查询参数变量引用">
                      <code>{`{ "$var": "gameId" }`}</code> — 仅用于 <code>PageDocument.queries.*.params</code>，前端 QueryManager 解析变量并追踪依赖，切换 <code>gameId</code> 时<strong>仅重查依赖该变量的查询</strong>。
                    </Descriptions.Item>
                    <Descriptions.Item label="只读数据绑定">
                      <code>{`{ "$state": "/data/summary/totalCost" }`}</code> 或 <code>{`{ "$state": "/data/daily" }`}</code> — 官方 <code>json-render</code> 表达式，路径前缀必须命中某个 <code>queries[k].targetState</code>。
                    </Descriptions.Item>
                    <Descriptions.Item label="筛选器双向绑定">
                      <code>{`{ "$bindState": "/variables/gameId" }`}</code> — 配合筛选组件 <code>variable</code> 属性使用，变更时派发白名单 Action <code>setVariable</code>。
                    </Descriptions.Item>
                    <Descriptions.Item label="单卡局部刷新与元状态">
                      每个业务卡片的 <code>props.queryKey</code> 必须等于 <code>PageDocument.queries</code> 中对应查询的 key（例如 <code>&quot;summary&quot;</code>、<code>&quot;recharge&quot;</code>）。前端自动在卡片右上角挂载局部刷新按钮，读取 <code>/meta/queries/&lt;queryKey&gt;</code> 渲染独立 Loading / Error 状态，点击时仅发送该单条查询且携带 <code>bypassCache: true</code>。
                    </Descriptions.Item>
                    <Descriptions.Item label="数值格式化口径约定">
                      后端统一返回原始数值（禁止返回格式化后的字符串）：<code>currency</code> 返回数字元、<code>percent</code> 返回 0~1 小数（如 0.084 → 8.40%）、<code>ratio</code> 返回倍率小数（如 1.24 → 1.24x）、<code>date</code> 返回 <code>YYYY-MM-DD</code>。
                    </Descriptions.Item>
                  </Descriptions>

                  <div className="bi-grid bi-grid--equal-2" style={{ gap: 14 }}>
                    <div>
                      <div className="bi-card-title" style={{ marginBottom: 8 }}>
                        POST /api/data/query-batch 请求示例
                      </div>
                      <pre className="code-viewer">
                        {JSON.stringify(SAMPLE_QUERY_BATCH_REQ, null, 2)}
                      </pre>
                    </div>
                    <div>
                      <div className="bi-card-title" style={{ marginBottom: 8 }}>
                        POST /api/data/query-batch 响应示例（单条错误隔离）
                      </div>
                      <pre className="code-viewer">
                        {JSON.stringify(SAMPLE_QUERY_BATCH_RES, null, 2)}
                      </pre>
                    </div>
                  </div>

                  <div>
                    <div className="bi-card-title" style={{ marginBottom: 8 }}>
                      已注册语义 DataSource 契约明细（来自 GET /api/catalog/datasources）
                    </div>
                    <Collapse
                      items={datasources.map((ds: DataSourceMetadata) => ({
                        key: ds.id,
                        label: (
                          <Space wrap>
                            <code style={{ color: '#34d399', fontWeight: 700 }}>{ds.id}</code>
                            <span>{ds.name}</span>
                            <Tag color="blue">{ds.resultType}</Tag>
                            {ds.requiredRoles.map((r) => (
                              <Tag key={r} color="purple">
                                role: {r}
                              </Tag>
                            ))}
                          </Space>
                        ),
                        children: (
                          <Space direction="vertical" style={{ width: '100%' }} size="middle">
                            <div style={{ color: '#cbd5e1', fontSize: 13 }}>{ds.description}</div>
                            {ds.params.length > 0 && (
                              <div>
                                <div className="bi-filter-label" style={{ marginBottom: 4 }}>
                                  入参定义：
                                </div>
                                <Table
                                  rowKey="name"
                                  size="small"
                                  pagination={false}
                                  dataSource={ds.params}
                                  columns={[
                                    { title: '参数名', dataIndex: 'name', width: 120 },
                                    { title: '类型', dataIndex: 'type', width: 100 },
                                    {
                                      title: '默认值',
                                      dataIndex: 'defaultValue',
                                      width: 110,
                                      render: (v) => (v !== undefined ? String(v) : '-'),
                                    },
                                    {
                                      title: '可选值',
                                      dataIndex: 'allowedValues',
                                      render: (arr?: string[]) =>
                                        arr ? arr.join(' | ') : '-',
                                    },
                                    { title: '说明', dataIndex: 'description' },
                                  ]}
                                />
                              </div>
                            )}
                            <div>
                              <div className="bi-filter-label" style={{ marginBottom: 4 }}>
                                返回字段 Schema：
                              </div>
                              <Table
                                rowKey="name"
                                size="small"
                                pagination={false}
                                dataSource={ds.fields}
                                columns={[
                                  {
                                    title: '字段名',
                                    dataIndex: 'name',
                                    width: 140,
                                    render: (n: string) => <code>{n}</code>,
                                  },
                                  { title: '中文名', dataIndex: 'label', width: 120 },
                                  {
                                    title: '字段类型',
                                    dataIndex: 'type',
                                    width: 100,
                                    render: (t: string) => <Tag color="cyan">{t}</Tag>,
                                  },
                                  { title: '单位', dataIndex: 'unit', width: 70 },
                                  { title: '口径/公式', dataIndex: 'formula', width: 180 },
                                  { title: '说明', dataIndex: 'description' },
                                ]}
                              />
                            </div>
                          </Space>
                        ),
                      }))}
                    />
                  </div>
                </Space>
              ),
            },
            {
              key: 'sse',
              label: (
                <span>
                  <ThunderboltOutlined style={{ marginRight: 6 }} />
                  5. SSE 流式生成协议
                </span>
              ),
              children: (
                <Space direction="vertical" size="large" style={{ width: '100%' }}>
                  <Alert
                    type="info"
                    showIcon
                    message="POST /api/dashboards/generate-stream 强制响应头与事件时序"
                    description={
                      <div>
                        <div>
                          • <strong>响应头</strong>：
                          <code>Content-Type: text/event-stream; charset=utf-8</code>、
                          <code>Cache-Control: no-cache, no-transform</code>、
                          <code>Connection: keep-alive</code>、
                          <code>X-Accel-Buffering: no</code>（防止 Nginx/代理缓冲导致无法流式到达）。
                        </div>
                        <div>
                          • <strong>事件顺序</strong>：<code>stage (catalog/planning)</code> →{' '}
                          <code>meta</code>（先下发 variables 与 queries，前端立刻拉取真实业务数据）→{' '}
                          <code>patch</code>（逐条 RFC 6902 SpecStream 补丁）→{' '}
                          <code>complete</code>（携带服务端校验通过的完整 PageDocument 与 ValidationReport）→{' '}
                          <code>stage (done)</code>。
                        </div>
                        <div>
                          • <strong>拓扑顺序不变量</strong>：每个元素必须先以 <code>children: []</code> 写入 <code>/elements/&lt;id&gt;</code>，再通过 <code>/elements/&lt;parentId&gt;/children/-</code> 挂载，保证流式过程每一帧都无悬空子节点引用。
                        </div>
                        <div>
                          • <strong>客户端断连处理</strong>：Node.js / Fastify 后端必须监听响应流 <code>reply.raw.on(&apos;close&apos;)</code>（且检查 <code>!reply.raw.writableEnded</code>），严禁监听 <code>request.raw.on(&apos;close&apos;)</code>（POST body 读完即触发）。
                        </div>
                      </div>
                    }
                  />

                  <div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginBottom: 8,
                      }}
                    >
                      <div className="bi-card-title">SSE Wire Format 报文示例</div>
                      <Button
                        size="small"
                        icon={<CopyOutlined />}
                        onClick={() => void copyText(SAMPLE_SSE_STREAM, 'SSE 报文示例')}
                      >
                        复制示例
                      </Button>
                    </div>
                    <pre className="code-viewer" data-testid="sse-wire-example">
                      {SAMPLE_SSE_STREAM}
                    </pre>
                  </div>
                </Space>
              ),
            },
            {
              key: 'versioning',
              label: (
                <span>
                  <CodeOutlined style={{ marginRight: 6 }} />
                  6. 拖拽编辑、版本乐观锁与联调自检
                </span>
              ),
              children: (
                <Space direction="vertical" size="large" style={{ width: '100%' }}>
                  <Descriptions
                    bordered
                    size="small"
                    column={1}
                    title="编辑态（AI 修改 + 拖拽布局）与持久化版本规则"
                  >
                    <Descriptions.Item label="AI 增量修改边界">
                      <code>POST /api/dashboards/:id/ai-edit</code> 仅生成并返回候选 <code>candidateDocument</code>、<code>patches</code>、<code>changeSummary</code> 与 <code>validation</code>，<strong>禁止直接写入数据库</strong>。用户确认预览后点击保存才调用 <code>PUT /api/dashboards/:id</code>。
                    </Descriptions.Item>
                    <Descriptions.Item label="拖拽布局编辑原则">
                      拖拽排序、跨容器移动、容器 <code>Row/Column/Grid</code> 一键切换完全在前端基于稳定节点 ID 修改 <code>ui.elements</code>，并通过 <code>diffToPatches</code> 计算与已保存版本的 RFC 6902 Patch；全程不调用任何 AI 接口，点击保存后走同一套 <code>PUT /api/dashboards/:id</code> 落库。
                    </Descriptions.Item>
                    <Descriptions.Item label="不可变 Revision 与乐观锁">
                      每次保存/回滚均生成新的不可变 <code>DashboardRevision</code>（版本号单调递增）。请求必须附带客户端加载时的 <code>baseRevision</code>；若数据库 <code>currentRevision !== baseRevision</code>，服务端必须拒绝写入并返回 <code>HTTP 409 REVISION_CONFLICT</code>。
                    </Descriptions.Item>
                    <Descriptions.Item label="身份与鉴权边界">
                      服务端必须从可信 Token/Session/环境变量解析当前用户（<code>id</code>、<code>roles</code>），严禁相信客户端请求体中传入的 <code>ownerId</code>；创建/修改/删除/发布/回滚要求具备 <code>editor</code> 角色，查询数据源校验对应 <code>requiredRoles</code>。
                    </Descriptions.Item>
                  </Descriptions>

                  <div className="bi-panel bi-panel--subtle" style={{ padding: 16 }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 12,
                      }}
                    >
                      <Space>
                        <CheckCircleOutlined style={{ color: '#34d399' }} />
                        <span className="bi-card-title">后端联调上线自检清单</span>
                      </Space>
                      <Tag color={checkedItems.length === INTEGRATION_CHECKLIST.length ? 'green' : 'blue'}>
                        已完成 {checkedItems.length} / {INTEGRATION_CHECKLIST.length}
                      </Tag>
                    </div>
                    <Checkbox.Group
                      value={checkedItems}
                      onChange={(vals) => setCheckedItems(vals as string[])}
                      style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
                    >
                      {INTEGRATION_CHECKLIST.map((item) => (
                        <Checkbox key={item} value={item} style={{ color: '#e2e8f0' }}>
                          {item}
                        </Checkbox>
                      ))}
                    </Checkbox.Group>
                  </div>
                </Space>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
};
