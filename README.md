# AI Generative Dashboard Platform V2

A full-stack **Generative UI BI Platform** powered by [`@json-render/core`](https://github.com/vercel-labs/json-render) and [`@json-render/react`](https://json-render.dev/docs/api/react). Users describe a business dashboard in natural language, the backend composes a strictly validated `PageDocument` (`json-render` UI Spec + variables + semantic DataSource queries), persists immutable revisions in SQLite, and serves an independent shareable URL that restores the live interactive dashboard **without calling any LLM**.

---

## Quick Start

```bash
# 1. Install dependencies
pnpm install

# 2. Initialize SQLite database schema
pnpm db:push

# 3. Seed demo dashboards (including "seed-game-ads-dashboard")
pnpm db:seed

# 4. Start Web (localhost:3000) and API (localhost:3001) together
pnpm dev
```

Default mode uses `AI_PROVIDER=mock` — **no API key is required**.

Open:
- Dashboard List: `http://localhost:3000/dashboards`
- AI Generator Studio: `http://localhost:3000/dashboards/new`
- Seed BI Dashboard Viewer: `http://localhost:3000/dashboards/seed-game-ads-dashboard`
- Backend Integration Rules (Live Interactive Spec): `http://localhost:3000/integration-rules`

---

## Monorepo Structure

```text
.
├── apps/
│   ├── web/                     # React 18 + Rsbuild + Ant Design 5 + ECharts + TanStack Query + json-render
│   │   └── src/
│   │       ├── api/             # Typed API client
│   │       ├── components/      # AppLayout & Developer DebugInspector
│   │       ├── data/            # DashboardQueryManager & value formatters
│   │       ├── pages/           # /dashboards, /dashboards/new, /dashboards/:id, /dashboards/:id/edit
│   │       ├── renderer/        # defineRegistry, DashboardRenderer, layout/chart/display/filter components
│   │       └── styles/          # Dark BI theme & responsive grid presets
│   └── server/                  # Fastify + Prisma + SQLite
│       └── src/
│           ├── ai/              # AIProvider interface, MockAIProvider, OpenAICompatibleProvider, templates
│           ├── datasource/      # DataSourceRegistry, deterministic 3-game/35-day mock dataset
│           ├── repositories/    # DashboardRepository (immutable revisions + optimistic locking)
│           ├── routes/          # Dashboards, AI Generate/Edit, Catalog, Query-Batch APIs
│           └── services/        # Server-side trusted demo auth resolver
├── packages/
│   ├── contracts/               # Shared PageDocument, API contracts, query dependency/dedup utilities
│   ├── datasource-contract/     # Public semantic DataSource Zod contracts & metadata (no handlers)
│   └── component-catalog/       # Official json-render defineCatalog (21 components) + 14-point validator
├── prisma/                      # Prisma SQLite schema & seed script
├── fixtures/                    # Exported canonical PageDocument JSON fixture
├── tests/
│   ├── unit/                    # Schema validator & query engine tests
│   ├── integration/             # Full backend lifecycle, optimistic lock 409, RBAC tests
│   └── e2e/                     # Playwright 4-scenario end-to-end acceptance tests
└── docs/                        # Detailed architecture & protocol documentation
```

---

## Four-Layer Architecture

1. **Layer 1 — AI Schema Generator (`apps/server/src/ai`)**: Translates natural language + Catalog metadata into validated `PageDocument`s or controlled RFC 6902 JSON patches.
2. **Layer 2 — Schema Repository (`apps/server/src/repositories`)**: Stores `Dashboard` and immutable `DashboardRevision` snapshots in SQLite with optimistic locking (`409` on conflict), publish state, and revision rollback. Never persists runtime business data.
3. **Layer 3 — Data Query Engine (`apps/server/src/datasource` & `apps/web/src/data/query-manager.ts`)**: Semantic DataSources (`ads.games`, `ads.summary`, `ads.daily`, `ads.recharge`, `ads.traffic`, `ads.conversion`), `$var` resolution, dependency-based selective re-fetching, request deduplication, caching, and independent batch error handling.
4. **Layer 4 — React UI Renderer (`apps/web/src/renderer`)**: Uses official `@json-render/react` `defineRegistry`, `createStateStore`, `JSONUIProvider`, and `Renderer` to render 21 composable BI components with Loading/Empty/Error states and zero inline functions.

See detailed docs:
- [docs/architecture.md](docs/architecture.md)
- [docs/page-document.md](docs/page-document.md)
- [docs/component-catalog.md](docs/component-catalog.md)
- [docs/datasource-contract.md](docs/datasource-contract.md)
- [docs/data-binding.md](docs/data-binding.md)
- [docs/api-contract.md](docs/api-contract.md)
- [docs/ai-generation.md](docs/ai-generation.md)
- [docs/backend-integration-guide.md](docs/backend-integration-guide.md) (Detailed Backend Integration Specification)
- [docs/deployment.md](docs/deployment.md) (Free Deployment Guide for Vercel / Render / Koyeb)

---

## PageDocument Example

See full generated fixture at [`fixtures/game-ads-page-document.json`](fixtures/game-ads-page-document.json):

```json
{
  "contractVersion": "2.0.0",
  "catalogVersion": "2.0.0",
  "title": "游戏广告投放数据看板",
  "variables": {
    "gameId": { "type": "string", "defaultValue": "all", "label": "游戏" },
    "dateRange": { "type": "dateRange", "defaultValue": "last14days", "label": "时间周期" }
  },
  "queries": {
    "summary": {
      "resource": "ads.summary",
      "params": {
        "gameId": { "$var": "gameId" },
        "dateRange": { "$var": "dateRange" }
      },
      "targetState": "/data/summary"
    }
  },
  "ui": {
    "root": "root",
    "elements": {
      "stat-cost": {
        "type": "StatCard",
        "props": {
          "title": "总消耗",
          "value": { "$state": "/data/summary/totalCost" },
          "format": "currency",
          "queryKey": "summary"
        },
        "children": []
      }
    }
  }
}
```

---

## How to Extend

### Adding a New UI Component

1. Declare its Zod props schema, slots, and description in `packages/component-catalog/src/catalog.ts` (`defineCatalog`) and add an entry to `COMPONENT_METADATA`.
2. If the component binds to structured DataSource fields, add field-type validation rules in `packages/component-catalog/src/validator.ts`.
3. Implement the React component in `apps/web/src/renderer/` and register it in `defineRegistry(dashboardCatalog, { components: { ... } })` inside `apps/web/src/renderer/registry.tsx`.

### Adding a New Semantic DataSource

1. Define its `paramsSchema`, `resultSchema`, `requiredRoles`, and public `metadata` in `packages/datasource-contract/src/contracts.ts` and add it to `ALL_DATASOURCE_CONTRACTS`.
2. Implement and register its backend-only `handler` in `apps/server/src/datasource/registry.ts` (`createDefaultDataSourceRegistry`).

### Using a Real OpenAI-Compatible LLM

Copy `.env.example` to `.env` and set:

```env
AI_PROVIDER=openai
OPENAI_API_KEY=your-server-side-api-key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
```

API keys remain strictly on the backend (`apps/server`) and are never exposed to the browser.

---

## Verification & Testing Commands

```bash
pnpm typecheck   # TypeScript typecheck across all 5 packages
pnpm lint        # ESLint across apps, packages, and tests
pnpm build       # Production build (TypeScript + Rsbuild web bundle)
pnpm test        # Vitest unit + backend integration tests
pnpm test:e2e    # Playwright 4-scenario Chromium E2E acceptance suite
```

---

## Known Limitations

- **OpenAI Provider Token-Level Streaming**: `POST /api/dashboards/generate-stream` streams progressive SSE `stage` / `meta` / RFC 6902 `patch` events for both Mock and OpenAI-compatible providers (currently streaming validated SpecStream patches after LLM JSON completion in OpenAI mode).
- **Snapshot Reports**: Dashboards intentionally persist declarative schemas only and query live DataSources on reopen; frozen point-in-time report snapshots would be added as a separate `DashboardSnapshot` table.
- **Drag-and-Drop Scope**: `/dashboards/:id/edit` supports visual drag-and-drop reordering, cross-container moves across `Row` / `Column` / `DashboardGrid`, 1-click container layout switching, multi-step undo, and RFC 6902 JSON Patch persistence; full property-inspector editing (custom chart colors/axes via forms) can be layered on next.
- **Demo Authentication**: Uses server-side environment identity (`DEMO_USER_ID` / `DEMO_USER_ROLES`) for zero-friction local runs; production deployments should replace `createDefaultAuthResolver()` with JWT/OAuth/SSO verification.
