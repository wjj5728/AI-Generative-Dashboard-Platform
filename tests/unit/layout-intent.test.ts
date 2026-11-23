import { describe, expect, it } from 'vitest';
import {
  getPublicComponentMetadata,
  validatePageDocument,
} from '@ai-dashboard/component-catalog';
import { getPublicDataSourceMetadata } from '@ai-dashboard/datasource-contract';
import { inferLayoutIntent } from '../../apps/server/src/ai/layout-intent';
import { MockAIProvider } from '../../apps/server/src/ai/mock-provider';

const TEST_USER = {
  id: 'tester-1',
  name: 'Tester',
  roles: ['viewer', 'editor', 'ads:read'],
};

describe('Row & Column Natural Language Layout Auto-Detection', () => {
  const provider = new MockAIProvider();
  const components = getPublicComponentMetadata();
  const datasources = getPublicDataSourceMetadata(TEST_USER.roles);

  it('infers row, column, mixed, and default intents from Chinese and English prompts', () => {
    expect(inferLayoutIntent('生成一个游戏看板，横向并排展示图表')).toBe('row');
    expect(inferLayoutIntent('Build a horizontal dashboard with row layout')).toBe('row');
    expect(inferLayoutIntent('生成一个收入看板，采用纵向竖排堆叠布局')).toBe('column');
    expect(inferLayoutIntent('Show charts stacked in a vertical column')).toBe('column');
    expect(inferLayoutIntent('顶部横向一行展示指标，下面纵向排列图表')).toBe('mixed');
    expect(inferLayoutIntent('生成一个游戏广告投放数据看板')).toBe('default');
  });

  it('automatically generates valid Row layout when prompt asks for horizontal/side-by-side', async () => {
    const doc = await provider.generate({
      prompt: '生成一个流量渠道分析看板，使用横向并排展示各渠道图表',
      components,
      datasources,
      user: TEST_USER,
    });

    const validation = validatePageDocument(doc, { userRoles: TEST_USER.roles });
    expect(validation.valid, JSON.stringify(validation.errors)).toBe(true);
    expect(doc.ui.elements['main-grid'].type).toBe('Row');
    expect(doc.ui.elements['main-grid'].props.equalWidth).toBe(true);
  });

  it('automatically generates valid Column layout when prompt asks for vertical/stacked', async () => {
    const doc = await provider.generate({
      prompt: '生成一个游戏收入分析看板，采用纵向竖排堆叠展示所有图表',
      components,
      datasources,
      user: TEST_USER,
    });

    const validation = validatePageDocument(doc, { userRoles: TEST_USER.roles });
    expect(validation.valid, JSON.stringify(validation.errors)).toBe(true);
    expect(doc.ui.elements.root.type).toBe('Column');
    expect(doc.ui.elements['main-grid'].type).toBe('Column');
  });

  it('automatically combines Row and Column when prompt mentions both directions', async () => {
    const doc = await provider.generate({
      prompt: '生成一个游戏广告投放看板，核心区横向并排展示，底部趋势图纵向堆叠',
      components,
      datasources,
      user: TEST_USER,
    });

    const validation = validatePageDocument(doc, { userRoles: TEST_USER.roles });
    expect(validation.valid, JSON.stringify(validation.errors)).toBe(true);
    expect(doc.ui.elements['main-grid'].type).toBe('Row');
    expect(doc.ui.elements['section-trends'].type).toBe('Column');
  });

  it('switches an existing dashboard between Row and Column via natural-language AI edit', async () => {
    const base = await provider.generate({
      prompt: '生成一个游戏广告投放数据看板',
      components,
      datasources,
      user: TEST_USER,
    });

    const toCol = await provider.edit({
      instruction: '切换为纵向 Column 布局',
      currentDocument: base,
      components,
      datasources,
      user: TEST_USER,
    });
    expect(validatePageDocument(toCol.pageDocument, { userRoles: TEST_USER.roles }).valid).toBe(
      true,
    );
    expect(toCol.pageDocument.ui.elements['main-grid'].type).toBe('Column');
    expect(toCol.pageDocument.ui.elements['section-trends'].type).toBe('Column');

    const toRow = await provider.edit({
      instruction: '把趋势图改为横向并排 Row 排列',
      currentDocument: toCol.pageDocument,
      components,
      datasources,
      user: TEST_USER,
    });
    expect(validatePageDocument(toRow.pageDocument, { userRoles: TEST_USER.roles }).valid).toBe(
      true,
    );
    expect(toRow.pageDocument.ui.elements['section-trends'].type).toBe('Row');
    expect(toRow.pageDocument.ui.elements['main-grid'].type).toBe('Column');
  });
});
