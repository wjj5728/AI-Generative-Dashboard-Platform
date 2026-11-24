import fs from 'node:fs';
import type {
  DashboardDetail,
  DashboardRevisionDetail,
  DashboardRevisionSummary,
  DashboardStatus,
  DashboardSummary,
  PageDocument,
} from '@ai-dashboard/contracts';
import {
  buildGameAdsDashboard,
  buildTrafficAnalysisDashboard,
} from '../ai/templates.js';
import { RepositoryError } from './dashboard-repository.js';

interface StoredDashboardRecord {
  id: string;
  title: string;
  description: string;
  ownerId: string;
  status: DashboardStatus;
  currentRevision: number;
  publishedRevision: number | null;
  schemaVersion: string;
  catalogVersion: string;
  createdAt: string;
  updatedAt: string;
  revisions: Array<{
    id: string;
    dashboardId: string;
    revision: number;
    pageDocument: PageDocument;
    changeDescription: string;
    createdAt: string;
  }>;
}

interface StoreData {
  dashboards: Record<string, StoredDashboardRecord>;
}

const STORE_FILE_PATH = '/tmp/ai-dashboard-store.json';
let memoryStore: StoreData | null = null;

function cleanDoc(doc: PageDocument, id: string): PageDocument {
  return {
    contractVersion: doc.contractVersion,
    catalogVersion: doc.catalogVersion,
    id,
    title: doc.title,
    description: doc.description ?? '',
    variables: doc.variables,
    queries: doc.queries,
    ui: {
      root: doc.ui.root,
      elements: doc.ui.elements,
    },
  };
}

function createInitialSeedStore(): StoreData {
  const now = new Date().toISOString();
  const ownerId = process.env.DEMO_USER_ID || 'demo-analyst-01';
  const seed1Doc = cleanDoc(
    buildGameAdsDashboard(
      '游戏广告投放数据看板（Seed 示例）',
      '预置的暗色 BI 游戏投放监控大屏，支持按游戏、时间周期实时联动后端 DataSource。',
    ),
    'seed-game-ads-dashboard',
  );
  const seed2Doc = cleanDoc(
    buildTrafficAnalysisDashboard(
      '买量流量渠道分析看板（Seed 示例）',
      '预置的渠道流量与转化漏斗分析看板。',
    ),
    'seed-traffic-dashboard',
  );

  return {
    dashboards: {
      'seed-game-ads-dashboard': {
        id: 'seed-game-ads-dashboard',
        title: seed1Doc.title,
        description: seed1Doc.description ?? '',
        ownerId,
        status: 'published',
        currentRevision: 1,
        publishedRevision: 1,
        schemaVersion: seed1Doc.contractVersion,
        catalogVersion: seed1Doc.catalogVersion,
        createdAt: now,
        updatedAt: now,
        revisions: [
          {
            id: 'rev-seed-1',
            dashboardId: 'seed-game-ads-dashboard',
            revision: 1,
            pageDocument: seed1Doc,
            changeDescription: 'Seeded initial published Game Ads BI dashboard',
            createdAt: now,
          },
        ],
      },
      'seed-traffic-dashboard': {
        id: 'seed-traffic-dashboard',
        title: seed2Doc.title,
        description: seed2Doc.description ?? '',
        ownerId,
        status: 'draft',
        currentRevision: 1,
        publishedRevision: null,
        schemaVersion: seed2Doc.contractVersion,
        catalogVersion: seed2Doc.catalogVersion,
        createdAt: now,
        updatedAt: now,
        revisions: [
          {
            id: 'rev-seed-2',
            dashboardId: 'seed-traffic-dashboard',
            revision: 1,
            pageDocument: seed2Doc,
            changeDescription: 'Seeded Traffic Analysis draft dashboard',
            createdAt: now,
          },
        ],
      },
    },
  };
}

function loadStore(): StoreData {
  if (memoryStore) return memoryStore;
  try {
    if (fs.existsSync(STORE_FILE_PATH)) {
      const raw = fs.readFileSync(STORE_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as StoreData;
      if (parsed && parsed.dashboards && Object.keys(parsed.dashboards).length > 0) {
        memoryStore = parsed;
        return memoryStore;
      }
    }
  } catch {
    // Ignore read errors and initialize fresh seed store
  }
  memoryStore = createInitialSeedStore();
  saveStore(memoryStore);
  return memoryStore;
}

function saveStore(store: StoreData): void {
  memoryStore = store;
  try {
    fs.writeFileSync(STORE_FILE_PATH, JSON.stringify(store), 'utf-8');
  } catch {
    // Keep in-memory store if /tmp write fails
  }
}

function toSummary(rec: StoredDashboardRecord): DashboardSummary {
  return {
    id: rec.id,
    title: rec.title,
    description: rec.description,
    ownerId: rec.ownerId,
    status: rec.status,
    currentRevision: rec.currentRevision,
    publishedRevision: rec.publishedRevision,
    schemaVersion: rec.schemaVersion,
    catalogVersion: rec.catalogVersion,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
  };
}

/**
 * Serverless-safe fallback DashboardRepository backed by `/tmp/ai-dashboard-store.json`
 * and in-memory state when Prisma's native Rust query engine is unavailable in Lambda.
 */
export class FallbackDashboardRepository {
  async list(ownerId?: string): Promise<DashboardSummary[]> {
    const store = loadStore();
    return Object.values(store.dashboards)
      .filter((d) => (!ownerId ? true : d.ownerId === ownerId))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(toSummary);
  }

  async getById(id: string): Promise<DashboardDetail | null> {
    const store = loadStore();
    const rec = store.dashboards[id];
    if (!rec) return null;
    const latest =
      rec.revisions.find((r) => r.revision === rec.currentRevision) ??
      rec.revisions[rec.revisions.length - 1];
    if (!latest) return null;
    return {
      ...toSummary(rec),
      pageDocument: structuredClone(latest.pageDocument),
    };
  }

  async create(
    ownerId: string,
    pageDocument: PageDocument,
    changeDescription = 'Initial version',
    explicitId?: string,
  ): Promise<DashboardDetail> {
    const store = loadStore();
    const id =
      explicitId ||
      `dash-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();
    const sanitized = cleanDoc(pageDocument, id);

    const record: StoredDashboardRecord = {
      id,
      title: sanitized.title,
      description: sanitized.description ?? '',
      ownerId,
      status: 'draft',
      currentRevision: 1,
      publishedRevision: null,
      schemaVersion: sanitized.contractVersion,
      catalogVersion: sanitized.catalogVersion,
      createdAt: now,
      updatedAt: now,
      revisions: [
        {
          id: `rev-${id}-1`,
          dashboardId: id,
          revision: 1,
          pageDocument: sanitized,
          changeDescription,
          createdAt: now,
        },
      ],
    };

    store.dashboards[id] = record;
    saveStore(store);

    return {
      ...toSummary(record),
      pageDocument: structuredClone(sanitized),
    };
  }

  async updateWithOptimisticLock(
    id: string,
    ownerId: string,
    baseRevision: number,
    pageDocument: PageDocument,
    changeDescription = 'Updated dashboard schema',
  ): Promise<DashboardDetail> {
    const store = loadStore();
    const existing = store.dashboards[id];
    if (!existing) {
      throw new RepositoryError(404, 'DASHBOARD_NOT_FOUND', `Dashboard "${id}" not found.`);
    }
    if (existing.ownerId !== ownerId) {
      throw new RepositoryError(403, 'FORBIDDEN', 'You do not have permission to edit this dashboard.');
    }
    if (existing.currentRevision !== baseRevision) {
      throw new RepositoryError(
        409,
        'REVISION_CONFLICT',
        `Revision conflict: expected baseRevision ${baseRevision}, but currentRevision is ${existing.currentRevision}.`,
        { baseRevision, currentRevision: existing.currentRevision },
      );
    }

    const nextRevision = existing.currentRevision + 1;
    const now = new Date().toISOString();
    const sanitized = cleanDoc(pageDocument, id);

    existing.title = sanitized.title;
    existing.description = sanitized.description ?? '';
    existing.currentRevision = nextRevision;
    existing.schemaVersion = sanitized.contractVersion;
    existing.catalogVersion = sanitized.catalogVersion;
    existing.updatedAt = now;
    existing.revisions.push({
      id: `rev-${id}-${nextRevision}`,
      dashboardId: id,
      revision: nextRevision,
      pageDocument: sanitized,
      changeDescription,
      createdAt: now,
    });

    saveStore(store);
    return {
      ...toSummary(existing),
      pageDocument: structuredClone(sanitized),
    };
  }

  async publish(id: string, ownerId: string): Promise<DashboardDetail> {
    const store = loadStore();
    const existing = store.dashboards[id];
    if (!existing) {
      throw new RepositoryError(404, 'DASHBOARD_NOT_FOUND', `Dashboard "${id}" not found.`);
    }
    if (existing.ownerId !== ownerId) {
      throw new RepositoryError(403, 'FORBIDDEN', 'You do not have permission to publish this dashboard.');
    }
    existing.status = 'published';
    existing.publishedRevision = existing.currentRevision;
    existing.updatedAt = new Date().toISOString();
    saveStore(store);

    const detail = await this.getById(id);
    if (!detail) {
      throw new RepositoryError(404, 'DASHBOARD_NOT_FOUND', `Dashboard "${id}" not found.`);
    }
    return detail;
  }

  async delete(id: string, ownerId: string): Promise<void> {
    const store = loadStore();
    const existing = store.dashboards[id];
    if (!existing) {
      throw new RepositoryError(404, 'DASHBOARD_NOT_FOUND', `Dashboard "${id}" not found.`);
    }
    if (existing.ownerId !== ownerId) {
      throw new RepositoryError(403, 'FORBIDDEN', 'You do not have permission to delete this dashboard.');
    }
    delete store.dashboards[id];
    saveStore(store);
  }

  async listRevisions(dashboardId: string): Promise<DashboardRevisionSummary[]> {
    const store = loadStore();
    const existing = store.dashboards[dashboardId];
    if (!existing) {
      throw new RepositoryError(404, 'DASHBOARD_NOT_FOUND', `Dashboard "${dashboardId}" not found.`);
    }
    return [...existing.revisions]
      .sort((a, b) => b.revision - a.revision)
      .map((r) => ({
        id: r.id,
        dashboardId: r.dashboardId,
        revision: r.revision,
        changeDescription: r.changeDescription,
        createdAt: r.createdAt,
      }));
  }

  async getRevision(
    dashboardId: string,
    revision: number,
  ): Promise<DashboardRevisionDetail | null> {
    const store = loadStore();
    const existing = store.dashboards[dashboardId];
    if (!existing) return null;
    const rev = existing.revisions.find((r) => r.revision === revision);
    if (!rev) return null;
    return {
      id: rev.id,
      dashboardId: rev.dashboardId,
      revision: rev.revision,
      changeDescription: rev.changeDescription,
      createdAt: rev.createdAt,
      pageDocument: structuredClone(rev.pageDocument),
    };
  }

  async rollback(
    dashboardId: string,
    ownerId: string,
    targetRevision: number,
    baseRevision: number,
    changeDescription?: string,
  ): Promise<DashboardDetail> {
    const target = await this.getRevision(dashboardId, targetRevision);
    if (!target) {
      throw new RepositoryError(
        404,
        'REVISION_NOT_FOUND',
        `Revision ${targetRevision} does not exist for dashboard "${dashboardId}".`,
      );
    }
    return this.updateWithOptimisticLock(
      dashboardId,
      ownerId,
      baseRevision,
      target.pageDocument,
      changeDescription ?? `Rollback to revision v${targetRevision}`,
    );
  }
}
