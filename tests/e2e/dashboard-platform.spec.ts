import { expect, test } from '@playwright/test';

test.describe('AI Generative Dashboard Platform E2E Acceptance', () => {
  test('Full 4-Scenario Acceptance: Generate & Save -> Reopen without LLM -> Filter Linkage -> AI Edit & Persist', async ({
    page,
  }) => {
    let aiGenerateCalls = 0;
    let aiEditCalls = 0;
    const queryBatchPayloads: Array<any> = [];

    page.on('request', (req) => {
      const url = req.url();
      if (
        (url.includes('/api/dashboards/generate-stream') ||
          url.includes('/api/dashboards/generate')) &&
        req.method() === 'POST'
      ) {
        aiGenerateCalls += 1;
      }
      if (url.includes('/ai-edit') && req.method() === 'POST') {
        aiEditCalls += 1;
      }
      if (url.includes('/api/data/query-batch') && req.method() === 'POST') {
        try {
          queryBatchPayloads.push(req.postDataJSON());
        } catch {
          // ignore
        }
      }
    });

    // =========================================================================
    // Scenario 1: SSE Streaming Generate & Save
    // =========================================================================
    await page.goto('/dashboards/new');
    const promptInput = page.getByTestId('prompt-input');
    await promptInput.fill(
      '生成一个游戏广告投放数据看板，包含总消耗、收入、ROI、新增用户、每日趋势、充值区间分布、渠道占比和数据明细。',
    );
    await page.getByTestId('btn-generate-dashboard').click();

    // Verify SSE progress panel streams patches and json-render preview renders live KPI cards, charts, and data table
    await expect(page.getByTestId('sse-progress-panel')).toBeVisible();
    await expect(page.getByTestId('generated-preview')).toBeVisible({ timeout: 15000 });
    const costCardPreview = page.locator('[data-stat-title="总消耗"]');
    await expect(costCardPreview).toBeVisible({ timeout: 15000 });
    await expect(costCardPreview.getByTestId('stat-card-value')).toContainText('¥', {
      timeout: 15000,
    });
    await expect(page.getByTestId('data-table')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('btn-save-dashboard')).toBeEnabled({ timeout: 15000 });
    expect(aiGenerateCalls).toBe(1);

    // Save Dashboard to SQLite and assert navigation to independent /dashboards/:id URL
    await page.getByTestId('btn-save-dashboard').click();
    await page.waitForURL(
      (url) =>
        /^\/dashboards\/[^/]+$/.test(url.pathname) &&
        url.pathname !== '/dashboards/new',
    );
    const dashboardUrl = page.url();
    const dashboardId = dashboardUrl.split('/').pop()!;
    expect(dashboardId).toBeTruthy();
    expect(dashboardId).not.toBe('new');

    await expect(page.getByTestId('dashboard-viewer')).toBeVisible();
    await expect(page.getByTestId('viewer-revision-tag')).toHaveText('v1');

    // =========================================================================
    // Scenario 2: Refresh & Reopen WITHOUT calling LLM
    // =========================================================================
    const aiCallsBeforeReload = aiGenerateCalls + aiEditCalls;
    const batchCountBeforeReload = queryBatchPayloads.length;

    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.getByTestId('dashboard-viewer')).toBeVisible();
    const costCard = page.locator('[data-stat-title="总消耗"]');
    await expect(costCard.getByTestId('stat-card-value')).toContainText('¥');
    await expect(page.getByTestId('chart-line').first()).toBeVisible();
    await expect(page.getByTestId('chart-donut')).toBeVisible();
    await expect(page.getByTestId('data-table')).toBeVisible();

    // Critical assertion: zero LLM calls on reopen/refresh, while DataSource query-batch DID execute
    expect(aiGenerateCalls + aiEditCalls).toBe(aiCallsBeforeReload);
    expect(queryBatchPayloads.length).toBeGreaterThan(batchCountBeforeReload);

    // =========================================================================
    // Scenario 3: Filter Linkage (switching game refreshes dependent queries)
    // =========================================================================
    const initialCostText = (
      await costCard.getByTestId('stat-card-value').innerText()
    ).trim();
    const batchCountBeforeFilter = queryBatchPayloads.length;

    // Select "星穹战纪 (SLG 策略)" in Ant Design SelectFilter
    await page.getByTestId('select-gameId').click();
    await page.locator('.ant-select-item-option', { hasText: '星穹战纪' }).click();

    // Wait for KPI value to update to game-001's value
    await expect(costCard.getByTestId('stat-card-value')).not.toHaveText(
      initialCostText,
    );

    // Confirm query-batch ran with gameId="game-001" and did NOT re-fetch ads.games
    expect(queryBatchPayloads.length).toBeGreaterThan(batchCountBeforeFilter);
    const filterPayload = queryBatchPayloads[queryBatchPayloads.length - 1];
    const requestedResources = filterPayload.queries.map((q: any) => q.resource);
    expect(requestedResources).toContain('ads.summary');
    expect(requestedResources).not.toContain('ads.games');
    expect(filterPayload.queries[0].params.gameId).toBe('game-001');
    // Still zero LLM calls during filtering
    expect(aiGenerateCalls + aiEditCalls).toBe(aiCallsBeforeReload);

    // Scenario 3b: Per-card Partial Refresh (only refreshes that card's DataSource with bypassCache)
    const [rechargeRefreshReq] = await Promise.all([
      page.waitForRequest(
        (req) =>
          req.url().includes('/api/data/query-batch') && req.method() === 'POST',
      ),
      page.getByTestId('card-refresh-recharge').click(),
    ]);
    const rechargePayload = rechargeRefreshReq.postDataJSON();
    expect(rechargePayload.bypassCache).toBe(true);
    expect(rechargePayload.queries).toHaveLength(1);
    expect(rechargePayload.queries[0].resource).toBe('ads.recharge');

    const [statRefreshReq] = await Promise.all([
      page.waitForRequest(
        (req) =>
          req.url().includes('/api/data/query-batch') && req.method() === 'POST',
      ),
      costCard.getByTestId('card-refresh-summary').click(),
    ]);
    const statPayload = statRefreshReq.postDataJSON();
    expect(statPayload.bypassCache).toBe(true);
    expect(statPayload.queries).toHaveLength(1);
    expect(statPayload.queries[0].resource).toBe('ads.summary');
    expect(aiGenerateCalls + aiEditCalls).toBe(aiCallsBeforeReload);

    // =========================================================================
    // Scenario 4: AI Edit -> Save Revision v2 -> Reopen & Verify Persistence
    // =========================================================================
    await page.getByTestId('btn-go-edit').click();
    await page.waitForURL(new RegExp(`/dashboards/${dashboardId}/edit$`));
    await expect(page.getByTestId('dashboard-editor')).toBeVisible();

    await page.getByTestId('ai-edit-input').fill('新增 ROI 卡片并切换为双栏布局');
    await page.getByTestId('btn-run-ai-edit').click();

    // Preview shows newly added ROI card & equal-2 layout
    await expect(page.locator('[data-stat-title="ROI 核心监控"]')).toBeVisible();
    await expect(page.locator('[data-grid-preset="equal-2"]').first()).toBeVisible();
    expect(aiEditCalls).toBe(1);

    // Save as new Revision v2
    await page.getByTestId('btn-save-revision').click();
    await expect(page.getByTestId('editor-revision-tag')).toHaveText('当前 v2');

    // Reopen Viewer URL fresh and verify persisted v2 without any extra LLM calls
    const aiCallsAfterEdit = aiGenerateCalls + aiEditCalls;
    await page.goto(`/dashboards/${dashboardId}`, { waitUntil: 'networkidle' });
    await expect(page.getByTestId('viewer-revision-tag')).toHaveText('v2');
    await expect(page.locator('[data-stat-title="ROI 核心监控"]')).toBeVisible();
    await expect(
      page.locator('[data-stat-title="ROI 核心监控"]').getByTestId('stat-card-value'),
    ).toContainText('x');
    expect(aiGenerateCalls + aiEditCalls).toBe(aiCallsAfterEdit);
  });

  test('Auto-detects Row vs Column layout from natural language prompts via SSE', async ({
    page,
  }) => {
    await page.goto('/dashboards/new');

    // 1. Horizontal Row prompt
    await page
      .getByTestId('prompt-input')
      .fill('生成一个流量渠道分析看板，使用横向并排布局展示图表');
    await page.getByTestId('btn-generate-dashboard').click();

    await expect(page.getByTestId('generated-preview')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('btn-save-dashboard')).toBeEnabled({ timeout: 15000 });
    await expect(
      page.getByTestId('generated-preview').locator('[data-layout-type="Row"]').first(),
    ).toBeVisible();
    await expect(page.getByTestId('generated-preview')).toContainText('ROW 水平布局');

    // 2. Vertical Column prompt
    await page
      .getByTestId('prompt-input')
      .fill('生成一个游戏收入分析看板，采用纵向竖排堆叠布局展示图表');
    await page.getByTestId('btn-generate-dashboard').click();

    await expect(page.getByTestId('btn-save-dashboard')).toBeEnabled({ timeout: 15000 });
    await expect(
      page.getByTestId('generated-preview').locator('[data-layout-type="Column"]').first(),
    ).toBeVisible();
    await expect(page.getByTestId('generated-preview')).toContainText('COLUMN 纵向布局');
  });

  test('Drag-and-drop layout editing: reorder, cross-container move, container Row/Col toggle, undo, save & persist without LLM', async ({
    page,
  }) => {
    // Create a fresh dashboard via API so this test is isolated
    const genRes = await page.request.post('http://127.0.0.1:3001/api/dashboards/generate', {
      data: { prompt: '生成一个游戏广告投放数据看板', scenario: 'game-ads' },
    });
    const genJson = await genRes.json();
    const createRes = await page.request.post('http://127.0.0.1:3001/api/dashboards', {
      data: {
        pageDocument: genJson.data.pageDocument,
        changeDescription: 'Initial DnD test dashboard',
      },
    });
    const dashboardId = (await createRes.json()).data.dashboard.id as string;

    let aiCalls = 0;
    page.on('request', (req) => {
      if (
        req.url().includes('/api/dashboards/generate') ||
        req.url().includes('/ai-edit')
      ) {
        aiCalls += 1;
      }
    });

    await page.goto(`/dashboards/${dashboardId}/edit`, { waitUntil: 'networkidle' });
    await expect(page.getByTestId('dashboard-editor')).toBeVisible();

    // Drag-and-drop mode is enabled by default in Editor
    const kpiContainer = page.getByTestId('dnd-container-kpi-grid');
    await expect(kpiContainer).toBeVisible();

    // 1. Native HTML5 Drag & Drop: drag "stat-new-users" onto "stat-cost" (left half -> before)
    const srcNode = page.getByTestId('dnd-node-stat-new-users');
    const dstNode = page.getByTestId('dnd-node-stat-cost');
    await srcNode.dragTo(dstNode, { targetPosition: { x: 10, y: 10 } });

    // Verify order changed inside kpi-grid
    const firstStatAfterDrag = await kpiContainer
      .locator('[data-dnd-parent="kpi-grid"]')
      .first()
      .getAttribute('data-dnd-node');
    expect(firstStatAfterDrag).toBe('stat-new-users');

    // 2. Cross-container Drag & Drop: drag "chart-recharge" handle from col-left into col-right
    const rechargeNode = page.getByTestId('dnd-node-chart-recharge');
    const rightCol = page.getByTestId('dnd-container-col-right');
    await rechargeNode.dragTo(rightCol, {
      sourcePosition: { x: 40, y: 12 },
      targetPosition: { x: 40, y: 12 },
    });
    await expect(
      rightCol.locator('[data-dnd-node="chart-recharge"]'),
    ).toBeVisible();

    // 3. One-click container toggle: switch section-trends to Column
    await page.getByTestId('dnd-switch-col-section-trends').click();
    await expect(
      page.getByTestId('dnd-container-section-trends'),
    ).toContainText('Column · section-trends');

    // 4. Verify Undo button works, then re-apply Column switch and Save as v2
    await page.getByTestId('btn-undo-step').click();
    await expect(
      page.getByTestId('dnd-container-section-trends'),
    ).toContainText('DashboardGrid');
    await page.getByTestId('dnd-switch-col-section-trends').click();

    await page.getByTestId('btn-save-revision').click();
    await expect(page.getByTestId('editor-revision-tag')).toHaveText('当前 v2');

    // 5. Reload editor and verify persisted layout order & Column container with 0 LLM calls
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.getByTestId('editor-revision-tag')).toHaveText('当前 v2');
    const persistedFirstStat = await page
      .getByTestId('dnd-container-kpi-grid')
      .locator('[data-dnd-parent="kpi-grid"]')
      .first()
      .getAttribute('data-dnd-node');
    expect(persistedFirstStat).toBe('stat-new-users');
    await expect(
      page
        .getByTestId('dnd-container-col-right')
        .locator('[data-dnd-node="chart-recharge"]'),
    ).toBeVisible();
    await expect(
      page.getByTestId('dnd-container-section-trends'),
    ).toContainText('Column · section-trends');
    expect(aiCalls).toBe(0);

    // 6. Navigate to /dashboards list and delete this test dashboard via UI Popconfirm
    await page.goto('/dashboards', { waitUntil: 'networkidle' });
    const row = page.locator(`tr[data-row-key="${dashboardId}"]`);
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: /删除/ }).click();
    await page.locator('.ant-popconfirm').getByRole('button', { name: /^删\s*除$/ }).click();
    await expect(row).toHaveCount(0);
  });

  test('Backend Integration Rules page displays live catalogs, contracts, and SSE specs', async ({
    page,
  }) => {
    await page.goto('/dashboards', { waitUntil: 'networkidle' });
    await page.getByTestId('nav-integration-rules').click();
    await page.waitForURL(/\/integration-rules$/);

    await expect(page.getByTestId('backend-integration-rules-page')).toBeVisible();
    await expect(page.getByTestId('rules-component-count')).toHaveText('23');
    await expect(page.getByTestId('rules-datasource-count')).toHaveText('6');

    // Switch to PageDocument & 14-point validation tab
    await page.getByRole('tab', { name: /2\. PageDocument/ }).click();
    await expect(page.getByTestId('sample-page-doc-code')).toContainText('"contractVersion": "2.0.0"');

    // Switch to Component Catalog tab and filter for Row
    await page.getByRole('tab', { name: /3\. 组件目录/ }).click();
    await page.getByTestId('rules-component-search').fill('Row');
    await expect(page.getByTestId('backend-integration-rules-page')).toContainText('DashboardRow');

    // Switch to SSE protocol tab
    await page.getByRole('tab', { name: /5\. SSE 流式生成协议/ }).click();
    await expect(page.getByTestId('sse-wire-example')).toContainText('event: patch');
  });
});
