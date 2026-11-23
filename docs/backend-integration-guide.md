# 前端规则与后端接入指南（Backend Integration Guide）

本文档完整梳理 **AI Generative Dashboard Platform V2** 前端的渲染协议、API 契约、组件目录、数据绑定、单卡局部刷新、SSE 流式生成、拖拽布局与版本乐观锁规则，供任意后端服务（Node.js / Java / Go / Python 等）按协议直接对接当前前端。

> 💡 本规范也提供实时交互式在线版本：启动项目后访问 `http://localhost:3000/integration-rules`（实时同步运行时的 Component Catalog 与 DataSource Catalog 元数据）。

---

## 1. 统一 HTTP 通信与状态码规范

### 1.1 统一响应信封

除 SSE 接口（`POST /api/dashboards/generate-stream`）外，**所有接口必须返回以下 JSON 信封**（前端由 `apps/web/src/api/client.ts` 统一解包）：

```json
// 成功
{
  "ok": true,
  "data": { ... }
}

// 失败
{
  "ok": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Revision conflict: expected baseRevision 1, but currentRevision is 2.",
    "details": { "baseRevision": 1, "currentRevision": 2 }
  }
}
```

### 1.2 HTTP 状态码前端行为映射

| HTTP 状态码 | 典型 `error.code` | 前端处理行为 |
| --- | --- | --- |
| `200` / `201` | — | 解包 `payload.data` |
| `400` | `INVALID_REQUEST` / `INVALID_REVISION` | 展示参数错误提示 |
| `401` | `UNAUTHORIZED` | 提示未认证（生产可跳登录） |
| `403` | `FORBIDDEN` | 提示无编辑/发布/数据源访问权限 |
| `404` | `DASHBOARD_NOT_FOUND` / `REVISION_NOT_FOUND` | 页面展示不存在提示与返回列表入口 |
| `409` | `REVISION_CONFLICT` | 编辑页弹出乐观锁冲突提示，并自动重新拉取最新 Revision |
| `422` | `SCHEMA_VALIDATION_FAILED` | 将 `error.details`（`ValidationReport`）渲染到调试面板的 `Validation Errors` |
| `500` | `INTERNAL_ERROR` | 展示服务端异常提示 |

### 1.3 前端路由与接口调用边界

| 前端路由 | 调用的后端接口 | 强约束 |
| --- | --- | --- |
| `/dashboards` | `GET /api/dashboards`, `DELETE /api/dashboards/:id` | 仅操作元数据 |
| `/dashboards/new` | `POST /api/dashboards/generate-stream`, `POST /api/data/query-batch`, `POST /api/dashboards` | 流式预览期间即可查询真实业务数据 |
| `/dashboards/:id` | `GET /api/dashboards/:id`, `POST /api/data/query-batch`, `POST /api/dashboards/:id/publish` | **严禁调用任何 AI 生成或 AI 编辑接口** |
| `/dashboards/:id/edit` | `GET /api/dashboards/:id`, `GET /api/dashboards/:id/revisions`, `POST /api/dashboards/:id/ai-edit`, `PUT /api/dashboards/:id`, `POST /api/dashboards/:id/publish`, `POST /api/dashboards/:id/rollback`, `POST /api/data/query-batch` | 拖拽修改完全在前端生成 Patch，保存走 `PUT` |
| `/integration-rules` | `GET /api/catalog/components`, `GET /api/catalog/datasources` | 实时展示前后端接入规范与元数据 |

---

## 2. PageDocument 协议与 14 项强制校验规则

### 2.1 `PageDocument` 顶层结构

```ts
interface PageDocument {
  contractVersion: '2.0.0'; // 必须精确匹配，否则前端拒绝渲染
  catalogVersion: '2.0.0';  // 必须精确匹配，否则前端拒绝渲染
  id?: string;
  title: string;            // 1~160 字符
  description?: string;     // <= 1000 字符
  variables: Record<string, VariableDefinition>;
  queries: Record<string, QueryDefinition>;
  ui: {
    root: string;
    elements: Record<string, UIElement>;
    // 注意：落库时禁止包含 ui.state（运行时业务数据不得持久化）
  };
}
```

### 2.2 14 项强制校验规则（前端与服务端共享同一契约）

1. **`contractVersion`** 必须等于 `"2.0.0"`。
2. **`catalogVersion`** 必须等于 `"2.0.0"`。
3. **组件类型白名单**：所有 `ui.elements[id].type` 必须属于已注册的 23 个组件之一。
4. **Props 类型校验**：每个节点的 `props` 必须通过对应 Zod Schema；可绑定属性允许字面量或 `{ "$state": "/..." }` / `{ "$bindState": "/..." }`。
5. **根节点完整性**：`ui.root` 必须非空且存在于 `ui.elements`。
6. **子节点引用与环路检测**：所有 `children` / `slots` 引用的 ID 必须存在，且不能形成任何循环引用。
7. **最大嵌套深度**：从 `root` 起深度不得超过 `12`。
8. **最大节点数量**：`ui.elements` 总数不得超过 `120`。
9. **DataSource 存在性**：`queries[*].resource` 必须是已注册的语义数据源 ID。
10. **查询参数校验**：解析变量默认值后的 `params` 必须通过对应 DataSource 的 `paramsSchema`。
11. **字段存在性与类型匹配**：
    - `StatCard.value` / `delta` 等标量绑定路径 `/data/<queryId>/<field>` 的字段必须存在，且 `delta` 必须为数值型。
    - `LineChart` / `BarChart` / `PieChart` / `DonutChart` / `DataTable` / `MetricList` / `ProgressList` 的 `data` 必须绑定 `resultType === "array"` 的数据源；图表的数值系列字段（`series[].field`、`valueField`、`percentField`）必须为数值型字段。
12. **变量引用合法性**：`queries` 中所有 `{ "$var": "<name>" }` 以及组件中所有 `/variables/<name>` 绑定必须已在 `variables` 中声明。
13. **动作白名单与内容安全**：
    - 仅允许动作：`setVariable`、`refreshData`、`changeTab`、`navigate`、`setState`。
    - 递归扫描整个 `PageDocument`，严禁包含 `<script`、`javascript:`、`eval(`、`new Function(`、原始 SQL（`SELECT ... FROM` / `DROP TABLE`）、原型污染键（`__proto__` / `constructor` / `prototype`）与内联函数。
14. **RBAC 权限校验**：当前服务端解析用户的 `roles` 必须包含所引用全部 DataSource 的 `requiredRoles`。

---

## 3. 组件目录与自然语言布局规则（23 个组件）

### 3.1 设计 Token（禁止后端/LLM 输出自由 CSS）

- `gap` / `padding` / `spacing`：`none | xs | sm | md | lg | xl`
- `align`：`start | center | end | stretch`
- `justify`：`start | center | end | between | around`
- `width`：`auto | full | 1/2 | 1/3 | 2/3 | 1/4 | 3/4`
- `format`：`number | currency | percent | ratio | integer | compact | text | date`
- `accent`：`cyan | emerald | amber | rose | indigo | slate`

### 3.2 布局组件（9 个）及自动选型规范

| 组件 | 适用场景 | 关键 Props |
| --- | --- | --- |
| `Row` | **自然语言要求横向、水平、并排、左右布局、row 时优先选用** | `gap`, `align`, `justify`, `wrap`, `equalWidth`（多卡片并排时设为 `true`）, `width` |
| `Column` | **自然语言要求纵向、垂直、竖排、上下堆叠、column 时优先选用** | `gap`, `align`, `width`, `span` |
| `DashboardRow` | 工具栏或横向行容器（兼容别名） | 同 `Row` |
| `DashboardColumn` | 页面主纵向容器或分列（兼容别名） | 同 `Column` |
| `DashboardGrid` | 多栏 BI 网格布局 | `preset`: `equal-2` \| `equal-3` \| `equal-4` \| `sidebar-main` \| `sidebar-main-sidebar`, `gap` |
| `DashboardPanel` | 顶部工具栏或区块面板 | `title`, `subtitle`, `tone` (`default`/`elevated`/`subtle`), `padding` |
| `DashboardCard` | 通用深色卡片容器 | `title`, `subtitle`, `badge`, `bordered`, `padding` |
| `Tabs` | 选项卡容器 | `tabGroupId`, `activeKey`, `defaultActiveKey`, `items: [{ key, label }]` |
| `Divider` | 分割线 | `label`, `orientation`, `spacing` |

### 3.3 业务展示组件（11 个）与数据绑定要求

| 组件 | 数据绑定 Prop | 必须配置的字段 Props | 局部刷新支持 |
| --- | --- | --- | --- |
| `StatCard` | `value: { "$state": "/data/<q>/<field>" }`, `delta?` | `title`, `format`, `accent`, **`queryKey`** | 提供 `queryKey` 自动展示右上角刷新按钮 |
| `MetricGroup` | `items[].value: { "$state": "/data/<q>/<field>" }` | `title`, `columns` (1-4), `items[]`, **`queryKey`** | 同上 |
| `MetricList` | `data: { "$state": "/data/<q>" }` | `labelField`, `valueField`, `secondaryField?`, `valueFormat`, **`queryKey`** | 同上 |
| `ProgressList` | `data: { "$state": "/data/<q>" }` | `labelField`, `valueField`, `percentField` (0~1), **`queryKey`** | 同上 |
| `LineChart` | `data: { "$state": "/data/<q>" }` | `xField`, `series: [{ field, name, color?, smooth?, area? }]`, `yAxisFormat`, **`queryKey`** | 同上 |
| `BarChart` | `data: { "$state": "/data/<q>" }` | `xField`, `series[]`, `horizontal?`, `stacked?`, `yAxisFormat`, **`queryKey`** | 同上 |
| `PieChart` | `data: { "$state": "/data/<q>" }` | `nameField`, `valueField`, `valueFormat`, **`queryKey`** | 同上 |
| `DonutChart` | `data: { "$state": "/data/<q>" }` | `nameField`, `valueField`, `centerLabel?`, `valueFormat`, **`queryKey`** | 同上 |
| `DataTable` | `data: { "$state": "/data/<q>" }` | `rowKey`, `columns: [{ key, title, dataIndex, format?, sortable?, align?, width?, fixed? }]`, `pageSize`, **`queryKey`** | 同上 |
| `Heading` | `text` / `subtitle` | `level` (1-4), `badge?` | 无数据绑定不显示 |
| `Text` | `content` | `tone`, `size` | 无数据绑定不显示 |

### 3.4 筛选与操作组件（3 个）

- `SelectFilter`：`variable` + `value: { "$bindState": "/variables/<var>" }` + `options: { "$state": "/data/games" }`（或静态数组）。变更触发 `setVariable`。
- `DateRangeFilter`：`variable` + `value: { "$bindState": "/variables/dateRange" }`。默认选项 `last7days` / `last14days` / `last30days` / `all`。变更触发 `setVariable`。
- `RefreshButton`：`label` + 可选 `queryIds?: string[]`。点击触发 `refreshData`。

---

## 4. 数据查询、局部刷新与数值格式规则

### 4.1 `StateStore` 路径约定

前端通过 `@json-render/react` 的 `createStateStore` 维护以下固定路径命名空间：

- `/variables/<varName>`：当前筛选变量值（初始化自 `PageDocument.variables[*].defaultValue`）。
- `/data/<queryId>`：后端查询返回体写入路径（严格对应 `PageDocument.queries[queryId].targetState`）。
- `/ui/tabs/<tabGroupId>`：Tabs 激活标签页状态。
- `/meta/queries/<queryId>`：单查询运行态 `{ status: 'idle'|'loading'|'success'|'error', resource, durationMs, cached, error, updatedAt }`。
- `/meta/isRefreshing`：仅全局刷新时为 `true`，单卡局部刷新时保持 `false` 以避免其他卡片抖动。

### 4.2 `POST /api/data/query-batch` 接入规则

- **请求去重与依赖刷新**：前端会自动合并完全等价的 `(resource, resolvedParams)` 请求；筛选变量变更时，前端仅发送依赖该变量的查询。
- **局部刷新穿透缓存**：当用户点击某张卡片右上角的局部刷新按钮时，前端发送**仅包含该卡片单个 `queryKey`** 的 batch 请求，并携带 `"bypassCache": true`。后端必须支持 `bypassCache: true` 跳过服务端缓存重新查询。
- **单条错误隔离**：batch 中某一条查询鉴权失败或参数非法时，HTTP 仍返回 `200`（前提是外层请求体结构合法），在 `results[key]` 中返回 `{ status: "error", error: { code, message } }`，不得阻断同批次其他成功查询。
- **原始数值约定**：后端一律返回原始数字（如金额 `562410.5`、百分比小数 `0.084`、ROI 倍率 `1.24`），由前端统一根据组件 `format` 进行千分位/货币/百分比格式化。

---

## 5. SSE 流式生成接入规范（`POST /api/dashboards/generate-stream`）

### 5.1 强制 HTTP 响应头

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream; charset=utf-8
Cache-Control: no-cache, no-transform
Connection: keep-alive
X-Accel-Buffering: no
```

> 若前置有 Nginx / 网关反向代理，务必关闭代理缓冲（`proxy_buffering off;` 或遵循 `X-Accel-Buffering: no`）。

### 5.2 五类 SSE 事件格式与严格时序

每个事件由 `event: <type>\ndata: <json>\n\n` 组成：

1. **`event: stage`**（进度提示）：
   `{ "step": "catalog" | "planning" | "spec" | "validating" | "done", "message": "...", "progress": 0..100 }`
2. **`event: meta`**（必须在第一条 `patch` 之前发送）：
   `{ "provider", "contractVersion", "catalogVersion", "title", "description?", "variables", "queries" }`
   前端收到 `meta` 后即初始化 `StateStore` 并并发拉取真实 DataSource 数据。
3. **`event: patch`**（逐条 RFC 6902 SpecStream 补丁）：
   `{ "patch": { "op": "add", "path": "...", "value": ... }, "index": 1, "total": 45, "elementId": "...", "componentType": "..." }`
   **强制拓扑不变量**：
   - 先 `{ "op": "add", "path": "/root", "value": "root" }`
   - 每个节点先以 `children: []` 写入 `/elements/<id>`
   - 再通过 `{ "op": "add", "path": "/elements/<parentId>/children/-", "value": "<childId>" }` 挂载到父节点
   确保前端 `createSpecStreamCompiler` 在每一帧都能无报错实时渲染。
4. **`event: complete`**（最终校验通过结果）：
   `{ "provider", "pageDocument": PageDocument, "validation": ValidationReport }`
   前端收到此事件后解锁“保存并生成独立 URL”按钮。
5. **`event: error`**（流式期间发生校验失败或模型异常）：
   `{ "code": "...", "message": "...", "details?": ValidationReport }`

### 5.3 服务端断连检测注意事项

前端支持点击“停止流式输出”通过 `AbortController` 主动断开连接。在 Node.js / Fastify 后端实现时，必须监听**响应流关闭**：

```ts
let closed = false;
reply.raw.on('close', () => {
  if (!reply.raw.writableEnded) closed = true;
});
```

> ⚠️ 严禁监听 `request.raw.on('close')`，因为在 Node 18+ 中 `POST` 请求体读取完毕后 `request.raw` 会立即触发 `close`，导致流式推送提前中断。

---

## 6. AI 编辑、拖拽布局与版本乐观锁规则

- **候选预览不自动落库**：`POST /api/dashboards/:id/ai-edit` 只返回 `{ provider, candidateDocument, patches, changeSummary, validation }`，不修改数据库。
- **拖拽编辑无缝兼容**：前端拖拽排序/跨容器移动/容器 `Row`/`Col`/`2列`/`3列` 切换均在客户端更新 `candidateDocument.ui` 并计算与已保存版本的 RFC 6902 Patch；点击保存时通过 `PUT /api/dashboards/:id` 统一落库，后端无需额外开发拖拽专用接口。
- **稳定节点 ID**：AI 修改必须尽量保留无关节点的 ID，避免破坏其他卡片或历史对比。
- **乐观锁与不可变历史**：
  - `PUT /api/dashboards/:id` 与 `POST /api/dashboards/:id/rollback` 必须校验 `baseRevision === db.currentRevision`，不一致返回 `409 REVISION_CONFLICT`。
  - 每次保存和回滚均插入一条新的不可变 `DashboardRevision` 记录（版本号递增），绝不覆盖旧版本。
  - `POST /api/dashboards` 与修改类接口严禁采信客户端请求体中的 `ownerId`，必须从服务端鉴权上下文获取操作者身份。
