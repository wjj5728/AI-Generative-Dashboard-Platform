import type {
  DataFieldMetadata,
  DataSourceMetadata,
  UserIdentity,
} from '@ai-dashboard/contracts';
import { z } from 'zod';

export interface QueryContext {
  user: UserIdentity;
  requestId: string;
}

export interface DataSourceContract<
  TParamsSchema extends z.ZodType = z.ZodType,
  TResultSchema extends z.ZodType = z.ZodType,
> {
  id: string;
  name: string;
  description: string;
  category: string;
  requiredRoles: string[];
  paramsSchema: TParamsSchema;
  resultSchema: TResultSchema;
  metadata: DataSourceMetadata;
}

export interface ServerDataSourceDefinition<
  TParamsSchema extends z.ZodType = z.ZodType,
  TResultSchema extends z.ZodType = z.ZodType,
> extends DataSourceContract<TParamsSchema, TResultSchema> {
  handler: (
    params: z.infer<TParamsSchema>,
    context: QueryContext,
  ) => Promise<z.infer<TResultSchema>>;
  authorize?: (context: QueryContext) => boolean;
}

export const DateRangePresetSchema = z.enum([
  'last7days',
  'last14days',
  'last30days',
  'all',
]);

export type DateRangePreset = z.infer<typeof DateRangePresetSchema>;

export const GameFilterParamsSchema = z
  .object({
    gameId: z.string().min(1).default('all'),
    dateRange: DateRangePresetSchema.default('last14days'),
  })
  .strict();

export const EmptyParamsSchema = z.object({}).strict();

// 1. ads.games
export const AdsGameItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  genre: z.string(),
  region: z.string(),
  label: z.string(),
  value: z.string(),
});

export const AdsGamesResultSchema = z.array(AdsGameItemSchema);

export const adsGamesContract: DataSourceContract<
  typeof EmptyParamsSchema,
  typeof AdsGamesResultSchema
> = {
  id: 'ads.games',
  name: '投放游戏列表',
  description: '返回当前有权限查看的投放游戏列表（包含全部游戏汇总选项），用于下拉筛选器。',
  category: 'advertising',
  requiredRoles: ['ads:read'],
  paramsSchema: EmptyParamsSchema,
  resultSchema: AdsGamesResultSchema,
  metadata: {
    id: 'ads.games',
    name: '投放游戏列表',
    description: '返回当前有权限查看的投放游戏列表（包含全部游戏汇总选项），用于下拉筛选器。',
    category: 'advertising',
    requiredRoles: ['ads:read'],
    params: [],
    resultType: 'array',
    fields: [
      { name: 'id', label: '游戏ID', type: 'string', description: '唯一游戏标识' },
      { name: 'name', label: '游戏名称', type: 'string', description: '游戏展示名称' },
      { name: 'genre', label: '品类', type: 'string', description: '游戏类型' },
      { name: 'region', label: '发行区域', type: 'string', description: '主要投放市场' },
      { name: 'label', label: '选项标题', type: 'string', description: '筛选器显示文本' },
      { name: 'value', label: '选项值', type: 'string', description: '筛选器绑定值' },
    ],
    metricDefinitions: {},
  },
};

// 2. ads.summary
export const AdsSummaryResultSchema = z.object({
  gameId: z.string(),
  gameName: z.string(),
  dateRange: z.string(),
  totalCost: z.number(),
  revenue: z.number(),
  roi: z.number(),
  newUsers: z.number(),
  payingUsers: z.number(),
  payRate: z.number(),
  arpu: z.number(),
  arppu: z.number(),
  cpa: z.number(),
  costDelta: z.number(),
  revenueDelta: z.number(),
  roiDelta: z.number(),
  newUsersDelta: z.number(),
});

export const adsSummaryContract: DataSourceContract<
  typeof GameFilterParamsSchema,
  typeof AdsSummaryResultSchema
> = {
  id: 'ads.summary',
  name: '投放核心汇总指标',
  description: '按游戏和日期区间聚合总消耗、总充值收入、ROI、新增用户、付费用户、付费率及环比变化。',
  category: 'advertising',
  requiredRoles: ['ads:read'],
  paramsSchema: GameFilterParamsSchema,
  resultSchema: AdsSummaryResultSchema,
  metadata: {
    id: 'ads.summary',
    name: '投放核心汇总指标',
    description: '按游戏和日期区间聚合总消耗、总充值收入、ROI、新增用户、付费用户、付费率及环比变化。',
    category: 'advertising',
    requiredRoles: ['ads:read'],
    params: [
      {
        name: 'gameId',
        type: 'string',
        required: false,
        defaultValue: 'all',
        description: '游戏ID（all 或 game-001 / game-002 / game-003）',
      },
      {
        name: 'dateRange',
        type: 'dateRange',
        required: false,
        defaultValue: 'last14days',
        allowedValues: ['last7days', 'last14days', 'last30days', 'all'],
        description: '日期筛选区间',
      },
    ],
    resultType: 'object',
    fields: [
      { name: 'gameId', label: '游戏ID', type: 'string', description: '当前筛选的游戏ID' },
      { name: 'gameName', label: '游戏名称', type: 'string', description: '当前筛选的游戏名称' },
      { name: 'dateRange', label: '时间范围', type: 'string', description: '统计时间区间' },
      {
        name: 'totalCost',
        label: '总消耗',
        type: 'currency',
        unit: '¥',
        description: '所选区间内广告投放总消耗',
        formula: 'SUM(daily.cost)',
      },
      {
        name: 'revenue',
        label: '充值收入',
        type: 'currency',
        unit: '¥',
        description: '所选区间内累计游戏充值收入',
        formula: 'SUM(daily.revenue)',
      },
      {
        name: 'roi',
        label: 'ROI',
        type: 'ratio',
        unit: 'x',
        description: '投资回报率（收入除以消耗）',
        formula: 'revenue / totalCost',
      },
      {
        name: 'newUsers',
        label: '新增用户',
        type: 'integer',
        unit: '人',
        description: '广告带来的新增激活用户数',
        formula: 'SUM(daily.newUsers)',
      },
      {
        name: 'payingUsers',
        label: '付费用户',
        type: 'integer',
        unit: '人',
        description: '产生充值行为的去重用户数',
        formula: 'SUM(daily.payingUsers)',
      },
      {
        name: 'payRate',
        label: '付费转化率',
        type: 'percent',
        unit: '%',
        description: '付费用户占新增用户比例',
        formula: 'payingUsers / newUsers',
      },
      {
        name: 'arpu',
        label: 'ARPU',
        type: 'currency',
        unit: '¥',
        description: '人均收入',
        formula: 'revenue / newUsers',
      },
      {
        name: 'arppu',
        label: 'ARPPU',
        type: 'currency',
        unit: '¥',
        description: '付费用户平均收入',
        formula: 'revenue / payingUsers',
      },
      {
        name: 'cpa',
        label: '获客成本 CPA',
        type: 'currency',
        unit: '¥',
        description: '单新增用户投放成本',
        formula: 'totalCost / newUsers',
      },
      { name: 'costDelta', label: '消耗环比', type: 'percent', unit: '%', description: '较上一周期变化比例' },
      { name: 'revenueDelta', label: '收入环比', type: 'percent', unit: '%', description: '较上一周期变化比例' },
      { name: 'roiDelta', label: 'ROI环比', type: 'percent', unit: '%', description: '较上一周期变化比例' },
      { name: 'newUsersDelta', label: '新增环比', type: 'percent', unit: '%', description: '较上一周期变化比例' },
    ],
    metricDefinitions: {
      roi: 'revenue / totalCost（充值收入 ÷ 广告消耗，非百分比，1.15 表示 115% 回本）',
      payRate: 'payingUsers / newUsers（0~1 小数，前端按百分比展示）',
      cpa: 'totalCost / newUsers（元/人）',
      arpu: 'revenue / newUsers（元/人）',
      arppu: 'revenue / payingUsers（元/付费人）',
    },
  },
};

// 3. ads.daily
export const AdsDailyRowSchema = z.object({
  date: z.string(),
  gameId: z.string(),
  gameName: z.string(),
  cost: z.number(),
  revenue: z.number(),
  roi: z.number(),
  newUsers: z.number(),
  payingUsers: z.number(),
  payRate: z.number(),
  cpa: z.number(),
});

export const AdsDailyResultSchema = z.array(AdsDailyRowSchema);

export const adsDailyContract: DataSourceContract<
  typeof GameFilterParamsSchema,
  typeof AdsDailyResultSchema
> = {
  id: 'ads.daily',
  name: '每日投放趋势与明细',
  description: '返回按日期升序排列的每日消耗、收入、ROI、新增用户、付费用户与转化明细，适用于折线图、柱状图和数据表。',
  category: 'advertising',
  requiredRoles: ['ads:read'],
  paramsSchema: GameFilterParamsSchema,
  resultSchema: AdsDailyResultSchema,
  metadata: {
    id: 'ads.daily',
    name: '每日投放趋势与明细',
    description: '返回按日期升序排列的每日消耗、收入、ROI、新增用户、付费用户与转化明细，适用于折线图、柱状图和数据表。',
    category: 'advertising',
    requiredRoles: ['ads:read'],
    params: [
      {
        name: 'gameId',
        type: 'string',
        required: false,
        defaultValue: 'all',
        description: '游戏ID',
      },
      {
        name: 'dateRange',
        type: 'dateRange',
        required: false,
        defaultValue: 'last14days',
        allowedValues: ['last7days', 'last14days', 'last30days', 'all'],
        description: '日期区间',
      },
    ],
    resultType: 'array',
    fields: [
      { name: 'date', label: '日期', type: 'date', description: '统计日期 YYYY-MM-DD' },
      { name: 'gameId', label: '游戏ID', type: 'string', description: '游戏标识' },
      { name: 'gameName', label: '游戏', type: 'string', description: '游戏名称' },
      { name: 'cost', label: '消耗', type: 'currency', unit: '¥', description: '当日投放消耗' },
      { name: 'revenue', label: '收入', type: 'currency', unit: '¥', description: '当日充值收入' },
      { name: 'roi', label: 'ROI', type: 'ratio', unit: 'x', description: '当日 ROI (revenue / cost)' },
      { name: 'newUsers', label: '新增用户', type: 'integer', unit: '人', description: '当日新增用户' },
      { name: 'payingUsers', label: '付费用户', type: 'integer', unit: '人', description: '当日付费用户' },
      { name: 'payRate', label: '付费率', type: 'percent', unit: '%', description: '当日付费转化率' },
      { name: 'cpa', label: 'CPA', type: 'currency', unit: '¥', description: '当日获客成本' },
    ],
    metricDefinitions: {
      roi: 'daily.revenue / daily.cost',
      payRate: 'daily.payingUsers / daily.newUsers',
    },
  },
};

// 4. ads.recharge
export const AdsRechargeBucketSchema = z.object({
  tier: z.string(),
  amount: z.number(),
  users: z.number(),
  share: z.number(),
});

export const AdsRechargeResultSchema = z.array(AdsRechargeBucketSchema);

export const adsRechargeContract: DataSourceContract<
  typeof GameFilterParamsSchema,
  typeof AdsRechargeResultSchema
> = {
  id: 'ads.recharge',
  name: '充值档位区间分布',
  description: '按充值金额区间（6元/30元/98元/198元/328元/648元+）统计充值额、人数及占比。',
  category: 'monetization',
  requiredRoles: ['ads:read'],
  paramsSchema: GameFilterParamsSchema,
  resultSchema: AdsRechargeResultSchema,
  metadata: {
    id: 'ads.recharge',
    name: '充值档位区间分布',
    description: '按充值金额区间（6元/30元/98元/198元/328元/648元+）统计充值额、人数及占比。',
    category: 'monetization',
    requiredRoles: ['ads:read'],
    params: [
      { name: 'gameId', type: 'string', required: false, defaultValue: 'all', description: '游戏ID' },
      {
        name: 'dateRange',
        type: 'dateRange',
        required: false,
        defaultValue: 'last14days',
        allowedValues: ['last7days', 'last14days', 'last30days', 'all'],
        description: '日期区间',
      },
    ],
    resultType: 'array',
    fields: [
      { name: 'tier', label: '充值档位', type: 'string', description: '充值区间名称' },
      { name: 'amount', label: '充值金额', type: 'currency', unit: '¥', description: '该档位总充值金额' },
      { name: 'users', label: '付费人数', type: 'integer', unit: '人', description: '该档位付费人数' },
      { name: 'share', label: '金额占比', type: 'percent', unit: '%', description: '占总充值额百分比 (0~1)' },
    ],
    metricDefinitions: {
      share: 'bucket.amount / SUM(buckets.amount)',
    },
  },
};

// 5. ads.traffic
export const AdsTrafficChannelSchema = z.object({
  channel: z.string(),
  cost: z.number(),
  revenue: z.number(),
  newUsers: z.number(),
  roi: z.number(),
  share: z.number(),
});

export const AdsTrafficResultSchema = z.array(AdsTrafficChannelSchema);

export const adsTrafficContract: DataSourceContract<
  typeof GameFilterParamsSchema,
  typeof AdsTrafficResultSchema
> = {
  id: 'ads.traffic',
  name: '投放渠道流量占比',
  description: '按买量渠道（巨量引擎、腾讯广告、快手磁力、Apple Search Ads、B站起飞）统计消耗、收入、新增与占比。',
  category: 'traffic',
  requiredRoles: ['ads:read'],
  paramsSchema: GameFilterParamsSchema,
  resultSchema: AdsTrafficResultSchema,
  metadata: {
    id: 'ads.traffic',
    name: '投放渠道流量占比',
    description: '按买量渠道（巨量引擎、腾讯广告、快手磁力、Apple Search Ads、B站起飞）统计消耗、收入、新增与占比。',
    category: 'traffic',
    requiredRoles: ['ads:read'],
    params: [
      { name: 'gameId', type: 'string', required: false, defaultValue: 'all', description: '游戏ID' },
      {
        name: 'dateRange',
        type: 'dateRange',
        required: false,
        defaultValue: 'last14days',
        allowedValues: ['last7days', 'last14days', 'last30days', 'all'],
        description: '日期区间',
      },
    ],
    resultType: 'array',
    fields: [
      { name: 'channel', label: '投放渠道', type: 'string', description: '流量媒体名称' },
      { name: 'cost', label: '渠道消耗', type: 'currency', unit: '¥', description: '该渠道广告消耗' },
      { name: 'revenue', label: '渠道收入', type: 'currency', unit: '¥', description: '该渠道回收收入' },
      { name: 'newUsers', label: '新增用户', type: 'integer', unit: '人', description: '该渠道新增用户数' },
      { name: 'roi', label: '渠道ROI', type: 'ratio', unit: 'x', description: '渠道回本率' },
      { name: 'share', label: '消耗占比', type: 'percent', unit: '%', description: '占总消耗比例 (0~1)' },
    ],
    metricDefinitions: {
      roi: 'channel.revenue / channel.cost',
      share: 'channel.cost / SUM(channels.cost)',
    },
  },
};

// 6. ads.conversion
export const AdsConversionStageSchema = z.object({
  stage: z.string(),
  count: z.number(),
  rate: z.number(),
  benchmark: z.number(),
});

export const AdsConversionResultSchema = z.array(AdsConversionStageSchema);

export const adsConversionContract: DataSourceContract<
  typeof GameFilterParamsSchema,
  typeof AdsConversionResultSchema
> = {
  id: 'ads.conversion',
  name: '投放转化漏斗指标',
  description: '统计曝光→点击→激活→创角→首充→复充各环节人数与转化率，适合进度列表或指标列表展示。',
  category: 'conversion',
  requiredRoles: ['ads:read'],
  paramsSchema: GameFilterParamsSchema,
  resultSchema: AdsConversionResultSchema,
  metadata: {
    id: 'ads.conversion',
    name: '投放转化漏斗指标',
    description: '统计曝光→点击→激活→创角→首充→复充各环节人数与转化率，适合进度列表或指标列表展示。',
    category: 'conversion',
    requiredRoles: ['ads:read'],
    params: [
      { name: 'gameId', type: 'string', required: false, defaultValue: 'all', description: '游戏ID' },
      {
        name: 'dateRange',
        type: 'dateRange',
        required: false,
        defaultValue: 'last14days',
        allowedValues: ['last7days', 'last14days', 'last30days', 'all'],
        description: '日期区间',
      },
    ],
    resultType: 'array',
    fields: [
      { name: 'stage', label: '转化环节', type: 'string', description: '漏斗阶段名称' },
      { name: 'count', label: '转化人数', type: 'integer', unit: '人', description: '该阶段累计规模' },
      { name: 'rate', label: '转化率', type: 'percent', unit: '%', description: '相对上一环节转化比例 (0~1)' },
      { name: 'benchmark', label: '行业基准', type: 'percent', unit: '%', description: '同类游戏参考转化率 (0~1)' },
    ],
    metricDefinitions: {
      rate: 'stage.count / prevStage.count',
    },
  },
};

export const ALL_DATASOURCE_CONTRACTS: Record<string, DataSourceContract> = {
  'ads.games': adsGamesContract,
  'ads.summary': adsSummaryContract,
  'ads.daily': adsDailyContract,
  'ads.recharge': adsRechargeContract,
  'ads.traffic': adsTrafficContract,
  'ads.conversion': adsConversionContract,
};

export function getDataSourceContract(id: string): DataSourceContract | undefined {
  return ALL_DATASOURCE_CONTRACTS[id];
}

export function getPublicDataSourceMetadata(
  userRoles?: string[],
): DataSourceMetadata[] {
  return Object.values(ALL_DATASOURCE_CONTRACTS)
    .filter((contract) => {
      if (!userRoles) return true;
      return contract.requiredRoles.every((role) => userRoles.includes(role));
    })
    .map((contract) => contract.metadata);
}

export function getDataSourceField(
  resourceId: string,
  fieldName: string,
): DataFieldMetadata | undefined {
  const contract = ALL_DATASOURCE_CONTRACTS[resourceId];
  if (!contract) return undefined;
  return contract.metadata.fields.find((f) => f.name === fieldName);
}
