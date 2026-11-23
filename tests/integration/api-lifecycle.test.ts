import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createSpecStreamCompiler, createStateStore } from '@json-render/core';
import { buildApp } from '../../apps/server/src/app';
import {
  ensureDatabaseReady,
  resetBootstrapState,
} from '../../apps/server/src/repositories/bootstrap';
import { DashboardQueryManager } from '../../apps/web/src/data/query-manager';

const TEST_DB_PATH = path.resolve(process.cwd(), 'prisma/test-integration.db');
const TEST_DB_URL = `file:${TEST_DB_PATH}`;

describe('Full Backend Integration: AI Generate -> Persist -> Query -> AI Edit -> Conflict -> Publish -> Rollback', () => {
  let prisma: PrismaClient;
  let app: FastifyInstance;

  beforeAll(async () => {
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.rmSync(TEST_DB_PATH, { force: true });
    }
    execSync('npx prisma db push --schema=prisma/schema.prisma --skip-generate', {
      env: { ...process.env, DATABASE_URL: TEST_DB_URL },
      stdio: 'pipe',
    });

    prisma = new PrismaClient({
      datasources: { db: { url: TEST_DB_URL } },
    });

    app = await buildApp({
      prisma,
      authResolver: () => ({
        id: 'integration-user-1',
        name: 'Integration Tester',
        roles: ['viewer', 'editor', 'ads:read'],
      }),
    });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.rmSync(TEST_DB_PATH, { force: true });
    }
  });

  it('exposes public Component Catalog & DataSource Catalog without leaking server handlers', async () => {
    const compRes = await app.inject({ method: 'GET', url: '/api/catalog/components' });
    expect(compRes.statusCode).toBe(200);
    const compJson = compRes.json();
    expect(compJson.ok).toBe(true);
    expect(compJson.data.components.length).toBeGreaterThanOrEqual(21);

    const dsRes = await app.inject({ method: 'GET', url: '/api/catalog/datasources' });
    expect(dsRes.statusCode).toBe(200);
    const dsJson = dsRes.json();
    expect(dsJson.ok).toBe(true);
    expect(dsJson.data.datasources.map((d: any) => d.id).sort()).toEqual([
      'ads.conversion',
      'ads.daily',
      'ads.games',
      'ads.recharge',
      'ads.summary',
      'ads.traffic',
    ]);
    for (const ds of dsJson.data.datasources) {
      expect(ds.handler).toBeUndefined();
    }
  });

  it('generates 3 distinct valid dashboard scenarios via MockAIProvider', async () => {
    const scenarios = ['game-ads', 'traffic-analysis', 'revenue-analysis'] as const;
    const rootsAndTypes: string[][] = [];

    for (const scenario of scenarios) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/dashboards/generate',
        payload: { prompt: `生成 ${scenario} 看板`, scenario },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.ok).toBe(true);
      expect(body.data.validation.valid).toBe(true);
      const types = Array.from(
        new Set(
          Object.values(body.data.pageDocument.ui.elements).map(
            (e: any) => e.type as string,
          ),
        ),
      ).sort();
      rootsAndTypes.push(types);
    }

    // Confirm distinct component compositions across the 3 templates
    expect(rootsAndTypes[0]).toContain('DonutChart');
    expect(rootsAndTypes[1]).toContain('MetricGroup');
    expect(rootsAndTypes[1]).toContain('PieChart');
    expect(rootsAndTypes[2]).toContain('LineChart');
    expect(rootsAndTypes[2]).not.toContain('DonutChart');
  });

  it('completes full lifecycle: generate -> save -> load -> query-batch -> StateStore -> AI edit -> optimistic lock 409 -> publish -> rollback', async () => {
    // 1. AI Generate
    const genRes = await app.inject({
      method: 'POST',
      url: '/api/dashboards/generate',
      payload: {
        prompt:
          '生成一个游戏广告投放数据看板，包含总消耗、收入、ROI、新增用户、每日趋势、充值区间分布、渠道占比和数据明细。',
      },
    });
    expect(genRes.statusCode).toBe(200);
    const generatedDoc = genRes.json().data.pageDocument;

    // 2. Save to SQLite (attempting spoofed ownerId in body must be ignored)
    const saveRes = await app.inject({
      method: 'POST',
      url: '/api/dashboards',
      payload: {
        ownerId: 'spoofed-attacker',
        pageDocument: generatedDoc,
        changeDescription: 'Initial save v1',
      },
    });
    expect(saveRes.statusCode).toBe(201);
    const saved = saveRes.json().data.dashboard;
    expect(saved.id).toBeTruthy();
    expect(saved.ownerId).toBe('integration-user-1');
    expect(saved.currentRevision).toBe(1);
    expect(saved.status).toBe('draft');

    // 3. Reload persisted dashboard from SQLite
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/dashboards/${saved.id}`,
    });
    expect(getRes.statusCode).toBe(200);
    const loaded = getRes.json().data.dashboard;
    expect(loaded.pageDocument.ui.root).toBe(generatedDoc.ui.root);
    // Ensure runtime business data was NOT saved into SQLite
    expect(loaded.pageDocument.ui.state).toBeUndefined();

    // 4. Execute DataSource batch query via QueryManager -> json-render StateStore
    const store = createStateStore({});
    const qm = new DashboardQueryManager(loaded.pageDocument, store, {
      executor: async (queries) => {
        const qRes = await app.inject({
          method: 'POST',
          url: '/api/data/query-batch',
          payload: { queries },
        });
        expect(qRes.statusCode).toBe(200);
        return qRes.json().data;
      },
    });
    qm.initializeState();
    await qm.executeQueries({ trigger: 'init' });

    const allCost = store.get('/data/summary/totalCost') as number;
    expect(allCost).toBeGreaterThan(0);
    expect(Array.isArray(store.get('/data/daily'))).toBe(true);
    expect((store.get('/data/daily') as any[]).length).toBe(14);

    // Switch gameId variable -> summary updates deterministically
    await qm.setVariable('gameId', 'game-001');
    const game1Cost = store.get('/data/summary/totalCost') as number;
    expect(game1Cost).toBeGreaterThan(0);
    expect(game1Cost).not.toBe(allCost);

    // Verify independent per-query failure handling in query-batch
    const partialRes = await app.inject({
      method: 'POST',
      url: '/api/data/query-batch',
      payload: {
        queries: [
          { key: 'valid', resource: 'ads.summary', params: { gameId: 'game-001', dateRange: 'last7days' } },
          { key: 'invalid', resource: 'ads.does_not_exist', params: {} },
        ],
      },
    });
    expect(partialRes.statusCode).toBe(200);
    expect(partialRes.json().data.results.valid.status).toBe('success');
    expect(partialRes.json().data.results.invalid.status).toBe('error');

    // 5. AI Edit (add ROI card + preserve unrelated node IDs)
    const editRes = await app.inject({
      method: 'POST',
      url: `/api/dashboards/${saved.id}/ai-edit`,
      payload: { instruction: '新增 ROI 卡片并将趋势图移动到顶部' },
    });
    expect(editRes.statusCode).toBe(200);
    const editData = editRes.json().data;
    expect(editData.validation.valid).toBe(true);
    expect(editData.patches.length).toBeGreaterThan(0);
    expect(editData.candidateDocument.ui.elements['stat-cost']).toBeDefined();
    expect(editData.candidateDocument.ui.elements['stat-roi-added']).toBeDefined();
    expect(editData.candidateDocument.ui.elements.root.children[1]).toBe('section-trends');

    // 6. Save as Revision v2
    const updateRes = await app.inject({
      method: 'PUT',
      url: `/api/dashboards/${saved.id}`,
      payload: {
        baseRevision: 1,
        pageDocument: editData.candidateDocument,
        changeDescription: editData.changeSummary,
      },
    });
    expect(updateRes.statusCode).toBe(200);
    expect(updateRes.json().data.dashboard.currentRevision).toBe(2);

    // 7. Optimistic lock conflict -> 409 when sending stale baseRevision=1
    const conflictRes = await app.inject({
      method: 'PUT',
      url: `/api/dashboards/${saved.id}`,
      payload: {
        baseRevision: 1,
        pageDocument: editData.candidateDocument,
        changeDescription: 'Stale write should fail',
      },
    });
    expect(conflictRes.statusCode).toBe(409);
    expect(conflictRes.json().error.code).toBe('REVISION_CONFLICT');

    // 8. Publish v2
    const pubRes = await app.inject({
      method: 'POST',
      url: `/api/dashboards/${saved.id}/publish`,
      payload: {},
    });
    expect(pubRes.statusCode).toBe(200);
    expect(pubRes.json().data.dashboard.status).toBe('published');
    expect(pubRes.json().data.dashboard.publishedRevision).toBe(2);

    // 9. Rollback to v1 -> creates immutable v3 matching v1
    const rbRes = await app.inject({
      method: 'POST',
      url: `/api/dashboards/${saved.id}/rollback`,
      payload: { targetRevision: 1, baseRevision: 2 },
    });
    expect(rbRes.statusCode).toBe(200);
    const rolledBack = rbRes.json().data.dashboard;
    expect(rolledBack.currentRevision).toBe(3);
    expect(rolledBack.pageDocument.ui.elements['stat-roi-added']).toBeUndefined();

    // Verify all 3 immutable revisions exist
    const revsRes = await app.inject({
      method: 'GET',
      url: `/api/dashboards/${saved.id}/revisions`,
    });
    expect(revsRes.statusCode).toBe(200);
    expect(revsRes.json().data.revisions.map((r: any) => r.revision)).toEqual([3, 2, 1]);

    // 10. Delete dashboard (even when Content-Type: application/json is sent with empty body)
    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/dashboards/${saved.id}`,
      headers: { 'content-type': 'application/json' },
    });
    expect(delRes.statusCode).toBe(200);
    expect(delRes.json().data.deleted).toBe(true);

    const afterDelRes = await app.inject({
      method: 'GET',
      url: `/api/dashboards/${saved.id}`,
    });
    expect(afterDelRes.statusCode).toBe(404);
  });

  it('returns 401 when unauthenticated and 403 when lacking editor role', async () => {
    const unauthApp = await buildApp({
      prisma,
      authResolver: () => null,
    });
    const r401 = await unauthApp.inject({ method: 'GET', url: '/api/dashboards' });
    expect(r401.statusCode).toBe(401);
    await unauthApp.close();

    const viewerOnlyApp = await buildApp({
      prisma,
      authResolver: () => ({ id: 'viewer-1', name: 'ReadOnly', roles: ['viewer'] }),
    });
    const r403 = await viewerOnlyApp.inject({
      method: 'POST',
      url: '/api/dashboards/generate',
      payload: { prompt: 'test' },
    });
    expect(r403.statusCode).toBe(403);
    await viewerOnlyApp.close();
  });

  it('streams progressive SSE SpecStream patches from POST /api/dashboards/generate-stream', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/dashboards/generate-stream',
      payload: {
        prompt: '生成一个游戏广告投放数据看板',
        scenario: 'game-ads',
        streamDelayMs: 0,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');

    const blocks = res.body
      .split('\n\n')
      .map((b) => b.trim())
      .filter(Boolean);

    const events = blocks.map((block) => {
      let event = 'message';
      let data = '';
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      return { event, data: JSON.parse(data) };
    });

    const stageEvents = events.filter((e) => e.event === 'stage');
    const metaEvents = events.filter((e) => e.event === 'meta');
    const patchEvents = events.filter((e) => e.event === 'patch');
    const completeEvents = events.filter((e) => e.event === 'complete');

    expect(stageEvents.length).toBeGreaterThanOrEqual(4);
    expect(metaEvents).toHaveLength(1);
    expect(patchEvents.length).toBeGreaterThan(20);
    expect(completeEvents).toHaveLength(1);

    const compiler = createSpecStreamCompiler<any>({ root: '', elements: {} });
    for (const pe of patchEvents) {
      compiler.push(`${JSON.stringify(pe.data.patch)}\n`);
    }

    const finalEventDoc = completeEvents[0].data.pageDocument;
    expect(completeEvents[0].data.validation.valid).toBe(true);
    expect(compiler.getResult()).toEqual(finalEventDoc.ui);
  });

  it('auto-bootstraps SQLite tables and seeds dashboards on cold start without prisma db push', async () => {
    const coldDbPath = path.resolve(process.cwd(), 'prisma/test-cold-bootstrap.db');
    if (fs.existsSync(coldDbPath)) {
      fs.rmSync(coldDbPath, { force: true });
    }

    const coldPrisma = new PrismaClient({
      datasources: { db: { url: `file:${coldDbPath}` } },
    });

    try {
      resetBootstrapState();
      await ensureDatabaseReady(coldPrisma);

      const seeded = await coldPrisma.dashboard.findMany();
      expect(seeded.length).toBeGreaterThanOrEqual(2);
      expect(seeded.some((d) => d.id === 'seed-game-ads-dashboard')).toBe(true);
    } finally {
      resetBootstrapState();
      await coldPrisma.$disconnect();
      if (fs.existsSync(coldDbPath)) {
        fs.rmSync(coldDbPath, { force: true });
      }
    }
  });
});
