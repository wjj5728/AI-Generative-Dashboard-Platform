import { describe, expect, it, vi } from 'vitest';
import { createStateStore } from '@json-render/core';
import {
  buildStableQueryKey,
  deduplicateQueries,
  extractQueryDependencies,
  getAffectedQueryIds,
  resolveQueryParams,
} from '@ai-dashboard/contracts';
import { DashboardQueryManager } from '../../apps/web/src/data/query-manager';
import { buildGameAdsDashboard } from '../../apps/server/src/ai/templates';

describe('Data Query Engine & Dependency Tracking', () => {
  it('resolves $var references and extracts query dependencies', () => {
    const doc = buildGameAdsDashboard();
    expect(extractQueryDependencies(doc.queries.games)).toEqual([]);
    expect(extractQueryDependencies(doc.queries.summary)).toEqual(['dateRange', 'gameId']);

    const resolved = resolveQueryParams(
      doc.queries.summary,
      { gameId: 'game-002' },
      doc.variables,
    );
    expect(resolved).toEqual({
      gameId: 'game-002',
      dateRange: 'last14days',
    });
  });

  it('builds deterministic cache keys regardless of param key ordering', () => {
    const k1 = buildStableQueryKey('ads.summary', {
      gameId: 'game-001',
      dateRange: 'last7days',
    });
    const k2 = buildStableQueryKey('ads.summary', {
      dateRange: 'last7days',
      gameId: 'game-001',
    });
    expect(k1).toBe(k2);
  });

  it('merges equivalent queries via deduplicateQueries', () => {
    const key = buildStableQueryKey('ads.summary', {
      gameId: 'all',
      dateRange: 'last14days',
    });
    const batch = deduplicateQueries([
      {
        queryId: 'summaryA',
        resource: 'ads.summary',
        resolvedParams: { gameId: 'all', dateRange: 'last14days' },
        targetState: '/data/summaryA',
        cacheKey: key,
        dependencies: ['gameId', 'dateRange'],
      },
      {
        queryId: 'summaryB',
        resource: 'ads.summary',
        resolvedParams: { dateRange: 'last14days', gameId: 'all' },
        targetState: '/data/summaryB',
        cacheKey: key,
        dependencies: ['gameId', 'dateRange'],
      },
    ]);

    expect(batch.uniqueRequests).toHaveLength(1);
    expect(batch.fanOutMap[batch.uniqueRequests[0].key]).toHaveLength(2);
  });

  it('selectively refreshes only dependent queries when a variable changes', async () => {
    const doc = buildGameAdsDashboard();
    const affectedByGame = getAffectedQueryIds(doc.queries, ['gameId']);
    expect(affectedByGame).not.toContain('games');
    expect(affectedByGame).toContain('summary');
    expect(affectedByGame).toContain('daily');

    const store = createStateStore({});
    const executor = vi.fn(async (items) => {
      const results: Record<string, any> = {};
      for (const item of items) {
        results[item.key] = {
          status: 'success',
          data:
            item.resource === 'ads.summary'
              ? { totalCost: item.params.gameId === 'game-001' ? 12345 : 99999 }
              : [],
        };
      }
      return { results };
    });

    const manager = new DashboardQueryManager(doc, store, { executor });
    manager.initializeState();
    await manager.executeQueries({ trigger: 'init' });

    expect(executor).toHaveBeenCalledTimes(1);
    expect(store.get('/data/summary/totalCost')).toBe(99999);

    // Change gameId -> must NOT re-request ads.games
    const reRunIds = await manager.setVariable('gameId', 'game-001');
    expect(reRunIds).not.toContain('games');
    expect(executor).toHaveBeenCalledTimes(2);

    const secondCallItems = executor.mock.calls[1][0];
    expect(secondCallItems.map((i: any) => i.resource)).not.toContain('ads.games');
    expect(store.get('/variables/gameId')).toBe('game-001');
    expect(store.get('/data/summary/totalCost')).toBe(12345);
  });

  it('supports partial single-card refresh with bypassCache without fetching unrelated queries', async () => {
    const doc = buildGameAdsDashboard();
    const store = createStateStore({});
    const executor = vi.fn(async (items, _opts?: { bypassCache?: boolean }) => {
      const results: Record<string, any> = {};
      for (const item of items) {
        results[item.key] = { status: 'success', data: [{ tier: '¥6', amount: 100 }] };
      }
      return { results };
    });

    const manager = new DashboardQueryManager(doc, store, { executor });
    manager.initializeState();
    await manager.executeQueries({ trigger: 'init' });
    expect(executor).toHaveBeenCalledTimes(1);

    // Trigger partial refresh for only the "recharge" card
    await manager.refresh(['recharge']);
    expect(executor).toHaveBeenCalledTimes(2);

    const [partialItems, partialOpts] = executor.mock.calls[1];
    expect(partialItems).toHaveLength(1);
    expect(partialItems[0].key).toBe('recharge');
    expect(partialItems[0].resource).toBe('ads.recharge');
    expect(partialOpts?.bypassCache).toBe(true);
    expect(store.get('/meta/isRefreshing')).toBe(false);
  });
});
