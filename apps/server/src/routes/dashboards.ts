import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { PageDocument } from '@ai-dashboard/contracts';
import {
  getPublicComponentMetadata,
  validatePageDocument,
} from '@ai-dashboard/component-catalog';
import type { AIProvider } from '../ai/provider.js';
import { buildProgressiveSpecPatches } from '../ai/spec-stream.js';
import type { DataSourceRegistry } from '../datasource/registry.js';
import {
  DashboardRepository,
  RepositoryError,
} from '../repositories/dashboard-repository.js';
import type { AuthResolver } from '../services/auth.js';
import { sendError, sendOk } from './helpers.js';

const CreateDashboardBodySchema = z.object({
  pageDocument: z.unknown(),
  changeDescription: z.string().max(300).optional(),
});

const UpdateDashboardBodySchema = z.object({
  baseRevision: z.number().int().min(1),
  pageDocument: z.unknown(),
  changeDescription: z.string().max(300).optional(),
});

const GenerateBodySchema = z.object({
  prompt: z.string().trim().min(1, 'Prompt is required').max(2000),
  scenario: z
    .enum(['game-ads', 'traffic-analysis', 'revenue-analysis', 'auto'])
    .optional(),
  streamDelayMs: z.number().int().min(0).max(1500).optional(),
});

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const AIEditBodySchema = z.object({
  instruction: z.string().trim().min(1, 'Instruction is required').max(2000),
  currentDocument: z.unknown().optional(),
});

const RollbackBodySchema = z.object({
  targetRevision: z.number().int().min(1),
  baseRevision: z.number().int().min(1),
  changeDescription: z.string().max(300).optional(),
});

function handleRouteError(reply: any, err: unknown) {
  if (err instanceof RepositoryError) {
    return sendError(reply, err.statusCode, err.code, err.message, err.details);
  }
  const message = err instanceof Error ? err.message : 'Internal server error';
  return sendError(reply, 500, 'INTERNAL_ERROR', message);
}

export function registerDashboardRoutes(
  app: FastifyInstance,
  deps: {
    repository: DashboardRepository;
    aiProvider: AIProvider;
    dataSourceRegistry: DataSourceRegistry;
    authResolver: AuthResolver;
  },
) {
  // List dashboards
  app.get('/api/dashboards', async (request, reply) => {
    const user = deps.authResolver(request);
    if (!user) {
      return sendError(reply, 401, 'UNAUTHORIZED', 'Authentication required.');
    }
    try {
      const items = await deps.repository.list();
      return sendOk(reply, { dashboards: items });
    } catch (err) {
      return handleRouteError(reply, err);
    }
  });

  // Create dashboard
  app.post('/api/dashboards', async (request, reply) => {
    const user = deps.authResolver(request);
    if (!user) {
      return sendError(reply, 401, 'UNAUTHORIZED', 'Authentication required.');
    }
    if (!user.roles.includes('editor')) {
      return sendError(reply, 403, 'FORBIDDEN', 'Editor role is required to create dashboards.');
    }

    const parsed = CreateDashboardBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(
        reply,
        400,
        'INVALID_REQUEST',
        'Invalid dashboard creation payload.',
        parsed.error.issues,
      );
    }

    const validation = validatePageDocument(parsed.data.pageDocument, {
      userRoles: user.roles,
    });
    if (!validation.valid) {
      return sendError(
        reply,
        422,
        'SCHEMA_VALIDATION_FAILED',
        'PageDocument failed schema validation.',
        validation,
      );
    }

    try {
      const created = await deps.repository.create(
        user.id,
        parsed.data.pageDocument as PageDocument,
        parsed.data.changeDescription || 'Initial generated dashboard',
      );
      return sendOk(reply, { dashboard: created }, 201);
    } catch (err) {
      return handleRouteError(reply, err);
    }
  });

  // AI Generate candidate PageDocument (must be registered before /:id)
  app.post('/api/dashboards/generate', async (request, reply) => {
    const user = deps.authResolver(request);
    if (!user) {
      return sendError(reply, 401, 'UNAUTHORIZED', 'Authentication required.');
    }
    if (!user.roles.includes('editor')) {
      return sendError(reply, 403, 'FORBIDDEN', 'Editor role is required to generate dashboards.');
    }

    const parsed = GenerateBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(
        reply,
        400,
        'INVALID_REQUEST',
        'Invalid generate request payload.',
        parsed.error.issues,
      );
    }

    try {
      const components = getPublicComponentMetadata();
      const datasources = deps.dataSourceRegistry.listPublicMetadata(user.roles);

      const pageDocument = await deps.aiProvider.generate({
        prompt: parsed.data.prompt,
        scenario: parsed.data.scenario,
        components,
        datasources,
        user,
      });

      const validation = validatePageDocument(pageDocument, {
        userRoles: user.roles,
      });
      if (!validation.valid) {
        return sendError(
          reply,
          422,
          'SCHEMA_VALIDATION_FAILED',
          'AI generated PageDocument failed server validation.',
          validation,
        );
      }

      return sendOk(reply, {
        provider: deps.aiProvider.name,
        pageDocument,
        validation,
      });
    } catch (err) {
      return handleRouteError(reply, err);
    }
  });

  // AI Generate candidate PageDocument via SSE streaming (SpecStream RFC 6902 patches)
  app.post('/api/dashboards/generate-stream', async (request, reply) => {
    const user = deps.authResolver(request);
    if (!user) {
      return sendError(reply, 401, 'UNAUTHORIZED', 'Authentication required.');
    }
    if (!user.roles.includes('editor')) {
      return sendError(
        reply,
        403,
        'FORBIDDEN',
        'Editor role is required to generate dashboards.',
      );
    }

    const parsed = GenerateBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(
        reply,
        400,
        'INVALID_REQUEST',
        'Invalid generate-stream request payload.',
        parsed.error.issues,
      );
    }

    const envDelay =
      process.env.STREAM_DELAY_MS !== undefined
        ? Number(process.env.STREAM_DELAY_MS)
        : undefined;
    const baseDelayMs =
      parsed.data.streamDelayMs ??
      (envDelay !== undefined && !Number.isNaN(envDelay) ? envDelay : 260);

    const originHeader = request.headers.origin;
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      ...(originHeader
        ? { 'Access-Control-Allow-Origin': originHeader }
        : {}),
    });

    let closed = false;
    reply.raw.on('close', () => {
      if (!reply.raw.writableEnded) {
        closed = true;
      }
    });

    const writeEvent = (event: string, data: unknown) => {
      if (closed || reply.raw.writableEnded) return;
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const components = getPublicComponentMetadata();
      const datasources = deps.dataSourceRegistry.listPublicMetadata(user.roles);

      writeEvent('stage', {
        step: 'catalog',
        message: `已加载 ${components.length} 个受控组件与 ${datasources.length} 个授权 DataSource 元数据`,
        progress: 12,
      });
      await sleep(Math.min(baseDelayMs * 1.4, 420));
      if (closed) return;

      writeEvent('stage', {
        step: 'planning',
        message: `正在通过 ${deps.aiProvider.name} 解析业务意图并规划布局与查询绑定...`,
        progress: 26,
      });

      const pageDocument = await deps.aiProvider.generate({
        prompt: parsed.data.prompt,
        scenario: parsed.data.scenario,
        components,
        datasources,
        user,
      });
      await sleep(Math.min(baseDelayMs * 1.6, 480));
      if (closed) return;

      const validation = validatePageDocument(pageDocument, {
        userRoles: user.roles,
      });
      if (!validation.valid) {
        writeEvent('error', {
          code: 'SCHEMA_VALIDATION_FAILED',
          message: 'AI generated PageDocument failed server validation.',
          details: validation,
        });
        reply.raw.end();
        return;
      }

      // Emit document metadata & queries first so client StateStore & DataSource queries start immediately
      writeEvent('meta', {
        provider: deps.aiProvider.name,
        contractVersion: pageDocument.contractVersion,
        catalogVersion: pageDocument.catalogVersion,
        title: pageDocument.title,
        description: pageDocument.description,
        variables: pageDocument.variables,
        queries: pageDocument.queries,
      });

      const patchSteps = buildProgressiveSpecPatches(pageDocument.ui);
      writeEvent('stage', {
        step: 'spec',
        message: `开始流式构建 json-render UI Spec（共 ${patchSteps.length} 条 SpecStream Patch）`,
        progress: 35,
      });

      for (let i = 0; i < patchSteps.length; i++) {
        if (closed) return;
        const step = patchSteps[i];
        writeEvent('patch', {
          patch: step.patch,
          index: i + 1,
          total: patchSteps.length,
          elementId: step.elementId,
          componentType: step.componentType,
        });

        // Pause AFTER the element is linked into the visible tree (or root is created),
        // so every pause corresponds to a visible component materializing on screen!
        const isRootCreation = step.patch.path === `/elements/${pageDocument.ui.root}`;
        const shouldPause = step.isLinkPatch || isRootCreation;
        const stepDelay = !shouldPause
          ? 0
          : step.phase === 'skeleton'
            ? Math.round(baseDelayMs * 0.6)
            : baseDelayMs;
        await sleep(stepDelay);
      }

      if (closed) return;
      writeEvent('stage', {
        step: 'validating',
        message: '已完成服务端 14 项安全与数据契约校验',
        progress: 96,
      });
      await sleep(Math.min(baseDelayMs, 100));
      if (closed) return;

      writeEvent('complete', {
        provider: deps.aiProvider.name,
        pageDocument,
        validation,
      });
      writeEvent('stage', {
        step: 'done',
        message: 'Dashboard 流式生成完成',
        progress: 100,
      });
    } catch (err) {
      writeEvent('error', {
        code: 'STREAM_GENERATION_ERROR',
        message: err instanceof Error ? err.message : 'Streaming generation failed',
      });
    } finally {
      if (!reply.raw.writableEnded) {
        reply.raw.end();
      }
    }
  });

  // Get dashboard by ID (NEVER calls LLM)
  app.get<{ Params: { id: string } }>('/api/dashboards/:id', async (request, reply) => {
    const user = deps.authResolver(request);
    if (!user) {
      return sendError(reply, 401, 'UNAUTHORIZED', 'Authentication required.');
    }
    try {
      const dashboard = await deps.repository.getById(request.params.id);
      if (!dashboard) {
        return sendError(
          reply,
          404,
          'DASHBOARD_NOT_FOUND',
          `Dashboard "${request.params.id}" not found.`,
        );
      }
      return sendOk(reply, { dashboard });
    } catch (err) {
      return handleRouteError(reply, err);
    }
  });

  // Update dashboard (with optimistic locking & new immutable revision)
  app.put<{ Params: { id: string } }>('/api/dashboards/:id', async (request, reply) => {
    const user = deps.authResolver(request);
    if (!user) {
      return sendError(reply, 401, 'UNAUTHORIZED', 'Authentication required.');
    }
    if (!user.roles.includes('editor')) {
      return sendError(reply, 403, 'FORBIDDEN', 'Editor role is required to update dashboards.');
    }

    const parsed = UpdateDashboardBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(
        reply,
        400,
        'INVALID_REQUEST',
        'Invalid dashboard update payload.',
        parsed.error.issues,
      );
    }

    const validation = validatePageDocument(parsed.data.pageDocument, {
      userRoles: user.roles,
    });
    if (!validation.valid) {
      return sendError(
        reply,
        422,
        'SCHEMA_VALIDATION_FAILED',
        'PageDocument failed schema validation.',
        validation,
      );
    }

    try {
      const updated = await deps.repository.updateWithOptimisticLock(
        request.params.id,
        user.id,
        parsed.data.baseRevision,
        parsed.data.pageDocument as PageDocument,
        parsed.data.changeDescription || 'Updated dashboard schema',
      );
      return sendOk(reply, { dashboard: updated });
    } catch (err) {
      return handleRouteError(reply, err);
    }
  });

  // Delete dashboard
  app.delete<{ Params: { id: string } }>('/api/dashboards/:id', async (request, reply) => {
    const user = deps.authResolver(request);
    if (!user) {
      return sendError(reply, 401, 'UNAUTHORIZED', 'Authentication required.');
    }
    if (!user.roles.includes('editor')) {
      return sendError(reply, 403, 'FORBIDDEN', 'Editor role is required to delete dashboards.');
    }
    try {
      await deps.repository.delete(request.params.id, user.id);
      return sendOk(reply, { deleted: true, id: request.params.id });
    } catch (err) {
      return handleRouteError(reply, err);
    }
  });

  // AI Edit existing dashboard (returns validated candidate + JSON patches, does NOT auto-save)
  app.post<{ Params: { id: string } }>(
    '/api/dashboards/:id/ai-edit',
    async (request, reply) => {
      const user = deps.authResolver(request);
      if (!user) {
        return sendError(reply, 401, 'UNAUTHORIZED', 'Authentication required.');
      }
      if (!user.roles.includes('editor')) {
        return sendError(reply, 403, 'FORBIDDEN', 'Editor role is required for AI edits.');
      }

      const parsed = AIEditBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(
          reply,
          400,
          'INVALID_REQUEST',
          'Invalid AI edit payload.',
          parsed.error.issues,
        );
      }

      try {
        const existing = await deps.repository.getById(request.params.id);
        if (!existing) {
          return sendError(
            reply,
            404,
            'DASHBOARD_NOT_FOUND',
            `Dashboard "${request.params.id}" not found.`,
          );
        }

        const baseDoc = (parsed.data.currentDocument ??
          existing.pageDocument) as PageDocument;

        const baseValidation = validatePageDocument(baseDoc, {
          userRoles: user.roles,
        });
        if (!baseValidation.valid) {
          return sendError(
            reply,
            422,
            'SCHEMA_VALIDATION_FAILED',
            'Current PageDocument is invalid.',
            baseValidation,
          );
        }

        const editResult = await deps.aiProvider.edit({
          instruction: parsed.data.instruction,
          currentDocument: baseDoc,
          components: getPublicComponentMetadata(),
          datasources: deps.dataSourceRegistry.listPublicMetadata(user.roles),
          user,
        });

        const validation = validatePageDocument(editResult.pageDocument, {
          userRoles: user.roles,
        });
        if (!validation.valid) {
          return sendError(
            reply,
            422,
            'SCHEMA_VALIDATION_FAILED',
            'AI edited candidate PageDocument failed server validation.',
            validation,
          );
        }

        return sendOk(reply, {
          provider: deps.aiProvider.name,
          candidateDocument: editResult.pageDocument,
          patches: editResult.patches,
          changeSummary: editResult.changeSummary,
          validation,
        });
      } catch (err) {
        return handleRouteError(reply, err);
      }
    },
  );

  // Publish dashboard
  app.post<{ Params: { id: string } }>(
    '/api/dashboards/:id/publish',
    async (request, reply) => {
      const user = deps.authResolver(request);
      if (!user) {
        return sendError(reply, 401, 'UNAUTHORIZED', 'Authentication required.');
      }
      if (!user.roles.includes('editor')) {
        return sendError(reply, 403, 'FORBIDDEN', 'Editor role is required to publish.');
      }
      try {
        const published = await deps.repository.publish(request.params.id, user.id);
        return sendOk(reply, { dashboard: published });
      } catch (err) {
        return handleRouteError(reply, err);
      }
    },
  );

  // List revisions
  app.get<{ Params: { id: string } }>(
    '/api/dashboards/:id/revisions',
    async (request, reply) => {
      const user = deps.authResolver(request);
      if (!user) {
        return sendError(reply, 401, 'UNAUTHORIZED', 'Authentication required.');
      }
      try {
        const revisions = await deps.repository.listRevisions(request.params.id);
        return sendOk(reply, { revisions });
      } catch (err) {
        return handleRouteError(reply, err);
      }
    },
  );

  // Get specific revision
  app.get<{ Params: { id: string; revision: string } }>(
    '/api/dashboards/:id/revisions/:revision',
    async (request, reply) => {
      const user = deps.authResolver(request);
      if (!user) {
        return sendError(reply, 401, 'UNAUTHORIZED', 'Authentication required.');
      }
      const revNum = Number(request.params.revision);
      if (!Number.isInteger(revNum) || revNum < 1) {
        return sendError(reply, 400, 'INVALID_REVISION', 'Revision must be a positive integer.');
      }
      try {
        const revision = await deps.repository.getRevision(
          request.params.id,
          revNum,
        );
        if (!revision) {
          return sendError(
            reply,
            404,
            'REVISION_NOT_FOUND',
            `Revision v${revNum} not found.`,
          );
        }
        return sendOk(reply, { revision });
      } catch (err) {
        return handleRouteError(reply, err);
      }
    },
  );

  // Rollback to historical revision (creates a new immutable revision)
  app.post<{ Params: { id: string } }>(
    '/api/dashboards/:id/rollback',
    async (request, reply) => {
      const user = deps.authResolver(request);
      if (!user) {
        return sendError(reply, 401, 'UNAUTHORIZED', 'Authentication required.');
      }
      if (!user.roles.includes('editor')) {
        return sendError(reply, 403, 'FORBIDDEN', 'Editor role is required to rollback.');
      }

      const parsed = RollbackBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(
          reply,
          400,
          'INVALID_REQUEST',
          'Invalid rollback payload.',
          parsed.error.issues,
        );
      }

      try {
        const updated = await deps.repository.rollback(
          request.params.id,
          user.id,
          parsed.data.targetRevision,
          parsed.data.baseRevision,
          parsed.data.changeDescription,
        );
        return sendOk(reply, { dashboard: updated });
      } catch (err) {
        return handleRouteError(reply, err);
      }
    },
  );
}
