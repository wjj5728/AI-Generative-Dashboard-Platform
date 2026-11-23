# Data Binding & Query Engine

## State Store Layout (`createStateStore`)

Every rendered `PageDocument` gets a controlled `@json-render/react` `StateStore` with a predictable JSON Pointer layout:

```text
/variables/<varName>        # Active filter variable values (e.g. /variables/gameId = "all")
/data/<queryId>             # Live query results written by DashboardQueryManager
/ui/tabs/<tabGroupId>       # Active tab keys
/meta/queries/<queryId>     # Loading / success / error status, durationMs, cacheKey
/meta/queryLog              # Recent batch query execution audit log
/meta/isRefreshing          # Global refresh indicator
```

## Binding Flow

1. **Page Variables & Filter Controls**:
   - Filter components (`SelectFilter`, `DateRangeFilter`) bind their value via official `{ "$bindState": "/variables/gameId" }` and emit the registered `setVariable` action on change.
2. **Query Dependency Graph**:
   - Each entry in `PageDocument.queries` binds parameters with `{ "$var": "gameId" }`.
   - `extractQueryDependencies(query)` extracts referenced variable names (`ads.games` → `[]`, `ads.summary` → `["dateRange", "gameId"]`).
3. **Deduplication & Canonical Cache Keys**:
   - `buildStableQueryKey(resource, resolvedParams)` recursively sorts object keys so equivalent parameter objects produce identical keys.
   - `deduplicateQueries(planned)` merges duplicate `(resource, params)` requests into a single item in `POST /api/data/query-batch` and fans out the result to every matching `targetState`.
4. **Selective Variable Refresh**:
   - When `gameId` changes, `DashboardQueryManager.setVariable('gameId', nextVal)` computes `getAffectedQueryIds(doc.queries, ['gameId'])` and re-queries **only** queries referencing `gameId` (`ads.games` is untouched).
   - Components bound via `{ "$state": "/data/summary/totalCost" }` or `{ "$state": "/data/daily" }` automatically re-render through `StateProvider` without calling any LLM.
5. **Component Lifecycle States**:
   - Display components read `/meta/queries/<queryKey>` to render Ant Design loading skeletons, error alerts, or empty states automatically.
   - Deleting a component never alters other components sharing the same DataSource query.
