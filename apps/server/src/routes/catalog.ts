import type { FastifyInstance } from 'fastify';
import {
  CATALOG_VERSION,
  CONTRACT_VERSION,
} from '@ai-dashboard/contracts';
import { getPublicComponentMetadata } from '@ai-dashboard/component-catalog';
import type { DataSourceRegistry } from '../datasource/registry.js';
import type { AuthResolver } from '../services/auth.js';
import { sendError, sendOk } from './helpers.js';

export function registerCatalogRoutes(
  app: FastifyInstance,
  deps: {
    dataSourceRegistry: DataSourceRegistry;
    authResolver: AuthResolver;
  },
) {
  app.get('/api/catalog/components', async (request, reply) => {
    const user = deps.authResolver(request);
    if (!user) {
      return sendError(reply, 401, 'UNAUTHORIZED', 'Authentication required.');
    }
    return sendOk(reply, {
      contractVersion: CONTRACT_VERSION,
      catalogVersion: CATALOG_VERSION,
      components: getPublicComponentMetadata(),
    });
  });

  app.get('/api/catalog/datasources', async (request, reply) => {
    const user = deps.authResolver(request);
    if (!user) {
      return sendError(reply, 401, 'UNAUTHORIZED', 'Authentication required.');
    }
    // Only returns public DataSource metadata authorized for this user (never handlers!)
    const datasources = deps.dataSourceRegistry.listPublicMetadata(user.roles);
    return sendOk(reply, {
      datasources,
    });
  });
}
