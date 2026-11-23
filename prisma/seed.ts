import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { validatePageDocument } from '../packages/component-catalog/src/index.js';
import {
  buildGameAdsDashboard,
  buildTrafficAnalysisDashboard,
} from '../apps/server/src/ai/templates.js';

const prisma = new PrismaClient();

async function seed() {
  const ownerId = process.env.DEMO_USER_ID || 'demo-analyst-01';
  const userRoles = (process.env.DEMO_USER_ROLES || 'viewer,editor,ads:read')
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);

  const seedDashboards = [
    {
      id: 'seed-game-ads-dashboard',
      doc: buildGameAdsDashboard(
        '游戏广告投放数据看板（Seed 示例）',
        '预置的暗色 BI 游戏投放监控大屏，支持按游戏、时间周期实时联动后端 DataSource。',
      ),
      status: 'published',
      changeDescription: 'Seeded initial published Game Ads BI dashboard',
    },
    {
      id: 'seed-traffic-dashboard',
      doc: buildTrafficAnalysisDashboard(
        '买量流量渠道分析看板（Seed 示例）',
        '预置的渠道流量与转化漏斗分析看板。',
      ),
      status: 'draft',
      changeDescription: 'Seeded Traffic Analysis draft dashboard',
    },
  ];

  // Export canonical fixture JSON for docs/tests
  const fixturesDir = path.resolve(process.cwd(), 'fixtures');
  await fs.mkdir(fixturesDir, { recursive: true });
  await fs.writeFile(
    path.join(fixturesDir, 'game-ads-page-document.json'),
    JSON.stringify(seedDashboards[0].doc, null, 2),
    'utf-8',
  );

  for (const item of seedDashboards) {
    const check = validatePageDocument(item.doc, { userRoles });
    if (!check.valid) {
      throw new Error(
        `Seed dashboard "${item.id}" failed validation: ${JSON.stringify(check.errors)}`,
      );
    }

    const existing = await prisma.dashboard.findUnique({ where: { id: item.id } });
    if (existing) {
      console.log(`[seed] Dashboard "${item.id}" already exists (rev ${existing.currentRevision}), skipping.`);
      continue;
    }

    const docWithId = { ...item.doc, id: item.id };
    await prisma.$transaction(async (tx) => {
      await tx.dashboard.create({
        data: {
          id: item.id,
          title: docWithId.title,
          description: docWithId.description ?? '',
          ownerId,
          status: item.status,
          currentRevision: 1,
          publishedRevision: item.status === 'published' ? 1 : null,
          schemaVersion: docWithId.contractVersion,
          catalogVersion: docWithId.catalogVersion,
        },
      });
      await tx.dashboardRevision.create({
        data: {
          dashboardId: item.id,
          revision: 1,
          pageDocument: JSON.stringify(docWithId),
          changeDescription: item.changeDescription,
        },
      });
    });
    console.log(`[seed] Created dashboard "${item.id}" (${docWithId.title}).`);
  }
}

seed()
  .then(async () => {
    await prisma.$disconnect();
    console.log('[seed] Done.');
  })
  .catch(async (err) => {
    console.error('[seed] Failed:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
