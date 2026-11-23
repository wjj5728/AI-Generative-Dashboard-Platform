import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { DataSourceRegistry } from '../datasource/registry.js';
import type { AuthResolver } from '../services/auth.js';
import { sendError, sendOk } from './helpers.js';

const QueryBatchBodySchema = z.object({
  queries: z
    .array(
      z.object({
        key: z.string().min(1),
        resource: z.string().min(1),
        params: z.record(z.string(), z.unknown()).default({}),
      }),
    )
    .min(1)
    .max(30),
  bypassCache: z.boolean().optional(),
});

export function registerDataRoutes(
  app: FastifyInstance,
  deps: {
    dataSourceRegistry: DataSourceRegistry;
    authResolver: AuthResolver;
  },
) {
  app.post('/api/data/query-batch', async (request, reply) => {
    const user = deps.authResolver(request);
    if (!user) {
      return sendError(reply, 401, 'UNAUTHORIZED', 'Authentication required.');
    }

    const parsed = QueryBatchBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(
        reply,
        400,
        'INVALID_REQUEST',
        'Invalid query-batch payload.',
        parsed.error.issues,
      );
    }

    const batchResult = await deps.dataSourceRegistry.executeBatch(
      parsed.data.queries,
      {
        user,
        requestId: request.id,
      },
      {
        bypassCache: parsed.data.bypassCache,
      },
    );

    return sendOk(reply, batchResult);
  });
}
