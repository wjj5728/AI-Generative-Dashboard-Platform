# AI Schema Generation & Incremental Editing

## Provider Abstraction (`apps/server/src/ai/provider.ts`)

Both generation and editing run strictly on the backend behind a replaceable `AIProvider` interface:

```ts
export interface AIProvider {
  readonly name: string;
  generate(input: GenerateInput): Promise<PageDocument>;
  edit(input: EditInput): Promise<EditOutput>;
}
```

### 1. MockAIProvider (Default — Zero API Key Required)

Enabled by default (`AI_PROVIDER=mock`).

- **Three distinct valid component compositions**:
  1. `game-ads` (**游戏广告投放数据看板**): `DashboardGrid (sidebar-main-sidebar)` + `StatCard` + `LineChart` + `BarChart` + `DonutChart` + `ProgressList` + `MetricList` + `DataTable`.
  2. `traffic-analysis` (**买量流量渠道分析看板**): `MetricGroup` + `BarChart` + `PieChart` + `ProgressList` + `DataTable`.
  3. `revenue-analysis` (**游戏商业化收入分析看板**): `StatCard` + `LineChart` + `BarChart` (dual recharge breakdowns).
- **Controlled Incremental Editing (`applySpecPatch` / `diffToPatches`)**:
  Supports natural language instructions while keeping all unrelated element IDs stable:
  - `将趋势图移动到顶部` — reorders root children to place trend section directly below toolbar.
  - `新增 ROI 卡片` (or CPA / ARPU card) — inserts a new `StatCard` with a unique deterministic ID.
  - `将饼图改成柱状图` — transforms `PieChart` / `DonutChart` into `BarChart` in-place (same node ID).
  - `删除充值分布` — removes recharge chart node without affecting unrelated components/queries.
  - `切换为双栏布局` — switches primary `DashboardGrid` preset to `equal-2`.
  - `切换为横向 Row 布局` / `切换为纵向 Column 布局` / `把趋势图改为横向并排` — automatically infers `Row` vs `Column` direction and patches targeted layout containers in-place.

- **Natural-Language `Row` vs `Column` Auto-Detection (`apps/server/src/ai/layout-intent.ts`)**:
  During both generation and editing, `inferLayoutIntent(prompt)` detects horizontal intents (`横向`, `水平`, `并排`, `左右布局`, `row`, `horizontal`), vertical intents (`纵向`, `垂直`, `竖排`, `堆叠`, `column`, `vertical`), and mixed nested intents (`Row` + `Column`), automatically selecting the matching layout components (`Row` with `equalWidth: true` or `Column`).

### 2. OpenAICompatibleProvider

Set in `.env` (server-side only):

```env
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
```

- Uses `dashboardCatalog.prompt()` from `@json-render/core` combined with authorized public DataSource metadata and `PageDocument` rules.
- Runs `@json-render/core`'s `autoFixSpec()` and server-side `validatePageDocument()` before accepting any output.
- Computes RFC 6902 JSON patches via `diffToPatches()` for editor diff inspection.

## SSE Progressive SpecStream Output

`POST /api/dashboards/generate-stream` simulates/delivers Server-Sent Events (`text/event-stream`) for progressive UI rendering:

1. `event: stage` — Emits lifecycle progress (`catalog` → `planning` → `spec` → `validating` → `done`).
2. `event: meta` — Emits `title`, `variables`, and `queries` early so the frontend `DashboardQueryManager` immediately queries live DataSources while UI components stream in.
3. `event: patch` — Streams topologically ordered RFC 6902 JSON Patches (`buildProgressiveSpecPatches`) compiled incrementally by `@json-render/core`'s `createSpecStreamCompiler`. Every intermediate snapshot is structurally valid (`validateSpec` passes with zero dangling children).
4. `event: complete` — Emits the final server-validated `PageDocument` and `ValidationReport`.
