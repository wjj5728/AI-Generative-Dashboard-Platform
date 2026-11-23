import type { StateStore } from '@json-render/react';
import type { QueryClient } from '@tanstack/react-query';
import {
  buildStableQueryKey,
  deduplicateQueries,
  extractQueryDependencies,
  getAffectedQueryIds,
  getDefaultVariableValues,
  resolveQueryParams,
  type PageDocument,
  type PlannedQueryExecution,
  type QueryBatchItem,
  type QueryBatchResponse,
} from '@ai-dashboard/contracts';
import { apiClient } from '../api/client';

export interface QueryRuntimeStatus {
  queryId: string;
  resource: string;
  targetState: string;
  status: 'idle' | 'loading' | 'success' | 'error';
  dependencies: string[];
  resolvedParams: Record<string, unknown>;
  cacheKey: string;
  cached?: boolean;
  durationMs?: number;
  error?: string;
  updatedAt?: string;
}

export interface QueryExecutionLogEntry {
  id: string;
  timestamp: string;
  trigger: 'init' | 'variable-change' | 'manual-refresh';
  changedVariables?: string[];
  executedQueryIds: string[];
  uniqueRequestCount: number;
  durationMs: number;
}

export type QueryBatchExecutor = (
  queries: QueryBatchItem[],
  options?: { bypassCache?: boolean },
) => Promise<QueryBatchResponse>;

export class DashboardQueryManager {
  private readonly executor: QueryBatchExecutor;
  private readonly queryClient?: QueryClient;
  private activeBatchCounter = 0;

  constructor(
    private readonly pageDocument: PageDocument,
    private readonly store: StateStore,
    options?: {
      executor?: QueryBatchExecutor;
      queryClient?: QueryClient;
    },
  ) {
    this.executor = options?.executor ?? apiClient.queryBatch;
    this.queryClient = options?.queryClient;
  }

  /**
   * Initialize PageDocument variables & query metadata into json-render StateStore.
   */
  initializeState(): void {
    const defaults = getDefaultVariableValues(this.pageDocument.variables);
    const queryStatuses: Record<string, QueryRuntimeStatus> = {};

    for (const [queryId, q] of Object.entries(this.pageDocument.queries)) {
      const resolvedParams = resolveQueryParams(
        q,
        defaults,
        this.pageDocument.variables,
      );
      queryStatuses[queryId] = {
        queryId,
        resource: q.resource,
        targetState: q.targetState,
        status: q.enabled === false ? 'idle' : 'loading',
        dependencies: extractQueryDependencies(q),
        resolvedParams,
        cacheKey: buildStableQueryKey(q.resource, resolvedParams),
      };
    }

    this.store.update({
      '/variables': defaults,
      '/data': {},
      '/ui': { tabs: {} },
      '/meta/queries': queryStatuses,
      '/meta/queryLog': [],
      '/meta/isRefreshing': false,
    });
  }

  getRuntimeVariables(): Record<string, unknown> {
    const vars = this.store.get('/variables');
    if (vars && typeof vars === 'object') {
      return vars as Record<string, unknown>;
    }
    return getDefaultVariableValues(this.pageDocument.variables);
  }

  /**
   * Plan queries for a subset (or all enabled) query IDs.
   */
  private planQueries(queryIds?: string[]): PlannedQueryExecution[] {
    const runtimeVars = this.getRuntimeVariables();
    const entries = Object.entries(this.pageDocument.queries).filter(
      ([id, q]) => {
        if (q.enabled === false) return false;
        if (queryIds && !queryIds.includes(id)) return false;
        return true;
      },
    );

    return entries.map(([queryId, q]) => {
      const resolvedParams = resolveQueryParams(
        q,
        runtimeVars,
        this.pageDocument.variables,
      );
      return {
        queryId,
        resource: q.resource,
        resolvedParams,
        targetState: q.targetState,
        cacheKey: buildStableQueryKey(q.resource, resolvedParams),
        dependencies: extractQueryDependencies(q),
      };
    });
  }

  /**
   * Execute all enabled queries or a targeted subset, deduplicating equivalent requests,
   * using TanStack Query cache when available, and writing results into json-render StateStore.
   */
  async executeQueries(options?: {
    queryIds?: string[];
    force?: boolean;
    trigger?: QueryExecutionLogEntry['trigger'];
    changedVariables?: string[];
  }): Promise<void> {
    const planned = this.planQueries(options?.queryIds);
    if (planned.length === 0) return;

    const batchId = ++this.activeBatchCounter;
    const startedAt = Date.now();
    const { uniqueRequests, fanOutMap } = deduplicateQueries(planned);

    const isPartialRefresh = Boolean(options?.queryIds && options.queryIds.length > 0);

    // Mark targeted queries as loading (only toggle global isRefreshing for full refresh)
    const loadingUpdates: Record<string, unknown> = {};
    if (!isPartialRefresh) {
      loadingUpdates['/meta/isRefreshing'] = true;
    }
    for (const item of planned) {
      loadingUpdates[`/meta/queries/${item.queryId}`] = {
        queryId: item.queryId,
        resource: item.resource,
        targetState: item.targetState,
        status: 'loading',
        dependencies: item.dependencies,
        resolvedParams: item.resolvedParams,
        cacheKey: item.cacheKey,
      } satisfies QueryRuntimeStatus;
    }
    this.store.update(loadingUpdates);

    // Check TanStack Query client cache if not forced
    const requestsToFetch: QueryBatchItem[] = [];
    const resolvedFromCache = new Map<string, unknown>();

    for (const req of uniqueRequests) {
      if (!options?.force && this.queryClient) {
        const cachedData = this.queryClient.getQueryData(['datasource', req.cacheKey]);
        if (cachedData !== undefined) {
          resolvedFromCache.set(req.key, cachedData);
          continue;
        }
      }
      requestsToFetch.push({
        key: req.key,
        resource: req.resource,
        params: req.params,
      });
    }

    let batchResponse: QueryBatchResponse = { results: {} };
    if (requestsToFetch.length > 0) {
      try {
        batchResponse = await this.executor(requestsToFetch, {
          bypassCache: Boolean(options?.force),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Batch query failed';
        const errorUpdates: Record<string, unknown> = {};
        if (!isPartialRefresh) {
          errorUpdates['/meta/isRefreshing'] = false;
        }
        for (const item of planned) {
          errorUpdates[`/meta/queries/${item.queryId}`] = {
            queryId: item.queryId,
            resource: item.resource,
            targetState: item.targetState,
            status: 'error',
            dependencies: item.dependencies,
            resolvedParams: item.resolvedParams,
            cacheKey: item.cacheKey,
            error: msg,
            updatedAt: new Date().toISOString(),
          } satisfies QueryRuntimeStatus;
        }
        this.store.update(errorUpdates);
        return;
      }
    }

    // Fan-out results into StateStore
    const stateUpdates: Record<string, unknown> = {};
    if (!isPartialRefresh) {
      stateUpdates['/meta/isRefreshing'] = false;
    }
    const nowIso = new Date().toISOString();
    const plannedById = new Map(planned.map((p) => [p.queryId, p]));

    for (const req of uniqueRequests) {
      const targets = fanOutMap[req.key] ?? [];
      if (resolvedFromCache.has(req.key)) {
        const cachedValue = resolvedFromCache.get(req.key);
        for (const target of targets) {
          const p = plannedById.get(target.queryId)!;
          stateUpdates[target.targetState] = cachedValue;
          stateUpdates[`/meta/queries/${target.queryId}`] = {
            queryId: target.queryId,
            resource: p.resource,
            targetState: target.targetState,
            status: 'success',
            dependencies: p.dependencies,
            resolvedParams: p.resolvedParams,
            cacheKey: p.cacheKey,
            cached: true,
            durationMs: 0,
            updatedAt: nowIso,
          } satisfies QueryRuntimeStatus;
        }
        continue;
      }

      const itemResult = batchResponse.results[req.key];
      if (itemResult?.status === 'success') {
        if (this.queryClient) {
          this.queryClient.setQueryData(['datasource', req.cacheKey], itemResult.data);
        }
        for (const target of targets) {
          const p = plannedById.get(target.queryId)!;
          stateUpdates[target.targetState] = itemResult.data;
          stateUpdates[`/meta/queries/${target.queryId}`] = {
            queryId: target.queryId,
            resource: p.resource,
            targetState: target.targetState,
            status: 'success',
            dependencies: p.dependencies,
            resolvedParams: p.resolvedParams,
            cacheKey: p.cacheKey,
            cached: itemResult.cached ?? false,
            durationMs: itemResult.durationMs,
            updatedAt: nowIso,
          } satisfies QueryRuntimeStatus;
        }
      } else {
        const errMessage =
          itemResult?.status === 'error'
            ? itemResult.error.message
            : 'Missing result from query-batch response';
        for (const target of targets) {
          const p = plannedById.get(target.queryId)!;
          stateUpdates[`/meta/queries/${target.queryId}`] = {
            queryId: target.queryId,
            resource: p.resource,
            targetState: target.targetState,
            status: 'error',
            dependencies: p.dependencies,
            resolvedParams: p.resolvedParams,
            cacheKey: p.cacheKey,
            error: errMessage,
            updatedAt: nowIso,
          } satisfies QueryRuntimeStatus;
        }
      }
    }

    const prevLog = Array.isArray(this.store.get('/meta/queryLog'))
      ? (this.store.get('/meta/queryLog') as QueryExecutionLogEntry[])
      : [];
    const nextLog: QueryExecutionLogEntry[] = [
      {
        id: `batch-${batchId}`,
        timestamp: nowIso,
        trigger: options?.trigger ?? 'init',
        changedVariables: options?.changedVariables,
        executedQueryIds: planned.map((p) => p.queryId),
        uniqueRequestCount: requestsToFetch.length,
        durationMs: Date.now() - startedAt,
      },
      ...prevLog.slice(0, 19),
    ];
    stateUpdates['/meta/queryLog'] = nextLog;

    this.store.update(stateUpdates);
  }

  /**
   * Update a single page variable and ONLY re-run queries that depend on it.
   */
  async setVariable(variableName: string, value: unknown): Promise<string[]> {
    const prevVal = this.store.get(`/variables/${variableName}`);
    if (prevVal === value) return [];

    this.store.set(`/variables/${variableName}`, value);
    const affected = getAffectedQueryIds(this.pageDocument.queries, [variableName]);
    if (affected.length > 0) {
      await this.executeQueries({
        queryIds: affected,
        trigger: 'variable-change',
        changedVariables: [variableName],
      });
    }
    return affected;
  }

  async refresh(queryIds?: string[]): Promise<void> {
    await this.executeQueries({
      queryIds,
      force: true,
      trigger: 'manual-refresh',
    });
  }
}
