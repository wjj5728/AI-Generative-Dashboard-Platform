import { isVariableReference, type QueryDefinition, type VariableDefinition } from './page-document.js';

/**
 * Extract all variable names referenced by a QueryDefinition via `{ "$var": "..." }`.
 */
export function extractQueryDependencies(query: QueryDefinition): string[] {
  const deps = new Set<string>();
  for (const rawValue of Object.values(query.params)) {
    if (isVariableReference(rawValue)) {
      deps.add(rawValue.$var);
    }
  }
  return Array.from(deps).sort();
}

/**
 * Resolve `{ "$var": "name" }` references in a QueryDefinition's params
 * using runtime variable values (falling back to VariableDefinition defaults).
 */
export function resolveQueryParams(
  query: QueryDefinition,
  runtimeVariables: Record<string, unknown>,
  variableDefs: Record<string, VariableDefinition> = {},
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const [paramName, rawValue] of Object.entries(query.params)) {
    if (isVariableReference(rawValue)) {
      const varName = rawValue.$var;
      if (varName in runtimeVariables && runtimeVariables[varName] !== undefined) {
        resolved[paramName] = runtimeVariables[varName];
      } else if (varName in variableDefs) {
        resolved[paramName] = variableDefs[varName].defaultValue;
      } else {
        resolved[paramName] = undefined;
      }
    } else {
      resolved[paramName] = rawValue;
    }
  }
  return resolved;
}

/**
 * Canonical JSON serialization with recursively sorted object keys
 * so equivalent query params always produce the exact same cache key.
 */
export function canonicalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalizeValue);
  }
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) {
        sorted[key] = canonicalizeValue(v);
      }
    }
    return sorted;
  }
  return value;
}

export function buildStableQueryKey(
  resource: string,
  resolvedParams: Record<string, unknown>,
): string {
  return `${resource}::${JSON.stringify(canonicalizeValue(resolvedParams))}`;
}

export interface PlannedQueryExecution {
  queryId: string;
  resource: string;
  resolvedParams: Record<string, unknown>;
  targetState: string;
  cacheKey: string;
  dependencies: string[];
}

export interface DeduplicatedQueryBatch {
  uniqueRequests: Array<{
    key: string;
    resource: string;
    params: Record<string, unknown>;
    cacheKey: string;
  }>;
  /** Maps unique request key -> all PageDocument queryIds + targetState paths sharing that result */
  fanOutMap: Record<string, Array<{ queryId: string; targetState: string }>>;
}

/**
 * Plan and deduplicate queries that share identical (resource, resolvedParams)
 * so equivalent requests are merged into a single backend query execution.
 */
export function deduplicateQueries(
  planned: PlannedQueryExecution[],
): DeduplicatedQueryBatch {
  const byCacheKey = new Map<
    string,
    {
      key: string;
      resource: string;
      params: Record<string, unknown>;
      cacheKey: string;
      targets: Array<{ queryId: string; targetState: string }>;
    }
  >();

  for (const item of planned) {
    const existing = byCacheKey.get(item.cacheKey);
    if (existing) {
      existing.targets.push({
        queryId: item.queryId,
        targetState: item.targetState,
      });
    } else {
      byCacheKey.set(item.cacheKey, {
        key: item.queryId,
        resource: item.resource,
        params: item.resolvedParams,
        cacheKey: item.cacheKey,
        targets: [{ queryId: item.queryId, targetState: item.targetState }],
      });
    }
  }

  const uniqueRequests: DeduplicatedQueryBatch['uniqueRequests'] = [];
  const fanOutMap: DeduplicatedQueryBatch['fanOutMap'] = {};

  for (const entry of byCacheKey.values()) {
    uniqueRequests.push({
      key: entry.key,
      resource: entry.resource,
      params: entry.params,
      cacheKey: entry.cacheKey,
    });
    fanOutMap[entry.key] = entry.targets;
  }

  return { uniqueRequests, fanOutMap };
}

/**
 * Given a set of changed variable names, return only queryIds whose dependencies
 * intersect the changed variables.
 */
export function getAffectedQueryIds(
  queries: Record<string, QueryDefinition>,
  changedVariables: string[],
): string[] {
  const changedSet = new Set(changedVariables);
  const affected: string[] = [];
  for (const [queryId, query] of Object.entries(queries)) {
    if (query.enabled === false) continue;
    const deps = extractQueryDependencies(query);
    if (deps.some((dep) => changedSet.has(dep))) {
      affected.push(queryId);
    }
  }
  return affected;
}

/**
 * Extract initial default variable values from a PageDocument's variable definitions.
 */
export function getDefaultVariableValues(
  variables: Record<string, VariableDefinition>,
): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const [key, def] of Object.entries(variables)) {
    defaults[key] = def.defaultValue;
  }
  return defaults;
}
