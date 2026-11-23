# DataSource Contract

Semantic DataSources are defined in two strictly separated halves:

1. **Public Contract (`packages/datasource-contract/src/contracts.ts`)** — Shared across frontend, backend, validator, and AI prompts. Contains `id`, `name`, `description`, `requiredRoles`, Zod `paramsSchema`, Zod `resultSchema`, field definitions, units, and metric formulas. Contains **zero server handlers**.
2. **Server Implementation (`apps/server/src/datasource/registry.ts`)** — Registers executable `handler(params, context)` functions and optional `authorize(context)` hooks strictly on the backend. Handlers are never serialized to clients or LLMs.

## Registered DataSources

| Resource ID | Result Type | Parameters | Required Role | Metric Definitions |
| --- | --- | --- | --- | --- |
| `ads.games` | `array` | `{}` | `ads:read` | Returns `all` + 3 games (`game-001` 星穹战纪, `game-002` 龙魂幻想, `game-003` 霓虹竞速) |
| `ads.summary` | `object` | `{ gameId, dateRange }` | `ads:read` | `roi = revenue / totalCost`, `payRate = payingUsers / newUsers`, `cpa = totalCost / newUsers`, `arpu = revenue / newUsers`, `arppu = revenue / payingUsers` |
| `ads.daily` | `array` | `{ gameId, dateRange }` | `ads:read` | Daily ascending series (`date`, `cost`, `revenue`, `roi`, `newUsers`, `payingUsers`, `payRate`, `cpa`) |
| `ads.recharge` | `array` | `{ gameId, dateRange }` | `ads:read` | 6 recharge price tiers (`tier`, `amount`, `users`, `share`) |
| `ads.traffic` | `array` | `{ gameId, dateRange }` | `ads:read` | 5 ad channels (`channel`, `cost`, `revenue`, `newUsers`, `roi`, `share`) |
| `ads.conversion` | `array` | `{ gameId, dateRange }` | `ads:read` | 5-stage funnel (`stage`, `count`, `rate`, `benchmark`) |

## Deterministic Mock Dataset

`apps/server/src/datasource/mock-dataset.ts` generates 35 days of daily records across 3 distinct games using a seeded Mulberry32 PRNG anchored to a fixed date window. Restarting the server guarantees identical metrics for identical filter conditions.
