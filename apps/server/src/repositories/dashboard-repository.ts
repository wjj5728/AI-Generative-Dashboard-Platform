import type { PrismaClient } from '@prisma/client';
import type {
  DashboardDetail,
  DashboardRevisionDetail,
  DashboardRevisionSummary,
  DashboardStatus,
  DashboardSummary,
  PageDocument,
} from '@ai-dashboard/contracts';

export class RepositoryError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'RepositoryError';
  }
}

function toSummary(row: {
  id: string;
  title: string;
  description: string;
  ownerId: string;
  status: string;
  currentRevision: number;
  publishedRevision: number | null;
  schemaVersion: string;
  catalogVersion: string;
  createdAt: Date;
  updatedAt: Date;
}): DashboardSummary {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    ownerId: row.ownerId,
    status: (row.status === 'published' ? 'published' : 'draft') as DashboardStatus,
    currentRevision: row.currentRevision,
    publishedRevision: row.publishedRevision,
    schemaVersion: row.schemaVersion,
    catalogVersion: row.catalogVersion,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function sanitizeDocumentForPersistence(
  doc: PageDocument,
  id?: string,
): PageDocument {
  // Never persist runtime business query results inside PageDocument.ui.state
  const cleanUi = {
    root: doc.ui.root,
    elements: doc.ui.elements,
  };
  return {
    contractVersion: doc.contractVersion,
    catalogVersion: doc.catalogVersion,
    ...(id ? { id } : {}),
    title: doc.title,
    description: doc.description ?? '',
    variables: doc.variables,
    queries: doc.queries,
    ui: cleanUi,
  };
}

export class DashboardRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(ownerId?: string): Promise<DashboardSummary[]> {
    const rows = await this.prisma.dashboard.findMany({
      where: ownerId ? { ownerId } : undefined,
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map(toSummary);
  }

  async getById(id: string): Promise<DashboardDetail | null> {
    const row = await this.prisma.dashboard.findUnique({
      where: { id },
      include: {
        revisions: {
          orderBy: { revision: 'desc' },
          take: 1,
        },
      },
    });
    if (!row) return null;

    const latestRev =
      row.revisions.find((r) => r.revision === row.currentRevision) ??
      (await this.prisma.dashboardRevision.findUnique({
        where: {
          dashboardId_revision: {
            dashboardId: row.id,
            revision: row.currentRevision,
          },
        },
      }));

    if (!latestRev) {
      throw new RepositoryError(
        500,
        'MISSING_REVISION',
        `Dashboard "${id}" is missing current revision ${row.currentRevision}.`,
      );
    }

    const pageDocument = JSON.parse(latestRev.pageDocument) as PageDocument;
    pageDocument.id = row.id;

    return {
      ...toSummary(row),
      pageDocument,
    };
  }

  async create(
    ownerId: string,
    pageDocument: PageDocument,
    changeDescription = 'Initial version',
    explicitId?: string,
  ): Promise<DashboardDetail> {
    const created = await this.prisma.$transaction(async (tx) => {
      const dashboard = await tx.dashboard.create({
        data: {
          ...(explicitId ? { id: explicitId } : {}),
          title: pageDocument.title,
          description: pageDocument.description ?? '',
          ownerId,
          status: 'draft',
          currentRevision: 1,
          publishedRevision: null,
          schemaVersion: pageDocument.contractVersion,
          catalogVersion: pageDocument.catalogVersion,
        },
      });

      const cleanDoc = sanitizeDocumentForPersistence(pageDocument, dashboard.id);
      await tx.dashboardRevision.create({
        data: {
          dashboardId: dashboard.id,
          revision: 1,
          pageDocument: JSON.stringify(cleanDoc),
          changeDescription,
        },
      });

      return { dashboard, cleanDoc };
    });

    return {
      ...toSummary(created.dashboard),
      pageDocument: created.cleanDoc,
    };
  }

  async updateWithOptimisticLock(
    id: string,
    ownerId: string,
    baseRevision: number,
    pageDocument: PageDocument,
    changeDescription = 'Updated dashboard schema',
  ): Promise<DashboardDetail> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.dashboard.findUnique({ where: { id } });
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
          {
            baseRevision,
            currentRevision: existing.currentRevision,
          },
        );
      }

      const nextRevision = existing.currentRevision + 1;
      const cleanDoc = sanitizeDocumentForPersistence(pageDocument, id);

      const updatedResult = await tx.dashboard.updateMany({
        where: { id, currentRevision: baseRevision },
        data: {
          title: cleanDoc.title,
          description: cleanDoc.description ?? '',
          currentRevision: nextRevision,
          schemaVersion: cleanDoc.contractVersion,
          catalogVersion: cleanDoc.catalogVersion,
        },
      });

      if (updatedResult.count === 0) {
        throw new RepositoryError(
          409,
          'REVISION_CONFLICT',
          'Concurrent update detected. Please reload the latest revision.',
        );
      }

      await tx.dashboardRevision.create({
        data: {
          dashboardId: id,
          revision: nextRevision,
          pageDocument: JSON.stringify(cleanDoc),
          changeDescription,
        },
      });

      const updated = await tx.dashboard.findUniqueOrThrow({ where: { id } });
      return {
        ...toSummary(updated),
        pageDocument: cleanDoc,
      };
    });
  }

  async publish(id: string, ownerId: string): Promise<DashboardDetail> {
    const existing = await this.prisma.dashboard.findUnique({ where: { id } });
    if (!existing) {
      throw new RepositoryError(404, 'DASHBOARD_NOT_FOUND', `Dashboard "${id}" not found.`);
    }
    if (existing.ownerId !== ownerId) {
      throw new RepositoryError(403, 'FORBIDDEN', 'You do not have permission to publish this dashboard.');
    }

    await this.prisma.dashboard.update({
      where: { id },
      data: {
        status: 'published',
        publishedRevision: existing.currentRevision,
      },
    });

    const detail = await this.getById(id);
    if (!detail) {
      throw new RepositoryError(404, 'DASHBOARD_NOT_FOUND', `Dashboard "${id}" not found.`);
    }
    return detail;
  }

  async delete(id: string, ownerId: string): Promise<void> {
    const existing = await this.prisma.dashboard.findUnique({ where: { id } });
    if (!existing) {
      throw new RepositoryError(404, 'DASHBOARD_NOT_FOUND', `Dashboard "${id}" not found.`);
    }
    if (existing.ownerId !== ownerId) {
      throw new RepositoryError(403, 'FORBIDDEN', 'You do not have permission to delete this dashboard.');
    }
    await this.prisma.dashboard.delete({ where: { id } });
  }

  async listRevisions(dashboardId: string): Promise<DashboardRevisionSummary[]> {
    const exists = await this.prisma.dashboard.findUnique({
      where: { id: dashboardId },
      select: { id: true },
    });
    if (!exists) {
      throw new RepositoryError(404, 'DASHBOARD_NOT_FOUND', `Dashboard "${dashboardId}" not found.`);
    }

    const rows = await this.prisma.dashboardRevision.findMany({
      where: { dashboardId },
      orderBy: { revision: 'desc' },
    });

    return rows.map((r) => ({
      id: r.id,
      dashboardId: r.dashboardId,
      revision: r.revision,
      changeDescription: r.changeDescription,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async getRevision(
    dashboardId: string,
    revision: number,
  ): Promise<DashboardRevisionDetail | null> {
    const row = await this.prisma.dashboardRevision.findUnique({
      where: {
        dashboardId_revision: { dashboardId, revision },
      },
    });
    if (!row) return null;
    return {
      id: row.id,
      dashboardId: row.dashboardId,
      revision: row.revision,
      changeDescription: row.changeDescription,
      createdAt: row.createdAt.toISOString(),
      pageDocument: JSON.parse(row.pageDocument) as PageDocument,
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
