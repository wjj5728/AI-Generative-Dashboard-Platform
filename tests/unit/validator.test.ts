import { describe, expect, it } from 'vitest';
import { validatePageDocument } from '@ai-dashboard/component-catalog';
import {
  buildGameAdsDashboard,
  buildRevenueAnalysisDashboard,
  buildTrafficAnalysisDashboard,
} from '../../apps/server/src/ai/templates';

const FULL_ROLES = ['viewer', 'editor', 'ads:read'];

describe('PageDocument 14-point Schema Validator', () => {
  it('validates all 3 built-in AI dashboard templates cleanly', () => {
    for (const doc of [
      buildGameAdsDashboard(),
      buildTrafficAnalysisDashboard(),
      buildRevenueAnalysisDashboard(),
    ]) {
      const report = validatePageDocument(doc, { userRoles: FULL_ROLES });
      expect(report.valid, JSON.stringify(report.errors)).toBe(true);
      expect(report.errors).toHaveLength(0);
    }
  });

  it('rejects mismatched contractVersion and catalogVersion', () => {
    const doc = buildGameAdsDashboard();
    doc.contractVersion = '0.9.0';
    doc.catalogVersion = '9.9.9';
    const report = validatePageDocument(doc, { userRoles: FULL_ROLES });
    expect(report.valid).toBe(false);
    const codes = report.errors.map((e) => e.code);
    expect(codes).toContain('INVALID_CONTRACT_VERSION');
    expect(codes).toContain('INVALID_CATALOG_VERSION');
  });

  it('rejects unregistered component types and invalid props', () => {
    const doc = buildGameAdsDashboard();
    doc.ui.elements['bad-comp'] = {
      type: 'ArbitraryHtmlScript',
      props: { html: '<div>bad</div>' },
      children: [],
    };
    doc.ui.elements.root.children!.push('bad-comp');

    doc.ui.elements['main-grid'].props.preset = 'custom-freeform-css';

    const report = validatePageDocument(doc, { userRoles: FULL_ROLES });
    expect(report.valid).toBe(false);
    const codes = report.errors.map((e) => e.code);
    expect(codes).toContain('UNKNOWN_COMPONENT');
    expect(codes).toContain('INVALID_COMPONENT_PROPS');
  });

  it('rejects non-existent child node references', () => {
    const doc = buildGameAdsDashboard();
    doc.ui.elements.root.children!.push('ghost-node-404');

    const report = validatePageDocument(doc, { userRoles: FULL_ROLES });
    expect(report.valid).toBe(false);
    expect(report.errors.some((e) => e.code === 'SPEC_MISSING_CHILD')).toBe(true);
  });

  it('detects circular references in element tree', () => {
    const doc = buildGameAdsDashboard();
    doc.ui.elements['col-left'].children!.push('main-grid');

    const report = validatePageDocument(doc, { userRoles: FULL_ROLES });
    expect(report.valid).toBe(false);
    expect(report.errors.some((e) => e.code === 'CIRCULAR_REFERENCE')).toBe(true);
  });

  it('enforces max nesting depth and max node count limits', () => {
    const doc = buildGameAdsDashboard();
    const shallowReport = validatePageDocument(doc, {
      userRoles: FULL_ROLES,
      maxDepth: 2,
      maxNodes: 5,
    });
    expect(shallowReport.valid).toBe(false);
    const codes = shallowReport.errors.map((e) => e.code);
    expect(codes).toContain('MAX_DEPTH_EXCEEDED');
    expect(codes).toContain('MAX_NODES_EXCEEDED');
  });

  it('rejects unknown DataSource, invalid query params, and undeclared variable refs', () => {
    const doc = buildGameAdsDashboard();
    doc.queries.secret = {
      resource: 'internal.admin_sql',
      params: { gameId: { $var: 'undeclaredVar' } },
      targetState: '/data/secret',
    };
    doc.queries.summary.params = {
      gameId: { $var: 'missingVar' },
      dateRange: 'invalid-date-preset',
    };

    const report = validatePageDocument(doc, { userRoles: FULL_ROLES });
    expect(report.valid).toBe(false);
    const codes = report.errors.map((e) => e.code);
    expect(codes).toContain('UNKNOWN_DATASOURCE');
    expect(codes).toContain('UNKNOWN_VARIABLE_REF');
    expect(codes).toContain('INVALID_QUERY_PARAMS');
  });

  it('detects DataSource field mismatches and non-numeric chart field bindings', () => {
    const doc = buildGameAdsDashboard();
    // Bind a non-existent field on StatCard
    doc.ui.elements['stat-cost'].props.value = { $state: '/data/summary/nonExistentMetric' };
    // Bind a string field ("date") as numeric chart series
    (doc.ui.elements['chart-roi-trend'].props.series as any)[0].field = 'date';

    const report = validatePageDocument(doc, { userRoles: FULL_ROLES });
    expect(report.valid).toBe(false);
    const codes = report.errors.map((e) => e.code);
    expect(codes).toContain('UNKNOWN_DATA_FIELD');
    expect(codes).toContain('DATA_FIELD_TYPE_MISMATCH');
  });

  it('rejects disallowed actions, executable scripts, raw SQL, and unauthorized roles', () => {
    const doc = buildGameAdsDashboard();
    doc.ui.elements['btn-refresh'].on = {
      press: { action: 'executeShellCommand', params: {} },
    };
    doc.description = '<script>alert(1)</script> SELECT * FROM users';

    const report = validatePageDocument(doc, { userRoles: ['viewer'] });
    expect(report.valid).toBe(false);
    const codes = report.errors.map((e) => e.code);
    expect(codes).toContain('DISALLOWED_ACTION');
    expect(codes).toContain('FORBIDDEN_CONTENT');
    expect(codes).toContain('FORBIDDEN_DATASOURCE_ACCESS');
  });
});
