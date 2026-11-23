export type ValueFormat =
  | 'number'
  | 'currency'
  | 'percent'
  | 'ratio'
  | 'integer'
  | 'compact'
  | 'text'
  | 'date';

export function formatMetricValue(
  value: unknown,
  format: ValueFormat = 'number',
  unit?: string,
): string {
  if (value === null || value === undefined || value === '') return '--';

  if (format === 'text' || format === 'date') {
    return String(value);
  }

  const num = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(num)) return String(value);

  switch (format) {
    case 'currency': {
      const abs = Math.abs(num);
      if (abs >= 100_000_000) {
        return `¥${(num / 100_000_000).toFixed(2)}亿`;
      }
      if (abs >= 100_000) {
        return `¥${(num / 10_000).toFixed(2)}万`;
      }
      return `¥${num.toLocaleString('zh-CN', {
        minimumFractionDigits: abs < 100 ? 2 : 0,
        maximumFractionDigits: abs < 100 ? 2 : 0,
      })}`;
    }
    case 'percent':
      return `${(num * 100).toFixed(2)}%`;
    case 'ratio':
      return `${num.toFixed(2)}x`;
    case 'integer':
      return `${Math.round(num).toLocaleString('zh-CN')}${unit ? ` ${unit}` : ''}`;
    case 'compact': {
      const abs = Math.abs(num);
      if (abs >= 10_000) return `${(num / 10_000).toFixed(1)}万`;
      return num.toLocaleString('zh-CN');
    }
    case 'number':
    default:
      return `${num.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ''}`;
  }
}

export function formatDelta(delta: unknown): {
  text: string;
  direction: 'up' | 'down' | 'flat';
} | null {
  if (delta === null || delta === undefined) return null;
  const num = typeof delta === 'number' ? delta : Number(delta);
  if (Number.isNaN(num)) return null;
  const pct = (num * 100).toFixed(1);
  if (num > 0.0005) return { text: `+${pct}%`, direction: 'up' };
  if (num < -0.0005) return { text: `${pct}%`, direction: 'down' };
  return { text: '0.0%', direction: 'flat' };
}
