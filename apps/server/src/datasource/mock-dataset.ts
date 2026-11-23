import type { DateRangePreset } from '@ai-dashboard/datasource-contract';

export interface GameSeedInfo {
  id: string;
  name: string;
  genre: string;
  region: string;
  baseDailyCost: number;
  baseRoi: number;
  baseCpa: number;
  basePayRate: number;
  channelWeights: Record<string, number>;
  channelRoiBoost: Record<string, number>;
  tierWeights: Record<string, number>;
  seedOffset: number;
}

export const GAMES: GameSeedInfo[] = [
  {
    id: 'game-001',
    name: '星穹战纪',
    genre: 'SLG 策略',
    region: '中国大陆 & 港澳台',
    baseDailyCost: 38500,
    baseRoi: 1.24,
    baseCpa: 28,
    basePayRate: 0.092,
    channelWeights: {
      巨量引擎: 0.38,
      腾讯广告: 0.27,
      快手磁力: 0.16,
      'Apple Search Ads': 0.12,
      B站起飞: 0.07,
    },
    channelRoiBoost: {
      巨量引擎: 1.05,
      腾讯广告: 0.98,
      快手磁力: 0.92,
      'Apple Search Ads': 1.18,
      B站起飞: 1.01,
    },
    tierWeights: {
      '¥6 首充档': 0.06,
      '¥30 月卡档': 0.14,
      '¥98 进阶档': 0.21,
      '¥198 战令档': 0.22,
      '¥328 豪礼档': 0.19,
      '¥648+ 鲸鱼档': 0.18,
    },
    seedOffset: 101,
  },
  {
    id: 'game-002',
    name: '龙魂幻想',
    genre: 'MMORPG',
    region: '中国大陆 & 日韩',
    baseDailyCost: 26400,
    baseRoi: 1.08,
    baseCpa: 22,
    basePayRate: 0.076,
    channelWeights: {
      巨量引擎: 0.31,
      腾讯广告: 0.34,
      快手磁力: 0.14,
      'Apple Search Ads': 0.09,
      B站起飞: 0.12,
    },
    channelRoiBoost: {
      巨量引擎: 0.99,
      腾讯广告: 1.06,
      快手磁力: 0.9,
      'Apple Search Ads': 1.12,
      B站起飞: 1.08,
    },
    tierWeights: {
      '¥6 首充档': 0.09,
      '¥30 月卡档': 0.18,
      '¥98 进阶档': 0.25,
      '¥198 战令档': 0.21,
      '¥328 豪礼档': 0.15,
      '¥648+ 鲸鱼档': 0.12,
    },
    seedOffset: 202,
  },
  {
    id: 'game-003',
    name: '霓虹竞速',
    genre: '休闲竞速',
    region: '全球发行',
    baseDailyCost: 15800,
    baseRoi: 1.38,
    baseCpa: 13.5,
    basePayRate: 0.064,
    channelWeights: {
      巨量引擎: 0.29,
      腾讯广告: 0.18,
      快手磁力: 0.24,
      'Apple Search Ads': 0.15,
      B站起飞: 0.14,
    },
    channelRoiBoost: {
      巨量引擎: 1.04,
      腾讯广告: 0.96,
      快手磁力: 1.02,
      'Apple Search Ads': 1.15,
      B站起飞: 1.11,
    },
    tierWeights: {
      '¥6 首充档': 0.16,
      '¥30 月卡档': 0.27,
      '¥98 进阶档': 0.26,
      '¥198 战令档': 0.16,
      '¥328 豪礼档': 0.09,
      '¥648+ 鲸鱼档': 0.06,
    },
    seedOffset: 303,
  },
];

export interface DailyRecord {
  date: string;
  gameId: string;
  gameName: string;
  cost: number;
  revenue: number;
  roi: number;
  newUsers: number;
  payingUsers: number;
  payRate: number;
  cpa: number;
}

/** Deterministic Mulberry32 PRNG */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TOTAL_DAYS = 35;
const ANCHOR_END_DATE = new Date('2026-11-23T00:00:00.000Z');

function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function generateAllDailyRecords(): DailyRecord[] {
  const records: DailyRecord[] = [];
  for (const game of GAMES) {
    const rand = mulberry32(20261123 + game.seedOffset * 7919);
    for (let i = TOTAL_DAYS - 1; i >= 0; i--) {
      const d = new Date(ANCHOR_END_DATE);
      d.setUTCDate(d.getUTCDate() - i);
      const dayOfWeek = d.getUTCDay();
      const weekendBoost = dayOfWeek === 0 || dayOfWeek === 6 ? 1.16 : 1.0;
      const trendFactor = 0.92 + ((TOTAL_DAYS - i) / TOTAL_DAYS) * 0.18;
      const wave = Math.sin((TOTAL_DAYS - i) * 0.45 + game.seedOffset) * 0.08;
      const noiseCost = (rand() - 0.5) * 0.14;
      const noiseRoi = (rand() - 0.5) * 0.18;
      const noiseCpa = (rand() - 0.5) * 0.1;

      const cost = round2(
        game.baseDailyCost * weekendBoost * trendFactor * (1 + wave + noiseCost),
      );
      const roi = round4(
        Math.max(0.68, game.baseRoi * (1 + wave * 0.6 + noiseRoi)),
      );
      const revenue = round2(cost * roi);
      const cpa = round2(Math.max(8, game.baseCpa * (1 + noiseCpa)));
      const newUsers = Math.max(50, Math.round(cost / cpa));
      const payRate = round4(
        Math.max(0.03, game.basePayRate * (1 + (roi - game.baseRoi) * 0.5)),
      );
      const payingUsers = Math.max(5, Math.round(newUsers * payRate));

      records.push({
        date: formatIsoDate(d),
        gameId: game.id,
        gameName: game.name,
        cost,
        revenue,
        roi,
        newUsers,
        payingUsers,
        payRate: round4(payingUsers / newUsers),
        cpa: round2(cost / newUsers),
      });
    }
  }
  return records;
}

export const ALL_DAILY_RECORDS: DailyRecord[] = generateAllDailyRecords();

export function getDaysForPreset(dateRange: DateRangePreset): number {
  switch (dateRange) {
    case 'last7days':
      return 7;
    case 'last14days':
      return 14;
    case 'last30days':
      return 30;
    case 'all':
    default:
      return TOTAL_DAYS;
  }
}

export function getFilteredDailyRecords(
  gameId: string,
  dateRange: DateRangePreset,
): DailyRecord[] {
  const days = getDaysForPreset(dateRange);
  const allDates = Array.from(new Set(ALL_DAILY_RECORDS.map((r) => r.date))).sort();
  const targetDates = new Set(allDates.slice(-days));

  if (gameId !== 'all') {
    return ALL_DAILY_RECORDS.filter(
      (r) => r.gameId === gameId && targetDates.has(r.date),
    ).sort((a, b) => a.date.localeCompare(b.date));
  }

  // Aggregate across all games by date
  const byDate = new Map<string, DailyRecord>();
  for (const r of ALL_DAILY_RECORDS) {
    if (!targetDates.has(r.date)) continue;
    const prev = byDate.get(r.date);
    if (!prev) {
      byDate.set(r.date, {
        date: r.date,
        gameId: 'all',
        gameName: '全部游戏',
        cost: r.cost,
        revenue: r.revenue,
        roi: 0,
        newUsers: r.newUsers,
        payingUsers: r.payingUsers,
        payRate: 0,
        cpa: 0,
      });
    } else {
      prev.cost += r.cost;
      prev.revenue += r.revenue;
      prev.newUsers += r.newUsers;
      prev.payingUsers += r.payingUsers;
    }
  }

  return Array.from(byDate.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => ({
      ...r,
      cost: round2(r.cost),
      revenue: round2(r.revenue),
      roi: r.cost > 0 ? round4(r.revenue / r.cost) : 0,
      payRate: r.newUsers > 0 ? round4(r.payingUsers / r.newUsers) : 0,
      cpa: r.newUsers > 0 ? round2(r.cost / r.newUsers) : 0,
    }));
}

export function getPreviousPeriodRecords(
  gameId: string,
  dateRange: DateRangePreset,
): DailyRecord[] {
  const days = Math.min(getDaysForPreset(dateRange), Math.floor(TOTAL_DAYS / 2));
  const allDates = Array.from(new Set(ALL_DAILY_RECORDS.map((r) => r.date))).sort();
  const prevDates = new Set(allDates.slice(-(days * 2), -days));

  return ALL_DAILY_RECORDS.filter(
    (r) => (gameId === 'all' || r.gameId === gameId) && prevDates.has(r.date),
  );
}

export function getGameById(gameId: string): GameSeedInfo | undefined {
  return GAMES.find((g) => g.id === gameId);
}

export { round2, round4 };
