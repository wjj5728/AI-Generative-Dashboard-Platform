# PageDocument Protocol

## Structure

`PageDocument` is the platform's top-level business document wrapping an official `json-render` `Spec` (`JsonRenderSpec = Spec` imported directly from `@json-render/core`).

```ts
export interface PageDocument {
  contractVersion: string; // "2.0.0"
  catalogVersion: string;  // "2.0.0"
  id?: string;
  title: string;
  description?: string;
  variables: Record<string, VariableDefinition>;
  queries: Record<string, QueryDefinition>;
  ui: JsonRenderSpec;      // { root: string, elements: Record<string, UIElement> }
}
```

### Separation of Concerns

| Field | Responsibility | Persisted in DB? |
| --- | --- | --- |
| `variables` | Declares filter variables (`gameId`, `dateRange`), their types, labels, and defaults | Yes |
| `queries` | Declares semantic DataSource requests, `$var` param bindings, and target state paths | Yes |
| `ui` | Official `json-render` flat element tree (`root`, `elements`) with stable node IDs | Yes |
| Runtime State | Live query outputs (`/data/*`), active variable values (`/variables/*`), loading/error metadata (`/meta/*`) | **No** (fetched dynamically on open) |

## Variable References (`$var`)

Query parameters use the platform-defined `$var` reference protocol:

```json
{
  "summary": {
    "resource": "ads.summary",
    "params": {
      "gameId": { "$var": "gameId" },
      "dateRange": { "$var": "dateRange" }
    },
    "targetState": "/data/summary"
  }
}
```

Only validated literal values and `{ "$var": "<declaredVariable>" }` references are allowed inside `queries.*.params`.

## 14-Point Server-Side Validation (`validatePageDocument`)

Implemented in `packages/component-catalog/src/validator.ts`:

1. `contractVersion` matches `CONTRACT_VERSION` (`2.0.0`).
2. `catalogVersion` matches `CATALOG_VERSION` (`2.0.0`).
3. Every `ui.elements[id].type` is registered in `dashboardCatalog`.
4. Every element's `props` passes its Zod schema in `dashboardCatalog` (plus `dashboardCatalog.validate(doc.ui)`).
5. `ui.root` exists and references an entry in `ui.elements`.
6. Every child and slot reference points to an existing node, with DFS cycle detection (`CIRCULAR_REFERENCE`).
7. Tree nesting depth does not exceed `MAX_SPEC_DEPTH` (12).
8. Element count does not exceed `MAX_SPEC_NODES` (120).
9. Every `queries[k].resource` exists in `ALL_DATASOURCE_CONTRACTS`.
10. Resolved query parameters conform to the DataSource's `paramsSchema`.
11. `$state` bindings targeting `/data/*` reference existing DataSource fields and compatible field types (e.g., numeric fields for chart series, array DataSources for charts/tables).
12. All `$var` query refs and `/variables/*` state bindings reference declared entries in `variables`.
13. All `on` / `watch` actions belong to the whitelist (`setVariable`, `refreshData`, `changeTab`, `navigate`, `setState`), and recursive scanning blocks `<script>`, `javascript:`, `eval(`, `new Function(`, raw SQL, and prototype pollution keys.
14. User roles include all `requiredRoles` of every referenced DataSource.
