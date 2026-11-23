import React from 'react';
import { ReloadOutlined } from '@ant-design/icons';
import { Button, Segmented, Select } from 'antd';
import {
  useActions,
  useBoundProp,
  useStateValue,
  type BaseComponentProps,
} from '@json-render/react';

const DEFAULT_DATE_OPTIONS = [
  { label: '近 7 天', value: 'last7days' },
  { label: '近 14 天', value: 'last14days' },
  { label: '近 30 天', value: 'last30days' },
  { label: '全部', value: 'all' },
];

export const SelectFilterComp = ({
  props,
  bindings,
}: BaseComponentProps<any>) => {
  const { execute } = useActions();
  const [boundValue] = useBoundProp<string | number>(
    props.value,
    bindings?.value,
  );
  const fallbackVarValue = useStateValue<string | number>(
    `/variables/${props.variable}`,
  );
  const currentValue = boundValue ?? fallbackVarValue ?? 'all';

  const rawOptions = Array.isArray(props.options) ? props.options : [];
  const options = rawOptions.map((item: any) => ({
    label: String(item.label ?? item.name ?? item.value ?? item.id ?? ''),
    value: item.value ?? item.id ?? item.label,
  }));

  return (
    <div className="bi-filter-item" data-testid={`filter-${props.variable}`}>
      {props.label && <span className="bi-filter-label">{props.label}</span>}
      <Select
        value={currentValue}
        options={options}
        placeholder={props.placeholder || '请选择'}
        style={{ width: props.width ?? 190 }}
        onChange={(nextVal) => {
          void execute({
            action: 'setVariable',
            params: { variable: props.variable, value: nextVal },
          });
        }}
        data-testid={`select-${props.variable}`}
      />
    </div>
  );
};

export const DateRangeFilterComp = ({
  props,
  bindings,
}: BaseComponentProps<any>) => {
  const { execute } = useActions();
  const [boundValue] = useBoundProp<string>(props.value, bindings?.value);
  const fallbackVarValue = useStateValue<string>(`/variables/${props.variable}`);
  const currentValue = boundValue ?? fallbackVarValue ?? 'last14days';

  const options =
    Array.isArray(props.options) && props.options.length > 0
      ? props.options
      : DEFAULT_DATE_OPTIONS;

  return (
    <div className="bi-filter-item" data-testid={`filter-${props.variable}`}>
      {props.label && <span className="bi-filter-label">{props.label}</span>}
      <Segmented
        value={currentValue}
        options={options}
        onChange={(nextVal) => {
          void execute({
            action: 'setVariable',
            params: { variable: props.variable, value: String(nextVal) },
          });
        }}
      />
    </div>
  );
};

export const RefreshButtonComp = ({ props }: BaseComponentProps<any>) => {
  const { execute } = useActions();
  const isRefreshing = Boolean(useStateValue<boolean>('/meta/isRefreshing'));

  return (
    <Button
      icon={<ReloadOutlined spin={isRefreshing} />}
      loading={isRefreshing}
      onClick={() => {
        void execute({
          action: 'refreshData',
          params: { queryIds: props.queryIds },
        });
      }}
      data-testid="btn-refresh-data"
    >
      {props.label || '刷新'}
    </Button>
  );
};
