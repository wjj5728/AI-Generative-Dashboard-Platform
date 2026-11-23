import React, { useMemo } from 'react';
import type { EChartsOption } from 'echarts';
import type { BaseComponentProps } from '@json-render/react';
import { formatMetricValue, type ValueFormat } from '../data/formatters';
import { EChartsWrapper } from './EChartsWrapper';
import { WidgetCardShell } from './layout-components';

const CHART_PALETTE = [
  '#38bdf8',
  '#34d399',
  '#818cf8',
  '#fbbf24',
  '#fb7185',
  '#22d3ee',
];

const DARK_TOOLTIP = {
  backgroundColor: 'rgba(15, 23, 42, 0.96)',
  borderColor: 'rgba(56, 189, 248, 0.35)',
  borderWidth: 1,
  textStyle: { color: '#e2e8f0', fontSize: 12 },
};

export const LineChartComp = ({ props }: BaseComponentProps<any>) => {
  const rows: Array<Record<string, unknown>> = Array.isArray(props.data)
    ? props.data
    : [];

  const option = useMemo<EChartsOption>(() => {
    const categories = rows.map((r) => String(r[props.xField] ?? ''));
    const seriesList: Array<any> = props.series ?? [];
    const yFormat = (props.yAxisFormat ?? 'number') as ValueFormat;

    return {
      color: CHART_PALETTE,
      tooltip: {
        ...DARK_TOOLTIP,
        trigger: 'axis',
        valueFormatter: (v: any) => formatMetricValue(v, yFormat),
      },
      legend:
        props.showLegend !== false
          ? {
              top: 0,
              right: 4,
              textStyle: { color: '#94a3b8', fontSize: 12 },
            }
          : undefined,
      grid: {
        left: 12,
        right: 16,
        top: props.showLegend !== false ? 36 : 18,
        bottom: 12,
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: categories,
        boundaryGap: false,
        axisLine: { lineStyle: { color: '#334155' } },
        axisLabel: { color: '#94a3b8', fontSize: 11 },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: 'rgba(148,163,184,0.12)' } },
        axisLabel: {
          color: '#94a3b8',
          fontSize: 11,
          formatter: (val: number) => formatMetricValue(val, yFormat),
        },
      },
      series: seriesList.map((s, idx) => {
        const lineColor = s.color || CHART_PALETTE[idx % CHART_PALETTE.length];
        return {
          name: s.name,
          type: 'line',
          smooth: s.smooth !== false,
          symbolSize: 6,
          data: rows.map((r) => Number(r[s.field] ?? 0)),
          lineStyle: { width: 2.5, color: lineColor },
          itemStyle: { color: lineColor },
          areaStyle: s.area
            ? {
                color: {
                  type: 'linear',
                  x: 0,
                  y: 0,
                  x2: 0,
                  y2: 1,
                  colorStops: [
                    { offset: 0, color: `${lineColor}44` },
                    { offset: 1, color: `${lineColor}04` },
                  ],
                },
              }
            : undefined,
        };
      }),
    };
  }, [rows, props.xField, props.series, props.yAxisFormat, props.showLegend]);

  return (
    <WidgetCardShell
      title={props.title}
      subtitle={props.subtitle}
      queryKey={props.queryKey}
      isEmpty={rows.length === 0}
    >
      <div data-testid="chart-line">
        <EChartsWrapper option={option} height={props.height ?? 280} />
      </div>
    </WidgetCardShell>
  );
};

export const BarChartComp = ({ props }: BaseComponentProps<any>) => {
  const rows: Array<Record<string, unknown>> = Array.isArray(props.data)
    ? props.data
    : [];

  const option = useMemo<EChartsOption>(() => {
    const categories = rows.map((r) => String(r[props.xField] ?? ''));
    const seriesList: Array<any> = props.series ?? [];
    const yFormat = (props.yAxisFormat ?? 'number') as ValueFormat;
    const isHorizontal = Boolean(props.horizontal);

    const categoryAxis = {
      type: 'category' as const,
      data: categories,
      axisLine: { lineStyle: { color: '#334155' } },
      axisLabel: { color: '#cbd5e1', fontSize: 11 },
    };
    const valueAxis = {
      type: 'value' as const,
      splitLine: { lineStyle: { color: 'rgba(148,163,184,0.12)' } },
      axisLabel: {
        color: '#94a3b8',
        fontSize: 11,
        formatter: (val: number) => formatMetricValue(val, yFormat),
      },
    };

    return {
      color: CHART_PALETTE,
      tooltip: {
        ...DARK_TOOLTIP,
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        valueFormatter: (v: any) => formatMetricValue(v, yFormat),
      },
      legend:
        props.showLegend !== false && seriesList.length > 1
          ? {
              top: 0,
              right: 4,
              textStyle: { color: '#94a3b8', fontSize: 12 },
            }
          : undefined,
      grid: {
        left: 10,
        right: 16,
        top: props.showLegend !== false && seriesList.length > 1 ? 34 : 14,
        bottom: 10,
        containLabel: true,
      },
      xAxis: isHorizontal ? valueAxis : categoryAxis,
      yAxis: isHorizontal ? categoryAxis : valueAxis,
      series: seriesList.map((s, idx) => ({
        name: s.name,
        type: 'bar',
        stack: props.stacked ? 'total' : undefined,
        barMaxWidth: 26,
        data: rows.map((r) => Number(r[s.field] ?? 0)),
        itemStyle: {
          color: s.color || CHART_PALETTE[idx % CHART_PALETTE.length],
          borderRadius: isHorizontal ? [0, 5, 5, 0] : [5, 5, 0, 0],
        },
      })),
    };
  }, [
    rows,
    props.xField,
    props.series,
    props.yAxisFormat,
    props.horizontal,
    props.stacked,
    props.showLegend,
  ]);

  return (
    <WidgetCardShell
      title={props.title}
      subtitle={props.subtitle}
      queryKey={props.queryKey}
      isEmpty={rows.length === 0}
    >
      <div data-testid="chart-bar">
        <EChartsWrapper option={option} height={props.height ?? 260} />
      </div>
    </WidgetCardShell>
  );
};

function buildPieOption(props: any, rows: Array<Record<string, unknown>>, isDonut: boolean): EChartsOption {
  const valFormat = (props.valueFormat ?? 'number') as ValueFormat;
  const items = rows.map((r) => ({
    name: String(r[props.nameField] ?? ''),
    value: Number(r[props.valueField] ?? 0),
  }));
  const total = items.reduce((acc, i) => acc + i.value, 0);

  return {
    color: CHART_PALETTE,
    tooltip: {
      ...DARK_TOOLTIP,
      trigger: 'item',
      formatter: (p: any) =>
        `${p.name}<br/><strong>${formatMetricValue(p.value, valFormat)}</strong> (${p.percent}%)`,
    },
    legend:
      props.showLegend !== false
        ? {
            bottom: 0,
            textStyle: { color: '#94a3b8', fontSize: 11 },
            itemWidth: 10,
            itemHeight: 10,
          }
        : undefined,
    title:
      isDonut && props.centerLabel
        ? {
            text: formatMetricValue(total, valFormat),
            subtext: props.centerLabel,
            left: 'center',
            top: '37%',
            textStyle: { color: '#f8fafc', fontSize: 15, fontWeight: 700 },
            subtextStyle: { color: '#94a3b8', fontSize: 11 },
          }
        : undefined,
    series: [
      {
        type: 'pie',
        radius: isDonut ? ['50%', '74%'] : '70%',
        center: ['50%', props.showLegend !== false ? '44%' : '50%'],
        itemStyle: {
          borderColor: '#111827',
          borderWidth: 2,
          borderRadius: isDonut ? 4 : 0,
        },
        label: { show: false },
        data: items,
      },
    ],
  };
}

export const PieChartComp = ({ props }: BaseComponentProps<any>) => {
  const rows: Array<Record<string, unknown>> = Array.isArray(props.data)
    ? props.data
    : [];
  const option = useMemo(() => buildPieOption(props, rows, false), [props, rows]);

  return (
    <WidgetCardShell
      title={props.title}
      subtitle={props.subtitle}
      queryKey={props.queryKey}
      isEmpty={rows.length === 0}
    >
      <div data-testid="chart-pie">
        <EChartsWrapper option={option} height={props.height ?? 260} />
      </div>
    </WidgetCardShell>
  );
};

export const DonutChartComp = ({ props }: BaseComponentProps<any>) => {
  const rows: Array<Record<string, unknown>> = Array.isArray(props.data)
    ? props.data
    : [];
  const option = useMemo(() => buildPieOption(props, rows, true), [props, rows]);

  return (
    <WidgetCardShell
      title={props.title}
      subtitle={props.subtitle}
      queryKey={props.queryKey}
      isEmpty={rows.length === 0}
    >
      <div data-testid="chart-donut">
        <EChartsWrapper option={option} height={props.height ?? 250} />
      </div>
    </WidgetCardShell>
  );
};
