import type { PrismaClient } from '@prisma/client';
import {
  buildGameAdsDashboard,
  buildTrafficAnalysisDashboard,
} from '../ai/templates.js';

let bootstrapPromise: Promise<void> | null = null;

/**
 * Automatically ensures SQLite tables exist and seeds initial demo dashboards
 * when running in ephemeral/serverless environments (e.g., Vercel /tmp/ai-dashboard.db)
 * or fresh containers where `prisma db push` / `prisma/seed.ts` was not pre-run.
 */
export async function ensureDatabaseReady(prisma: PrismaClient): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = runBootstrap(prisma).catch((err) => {
      bootstrapPromise = null;
      throw err;
    });
  }
  return bootstrapPromise;
}

export function resetBootstrapState(): void {
  bootstrapPromise = null;
}

async function runBootstrap(prisma: PrismaClient): Promise<void> {
  // 1. Ensure SQLite tables and indexes exist (idempotent DDL matching prisma/schema.prisma)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Dashboard" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "title" TEXT NOT NULL,
      "description" TEXT NOT NULL DEFAULT '',
      "ownerId" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'draft',
      "currentRevision" INTEGER NOT NULL DEFAULT 1,
      "publishedRevision" INTEGER,
      "schemaVersion" TEXT NOT NULL,
      "catalogVersion" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "DashboardRevision" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "dashboardId" TEXT NOT NULL,
      "revision" INTEGER NOT NULL,
      "pageDocument" TEXT NOT NULL,
      "changeDescription" TEXT NOT NULL DEFAULT '',
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "DashboardRevision_dashboardId_fkey"
        FOREIGN KEY ("dashboardId") REFERENCES "Dashboard" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "DashboardRevision_dashboardId_revision_key"
    ON "DashboardRevision"("dashboardId", "revision");
  `);

  // 2. Auto-seed default demo dashboards if database is completely empty
  const count = await prisma.dashboard.count();
  if (count > 0) return;

  const ownerId = process.env.DEMO_USER_ID || 'demo-analyst-01';
  const seeds = [
    {
      id: 'seed-game-ads-dashboard',
      doc: buildGameAdsDashboard(
        '游戏广告投放数据看板（Seed 示例）',
        '预置的暗色 BI 游戏投放监控大屏，支持按游戏、时间周期实时联动后端 DataSource。',
      ),
      status: 'published',
      changeDescription: 'Auto-seeded published Game Ads BI dashboard',
    },
    {
      id: 'seed-traffic-dashboard',
      doc: buildTrafficAnalysisDashboard(
        '买量流量渠道分析看板（Seed 示例）',
        '预置的渠道流量与转化漏斗分析看板。',
      ),
      status: 'draft',
      changeDescription: 'Auto-seeded Traffic Analysis draft dashboard',
    },
  ];

  for (const item of seeds) {
    const existing = await prisma.dashboard.findUnique({ where: { id: item.id } });
    if (existing) continue;
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
  }
}
