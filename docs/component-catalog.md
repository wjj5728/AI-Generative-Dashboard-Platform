# Component Catalog

Defined via official `defineCatalog(schema, ...)` from `@json-render/core` + `@json-render/react/schema` in `packages/component-catalog/src/catalog.ts`, and bound to React implementations via `defineRegistry` in `apps/web/src/renderer/registry.tsx`.

## Layout Components (9)

All layout components use bounded design tokens (`gap`, `padding`, `align`, `justify`, `width`, `span`) — arbitrary CSS strings are disallowed.

| Component | Description | Key Props |
| --- | --- | --- |
| `Row` | Canonical horizontal flex row container (auto-selected for horizontal/side-by-side prompts) | `gap`, `padding`, `align`, `justify`, `wrap`, `equalWidth`, `width` |
| `Column` | Canonical vertical stack column container (auto-selected for vertical/stacked prompts) | `gap`, `padding`, `align`, `width`, `span` |
| `DashboardRow` | Responsive horizontal flex container | `gap`, `padding`, `align`, `justify`, `wrap`, `equalWidth`, `width` |
| `DashboardColumn` | Vertical stack container | `gap`, `padding`, `align`, `width`, `span` |
| `DashboardGrid` | Responsive BI grid with 5 built-in presets | `preset`: `equal-2` \| `equal-3` \| `equal-4` \| `sidebar-main` \| `sidebar-main-sidebar` |
| `DashboardPanel` | Semantic dark panel container | `title`, `subtitle`, `tone` (`default`/`elevated`/`subtle`), `padding` |
| `DashboardCard` | Standard dark BI card wrapper | `title`, `subtitle`, `badge`, `bordered`, `padding` |
| `Tabs` | Interactive tabbed container | `tabGroupId`, `activeKey`, `defaultActiveKey`, `items` |
| `Divider` | Horizontal or vertical divider | `label`, `orientation`, `spacing` |

## Business Display Components (11)

| Component | Rendering Engine | Data Input | Key Props |
| --- | --- | --- | --- |
| `StatCard` | Custom Dark BI Card | Scalar (`$state`) | `title`, `value`, `delta`, `format`, `accent`, `queryKey` |
| `MetricGroup` | Custom Grid | Scalar array | `title`, `columns`, `items[]`, `queryKey` |
| `MetricList` | Ranked List | Category array | `title`, `data`, `labelField`, `valueField`, `secondaryField`, `queryKey` |
| `ProgressList` | Ant Design Progress | Category array | `title`, `data`, `labelField`, `valueField`, `percentField`, `accent`, `queryKey` |
| `LineChart` | ECharts | Time-series array | `title`, `data`, `xField`, `series[]`, `yAxisFormat`, `height`, `queryKey` |
| `BarChart` | ECharts | Category array | `title`, `data`, `xField`, `series[]`, `horizontal`, `stacked`, `queryKey` |
| `PieChart` | ECharts | Category array | `title`, `data`, `nameField`, `valueField`, `valueFormat`, `queryKey` |
| `DonutChart` | ECharts | Category array | `title`, `data`, `nameField`, `valueField`, `centerLabel`, `queryKey` |
| `DataTable` | Ant Design Table | Row array | `title`, `data`, `rowKey`, `columns[]` (sortable, width, align, format), `pageSize` |
| `Heading` | Typography | Scalar | `text`, `subtitle`, `level` (1-4), `badge` |
| `Text` | Typography | Scalar | `content`, `tone`, `size` |

## Filter & Action Components (3)

| Component | Action Emitted | Key Props |
| --- | --- | --- |
| `SelectFilter` | `setVariable` | `label`, `variable`, `value` (`$bindState`), `options` (`$state` or static), `width` |
| `DateRangeFilter` | `setVariable` | `label`, `variable`, `value` (`$bindState`), `options` |
| `RefreshButton` | `refreshData` | `label`, `queryIds` |

## Registered Actions

- `setVariable({ variable, value })`: Updates `/variables/<name>` and refreshes only dependent queries.
- `refreshData({ queryIds? })`: Force-refetches queries without calling any LLM.
- `changeTab({ tabGroupId, activeKey })`: Updates `/ui/tabs/<tabGroupId>`.
- `navigate({ path })`: Safe in-app navigation restricted to `/` paths.
