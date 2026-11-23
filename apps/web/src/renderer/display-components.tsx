import React from 'react';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  MinusOutlined,
} from '@ant-design/icons';
import { Alert, Empty, Progress, Skeleton, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { BaseComponentProps } from '@json-render/react';
import {
  formatDelta,
  formatMetricValue,
  type ValueFormat,
} from '../data/formatters';
import {
  CardRefreshButton,
  useQueryMeta,
  WidgetCardShell,
} from './layout-components';

const ACCENT_COLORS: Record<string, string> = {
  cyan: '#38bdf8',
  emerald: '#34d399',
  amber: '#fbbf24',
  rose: '#fb7185',
  indigo: '#818cf8',
  slate: '#94a3b8',
};

export const StatCardComp = ({ props }: BaseComponentProps<any>) => {
  const meta = useQueryMeta(props.queryKey);
  const isLoading = meta?.status === 'loading';
  const errorMsg = meta?.status === 'error' ? meta.error : undefined;
  const accentColor = ACCENT_COLORS[props.accent ?? 'cyan'] ?? '#38bdf8';
  const deltaInfo = formatDelta(props.delta);

  return (
    <div
      className="bi-stat-card"
      style={{ borderTopColor: accentColor }}
      data-testid="stat-card"
      data-stat-title={props.title}
      data-query-key={props.queryKey}
    >
      <div className="bi-stat-header">
        <div className="bi-stat-title">{props.title}</div>
        <CardRefreshButton queryKey={props.queryKey} compact />
      </div>
      {errorMsg ? (
        <Alert type="error" showIcon message={errorMsg} />
      ) : isLoading ? (
        <Skeleton.Input active size="small" style={{ width: '80%', marginTop: 8 }} />
      ) : (
        <>
          <div className="bi-stat-value" data-testid="stat-card-value">
            {formatMetricValue(props.value, props.format as ValueFormat, props.unit)}
          </div>
          <div className="bi-stat-footer">
            {deltaInfo ? (
              <span className={`bi-delta bi-delta--${deltaInfo.direction}`}>
                {deltaInfo.direction === 'up' && <ArrowUpOutlined />}
                {deltaInfo.direction === 'down' && <ArrowDownOutlined />}
                {deltaInfo.direction === 'flat' && <MinusOutlined />}
                <span>{deltaInfo.text}</span>
              </span>
            ) : null}
            {(props.deltaLabel || props.subtitle) && (
              <span className="bi-stat-sub">
                {props.subtitle || props.deltaLabel}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export const MetricGroupComp = ({ props }: BaseComponentProps<any>) => {
  const items: Array<any> = Array.isArray(props.items) ? props.items : [];
  const cols = props.columns ?? Math.min(items.length || 1, 4);

  return (
    <WidgetCardShell
      title={props.title}
      queryKey={props.queryKey}
      isEmpty={items.length === 0}
    >
      <div
        className="bi-metric-group"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {items.map((item, idx) => {
          const deltaInfo = formatDelta(item.delta);
          const accent = ACCENT_COLORS[item.accent ?? 'cyan'];
          return (
            <div key={`${item.label}-${idx}`} className="bi-metric-group-item">
              <div className="bi-metric-group-label">
                <span className="bi-metric-dot" style={{ backgroundColor: accent }} />
                {item.label}
              </div>
              <div className="bi-metric-group-value">
                {formatMetricValue(item.value, item.format as ValueFormat, item.unit)}
              </div>
              {deltaInfo && (
                <span className={`bi-delta bi-delta--${deltaInfo.direction}`}>
                  {deltaInfo.text}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </WidgetCardShell>
  );
};

export const MetricListComp = ({ props }: BaseComponentProps<any>) => {
  const rows: Array<Record<string, unknown>> = Array.isArray(props.data)
    ? props.data
    : [];
  const visibleRows = rows.slice(0, props.maxItems ?? 8);

  return (
    <WidgetCardShell
      title={props.title}
      queryKey={props.queryKey}
      isEmpty={visibleRows.length === 0}
    >
      <div className="bi-metric-list">
        {visibleRows.map((row, idx) => (
          <div key={`${String(row[props.labelField])}-${idx}`} className="bi-metric-list-row">
            <div className="bi-metric-list-left">
              <span className="bi-rank-badge">{idx + 1}</span>
              <span className="bi-metric-list-name">
                {String(row[props.labelField] ?? '--')}
              </span>
            </div>
            <div className="bi-metric-list-right">
              <span className="bi-metric-list-val">
                {formatMetricValue(row[props.valueField], props.valueFormat as ValueFormat)}
              </span>
              {props.secondaryField && (
                <Tag color="geekblue" style={{ margin: 0, fontSize: 11 }}>
                  {formatMetricValue(
                    row[props.secondaryField],
                    props.secondaryFormat as ValueFormat,
                  )}
                </Tag>
              )}
            </div>
          </div>
        ))}
      </div>
    </WidgetCardShell>
  );
};

export const ProgressListComp = ({ props }: BaseComponentProps<any>) => {
  const rows: Array<Record<string, unknown>> = Array.isArray(props.data)
    ? props.data
    : [];
  const strokeColor = ACCENT_COLORS[props.accent ?? 'emerald'] ?? '#34d399';

  return (
    <WidgetCardShell
      title={props.title}
      queryKey={props.queryKey}
      isEmpty={rows.length === 0}
    >
      <div className="bi-progress-list">
        {rows.map((row, idx) => {
          const rawRate = Number(row[props.percentField] ?? 0);
          const pct = Math.max(0, Math.min(100, rawRate <= 1 ? rawRate * 100 : rawRate));
          return (
            <div key={`${String(row[props.labelField])}-${idx}`} className="bi-progress-item">
              <div className="bi-progress-head">
                <span className="bi-progress-label">
                  {String(row[props.labelField] ?? '--')}
                </span>
                <span className="bi-progress-numbers">
                  <strong>
                    {formatMetricValue(row[props.valueField], props.valueFormat as ValueFormat)}
                  </strong>
                  <span className="bi-progress-pct">{pct.toFixed(1)}%</span>
                </span>
              </div>
              <Progress
                percent={Number(pct.toFixed(1))}
                showInfo={false}
                strokeColor={strokeColor}
                trailColor="rgba(148,163,184,0.14)"
                size="small"
              />
            </div>
          );
        })}
      </div>
    </WidgetCardShell>
  );
};

export const DataTableComp = ({ props }: BaseComponentProps<any>) => {
  const rows: Array<Record<string, unknown>> = Array.isArray(props.data)
    ? props.data
    : [];
  const meta = useQueryMeta(props.queryKey);
  const isLoading = meta?.status === 'loading';
  const errorMsg = meta?.status === 'error' ? meta.error : undefined;

  const columns: ColumnsType<Record<string, unknown>> = (props.columns ?? []).map(
    (col: any) => ({
      key: col.key,
      title: col.title,
      dataIndex: col.dataIndex,
      align: col.align ?? 'left',
      width: col.width,
      fixed: col.fixed,
      sorter: col.sortable
        ? (a: Record<string, unknown>, b: Record<string, unknown>) => {
            const va = a[col.dataIndex];
            const vb = b[col.dataIndex];
            if (typeof va === 'number' && typeof vb === 'number') return va - vb;
            return String(va ?? '').localeCompare(String(vb ?? ''));
          }
        : undefined,
      render: (value: unknown) => (
        <span className="bi-tabular">
          {formatMetricValue(value, (col.format ?? 'text') as ValueFormat)}
        </span>
      ),
    }),
  );

  return (
    <div className="bi-card" data-testid="data-table" data-query-key={props.queryKey}>
      {(props.title || props.queryKey) && (
        <div className="bi-card-header">
          <div className="bi-card-title">{props.title || '数据明细'}</div>
          <div className="bi-card-actions">
            <span className="bi-card-subtitle">{rows.length} 条记录</span>
            <CardRefreshButton queryKey={props.queryKey} />
          </div>
        </div>
      )}
      <div className="bi-card-body">
        {errorMsg ? (
          <Alert type="error" showIcon message="表格数据加载失败" description={errorMsg} />
        ) : (
          <Table
            rowKey={props.rowKey || 'date'}
            dataSource={rows}
            columns={columns}
            loading={isLoading}
            size={props.compact === false ? 'middle' : 'small'}
            scroll={{ x: 'max-content' }}
            pagination={{
              pageSize: props.pageSize ?? 7,
              showSizeChanger: false,
              hideOnSinglePage: rows.length <= (props.pageSize ?? 7),
            }}
            locale={{
              emptyText: (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无明细数据" />
              ),
            }}
          />
        )}
      </div>
    </div>
  );
};

export const HeadingComp = ({ props }: BaseComponentProps<any>) => {
  const level = props.level ?? 2;
  const tagName = `h${Math.min(4, Math.max(1, level))}` as 'h1' | 'h2' | 'h3' | 'h4';
  return (
    <div className="bi-heading">
      <div className="bi-heading-row">
        {React.createElement(
          tagName,
          { className: `bi-heading-text bi-heading-h${level}` },
          props.text,
        )}
        {props.badge && (
          <Tag color="cyan" style={{ margin: 0, fontWeight: 600 }}>
            {props.badge}
          </Tag>
        )}
      </div>
      {props.subtitle && <div className="bi-heading-sub">{props.subtitle}</div>}
    </div>
  );
};

export const TextComp = ({ props }: BaseComponentProps<any>) => (
  <p className={`bi-text bi-text--${props.tone ?? 'secondary'} bi-text--${props.size ?? 'sm'}`}>
    {props.content}
  </p>
);
