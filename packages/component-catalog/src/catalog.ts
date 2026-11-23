import { defineCatalog } from '@json-render/core';
import { schema as reactSchema } from '@json-render/react/schema';
import type { ComponentMetadata } from '@ai-dashboard/contracts';
import { z } from 'zod';

/**
 * Official json-render state reference schemas so bindable props pass
 * catalog.validate(spec) for both literals and runtime state bindings.
 */
export const StateRefSchema = z
  .object({
    $state: z.string().startsWith('/'),
  })
  .strict();

export const BindStateRefSchema = z
  .object({
    $bindState: z.string().startsWith('/'),
  })
  .strict();

export const bindable = <T extends z.ZodType>(inner: T) =>
  z.union([inner, StateRefSchema]);

export const twoWayBindable = <T extends z.ZodType>(inner: T) =>
  z.union([inner, StateRefSchema, BindStateRefSchema]);

export const SpacingTokenSchema = z.enum(['none', 'xs', 'sm', 'md', 'lg', 'xl']);
export const AlignTokenSchema = z.enum(['start', 'center', 'end', 'stretch']);
export const JustifyTokenSchema = z.enum([
  'start',
  'center',
  'end',
  'between',
  'around',
]);
export const WidthTokenSchema = z.enum([
  'auto',
  'full',
  '1/2',
  '1/3',
  '2/3',
  '1/4',
  '3/4',
]);
export const FormatTypeSchema = z.enum([
  'number',
  'currency',
  'percent',
  'ratio',
  'integer',
  'compact',
  'text',
  'date',
]);

const BaseLayoutProps = {
  gap: SpacingTokenSchema.optional(),
  padding: SpacingTokenSchema.optional(),
  align: AlignTokenSchema.optional(),
  justify: JustifyTokenSchema.optional(),
  width: WidthTokenSchema.optional(),
  span: z.number().int().min(1).max(12).optional(),
};

const ChartSeriesSchema = z.object({
  field: z.string().min(1),
  name: z.string().min(1),
  color: z.string().optional(),
  yAxisIndex: z.number().int().min(0).max(1).optional(),
  smooth: z.boolean().optional(),
  area: z.boolean().optional(),
});

const TableColumnSchema = z.object({
  key: z.string().min(1),
  title: z.string().min(1),
  dataIndex: z.string().min(1),
  format: FormatTypeSchema.optional(),
  sortable: z.boolean().optional(),
  align: z.enum(['left', 'center', 'right']).optional(),
  width: z.number().int().min(60).max(400).optional(),
  fixed: z.enum(['left', 'right']).optional(),
});

const MetricGroupItemSchema = z.object({
  label: z.string().min(1),
  value: bindable(z.union([z.number(), z.string()])).optional(),
  delta: bindable(z.number()).optional(),
  format: FormatTypeSchema.optional(),
  unit: z.string().optional(),
  accent: z.enum(['cyan', 'emerald', 'amber', 'rose', 'indigo', 'slate']).optional(),
});

const TabItemSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
});

const SelectOptionSchema = z.object({
  label: z.string(),
  value: z.union([z.string(), z.number()]),
});

export const dashboardCatalog = defineCatalog(reactSchema, {
  components: {
    // ================= 5.1 Layout Components =================
    Row: {
      props: z.object({
        ...BaseLayoutProps,
        wrap: z.boolean().optional(),
        equalWidth: z.boolean().optional(),
      }),
      slots: ['default'],
      description:
        '水平弹性布局行容器 (Row)，适合横向并排展示多个指标卡、图表或列容器；支持 equalWidth 等宽分栏与响应式自动换行。',
      example: { gap: 'md', align: 'stretch', equalWidth: true, wrap: true },
    },

    Column: {
      props: z.object({
        ...BaseLayoutProps,
      }),
      slots: ['default'],
      description:
        '垂直布局列容器 (Column)，适合纵向堆叠模块、单列阅读流或在 Row 内构成左/右分列。',
      example: { gap: 'md', width: 'full' },
    },

    DashboardRow: {
      props: z.object({
        ...BaseLayoutProps,
        wrap: z.boolean().optional(),
        equalWidth: z.boolean().optional(),
      }),
      slots: ['default'],
      description:
        '水平弹性布局行容器，支持 wrap 换行、equalWidth 等宽、间距、对齐和响应式折叠，不允许自由 CSS。',
      example: { gap: 'md', align: 'center', justify: 'between', wrap: true },
    },

    DashboardColumn: {
      props: z.object({
        ...BaseLayoutProps,
      }),
      slots: ['default'],
      description:
        '垂直布局列容器，用于组织页面纵向区块或在 Grid/Row 列内垂直堆叠多个组件。',
      example: { gap: 'md', width: 'full' },
    },

    DashboardGrid: {
      props: z.object({
        ...BaseLayoutProps,
        preset: z.enum([
          'equal-2',
          'equal-3',
          'equal-4',
          'sidebar-main',
          'sidebar-main-sidebar',
        ]),
        minHeight: z.enum(['auto', 'sm', 'md', 'lg']).optional(),
      }),
      slots: ['default'],
      description:
        '预设响应式网格布局容器。支持 equal-2、equal-3、equal-4、sidebar-main、sidebar-main-sidebar 五种 BI 布局。',
      example: { preset: 'sidebar-main-sidebar', gap: 'md' },
    },

    DashboardPanel: {
      props: z.object({
        ...BaseLayoutProps,
        title: z.string().optional(),
        subtitle: z.string().optional(),
        tone: z.enum(['default', 'elevated', 'subtle']).optional(),
      }),
      slots: ['default'],
      description: '语义分区面板容器，带可选标题和副标题，适合包裹一组关联图表或筛选工具栏。',
      example: { title: '核心监控区', padding: 'md', tone: 'default' },
    },

    DashboardCard: {
      props: z.object({
        ...BaseLayoutProps,
        title: z.string().optional(),
        subtitle: z.string().optional(),
        badge: z.string().optional(),
        bordered: z.boolean().optional(),
      }),
      slots: ['default'],
      description: '标准深色 BI 卡片容器，统一卡片边框、标题栏与内边距。',
      example: { title: '每日趋势', badge: '近14天', padding: 'md' },
    },

    Tabs: {
      props: z.object({
        ...BaseLayoutProps,
        tabGroupId: z.string().min(1),
        activeKey: twoWayBindable(z.string()).optional(),
        defaultActiveKey: z.string().optional(),
        items: z.array(TabItemSchema).min(1),
      }),
      slots: ['default'],
      description: '选项卡切换容器，通过 activeKey 绑定状态或触发 changeTab 动作切换子视图。',
      example: {
        tabGroupId: 'trend-tabs',
        defaultActiveKey: 'cost',
        items: [
          { key: 'cost', label: '消耗趋势' },
          { key: 'roi', label: 'ROI 趋势' },
        ],
      },
    },

    Divider: {
      props: z.object({
        label: z.string().optional(),
        orientation: z.enum(['horizontal', 'vertical']).optional(),
        spacing: SpacingTokenSchema.optional(),
      }),
      slots: [],
      description: '区块分割线，用于在页面区域之间提供视觉分层。',
      example: { orientation: 'horizontal', spacing: 'sm' },
    },

    // ================= 5.2 Business Display Components =================
    StatCard: {
      props: z.object({
        title: z.string().min(1),
        value: bindable(z.union([z.number(), z.string()])).optional(),
        delta: bindable(z.number()).optional(),
        deltaLabel: z.string().optional(),
        format: FormatTypeSchema.optional(),
        unit: z.string().optional(),
        subtitle: z.string().optional(),
        accent: z.enum(['cyan', 'emerald', 'amber', 'rose', 'indigo', 'slate']).optional(),
        queryKey: z.string().optional(),
        span: z.number().int().min(1).max(12).optional(),
      }),
      slots: [],
      description:
        '核心 KPI 指标卡，通过 { "$state": "/data/summary/totalCost" } 绑定标量指标及环比变化。',
      example: {
        title: '总消耗',
        value: { $state: '/data/summary/totalCost' },
        delta: { $state: '/data/summary/costDelta' },
        format: 'currency',
        accent: 'cyan',
        queryKey: 'summary',
      },
    },

    MetricGroup: {
      props: z.object({
        title: z.string().optional(),
        columns: z.number().int().min(1).max(4).optional(),
        items: z.array(MetricGroupItemSchema).min(1),
        queryKey: z.string().optional(),
        span: z.number().int().min(1).max(12).optional(),
      }),
      slots: [],
      description: '多指标紧凑组合卡，适合在一个卡片内并排展示 2~4 个核心指标。',
      example: {
        title: '核心指标概览',
        columns: 2,
        queryKey: 'summary',
        items: [
          { label: '总消耗', value: { $state: '/data/summary/totalCost' }, format: 'currency' },
          { label: 'ROI', value: { $state: '/data/summary/roi' }, format: 'ratio' },
        ],
      },
    },

    MetricList: {
      props: z.object({
        title: z.string().optional(),
        data: bindable(z.array(z.record(z.string(), z.unknown()))).optional(),
        labelField: z.string().min(1),
        valueField: z.string().min(1),
        secondaryField: z.string().optional(),
        valueFormat: FormatTypeSchema.optional(),
        secondaryFormat: FormatTypeSchema.optional(),
        maxItems: z.number().int().min(1).max(20).optional(),
        queryKey: z.string().optional(),
        span: z.number().int().min(1).max(12).optional(),
      }),
      slots: [],
      description: '列表型指标榜单组件，将数组数据源渲染为带排名与副指标的紧凑列表。',
      example: {
        title: '渠道效果明细',
        data: { $state: '/data/traffic' },
        labelField: 'channel',
        valueField: 'cost',
        secondaryField: 'roi',
        valueFormat: 'currency',
        secondaryFormat: 'ratio',
        queryKey: 'traffic',
      },
    },

    ProgressList: {
      props: z.object({
        title: z.string().optional(),
        data: bindable(z.array(z.record(z.string(), z.unknown()))).optional(),
        labelField: z.string().min(1),
        valueField: z.string().min(1),
        percentField: z.string().min(1),
        valueFormat: FormatTypeSchema.optional(),
        accent: z.enum(['cyan', 'emerald', 'amber', 'rose', 'indigo']).optional(),
        queryKey: z.string().optional(),
        span: z.number().int().min(1).max(12).optional(),
      }),
      slots: [],
      description: '带进度条的分布/转化漏斗列表组件，适合充值档位分布或转化漏斗展示。',
      example: {
        title: '转化漏斗',
        data: { $state: '/data/conversion' },
        labelField: 'stage',
        valueField: 'count',
        percentField: 'rate',
        valueFormat: 'integer',
        accent: 'emerald',
        queryKey: 'conversion',
      },
    },

    LineChart: {
      props: z.object({
        title: z.string().optional(),
        subtitle: z.string().optional(),
        data: bindable(z.array(z.record(z.string(), z.unknown()))).optional(),
        xField: z.string().min(1),
        series: z.array(ChartSeriesSchema).min(1),
        yAxisFormat: FormatTypeSchema.optional(),
        secondaryYAxisFormat: FormatTypeSchema.optional(),
        height: z.number().int().min(180).max(560).optional(),
        showLegend: z.boolean().optional(),
        queryKey: z.string().optional(),
        span: z.number().int().min(1).max(12).optional(),
      }),
      slots: [],
      description: '基于 ECharts 的折线趋势图，支持多系列、双 Y 轴、面积填充与自适应缩放。',
      example: {
        title: '每日消耗与收入趋势',
        data: { $state: '/data/daily' },
        xField: 'date',
        series: [
          { field: 'cost', name: '消耗', color: '#38bdf8', area: true, smooth: true },
          { field: 'revenue', name: '收入', color: '#34d399', area: true, smooth: true },
        ],
        yAxisFormat: 'currency',
        height: 300,
        queryKey: 'daily',
      },
    },

    BarChart: {
      props: z.object({
        title: z.string().optional(),
        subtitle: z.string().optional(),
        data: bindable(z.array(z.record(z.string(), z.unknown()))).optional(),
        xField: z.string().min(1),
        series: z.array(ChartSeriesSchema).min(1),
        yAxisFormat: FormatTypeSchema.optional(),
        horizontal: z.boolean().optional(),
        stacked: z.boolean().optional(),
        height: z.number().int().min(180).max(560).optional(),
        showLegend: z.boolean().optional(),
        queryKey: z.string().optional(),
        span: z.number().int().min(1).max(12).optional(),
      }),
      slots: [],
      description: '基于 ECharts 的柱状图，支持横向条形图、堆叠柱图和类别对比。',
      example: {
        title: '充值区间分布',
        data: { $state: '/data/recharge' },
        xField: 'tier',
        series: [{ field: 'amount', name: '充值金额', color: '#818cf8' }],
        yAxisFormat: 'currency',
        height: 260,
        queryKey: 'recharge',
      },
    },

    PieChart: {
      props: z.object({
        title: z.string().optional(),
        subtitle: z.string().optional(),
        data: bindable(z.array(z.record(z.string(), z.unknown()))).optional(),
        nameField: z.string().min(1),
        valueField: z.string().min(1),
        valueFormat: FormatTypeSchema.optional(),
        height: z.number().int().min(180).max(520).optional(),
        showLegend: z.boolean().optional(),
        queryKey: z.string().optional(),
        span: z.number().int().min(1).max(12).optional(),
      }),
      slots: [],
      description: '基于 ECharts 的饼图，用于展示构成与渠道/档位占比。',
      example: {
        title: '渠道消耗占比',
        data: { $state: '/data/traffic' },
        nameField: 'channel',
        valueField: 'cost',
        valueFormat: 'currency',
        height: 260,
        queryKey: 'traffic',
      },
    },

    DonutChart: {
      props: z.object({
        title: z.string().optional(),
        subtitle: z.string().optional(),
        data: bindable(z.array(z.record(z.string(), z.unknown()))).optional(),
        nameField: z.string().min(1),
        valueField: z.string().min(1),
        valueFormat: FormatTypeSchema.optional(),
        centerLabel: z.string().optional(),
        height: z.number().int().min(180).max(520).optional(),
        showLegend: z.boolean().optional(),
        queryKey: z.string().optional(),
        span: z.number().int().min(1).max(12).optional(),
      }),
      slots: [],
      description: '基于 ECharts 的环形图，支持中心汇总文案与占比 Tooltip，适合渠道占比。',
      example: {
        title: '流量渠道占比',
        data: { $state: '/data/traffic' },
        nameField: 'channel',
        valueField: 'cost',
        valueFormat: 'currency',
        centerLabel: '总消耗',
        height: 260,
        queryKey: 'traffic',
      },
    },

    DataTable: {
      props: z.object({
        title: z.string().optional(),
        data: bindable(z.array(z.record(z.string(), z.unknown()))).optional(),
        rowKey: z.string().min(1),
        columns: z.array(TableColumnSchema).min(1),
        pageSize: z.number().int().min(5).max(50).optional(),
        compact: z.boolean().optional(),
        queryKey: z.string().optional(),
        span: z.number().int().min(1).max(12).optional(),
      }),
      slots: [],
      description: '基于 Ant Design Table 的明细数据表，内置列排序、分页、数值格式化与横向滚动。',
      example: {
        title: '每日投放明细',
        data: { $state: '/data/daily' },
        rowKey: 'date',
        pageSize: 7,
        queryKey: 'daily',
        columns: [
          { key: 'date', title: '日期', dataIndex: 'date', sortable: true, width: 110 },
          { key: 'cost', title: '消耗', dataIndex: 'cost', format: 'currency', sortable: true, align: 'right' },
          { key: 'revenue', title: '收入', dataIndex: 'revenue', format: 'currency', sortable: true, align: 'right' },
          { key: 'roi', title: 'ROI', dataIndex: 'roi', format: 'ratio', sortable: true, align: 'right' },
        ],
      },
    },

    Text: {
      props: z.object({
        content: bindable(z.string()),
        tone: z.enum(['primary', 'secondary', 'muted', 'success', 'warning']).optional(),
        size: z.enum(['xs', 'sm', 'md']).optional(),
      }),
      slots: [],
      description: '正文或辅助说明文本组件，支持绑定状态值。',
      example: { content: '统计口径：ROI = 充值收入 / 广告消耗', tone: 'muted', size: 'xs' },
    },

    Heading: {
      props: z.object({
        text: bindable(z.string()),
        subtitle: bindable(z.string()).optional(),
        level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
        badge: z.string().optional(),
      }),
      slots: [],
      description: '页面或区块标题组件，支持副标题和状态标签。',
      example: { text: '游戏广告投放数据看板', subtitle: '实时多维投放监控', level: 2, badge: 'LIVE' },
    },

    // ================= 5.3 Filter & Action Components =================
    SelectFilter: {
      props: z.object({
        label: z.string().optional(),
        variable: z.string().min(1),
        value: twoWayBindable(z.union([z.string(), z.number()])).optional(),
        options: bindable(z.array(SelectOptionSchema)).optional(),
        placeholder: z.string().optional(),
        width: z.number().int().min(120).max(360).optional(),
      }),
      slots: [],
      description:
        '下拉筛选器，通过 variable 绑定页面变量，支持静态选项或 { "$state": "/data/games" } 动态选项，变更时派发 setVariable 动作。',
      example: {
        label: '游戏',
        variable: 'gameId',
        value: { $bindState: '/variables/gameId' },
        options: { $state: '/data/games' },
        width: 180,
      },
    },

    DateRangeFilter: {
      props: z.object({
        label: z.string().optional(),
        variable: z.string().min(1),
        value: twoWayBindable(z.string()).optional(),
        options: z.array(SelectOptionSchema).optional(),
      }),
      slots: [],
      description:
        '日期范围分段/下拉筛选器，默认支持近7天/近14天/近30天/全部，变更时派发 setVariable 动作触发依赖查询刷新。',
      example: {
        label: '时间周期',
        variable: 'dateRange',
        value: { $bindState: '/variables/dateRange' },
      },
    },

    RefreshButton: {
      props: z.object({
        label: z.string().optional(),
        queryIds: z.array(z.string()).optional(),
      }),
      slots: [],
      description: '数据刷新操作按钮，点击触发 refreshData 动作重新查询数据，不调用 LLM。',
      example: { label: '刷新数据' },
    },
  },

  actions: {
    setVariable: {
      params: z.object({
        variable: z.string().min(1),
        value: z.unknown(),
      }),
      description: '更新页面筛选变量并仅重新请求依赖该变量的数据源。',
    },
    refreshData: {
      params: z.object({
        queryIds: z.array(z.string()).optional(),
      }),
      description: '手动刷新当前页面全部或指定查询的数据源，绝不触发 LLM。',
    },
    changeTab: {
      params: z.object({
        tabGroupId: z.string().min(1),
        activeKey: z.string().min(1),
      }),
      description: '切换 Tabs 组件当前激活的标签页。',
    },
    navigate: {
      params: z.object({
        path: z.string().startsWith('/'),
      }),
      description: '应用内安全路由跳转（仅允许以 / 开头的站内路径）。',
    },
  },
});

export type DashboardCatalog = typeof dashboardCatalog;

export const COMPONENT_METADATA: ComponentMetadata[] = [
  {
    type: 'Row',
    category: 'layout',
    description: '水平弹性布局行容器，支持横向并排、等宽分栏 (equalWidth) 与响应式换行。',
    slots: ['default'],
    dataInputType: 'none',
    defaultProps: { gap: 'md', align: 'stretch', wrap: true, equalWidth: true },
    useCases: [
      '当用户要求横向、水平、并排、左右排列或 row 布局时使用',
      '将多个指标卡或图表水平并排展示',
    ],
    exampleSpec: {
      type: 'Row',
      props: { gap: 'md', align: 'stretch', equalWidth: true, wrap: true },
      children: ['chart-daily-trend', 'chart-roi-trend'],
    },
    propsDescription: {
      gap: '子项水平间距 token: none | xs | sm | md | lg | xl',
      padding: '内边距 token',
      align: '交叉轴对齐: start | center | end | stretch',
      justify: '主轴对齐: start | center | end | between | around',
      wrap: '是否允许响应式换行',
      equalWidth: '是否让子元素等宽平分当前行',
      width: '宽度 token',
    },
  },
  {
    type: 'Column',
    category: 'layout',
    description: '垂直布局列容器，支持纵向堆叠多个图表、卡片或嵌套 Row。',
    slots: ['default'],
    dataInputType: 'none',
    defaultProps: { gap: 'md', width: 'full' },
    useCases: [
      '当用户要求纵向、垂直、竖排、上下排列、单列堆叠或 column 布局时使用',
      '作为页面主纵向流或 Row 内部的独立分列',
    ],
    exampleSpec: {
      type: 'Column',
      props: { gap: 'md', width: 'full' },
      children: ['kpi-row', 'chart-daily-trend', 'table-daily'],
    },
    propsDescription: {
      gap: '子元素垂直间距 token',
      padding: '内边距 token',
      align: '水平对齐',
      width: '列宽 token',
      span: '栅格列跨度 (1-12)',
    },
  },
  {
    type: 'DashboardRow',
    category: 'layout',
    description: '水平弹性布局行容器，支持 wrap 换行、间距与对齐控制。',
    slots: ['default'],
    dataInputType: 'none',
    defaultProps: { gap: 'md', align: 'center', wrap: true },
    useCases: ['顶部标题与筛选操作条', '横向排列多个 KPI 指标卡'],
    exampleSpec: {
      type: 'DashboardRow',
      props: { gap: 'md', justify: 'between', align: 'center', wrap: true },
      children: ['filter-game', 'filter-date', 'btn-refresh'],
    },
    propsDescription: {
      gap: '间距 token: none | xs | sm | md | lg | xl',
      padding: '内边距 token',
      align: '交叉轴对齐: start | center | end | stretch',
      justify: '主轴对齐: start | center | end | between | around',
      wrap: '是否允许换行',
      width: '宽度 token',
    },
  },
  {
    type: 'DashboardColumn',
    category: 'layout',
    description: '垂直布局列容器，用于纵向堆叠模块或作为 Grid 的一列。',
    slots: ['default'],
    dataInputType: 'none',
    defaultProps: { gap: 'md', width: 'full' },
    useCases: ['页面根容器', '三栏布局中的左右侧边列与主列'],
    exampleSpec: {
      type: 'DashboardColumn',
      props: { gap: 'md', width: 'full' },
      children: ['header-panel', 'main-grid', 'trend-panel'],
    },
    propsDescription: {
      gap: '子元素垂直间距 token',
      padding: '内边距 token',
      align: '水平对齐',
      width: '列宽 token',
      span: '栅格列跨度 (1-12)',
    },
  },
  {
    type: 'DashboardGrid',
    category: 'layout',
    description: '预设响应式 BI 网格布局，内置 5 种栅格模板，自动适配中小屏。',
    slots: ['default'],
    dataInputType: 'none',
    defaultProps: { preset: 'equal-2', gap: 'md' },
    useCases: [
      'equal-2: 双栏图表对比',
      'equal-3: 三列指标或图表',
      'equal-4: 四列 KPI 概览',
      'sidebar-main: 左侧分布 + 右侧主表',
      'sidebar-main-sidebar: 经典 BI 三栏大屏（左分析 + 中核心 + 右渠道）',
    ],
    exampleSpec: {
      type: 'DashboardGrid',
      props: { preset: 'sidebar-main-sidebar', gap: 'md' },
      children: ['left-col', 'center-col', 'right-col'],
    },
    propsDescription: {
      preset: 'equal-2 | equal-3 | equal-4 | sidebar-main | sidebar-main-sidebar',
      gap: '网格间距 token',
      padding: '内边距 token',
    },
  },
  {
    type: 'DashboardPanel',
    category: 'layout',
    description: '语义区块面板容器，常用于顶部工具条或大模块分组。',
    slots: ['default'],
    dataInputType: 'none',
    defaultProps: { padding: 'md', tone: 'default' },
    useCases: ['顶部筛选工具栏容器', '趋势分析大区块容器'],
    exampleSpec: {
      type: 'DashboardPanel',
      props: { padding: 'md', tone: 'elevated' },
      children: ['toolbar-row'],
    },
    propsDescription: {
      title: '面板标题',
      subtitle: '面板副标题',
      tone: 'default | elevated | subtle',
      padding: '内边距 token',
    },
  },
  {
    type: 'DashboardCard',
    category: 'layout',
    description: '标准深色 BI 卡片容器，包裹图表、列表或指标。',
    slots: ['default'],
    dataInputType: 'none',
    defaultProps: { padding: 'md', bordered: true },
    useCases: ['包裹任意图表、明细表或嵌套子组件'],
    exampleSpec: {
      type: 'DashboardCard',
      props: { title: '趋势分析', badge: 'LIVE', padding: 'md' },
      children: ['trend-chart'],
    },
    propsDescription: {
      title: '卡片标题',
      subtitle: '副标题',
      badge: '右上角徽章文本',
      bordered: '是否显示边框',
    },
  },
  {
    type: 'Tabs',
    category: 'layout',
    description: '选项卡切换容器，通过 activeKey 与子元素联动。',
    slots: ['default'],
    dataInputType: 'none',
    defaultProps: { defaultActiveKey: 'tab-1' },
    useCases: ['在同一卡片内切换消耗趋势与 ROI 趋势'],
    exampleSpec: {
      type: 'Tabs',
      props: {
        tabGroupId: 'main-tabs',
        defaultActiveKey: 'cost',
        items: [
          { key: 'cost', label: '消耗/收入' },
          { key: 'roi', label: 'ROI' },
        ],
      },
      children: ['chart-cost', 'chart-roi'],
    },
    propsDescription: {
      tabGroupId: '选项卡组唯一标识',
      activeKey: '当前激活 tab（可绑定 state）',
      items: '选项卡数组 [{ key, label }]',
    },
  },
  {
    type: 'Divider',
    category: 'layout',
    description: '水平或垂直分割线。',
    slots: [],
    dataInputType: 'none',
    defaultProps: { orientation: 'horizontal', spacing: 'sm' },
    useCases: ['分隔顶部筛选栏与主体指标区域'],
    exampleSpec: { type: 'Divider', props: { orientation: 'horizontal', spacing: 'sm' } },
    propsDescription: {
      label: '分割线中间标签',
      orientation: 'horizontal | vertical',
      spacing: '上下/左右留白 token',
    },
  },
  {
    type: 'StatCard',
    category: 'display',
    description: '核心 KPI 单值指标卡，支持货币/百分比/倍率/整数格式化及环比箭头。',
    slots: [],
    dataInputType: 'scalar',
    defaultProps: { format: 'number', accent: 'cyan' },
    useCases: ['展示总消耗、充值收入、ROI、新增用户等核心 KPI'],
    exampleSpec: {
      type: 'StatCard',
      props: {
        title: '总消耗',
        value: { $state: '/data/summary/totalCost' },
        delta: { $state: '/data/summary/costDelta' },
        format: 'currency',
        accent: 'cyan',
        queryKey: 'summary',
      },
    },
    propsDescription: {
      title: '指标名称',
      value: '标量值或 { "$state": "/data/summary/..." }',
      delta: '环比变化小数（可绑定 state）',
      format: 'number | currency | percent | ratio | integer | compact | text',
      accent: '主题强调色: cyan | emerald | amber | rose | indigo | slate',
      queryKey: '关联查询 key（用于自动展示 Loading/Error 状态）',
    },
  },
  {
    type: 'MetricGroup',
    category: 'display',
    description: '在单个面板内以网格紧凑展示多个 KPI 指标。',
    slots: [],
    dataInputType: 'scalar',
    defaultProps: { columns: 2 },
    useCases: ['流量分析或辅助指标组合展示（付费用户、付费率、ARPU、CPA）'],
    exampleSpec: {
      type: 'MetricGroup',
      props: {
        title: '效率指标',
        columns: 2,
        queryKey: 'summary',
        items: [
          { label: '付费用户', value: { $state: '/data/summary/payingUsers' }, format: 'integer' },
          { label: '付费率', value: { $state: '/data/summary/payRate' }, format: 'percent' },
        ],
      },
    },
    propsDescription: {
      title: '指标组标题',
      columns: '列数 (1-4)',
      items: '指标项数组，每项包含 label/value/delta/format',
      queryKey: '关联查询 key',
    },
  },
  {
    type: 'MetricList',
    category: 'display',
    description: '紧凑排行/指标列表，展示名称、主指标与副指标。',
    slots: [],
    dataInputType: 'category',
    defaultProps: { valueFormat: 'number', maxItems: 8 },
    useCases: ['渠道指标榜、充值档位列表'],
    exampleSpec: {
      type: 'MetricList',
      props: {
        title: '渠道消耗与 ROI',
        data: { $state: '/data/traffic' },
        labelField: 'channel',
        valueField: 'cost',
        secondaryField: 'roi',
        valueFormat: 'currency',
        secondaryFormat: 'ratio',
        queryKey: 'traffic',
      },
    },
    propsDescription: {
      data: '数组数据绑定 { "$state": "/data/..." }',
      labelField: '名称字段',
      valueField: '主数值字段',
      secondaryField: '副指标字段',
    },
  },
  {
    type: 'ProgressList',
    category: 'display',
    description: '带占比进度条的指标列表，适合转化漏斗或档位占比。',
    slots: [],
    dataInputType: 'category',
    defaultProps: { valueFormat: 'integer', accent: 'cyan' },
    useCases: ['投放转化漏斗（曝光→点击→激活→首充）', '充值区间占比条'],
    exampleSpec: {
      type: 'ProgressList',
      props: {
        title: '转化漏斗',
        data: { $state: '/data/conversion' },
        labelField: 'stage',
        valueField: 'count',
        percentField: 'rate',
        valueFormat: 'integer',
        queryKey: 'conversion',
      },
    },
    propsDescription: {
      data: '数组数据绑定',
      labelField: '阶段/类别字段',
      valueField: '数值字段',
      percentField: '比例字段 (0~1)',
    },
  },
  {
    type: 'LineChart',
    category: 'display',
    description: 'ECharts 折线/面积趋势图，支持多系列与双轴。',
    slots: [],
    dataInputType: 'series',
    defaultProps: { height: 280, showLegend: true },
    useCases: ['每日消耗与充值收入趋势', '每日 ROI 走势'],
    exampleSpec: {
      type: 'LineChart',
      props: {
        title: '每日消耗与收入趋势',
        data: { $state: '/data/daily' },
        xField: 'date',
        series: [
          { field: 'cost', name: '广告消耗', color: '#38bdf8', area: true, smooth: true },
          { field: 'revenue', name: '充值收入', color: '#34d399', area: true, smooth: true },
        ],
        yAxisFormat: 'currency',
        height: 300,
        queryKey: 'daily',
      },
    },
    propsDescription: {
      data: '时间序列数组绑定 { "$state": "/data/daily" }',
      xField: '横轴字段（如 date）',
      series: '系列数组 [{ field, name, color?, yAxisIndex?, smooth?, area? }]',
      yAxisFormat: '主 Y 轴格式',
      height: '图表高度 (180-560)',
    },
  },
  {
    type: 'BarChart',
    category: 'display',
    description: 'ECharts 柱状/条形图，支持横向与堆叠对比。',
    slots: [],
    dataInputType: 'category',
    defaultProps: { height: 260, showLegend: true, horizontal: false, stacked: false },
    useCases: ['充值区间分布柱状图', '渠道消耗与收入对比柱状图'],
    exampleSpec: {
      type: 'BarChart',
      props: {
        title: '充值区间分布',
        data: { $state: '/data/recharge' },
        xField: 'tier',
        series: [{ field: 'amount', name: '充值金额', color: '#818cf8' }],
        yAxisFormat: 'currency',
        height: 250,
        queryKey: 'recharge',
      },
    },
    propsDescription: {
      data: '类别数组绑定',
      xField: '分类轴字段',
      series: '柱系列定义',
      horizontal: '是否横向条形图',
      stacked: '是否堆叠',
    },
  },
  {
    type: 'PieChart',
    category: 'display',
    description: 'ECharts 饼图，用于类别占比分析。',
    slots: [],
    dataInputType: 'category',
    defaultProps: { height: 260, showLegend: true },
    useCases: ['流量渠道构成饼图', '充值档位占比饼图'],
    exampleSpec: {
      type: 'PieChart',
      props: {
        title: '流量渠道占比',
        data: { $state: '/data/traffic' },
        nameField: 'channel',
        valueField: 'cost',
        valueFormat: 'currency',
        height: 260,
        queryKey: 'traffic',
      },
    },
    propsDescription: {
      data: '类别数组绑定',
      nameField: '名称字段',
      valueField: '数值字段',
      valueFormat: '格式化类型',
    },
  },
  {
    type: 'DonutChart',
    category: 'display',
    description: 'ECharts 环形占比图，支持中心汇总文案。',
    slots: [],
    dataInputType: 'category',
    defaultProps: { height: 260, showLegend: true },
    useCases: ['渠道消耗占比环形图', '充值结构环形图'],
    exampleSpec: {
      type: 'DonutChart',
      props: {
        title: '渠道占比',
        data: { $state: '/data/traffic' },
        nameField: 'channel',
        valueField: 'cost',
        valueFormat: 'currency',
        centerLabel: '渠道消耗',
        height: 250,
        queryKey: 'traffic',
      },
    },
    propsDescription: {
      data: '类别数组绑定',
      nameField: '名称字段',
      valueField: '数值字段',
      centerLabel: '环心说明文字',
    },
  },
  {
    type: 'DataTable',
    category: 'display',
    description: 'Ant Design 明细数据表，支持列排序、分页、格式化与横向滚动。',
    slots: [],
    dataInputType: 'table',
    defaultProps: { pageSize: 7, compact: true },
    useCases: ['每日广告投放明细表', '渠道明细数据表'],
    exampleSpec: {
      type: 'DataTable',
      props: {
        title: '每日数据明细',
        data: { $state: '/data/daily' },
        rowKey: 'date',
        pageSize: 7,
        queryKey: 'daily',
        columns: [
          { key: 'date', title: '日期', dataIndex: 'date', sortable: true, width: 110 },
          { key: 'cost', title: '消耗', dataIndex: 'cost', format: 'currency', sortable: true, align: 'right' },
          { key: 'revenue', title: '收入', dataIndex: 'revenue', format: 'currency', sortable: true, align: 'right' },
          { key: 'roi', title: 'ROI', dataIndex: 'roi', format: 'ratio', sortable: true, align: 'right' },
        ],
      },
    },
    propsDescription: {
      data: '表格行数组绑定',
      rowKey: '行唯一键字段名',
      columns: '列定义数组 [{ key, title, dataIndex, format?, sortable?, align?, width? }]',
      pageSize: '每页行数',
    },
  },
  {
    type: 'Text',
    category: 'display',
    description: '文本说明组件，用于口径备注或摘要信息。',
    slots: [],
    dataInputType: 'scalar',
    defaultProps: { tone: 'secondary', size: 'sm' },
    useCases: ['指标口径注释', '分析结论说明'],
    exampleSpec: { type: 'Text', props: { content: '数据按自然日聚合', tone: 'muted', size: 'xs' } },
    propsDescription: {
      content: '文本内容或 state 绑定',
      tone: 'primary | secondary | muted | success | warning',
      size: 'xs | sm | md',
    },
  },
  {
    type: 'Heading',
    category: 'display',
    description: '标题组件，支持副标题和状态标签。',
    slots: [],
    dataInputType: 'scalar',
    defaultProps: { level: 2 },
    useCases: ['看板主标题', '分区小标题'],
    exampleSpec: { type: 'Heading', props: { text: '游戏广告投放看板', level: 2 } },
    propsDescription: {
      text: '标题内容',
      subtitle: '副标题',
      level: '1 | 2 | 3 | 4',
      badge: '状态徽章',
    },
  },
  {
    type: 'SelectFilter',
    category: 'filter',
    description: '下拉选择器筛选组件，修改页面变量并联动依赖数据源刷新。',
    slots: [],
    dataInputType: 'options',
    defaultProps: { width: 180 },
    useCases: ['按游戏筛选', '按渠道筛选'],
    exampleSpec: {
      type: 'SelectFilter',
      props: {
        label: '游戏',
        variable: 'gameId',
        value: { $bindState: '/variables/gameId' },
        options: { $state: '/data/games' },
      },
    },
    propsDescription: {
      label: '标签名',
      variable: '绑定的页面变量名',
      value: '当前值（通常为 { "$bindState": "/variables/<name>" }）',
      options: '选项数组或 { "$state": "/data/games" }',
    },
  },
  {
    type: 'DateRangeFilter',
    category: 'filter',
    description: '时间区间筛选组件，修改 dateRange 页面变量并联动数据源刷新。',
    slots: [],
    dataInputType: 'options',
    defaultProps: { label: '周期' },
    useCases: ['近7天 / 近14天 / 近30天 / 全部切换'],
    exampleSpec: {
      type: 'DateRangeFilter',
      props: {
        label: '周期',
        variable: 'dateRange',
        value: { $bindState: '/variables/dateRange' },
      },
    },
    propsDescription: {
      label: '标签名',
      variable: '日期变量名（如 dateRange）',
      value: '当前值绑定',
    },
  },
  {
    type: 'RefreshButton',
    category: 'action',
    description: '刷新按钮组件，点击执行 refreshData 动作重新查询数据。',
    slots: [],
    dataInputType: 'none',
    defaultProps: { label: '刷新' },
    useCases: ['顶部操作条手动刷新业务数据'],
    exampleSpec: { type: 'RefreshButton', props: { label: '刷新数据' } },
    propsDescription: {
      label: '按钮文本',
      queryIds: '可选，仅刷新指定 queryId 列表',
    },
  },
];

export function getPublicComponentMetadata(): ComponentMetadata[] {
  return COMPONENT_METADATA;
}
