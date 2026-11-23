import type { z } from 'zod';
import {
  buildStableQueryKey,
  type QueryBatchItem,
  type QueryBatchItemResult,
  type QueryBatchResponse,
} from '@ai-dashboard/contracts';
import {
  adsConversionContract,
  adsDailyContract,
  adsGamesContract,
  adsRechargeContract,
  adsSummaryContract,
  adsTrafficContract,
  type QueryContext,
  type ServerDataSourceDefinition,
} from '@ai-dashboard/datasource-contract';
import {
  GAMES,
  getFilteredDailyRecords,
  getGameById,
  getPreviousPeriodRecords,
  round2,
  round4,
} from './mock-dataset.js';

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

const CACHE_TTL_MS = 15_000;

export class DataSourceRegistry {
  private readonly sources = new Map<string, ServerDataSourceDefinition<any, any>>();
  private readonly cache = new Map<string, CacheEntry>();

  register<TParams extends z.ZodType, TResult extends z.ZodType>(
    source: ServerDataSourceDefinition<TParams, TResult>,
  ): void {
    this.sources.set(source.id, source);
  }

  get(id: string): ServerDataSourceDefinition<any, any> | undefined {
    return this.sources.get(id);
  }

  listPublicMetadata(userRoles: string[]) {
    return Array.from(this.sources.values())
      .filter((s) => s.requiredRoles.every((r) => userRoles.includes(r)))
      .map((s) => s.metadata);
  }

  clearCache(): void {
    this.cache.clear();
  }

  async executeSingle(
    item: QueryBatchItem,
    context: QueryContext,
    options?: { bypassCache?: boolean },
  ): Promise<QueryBatchItemResult> {
    const startedAt = Date.now();
    const source = this.sources.get(item.resource);
    if (!source) {
      return {
        status: 'error',
        error: {
          code: 'UNKNOWN_DATASOURCE',
          message: `DataSource "${item.resource}" is not registered.`,
        },
      };
    }

    // Role & custom authorization check
    const hasRoles = source.requiredRoles.every((role) =>
      context.user.roles.includes(role),
    );
    const customAllowed = source.authorize ? source.authorize(context) : true;
    if (!hasRoles || !customAllowed) {
      return {
        status: 'error',
        error: {
          code: 'FORBIDDEN',
          message: `Insufficient permissions for DataSource "${item.resource}".`,
        },
      };
    }

    // Validate parameters
    const parsedParams = source.paramsSchema.safeParse(item.params ?? {});
    if (!parsedParams.success) {
      return {
        status: 'error',
        error: {
          code: 'INVALID_PARAMS',
          message: parsedParams.error.issues
            .map((i: z.ZodIssue) => `${i.path.join('.') || 'params'}: ${i.message}`)
            .join('; '),
        },
      };
    }

    const cacheKey = `${context.user.id}::${buildStableQueryKey(
      item.resource,
      parsedParams.data as Record<string, unknown>,
    )}`;
    const now = Date.now();
    const cached = options?.bypassCache ? undefined : this.cache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return {
        status: 'success',
        data: cached.data,
        cached: true,
        durationMs: Date.now() - startedAt,
      };
    }

    try {
      const rawResult = await source.handler(parsedParams.data, context);
      const validated = source.resultSchema.parse(rawResult);
      this.cache.set(cacheKey, {
        data: validated,
        expiresAt: now + CACHE_TTL_MS,
      });
      return {
        status: 'success',
        data: validated,
        cached: false,
        durationMs: Date.now() - startedAt,
      };
    } catch (err) {
      return {
        status: 'error',
        error: {
          code: 'QUERY_EXECUTION_ERROR',
          message: err instanceof Error ? err.message : 'Unexpected query error',
        },
      };
    }
  }

  async executeBatch(
    queries: QueryBatchItem[],
    context: QueryContext,
    options?: { bypassCache?: boolean },
  ): Promise<QueryBatchResponse> {
    const entries = await Promise.all(
      queries.map(async (q) => {
        const result = await this.executeSingle(q, context, options);
        return [q.key, result] as const;
      }),
    );

    const results: Record<string, QueryBatchItemResult> = {};
    for (const [key, res] of entries) {
      results[key] = res;
    }
    return { results };
  }
}

export function createDefaultDataSourceRegistry(): DataSourceRegistry {
  const registry = new DataSourceRegistry();

  // 1. ads.games
  registry.register({
    ...adsGamesContract,
    handler: async () => [
      {
        id: 'all',
        name: '全部游戏',
        genre: '全品类汇总',
        region: '全球',
        label: '全部游戏（汇总）',
        value: 'all',
      },
      ...GAMES.map((g) => ({
        id: g.id,
        name: g.name,
        genre: g.genre,
        region: g.region,
        label: `${g.name} (${g.genre})`,
        value: g.id,
      })),
    ],
  });

  // 2. ads.summary
  registry.register({
    ...adsSummaryContract,
    handler: async ({ gameId, dateRange }) => {
      const current = getFilteredDailyRecords(gameId, dateRange);
      const prev = getPreviousPeriodRecords(gameId, dateRange);

      const sum = (rows: typeof current) => {
        const totalCost = round2(rows.reduce((acc, r) => acc + r.cost, 0));
        const revenue = round2(rows.reduce((acc, r) => acc + r.revenue, 0));
        const newUsers = rows.reduce((acc, r) => acc + r.newUsers, 0);
        const payingUsers = rows.reduce((acc, r) => acc + r.payingUsers, 0);
        const roi = totalCost > 0 ? round4(revenue / totalCost) : 0;
        return { totalCost, revenue, newUsers, payingUsers, roi };
      };

      const cur = sum(current);
      const prv = sum(prev);
      const delta = (a: number, b: number) => (b > 0 ? round4((a - b) / b) : 0);
      const game = getGameById(gameId);

      return {
        gameId,
        gameName: game ? game.name : '全部游戏',
        dateRange,
        totalCost: cur.totalCost,
        revenue: cur.revenue,
        roi: cur.roi,
        newUsers: cur.newUsers,
        payingUsers: cur.payingUsers,
        payRate: cur.newUsers > 0 ? round4(cur.payingUsers / cur.newUsers) : 0,
        arpu: cur.newUsers > 0 ? round2(cur.revenue / cur.newUsers) : 0,
        arppu: cur.payingUsers > 0 ? round2(cur.revenue / cur.payingUsers) : 0,
        cpa: cur.newUsers > 0 ? round2(cur.totalCost / cur.newUsers) : 0,
        costDelta: delta(cur.totalCost, prv.totalCost),
        revenueDelta: delta(cur.revenue, prv.revenue),
        roiDelta: delta(cur.roi, prv.roi),
        newUsersDelta: delta(cur.newUsers, prv.newUsers),
      };
    },
  });

  // 3. ads.daily
  registry.register({
    ...adsDailyContract,
    handler: async ({ gameId, dateRange }) =>
      getFilteredDailyRecords(gameId, dateRange),
  });

  // 4. ads.recharge
  registry.register({
    ...adsRechargeContract,
    handler: async ({ gameId, dateRange }) => {
      const targetGames =
        gameId === 'all' ? GAMES : GAMES.filter((g) => g.id === gameId);
      const tierAvgPrice: Record<string, number> = {
        '¥6 首充档': 6,
        '¥30 月卡档': 30,
        '¥98 进阶档': 98,
        '¥198 战令档': 198,
        '¥328 豪礼档': 328,
        '¥648+ 鲸鱼档': 820,
      };
      const tierOrder = Object.keys(tierAvgPrice);
      const totals: Record<string, { amount: number; users: number }> = {};
      for (const tier of tierOrder) {
        totals[tier] = { amount: 0, users: 0 };
      }

      for (const game of targetGames) {
        const rows = getFilteredDailyRecords(game.id, dateRange);
        const totalRevenue = rows.reduce((acc, r) => acc + r.revenue, 0);
        for (const tier of tierOrder) {
          const weight = game.tierWeights[tier] ?? 0.1;
          const amount = totalRevenue * weight;
          const users = Math.max(1, Math.round(amount / tierAvgPrice[tier]));
          totals[tier].amount += amount;
          totals[tier].users += users;
        }
      }

      const grandTotal = Object.values(totals).reduce((s, x) => s + x.amount, 0);
      return tierOrder.map((tier) => ({
        tier,
        amount: round2(totals[tier].amount),
        users: totals[tier].users,
        share: grandTotal > 0 ? round4(totals[tier].amount / grandTotal) : 0,
      }));
    },
  });

  // 5. ads.traffic
  registry.register({
    ...adsTrafficContract,
    handler: async ({ gameId, dateRange }) => {
      const targetGames =
        gameId === 'all' ? GAMES : GAMES.filter((g) => g.id === gameId);
      const channels = [
        '巨量引擎',
        '腾讯广告',
        '快手磁力',
        'Apple Search Ads',
        'B站起飞',
      ];
      const agg: Record<
        string,
        { cost: number; revenue: number; newUsers: number }
      > = {};
      for (const ch of channels) {
        agg[ch] = { cost: 0, revenue: 0, newUsers: 0 };
      }

      for (const game of targetGames) {
        const rows = getFilteredDailyRecords(game.id, dateRange);
        const totalCost = rows.reduce((s, r) => s + r.cost, 0);
        const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
        const totalNewUsers = rows.reduce((s, r) => s + r.newUsers, 0);

        const weightedRoiSum = channels.reduce(
          (acc, ch) =>
            acc + (game.channelWeights[ch] ?? 0) * (game.channelRoiBoost[ch] ?? 1),
          0,
        );

        for (const ch of channels) {
          const w = game.channelWeights[ch] ?? 0.1;
          const boost = game.channelRoiBoost[ch] ?? 1;
          const chCost = totalCost * w;
          const chRevenue =
            weightedRoiSum > 0 ? totalRevenue * ((w * boost) / weightedRoiSum) : 0;
          const chNewUsers = Math.round(totalNewUsers * w);
          agg[ch].cost += chCost;
          agg[ch].revenue += chRevenue;
          agg[ch].newUsers += chNewUsers;
        }
      }

      const grandCost = Object.values(agg).reduce((s, x) => s + x.cost, 0);
      return channels.map((channel) => {
        const cost = round2(agg[channel].cost);
        const revenue = round2(agg[channel].revenue);
        return {
          channel,
          cost,
          revenue,
          newUsers: agg[channel].newUsers,
          roi: cost > 0 ? round4(revenue / cost) : 0,
          share: grandCost > 0 ? round4(cost / grandCost) : 0,
        };
      });
    },
  });

  // 6. ads.conversion
  registry.register({
    ...adsConversionContract,
    handler: async ({ gameId, dateRange }) => {
      const rows = getFilteredDailyRecords(gameId, dateRange);
      const newUsers = rows.reduce((s, r) => s + r.newUsers, 0);
      const payingUsers = rows.reduce((s, r) => s + r.payingUsers, 0);
      const game = getGameById(gameId);
      const ctr = game?.id === 'game-003' ? 0.048 : game?.id === 'game-002' ? 0.036 : 0.041;
      const cvr = game?.id === 'game-003' ? 0.34 : game?.id === 'game-002' ? 0.25 : 0.29;

      const clicks = Math.max(1, Math.round(newUsers / cvr));
      const impressions = Math.max(1, Math.round(clicks / ctr));
      const roleCreated = Math.round(newUsers * 0.78);
      const repeatPayers = Math.round(payingUsers * 0.44);

      return [
        {
          stage: '广告点击 (CTR)',
          count: clicks,
          rate: round4(clicks / impressions),
          benchmark: 0.035,
        },
        {
          stage: '新增激活 (CVR)',
          count: newUsers,
          rate: round4(newUsers / clicks),
          benchmark: 0.26,
        },
        {
          stage: '创角完成',
          count: roleCreated,
          rate: newUsers > 0 ? round4(roleCreated / newUsers) : 0,
          benchmark: 0.74,
        },
        {
          stage: '首日付费转化',
          count: payingUsers,
          rate: roleCreated > 0 ? round4(payingUsers / roleCreated) : 0,
          benchmark: 0.095,
        },
        {
          stage: '次周复充留存',
          count: repeatPayers,
          rate: payingUsers > 0 ? round4(repeatPayers / payingUsers) : 0,
          benchmark: 0.4,
        },
      ];
    },
  });

  return registry;
}
