import { describe, expect, it } from 'vitest';
import {
  canMoveElement,
  moveElementInSpec,
  removeElementFromSpec,
  switchContainerLayoutInSpec,
} from '@ai-dashboard/contracts';
import { validatePageDocument } from '@ai-dashboard/component-catalog';
import { buildGameAdsDashboard } from '../../apps/server/src/ai/templates';

const ROLES = ['viewer', 'editor', 'ads:read'];

describe('Drag-and-Drop Layout Operations Engine', () => {
  it('reorders siblings within the same container and emits RFC 6902 patches', () => {
    const doc = buildGameAdsDashboard();
    // Initial kpi-grid children: ['stat-cost', 'stat-revenue', 'stat-roi', 'stat-new-users']
    const res = moveElementInSpec(doc.ui, 'stat-new-users', {
      mode: 'before',
      targetId: 'stat-cost',
    });

    expect(res.changed).toBe(true);
    expect(res.patches.length).toBeGreaterThan(0);
    expect(res.spec.elements['kpi-grid'].children).toEqual([
      'stat-new-users',
      'stat-cost',
      'stat-revenue',
      'stat-roi',
    ]);
    expect(
      validatePageDocument({ ...doc, ui: res.spec }, { userRoles: ROLES }).valid,
    ).toBe(true);
  });

  it('moves a widget across different containers while keeping node IDs and schema valid', () => {
    const doc = buildGameAdsDashboard();
    const res = moveElementInSpec(doc.ui, 'chart-recharge', {
      mode: 'into',
      containerId: 'col-right',
    });

    expect(res.changed).toBe(true);
    expect(res.spec.elements['col-left'].children).not.toContain('chart-recharge');
    expect(res.spec.elements['col-right'].children).toContain('chart-recharge');
    expect(
      validatePageDocument({ ...doc, ui: res.spec }, { userRoles: ROLES }).valid,
    ).toBe(true);
  });

  it('prevents circular drops (dropping a container into itself or its own descendant)', () => {
    const doc = buildGameAdsDashboard();
    expect(canMoveElement(doc.ui, 'main-grid', 'main-grid')).toBe(false);
    expect(canMoveElement(doc.ui, 'main-grid', 'col-left')).toBe(false);
    expect(canMoveElement(doc.ui, 'root', 'col-left')).toBe(false);

    const blocked = moveElementInSpec(doc.ui, 'main-grid', {
      mode: 'into',
      containerId: 'col-left',
    });
    expect(blocked.changed).toBe(false);
  });

  it('switches container layout between Row, Column, and DashboardGrid presets', () => {
    const doc = buildGameAdsDashboard();

    const toRow = switchContainerLayoutInSpec(doc.ui, 'section-trends', 'row');
    expect(toRow.changed).toBe(true);
    expect(toRow.spec.elements['section-trends'].type).toBe('Row');
    expect(toRow.spec.elements['section-trends'].props.equalWidth).toBe(true);
    expect(
      validatePageDocument({ ...doc, ui: toRow.spec }, { userRoles: ROLES }).valid,
    ).toBe(true);

    const toCol = switchContainerLayoutInSpec(toRow.spec, 'section-trends', 'column');
    expect(toCol.changed).toBe(true);
    expect(toCol.spec.elements['section-trends'].type).toBe('Column');
    expect(
      validatePageDocument({ ...doc, ui: toCol.spec }, { userRoles: ROLES }).valid,
    ).toBe(true);
  });

  it('removes a widget cleanly without affecting unrelated components sharing datasources', () => {
    const doc = buildGameAdsDashboard();
    const res = removeElementFromSpec(doc.ui, 'chart-channel-donut');
    expect(res.changed).toBe(true);
    expect(res.spec.elements['chart-channel-donut']).toBeUndefined();
    // list-channel-metrics still uses ads.traffic and must remain intact
    expect(res.spec.elements['list-channel-metrics']).toBeDefined();
    expect(
      validatePageDocument({ ...doc, ui: res.spec }, { userRoles: ROLES }).valid,
    ).toBe(true);
  });
});
