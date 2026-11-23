import React from 'react';
import { ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, Empty, Skeleton, Tabs as AntTabs, Tag, Tooltip } from 'antd';
import { useActions, useStateValue, type BaseComponentProps } from '@json-render/react';
import type { QueryRuntimeStatus } from '../data/query-manager';

export const SPACING_MAP: Record<string, string> = {
  none: '0px',
  xs: '6px',
  sm: '10px',
  md: '16px',
  lg: '22px',
  xl: '28px',
};

const ALIGN_MAP: Record<string, string> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
};

const JUSTIFY_MAP: Record<string, string> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  between: 'space-between',
  around: 'space-around',
};

const WIDTH_MAP: Record<string, string> = {
  auto: 'auto',
  full: '100%',
  '1/2': '50%',
  '1/3': '33.333%',
  '2/3': '66.666%',
  '1/4': '25%',
  '3/4': '75%',
};

export function useQueryMeta(queryKey?: string): QueryRuntimeStatus | undefined {
  return useStateValue<QueryRuntimeStatus>(
    queryKey ? `/meta/queries/${queryKey}` : '/meta/queries/__none__',
  );
}

/**
 * Reusable partial-refresh button for any card bound to a DataSource queryKey.
 * Triggers the official registered `refreshData` action scoped to `[queryKey]`.
 */
export const CardRefreshButton: React.FC<{
  queryKey?: string;
  compact?: boolean;
}> = ({ queryKey, compact = false }) => {
  const { execute } = useActions();
  const meta = useQueryMeta(queryKey);

  if (!queryKey) return null;

  const isLoading = meta?.status === 'loading';
  const resourceLabel = meta?.resource ? `${meta.resource}` : queryKey;
  const updatedText = meta?.updatedAt
    ? ` · 更新于 ${new Date(meta.updatedAt).toLocaleTimeString('zh-CN')}`
    : '';

  return (
    <Tooltip title={`局部刷新 (${resourceLabel})${updatedText}`}>
      <Button
        type="text"
        size="small"
        className={`bi-card-refresh-btn ${compact ? 'bi-card-refresh-btn--compact' : ''}`}
        icon={<ReloadOutlined spin={isLoading} />}
        disabled={isLoading}
        aria-label={`局部刷新 ${queryKey}`}
        data-testid={`card-refresh-${queryKey}`}
        data-refresh-query={queryKey}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          void execute({
            action: 'refreshData',
            params: { queryIds: [queryKey] },
          });
        }}
      />
    </Tooltip>
  );
};

export const WidgetCardShell: React.FC<{
  title?: string;
  subtitle?: string;
  badge?: string;
  queryKey?: string;
  isEmpty?: boolean;
  emptyText?: string;
  children: React.ReactNode;
}> = ({ title, subtitle, badge, queryKey, isEmpty, emptyText, children }) => {
  const { execute } = useActions();
  const meta = useQueryMeta(queryKey);
  const isLoading = meta?.status === 'loading';
  const errorMsg = meta?.status === 'error' ? meta.error : undefined;

  return (
    <div className="bi-card" data-query-key={queryKey}>
      {(title || subtitle || badge || queryKey) && (
        <div className="bi-card-header">
          <div>
            {title && <div className="bi-card-title">{title}</div>}
            {subtitle && <div className="bi-card-subtitle">{subtitle}</div>}
          </div>
          <div className="bi-card-actions">
            {badge && (
              <Tag color="cyan" style={{ margin: 0, fontSize: 11 }}>
                {badge}
              </Tag>
            )}
            <CardRefreshButton queryKey={queryKey} />
          </div>
        </div>
      )}
      <div className="bi-card-body">
        {errorMsg ? (
          <Alert
            type="error"
            showIcon
            message="数据查询失败"
            description={errorMsg}
            action={
              queryKey ? (
                <Button
                  size="small"
                  onClick={() => {
                    void execute({
                      action: 'refreshData',
                      params: { queryIds: [queryKey] },
                    });
                  }}
                >
                  重试
                </Button>
              ) : undefined
            }
          />
        ) : isLoading ? (
          <Skeleton active paragraph={{ rows: 4 }} />
        ) : isEmpty ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={emptyText || '暂无符合筛选条件的数据'}
          />
        ) : (
          children
        )}
      </div>
    </div>
  );
};

export const StreamSlotPlaceholder: React.FC<{ label?: string }> = ({ label }) => (
  <div className="bi-stream-slot" aria-hidden="true">
    <span className="bi-stream-slot-dot" />
    <span>{label || 'AI 正在装配组件...'}</span>
  </div>
);

export const DashboardRowComp = ({
  props,
  children,
  loading,
}: BaseComponentProps<any>) => {
  const hasChildren = React.Children.count(children) > 0;
  return (
    <div
      className={`bi-row ${props.equalWidth ? 'bi-row--equal' : ''}`}
      data-layout-type="Row"
      style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: props.wrap === false ? 'nowrap' : 'wrap',
        gap: SPACING_MAP[props.gap ?? 'md'],
        padding: SPACING_MAP[props.padding ?? 'none'],
        alignItems: ALIGN_MAP[props.align ?? (props.equalWidth ? 'stretch' : 'center')],
        justifyContent: JUSTIFY_MAP[props.justify ?? 'start'],
        width: WIDTH_MAP[props.width ?? (props.equalWidth ? 'full' : 'auto')],
        minWidth: 0,
      }}
    >
      {hasChildren ? children : loading ? <StreamSlotPlaceholder /> : null}
    </div>
  );
};

export const DashboardColumnComp = ({
  props,
  children,
  loading,
}: BaseComponentProps<any>) => {
  const hasChildren = React.Children.count(children) > 0;
  return (
    <div
      className="bi-column"
      data-layout-type="Column"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: SPACING_MAP[props.gap ?? 'md'],
        padding: SPACING_MAP[props.padding ?? 'none'],
        alignItems: ALIGN_MAP[props.align ?? 'stretch'],
        justifyContent: JUSTIFY_MAP[props.justify ?? 'start'],
        width: WIDTH_MAP[props.width ?? 'full'],
        minWidth: 0,
      }}
    >
      {hasChildren ? children : loading ? <StreamSlotPlaceholder /> : null}
    </div>
  );
};

export const RowComp = DashboardRowComp;
export const ColumnComp = DashboardColumnComp;

export const DashboardGridComp = ({
  props,
  children,
  loading,
}: BaseComponentProps<any>) => {
  const hasChildren = React.Children.count(children) > 0;
  return (
    <div
      className={`bi-grid bi-grid--${props.preset ?? 'equal-2'}`}
      style={{
        gap: SPACING_MAP[props.gap ?? 'md'],
        padding: SPACING_MAP[props.padding ?? 'none'],
      }}
      data-grid-preset={props.preset ?? 'equal-2'}
    >
      {hasChildren ? children : loading ? <StreamSlotPlaceholder /> : null}
    </div>
  );
};

export const DashboardPanelComp = ({ props, children }: BaseComponentProps<any>) => (
  <section
    className={`bi-panel bi-panel--${props.tone ?? 'default'}`}
    style={{
      padding: SPACING_MAP[props.padding ?? 'md'],
    }}
  >
    {(props.title || props.subtitle) && (
      <div className="bi-panel-header">
        {props.title && <h3 className="bi-panel-title">{props.title}</h3>}
        {props.subtitle && <span className="bi-panel-subtitle">{props.subtitle}</span>}
      </div>
    )}
    {children}
  </section>
);

export const DashboardCardComp = ({ props, children }: BaseComponentProps<any>) => (
  <div
    className={`bi-card ${props.bordered === false ? 'bi-card--borderless' : ''}`}
    style={{ padding: SPACING_MAP[props.padding ?? 'md'] }}
  >
    {(props.title || props.subtitle || props.badge) && (
      <div className="bi-card-header">
        <div>
          {props.title && <div className="bi-card-title">{props.title}</div>}
          {props.subtitle && <div className="bi-card-subtitle">{props.subtitle}</div>}
        </div>
        {props.badge && (
          <Tag color="blue" style={{ margin: 0 }}>
            {props.badge}
          </Tag>
        )}
      </div>
    )}
    <div className="bi-card-body">{children}</div>
  </div>
);

export const TabsComp = ({ props, children }: BaseComponentProps<any>) => {
  const { execute } = useActions();
  const stateActive = useStateValue<string>(`/ui/tabs/${props.tabGroupId}`);
  const items: Array<{ key: string; label: string }> = props.items ?? [];
  const activeKey =
    (typeof props.activeKey === 'string' && props.activeKey) ||
    stateActive ||
    props.defaultActiveKey ||
    items[0]?.key ||
    '';

  const childArray = React.Children.toArray(children);
  const activeIdx = Math.max(
    0,
    items.findIndex((i) => i.key === activeKey),
  );

  return (
    <div className="bi-card">
      <AntTabs
        activeKey={activeKey}
        onChange={(nextKey) => {
          void execute({
            action: 'changeTab',
            params: { tabGroupId: props.tabGroupId, activeKey: nextKey },
          });
        }}
        items={items.map((item, idx) => ({
          key: item.key,
          label: item.label,
          children: childArray[idx] ?? null,
        }))}
      />
      {items.length === 0 && childArray[activeIdx]}
    </div>
  );
};

export const DividerComp = ({ props }: BaseComponentProps<any>) => {
  const spacing = SPACING_MAP[props.spacing ?? 'sm'];
  if (props.orientation === 'vertical') {
    return (
      <div
        className="bi-divider-vertical"
        style={{ margin: `0 ${spacing}` }}
      />
    );
  }
  return (
    <div className="bi-divider-horizontal" style={{ margin: `${spacing} 0` }}>
      {props.label && <span className="bi-divider-label">{props.label}</span>}
    </div>
  );
};
