import { defineRegistry, type Components } from '@json-render/react';
import { dashboardCatalog } from '@ai-dashboard/component-catalog';
import {
  BarChartComp,
  DonutChartComp,
  LineChartComp,
  PieChartComp,
} from './chart-components';
import {
  DataTableComp,
  HeadingComp,
  MetricGroupComp,
  MetricListComp,
  ProgressListComp,
  StatCardComp,
  TextComp,
} from './display-components';
import {
  DateRangeFilterComp,
  RefreshButtonComp,
  SelectFilterComp,
} from './filter-components';
import {
  ColumnComp,
  DashboardCardComp,
  DashboardColumnComp,
  DashboardGridComp,
  DashboardPanelComp,
  DashboardRowComp,
  DividerComp,
  RowComp,
  TabsComp,
} from './layout-components';

/**
 * Official json-render component & action registry backed by dashboardCatalog.
 */
export const dashboardRegistryBundle = defineRegistry(dashboardCatalog, {
  components: {
    Row: RowComp,
    Column: ColumnComp,
    DashboardRow: DashboardRowComp,
    DashboardColumn: DashboardColumnComp,
    DashboardGrid: DashboardGridComp,
    DashboardPanel: DashboardPanelComp,
    DashboardCard: DashboardCardComp,
    Tabs: TabsComp,
    Divider: DividerComp,
    StatCard: StatCardComp,
    MetricGroup: MetricGroupComp,
    MetricList: MetricListComp,
    ProgressList: ProgressListComp,
    LineChart: LineChartComp,
    BarChart: BarChartComp,
    PieChart: PieChartComp,
    DonutChart: DonutChartComp,
    DataTable: DataTableComp,
    Text: TextComp,
    Heading: HeadingComp,
    SelectFilter: SelectFilterComp,
    DateRangeFilter: DateRangeFilterComp,
    RefreshButton: RefreshButtonComp,
  } as Components<typeof dashboardCatalog>,
  actions: {
    setVariable: async () => {
      // Bound dynamically at runtime by DashboardRenderer -> DashboardQueryManager
    },
    refreshData: async () => {
      // Bound dynamically at runtime by DashboardRenderer -> DashboardQueryManager
    },
    changeTab: async () => {
      // Bound dynamically at runtime by DashboardRenderer -> StateStore
    },
    navigate: async () => {
      // Bound dynamically at runtime by DashboardRenderer -> React Router
    },
  },
});

export const dashboardComponentRegistry = dashboardRegistryBundle.registry;
