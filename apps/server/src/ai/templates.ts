import {
  CATALOG_VERSION,
  CONTRACT_VERSION,
  type PageDocument,
} from '@ai-dashboard/contracts';

const DEFAULT_VARIABLES: PageDocument['variables'] = {
  gameId: {
    type: 'string',
    defaultValue: 'all',
    label: '游戏',
    description: '选择要分析的投放游戏',
  },
  dateRange: {
    type: 'dateRange',
    defaultValue: 'last14days',
    label: '时间周期',
    description: '统计时间区间',
    options: [
      { label: '近 7 天', value: 'last7days' },
      { label: '近 14 天', value: 'last14days' },
      { label: '近 30 天', value: 'last30days' },
      { label: '全部 35 天', value: 'all' },
    ],
  },
};

export function buildGameAdsDashboard(title?: string, description?: string): PageDocument {
  return {
    contractVersion: CONTRACT_VERSION,
    catalogVersion: CATALOG_VERSION,
    title: title || '游戏广告投放数据看板',
    description:
      description ||
      '全景监控游戏买量总消耗、充值收入、ROI、新增用户、每日趋势、充值档位分布、流量渠道占比与每日明细。',
    variables: structuredClone(DEFAULT_VARIABLES),
    queries: {
      games: { resource: 'ads.games', params: {}, targetState: '/data/games' },
      summary: {
        resource: 'ads.summary',
        params: { gameId: { $var: 'gameId' }, dateRange: { $var: 'dateRange' } },
        targetState: '/data/summary',
      },
      daily: {
        resource: 'ads.daily',
        params: { gameId: { $var: 'gameId' }, dateRange: { $var: 'dateRange' } },
        targetState: '/data/daily',
      },
      recharge: {
        resource: 'ads.recharge',
        params: { gameId: { $var: 'gameId' }, dateRange: { $var: 'dateRange' } },
        targetState: '/data/recharge',
      },
      traffic: {
        resource: 'ads.traffic',
        params: { gameId: { $var: 'gameId' }, dateRange: { $var: 'dateRange' } },
        targetState: '/data/traffic',
      },
      conversion: {
        resource: 'ads.conversion',
        params: { gameId: { $var: 'gameId' }, dateRange: { $var: 'dateRange' } },
        targetState: '/data/conversion',
      },
    },
    ui: {
      root: 'root',
      elements: {
        root: {
          type: 'DashboardColumn',
          props: { gap: 'md', width: 'full' },
          children: ['toolbar-panel', 'main-grid', 'section-trends'],
        },
        'toolbar-panel': {
          type: 'DashboardPanel',
          props: { padding: 'md', tone: 'elevated' },
          children: ['toolbar-row'],
        },
        'toolbar-row': {
          type: 'DashboardRow',
          props: { gap: 'md', align: 'center', justify: 'between', wrap: true },
          children: ['header-title', 'filter-group'],
        },
        'header-title': {
          type: 'Heading',
          props: {
            text: title || '游戏广告投放数据看板',
            subtitle: '口径：ROI = 充值收入 / 广告消耗 · 实时联动后端 DataSource',
            level: 2,
            badge: 'GAME ADS BI',
          },
          children: [],
        },
        'filter-group': {
          type: 'DashboardRow',
          props: { gap: 'sm', align: 'center', wrap: true },
          children: ['filter-game', 'filter-date', 'btn-refresh'],
        },
        'filter-game': {
          type: 'SelectFilter',
          props: {
            label: '投放游戏',
            variable: 'gameId',
            value: { $bindState: '/variables/gameId' },
            options: { $state: '/data/games' },
            width: 200,
          },
          children: [],
        },
        'filter-date': {
          type: 'DateRangeFilter',
          props: {
            label: '周期',
            variable: 'dateRange',
            value: { $bindState: '/variables/dateRange' },
          },
          children: [],
        },
        'btn-refresh': {
          type: 'RefreshButton',
          props: { label: '刷新数据' },
          children: [],
        },
        'main-grid': {
          type: 'DashboardGrid',
          props: { preset: 'sidebar-main-sidebar', gap: 'md' },
          children: ['col-left', 'col-center', 'col-right'],
        },
        'col-left': {
          type: 'DashboardColumn',
          props: { gap: 'md', width: 'full' },
          children: ['chart-recharge', 'list-channel-metrics'],
        },
        'chart-recharge': {
          type: 'BarChart',
          props: {
            title: '充值区间分布',
            subtitle: '各付费档位充值金额贡献',
            data: { $state: '/data/recharge' },
            xField: 'tier',
            series: [{ field: 'amount', name: '充值金额', color: '#818cf8' }],
            yAxisFormat: 'currency',
            horizontal: true,
            height: 250,
            showLegend: false,
            queryKey: 'recharge',
          },
          children: [],
        },
        'list-channel-metrics': {
          type: 'MetricList',
          props: {
            title: '渠道投放效率榜',
            data: { $state: '/data/traffic' },
            labelField: 'channel',
            valueField: 'cost',
            secondaryField: 'roi',
            valueFormat: 'currency',
            secondaryFormat: 'ratio',
            maxItems: 6,
            queryKey: 'traffic',
          },
          children: [],
        },
        'col-center': {
          type: 'DashboardColumn',
          props: { gap: 'md', width: 'full' },
          children: ['kpi-grid', 'table-daily'],
        },
        'kpi-grid': {
          type: 'DashboardGrid',
          props: { preset: 'equal-4', gap: 'sm' },
          children: ['stat-cost', 'stat-revenue', 'stat-roi', 'stat-new-users'],
        },
        'stat-cost': {
          type: 'StatCard',
          props: {
            title: '总消耗',
            value: { $state: '/data/summary/totalCost' },
            delta: { $state: '/data/summary/costDelta' },
            deltaLabel: '较上周期',
            format: 'currency',
            accent: 'cyan',
            queryKey: 'summary',
          },
          children: [],
        },
        'stat-revenue': {
          type: 'StatCard',
          props: {
            title: '充值收入',
            value: { $state: '/data/summary/revenue' },
            delta: { $state: '/data/summary/revenueDelta' },
            deltaLabel: '较上周期',
            format: 'currency',
            accent: 'emerald',
            queryKey: 'summary',
          },
          children: [],
        },
        'stat-roi': {
          type: 'StatCard',
          props: {
            title: '综合 ROI',
            value: { $state: '/data/summary/roi' },
            delta: { $state: '/data/summary/roiDelta' },
            deltaLabel: '较上周期',
            format: 'ratio',
            accent: 'amber',
            queryKey: 'summary',
          },
          children: [],
        },
        'stat-new-users': {
          type: 'StatCard',
          props: {
            title: '新增用户',
            value: { $state: '/data/summary/newUsers' },
            delta: { $state: '/data/summary/newUsersDelta' },
            deltaLabel: '较上周期',
            format: 'integer',
            accent: 'indigo',
            queryKey: 'summary',
          },
          children: [],
        },
        'table-daily': {
          type: 'DataTable',
          props: {
            title: '每日投放数据明细',
            data: { $state: '/data/daily' },
            rowKey: 'date',
            pageSize: 7,
            compact: true,
            queryKey: 'daily',
            columns: [
              { key: 'date', title: '日期', dataIndex: 'date', sortable: true, width: 112, fixed: 'left' },
              { key: 'cost', title: '消耗', dataIndex: 'cost', format: 'currency', sortable: true, align: 'right', width: 112 },
              { key: 'revenue', title: '收入', dataIndex: 'revenue', format: 'currency', sortable: true, align: 'right', width: 112 },
              { key: 'roi', title: 'ROI', dataIndex: 'roi', format: 'ratio', sortable: true, align: 'right', width: 88 },
              { key: 'newUsers', title: '新增', dataIndex: 'newUsers', format: 'integer', sortable: true, align: 'right', width: 92 },
              { key: 'payRate', title: '付费率', dataIndex: 'payRate', format: 'percent', sortable: true, align: 'right', width: 92 },
              { key: 'cpa', title: 'CPA', dataIndex: 'cpa', format: 'currency', sortable: true, align: 'right', width: 90 },
            ],
          },
          children: [],
        },
        'col-right': {
          type: 'DashboardColumn',
          props: { gap: 'md', width: 'full' },
          children: ['list-conversion', 'chart-channel-donut'],
        },
        'list-conversion': {
          type: 'ProgressList',
          props: {
            title: '核心转化漏斗',
            data: { $state: '/data/conversion' },
            labelField: 'stage',
            valueField: 'count',
            percentField: 'rate',
            valueFormat: 'integer',
            accent: 'emerald',
            queryKey: 'conversion',
          },
          children: [],
        },
        'chart-channel-donut': {
          type: 'DonutChart',
          props: {
            title: '流量渠道占比',
            subtitle: '按广告投放消耗统计',
            data: { $state: '/data/traffic' },
            nameField: 'channel',
            valueField: 'cost',
            valueFormat: 'currency',
            centerLabel: '渠道消耗',
            height: 250,
            showLegend: true,
            queryKey: 'traffic',
          },
          children: [],
        },
        'section-trends': {
          type: 'DashboardGrid',
          props: { preset: 'equal-2', gap: 'md' },
          children: ['chart-daily-trend', 'chart-roi-trend'],
        },
        'chart-daily-trend': {
          type: 'LineChart',
          props: {
            title: '每日消耗与充值收入趋势',
            subtitle: '单位：人民币 (¥)',
            data: { $state: '/data/daily' },
            xField: 'date',
            series: [
              { field: 'cost', name: '广告消耗', color: '#38bdf8', smooth: true, area: true },
              { field: 'revenue', name: '充值收入', color: '#34d399', smooth: true, area: true },
            ],
            yAxisFormat: 'currency',
            height: 290,
            showLegend: true,
            queryKey: 'daily',
          },
          children: [],
        },
        'chart-roi-trend': {
          type: 'LineChart',
          props: {
            title: '每日 ROI 走势',
            subtitle: '基准线 1.0x 为回本线',
            data: { $state: '/data/daily' },
            xField: 'date',
            series: [{ field: 'roi', name: '当日 ROI', color: '#f59e0b', smooth: true, area: true }],
            yAxisFormat: 'ratio',
            height: 290,
            showLegend: true,
            queryKey: 'daily',
          },
          children: [],
        },
      },
    },
  };
}

export function buildTrafficAnalysisDashboard(
  title?: string,
  description?: string,
): PageDocument {
  return {
    contractVersion: CONTRACT_VERSION,
    catalogVersion: CATALOG_VERSION,
    title: title || '买量流量渠道分析看板',
    description:
      description ||
      '聚焦多渠道流量结构、获客成本 CPA、渠道 ROI 对比、转化漏斗和渠道明细表现。',
    variables: structuredClone(DEFAULT_VARIABLES),
    queries: {
      games: { resource: 'ads.games', params: {}, targetState: '/data/games' },
      summary: {
        resource: 'ads.summary',
        params: { gameId: { $var: 'gameId' }, dateRange: { $var: 'dateRange' } },
        targetState: '/data/summary',
      },
      traffic: {
        resource: 'ads.traffic',
        params: { gameId: { $var: 'gameId' }, dateRange: { $var: 'dateRange' } },
        targetState: '/data/traffic',
      },
      conversion: {
        resource: 'ads.conversion',
        params: { gameId: { $var: 'gameId' }, dateRange: { $var: 'dateRange' } },
        targetState: '/data/conversion',
      },
    },
    ui: {
      root: 'root',
      elements: {
        root: {
          type: 'DashboardColumn',
          props: { gap: 'md', width: 'full' },
          children: ['toolbar-panel', 'traffic-summary-group', 'main-grid', 'table-traffic'],
        },
        'toolbar-panel': {
          type: 'DashboardPanel',
          props: { padding: 'md', tone: 'elevated' },
          children: ['toolbar-row'],
        },
        'toolbar-row': {
          type: 'DashboardRow',
          props: { gap: 'md', align: 'center', justify: 'between', wrap: true },
          children: ['header-title', 'filter-group'],
        },
        'header-title': {
          type: 'Heading',
          props: {
            text: title || '买量流量渠道分析看板',
            subtitle: '多渠道流量占比、获客成本与漏斗转化效率分析',
            level: 2,
            badge: 'TRAFFIC BI',
          },
          children: [],
        },
        'filter-group': {
          type: 'DashboardRow',
          props: { gap: 'sm', align: 'center', wrap: true },
          children: ['filter-game', 'filter-date', 'btn-refresh'],
        },
        'filter-game': {
          type: 'SelectFilter',
          props: {
            label: '游戏',
            variable: 'gameId',
            value: { $bindState: '/variables/gameId' },
            options: { $state: '/data/games' },
            width: 200,
          },
          children: [],
        },
        'filter-date': {
          type: 'DateRangeFilter',
          props: {
            label: '周期',
            variable: 'dateRange',
            value: { $bindState: '/variables/dateRange' },
          },
          children: [],
        },
        'btn-refresh': {
          type: 'RefreshButton',
          props: { label: '刷新数据' },
          children: [],
        },
        'traffic-summary-group': {
          type: 'MetricGroup',
          props: {
            title: '流量获客核心效率',
            columns: 4,
            queryKey: 'summary',
            items: [
              { label: '新增用户', value: { $state: '/data/summary/newUsers' }, delta: { $state: '/data/summary/newUsersDelta' }, format: 'integer', accent: 'cyan' },
              { label: '获客成本 CPA', value: { $state: '/data/summary/cpa' }, format: 'currency', accent: 'amber' },
              { label: '付费转化率', value: { $state: '/data/summary/payRate' }, format: 'percent', accent: 'emerald' },
              { label: '综合 ROI', value: { $state: '/data/summary/roi' }, delta: { $state: '/data/summary/roiDelta' }, format: 'ratio', accent: 'indigo' },
            ],
          },
          children: [],
        },
        'main-grid': {
          type: 'DashboardGrid',
          props: { preset: 'equal-3', gap: 'md' },
          children: ['chart-channel-bar', 'chart-channel-pie', 'list-conversion'],
        },
        'chart-channel-bar': {
          type: 'BarChart',
          props: {
            title: '各渠道消耗与收入对比',
            data: { $state: '/data/traffic' },
            xField: 'channel',
            series: [
              { field: 'cost', name: '渠道消耗', color: '#38bdf8' },
              { field: 'revenue', name: '渠道收入', color: '#34d399' },
            ],
            yAxisFormat: 'currency',
            height: 290,
            showLegend: true,
            queryKey: 'traffic',
          },
          children: [],
        },
        'chart-channel-pie': {
          type: 'PieChart',
          props: {
            title: '渠道消耗结构占比',
            data: { $state: '/data/traffic' },
            nameField: 'channel',
            valueField: 'cost',
            valueFormat: 'currency',
            height: 290,
            showLegend: true,
            queryKey: 'traffic',
          },
          children: [],
        },
        'list-conversion': {
          type: 'ProgressList',
          props: {
            title: '流量转化漏斗',
            data: { $state: '/data/conversion' },
            labelField: 'stage',
            valueField: 'count',
            percentField: 'rate',
            valueFormat: 'integer',
            accent: 'cyan',
            queryKey: 'conversion',
          },
          children: [],
        },
        'table-traffic': {
          type: 'DataTable',
          props: {
            title: '投放渠道明细表',
            data: { $state: '/data/traffic' },
            rowKey: 'channel',
            pageSize: 10,
            queryKey: 'traffic',
            columns: [
              { key: 'channel', title: '投放渠道', dataIndex: 'channel', sortable: true, width: 160 },
              { key: 'cost', title: '消耗', dataIndex: 'cost', format: 'currency', sortable: true, align: 'right' },
              { key: 'revenue', title: '收入', dataIndex: 'revenue', format: 'currency', sortable: true, align: 'right' },
              { key: 'newUsers', title: '新增用户', dataIndex: 'newUsers', format: 'integer', sortable: true, align: 'right' },
              { key: 'roi', title: '渠道 ROI', dataIndex: 'roi', format: 'ratio', sortable: true, align: 'right' },
              { key: 'share', title: '消耗占比', dataIndex: 'share', format: 'percent', sortable: true, align: 'right' },
            ],
          },
          children: [],
        },
      },
    },
  };
}

export function buildRevenueAnalysisDashboard(
  title?: string,
  description?: string,
): PageDocument {
  return {
    contractVersion: CONTRACT_VERSION,
    catalogVersion: CATALOG_VERSION,
    title: title || '游戏商业化收入分析看板',
    description:
      description ||
      '聚焦充值收入、付费规模、ARPU/ARPPU、每日收入走势与充值档位结构分布。',
    variables: structuredClone(DEFAULT_VARIABLES),
    queries: {
      games: { resource: 'ads.games', params: {}, targetState: '/data/games' },
      summary: {
        resource: 'ads.summary',
        params: { gameId: { $var: 'gameId' }, dateRange: { $var: 'dateRange' } },
        targetState: '/data/summary',
      },
      daily: {
        resource: 'ads.daily',
        params: { gameId: { $var: 'gameId' }, dateRange: { $var: 'dateRange' } },
        targetState: '/data/daily',
      },
      recharge: {
        resource: 'ads.recharge',
        params: { gameId: { $var: 'gameId' }, dateRange: { $var: 'dateRange' } },
        targetState: '/data/recharge',
      },
    },
    ui: {
      root: 'root',
      elements: {
        root: {
          type: 'DashboardColumn',
          props: { gap: 'md', width: 'full' },
          children: ['toolbar-panel', 'kpi-grid', 'section-trends', 'main-grid'],
        },
        'toolbar-panel': {
          type: 'DashboardPanel',
          props: { padding: 'md', tone: 'elevated' },
          children: ['toolbar-row'],
        },
        'toolbar-row': {
          type: 'DashboardRow',
          props: { gap: 'md', align: 'center', justify: 'between', wrap: true },
          children: ['header-title', 'filter-group'],
        },
        'header-title': {
          type: 'Heading',
          props: {
            text: title || '游戏商业化收入分析看板',
            subtitle: '充值营收趋势、付费深度与档位结构监控',
            level: 2,
            badge: 'REVENUE BI',
          },
          children: [],
        },
        'filter-group': {
          type: 'DashboardRow',
          props: { gap: 'sm', align: 'center', wrap: true },
          children: ['filter-game', 'filter-date', 'btn-refresh'],
        },
        'filter-game': {
          type: 'SelectFilter',
          props: {
            label: '游戏',
            variable: 'gameId',
            value: { $bindState: '/variables/gameId' },
            options: { $state: '/data/games' },
            width: 200,
          },
          children: [],
        },
        'filter-date': {
          type: 'DateRangeFilter',
          props: {
            label: '周期',
            variable: 'dateRange',
            value: { $bindState: '/variables/dateRange' },
          },
          children: [],
        },
        'btn-refresh': {
          type: 'RefreshButton',
          props: { label: '刷新数据' },
          children: [],
        },
        'kpi-grid': {
          type: 'DashboardGrid',
          props: { preset: 'equal-4', gap: 'md' },
          children: ['stat-revenue', 'stat-paying-users', 'stat-arpu', 'stat-arppu'],
        },
        'stat-revenue': {
          type: 'StatCard',
          props: {
            title: '累计充值收入',
            value: { $state: '/data/summary/revenue' },
            delta: { $state: '/data/summary/revenueDelta' },
            deltaLabel: '较上周期',
            format: 'currency',
            accent: 'emerald',
            queryKey: 'summary',
          },
          children: [],
        },
        'stat-paying-users': {
          type: 'StatCard',
          props: {
            title: '付费用户数',
            value: { $state: '/data/summary/payingUsers' },
            format: 'integer',
            accent: 'cyan',
            queryKey: 'summary',
          },
          children: [],
        },
        'stat-arpu': {
          type: 'StatCard',
          props: {
            title: '人均收入 ARPU',
            value: { $state: '/data/summary/arpu' },
            format: 'currency',
            accent: 'indigo',
            queryKey: 'summary',
          },
          children: [],
        },
        'stat-arppu': {
          type: 'StatCard',
          props: {
            title: '付费人均 ARPPU',
            value: { $state: '/data/summary/arppu' },
            format: 'currency',
            accent: 'amber',
            queryKey: 'summary',
          },
          children: [],
        },
        'section-trends': {
          type: 'LineChart',
          props: {
            title: '每日充值收入与消耗走势',
            data: { $state: '/data/daily' },
            xField: 'date',
            series: [
              { field: 'revenue', name: '充值收入', color: '#34d399', smooth: true, area: true },
              { field: 'cost', name: '投放消耗', color: '#38bdf8', smooth: true },
            ],
            yAxisFormat: 'currency',
            height: 310,
            showLegend: true,
            queryKey: 'daily',
          },
          children: [],
        },
        'main-grid': {
          type: 'DashboardGrid',
          props: { preset: 'equal-2', gap: 'md' },
          children: ['chart-recharge-amount', 'chart-recharge-users'],
        },
        'chart-recharge-amount': {
          type: 'BarChart',
          props: {
            title: '各充值档位金额分布',
            data: { $state: '/data/recharge' },
            xField: 'tier',
            series: [{ field: 'amount', name: '充值金额', color: '#34d399' }],
            yAxisFormat: 'currency',
            height: 270,
            queryKey: 'recharge',
          },
          children: [],
        },
        'chart-recharge-users': {
          type: 'BarChart',
          props: {
            title: '各充值档位付费人数',
            data: { $state: '/data/recharge' },
            xField: 'tier',
            series: [{ field: 'users', name: '付费人数', color: '#818cf8' }],
            yAxisFormat: 'integer',
            height: 270,
            queryKey: 'recharge',
          },
          children: [],
        },
      },
    },
  };
}
