import type { PageDocument } from '@ai-dashboard/contracts';

export type LayoutDirectionIntent = 'row' | 'column' | 'mixed' | 'default';

const ROW_PATTERNS: RegExp[] = [
  /横向/,
  /水平/,
  /并排/,
  /横排/,
  /一行/,
  /左右排列/,
  /左右布局/,
  /同行/,
  /\brow\b/i,
  /\bhorizontal\b/i,
  /side[\s-]*by[\s-]*side/i,
];

const COLUMN_PATTERNS: RegExp[] = [
  /纵向/,
  /垂直/,
  /竖排/,
  /单列/,
  /上下排列/,
  /上下布局/,
  /堆叠/,
  /一列/,
  /从上到下/,
  /\bcolumn\b/i,
  /\bvertical\b/i,
  /\bstacked?\b/i,
];

/**
 * Automatically infer whether natural language requests horizontal (Row),
 * vertical (Column), mixed (Row + Column), or default BI layout.
 */
export function inferLayoutIntent(prompt: string): LayoutDirectionIntent {
  const wantsRow = ROW_PATTERNS.some((re) => re.test(prompt));
  const wantsColumn = COLUMN_PATTERNS.some((re) => re.test(prompt));

  if (wantsRow && wantsColumn) return 'mixed';
  if (wantsRow) return 'row';
  if (wantsColumn) return 'column';
  return 'default';
}

function isLayoutContainer(type: string): boolean {
  return (
    type === 'DashboardGrid' ||
    type === 'DashboardRow' ||
    type === 'DashboardColumn' ||
    type === 'Row' ||
    type === 'Column'
  );
}

/**
 * Apply inferred Row / Column layout strategy to a generated PageDocument
 * while keeping all node IDs and data bindings intact and valid.
 */
export function applyLayoutIntentToDocument(
  doc: PageDocument,
  intent: LayoutDirectionIntent,
): PageDocument {
  if (intent === 'default') return doc;

  const next = structuredClone(doc);
  const elements = next.ui.elements;
  const setAsRow = (id: string, gap: 'sm' | 'md' = 'md') => {
    const el = elements[id];
    if (!el || !isLayoutContainer(el.type)) return;
    el.type = 'Row';
    el.props = {
      gap,
      align: 'stretch',
      equalWidth: true,
      wrap: true,
      width: 'full',
    };
  };

  const setAsColumn = (id: string, gap: 'sm' | 'md' = 'md') => {
    const el = elements[id];
    if (!el || !isLayoutContainer(el.type)) return;
    el.type = 'Column';
    el.props = {
      gap,
      width: 'full',
    };
  };

  if (intent === 'row') {
    setAsColumn('root', 'md');
    setAsRow('kpi-grid', 'sm');
    setAsRow('main-grid', 'md');
    setAsRow('section-trends', 'md');
    setAsColumn('col-left', 'md');
    setAsColumn('col-center', 'md');
    setAsColumn('col-right', 'md');

    const header = elements['header-title'];
    if (header?.type === 'Heading') {
      header.props.badge = 'ROW 水平布局';
      header.props.subtitle = 'AI 已根据自然语言自动选用 Row 横向并排布局 · 实时联动后端 DataSource';
    }
  } else if (intent === 'column') {
    setAsColumn('root', 'md');
    setAsColumn('main-grid', 'md');
    setAsColumn('section-trends', 'md');
    setAsColumn('col-left', 'md');
    setAsColumn('col-center', 'md');
    setAsColumn('col-right', 'md');
    setAsRow('kpi-grid', 'sm');

    const header = elements['header-title'];
    if (header?.type === 'Heading') {
      header.props.badge = 'COLUMN 纵向布局';
      header.props.subtitle = 'AI 已根据自然语言自动选用 Column 纵向堆叠布局 · 实时联动后端 DataSource';
    }
  } else if (intent === 'mixed') {
    setAsColumn('root', 'md');
    setAsRow('kpi-grid', 'sm');
    setAsRow('main-grid', 'md');
    setAsColumn('col-left', 'md');
    setAsColumn('col-center', 'md');
    setAsColumn('col-right', 'md');
    setAsColumn('section-trends', 'md');

    const header = elements['header-title'];
    if (header?.type === 'Heading') {
      header.props.badge = 'ROW + COLUMN 组合布局';
      header.props.subtitle = 'AI 已根据自然语言自动组合 Row 横向与 Column 纵向布局 · 实时联动后端 DataSource';
    }
  }

  return next;
}
