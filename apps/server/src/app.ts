import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { createAIProviderFromEnv, type AIProvider } from './ai/index.js';
import {
  createDefaultDataSourceRegistry,
  type DataSourceRegistry,
} from './datasource/registry.js';
import { ensureDatabaseReady } from './repositories/bootstrap.js';
import { DashboardRepository } from './repositories/dashboard-repository.js';
import { FallbackDashboardRepository } from './repositories/fallback-repository.js';
import { getPrismaClient } from './repositories/prisma.js';
import { registerCatalogRoutes } from './routes/catalog.js';
import { registerDashboardRoutes } from './routes/dashboards.js';
import { registerDataRoutes } from './routes/data.js';
import { sendOk } from './routes/helpers.js';
import { createDefaultAuthResolver, type AuthResolver } from './services/auth.js';

export interface BuildAppOptions {
  prisma?: PrismaClient;
  aiProvider?: AIProvider;
  dataSourceRegistry?: DataSourceRegistry;
  authResolver?: AuthResolver;
  logger?: boolean;
  /** Automatically create tables & seed if empty (default: true when using default Prisma client) */
  autoBootstrap?: boolean;
  /** Serve built web static assets from apps/web/dist or public/ when present (default: true) */
  serveStaticWeb?: boolean;
  /** Optional embedded index.html string for serverless SPA fallback */
  embeddedIndexHtml?: string;
  /** Force serverless /tmp JSON fallback repository without loading Prisma native binary */
  useFallbackRepository?: boolean;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
  });

  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // Allow empty body even when caller sends Content-Type: application/json (e.g. DELETE / POST)
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_req, body, done) => {
      const raw = typeof body === 'string' ? body.trim() : '';
      if (!raw) {
        done(null, {});
        return;
      }
      try {
        done(null, JSON.parse(raw));
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  let repository: DashboardRepository;
  if (options.useFallbackRepository) {
    repository = new FallbackDashboardRepository() as unknown as DashboardRepository;
  } else {
    try {
      const prisma = options.prisma ?? getPrismaClient();
      if (options.autoBootstrap ?? !options.prisma) {
        await ensureDatabaseReady(prisma);
      }
      repository = new DashboardRepository(prisma);
    } catch (err) {
      console.warn(
        '[buildApp] Prisma initialization failed in serverless runtime, falling back to /tmp JSON store:',
        err instanceof Error ? err.message : err,
      );
      repository = new FallbackDashboardRepository() as unknown as DashboardRepository;
    }
  }
  const aiProvider = options.aiProvider ?? createAIProviderFromEnv();
  const dataSourceRegistry =
    options.dataSourceRegistry ?? createDefaultDataSourceRegistry();
  const authResolver = options.authResolver ?? createDefaultAuthResolver();

  app.get('/api/health', async (_request, reply) => {
    return sendOk(reply, {
      status: 'ok',
      aiProvider: aiProvider.name,
      timestamp: new Date().toISOString(),
    });
  });

  registerCatalogRoutes(app, { dataSourceRegistry, authResolver });
  registerDataRoutes(app, { dataSourceRegistry, authResolver });
  registerDashboardRoutes(app, {
    repository,
    aiProvider,
    dataSourceRegistry,
    authResolver,
  });

  // Production static hosting for apps/web/dist or public/ (Vercel / Render / Docker / node dist/index.js)
  if (options.serveStaticWeb !== false) {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const candidateDirs = [
      path.resolve(currentDir, '../../web/dist'),
      path.resolve(process.cwd(), 'apps/web/dist'),
      path.resolve(process.cwd(), 'public'),
    ];
    const webDistDir =
      candidateDirs.find((dir) => fs.existsSync(path.join(dir, 'index.html'))) ??
      candidateDirs[0];
    const indexHtmlPath = path.join(webDistDir, 'index.html');
    const hasDiskIndex = fs.existsSync(indexHtmlPath);

    if (hasDiskIndex || options.embeddedIndexHtml) {
      const MIME_TYPES: Record<string, string> = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.ico': 'image/x-icon',
      };

      app.setNotFoundHandler(async (request, reply) => {
        if (request.url.startsWith('/api/') || request.method !== 'GET') {
          return reply.code(404).send({
            ok: false,
            error: { code: 'NOT_FOUND', message: `Route ${request.url} not found` },
          });
        }

        if (hasDiskIndex) {
          const cleanPath = request.url.split('?')[0];
          const candidatePath = path.resolve(webDistDir, `.${cleanPath}`);
          if (
            candidatePath.startsWith(webDistDir) &&
            fs.existsSync(candidatePath) &&
            fs.statSync(candidatePath).isFile()
          ) {
            const ext = path.extname(candidatePath);
            reply.header(
              'Content-Type',
              MIME_TYPES[ext] || 'application/octet-stream',
            );
            return reply.send(fs.readFileSync(candidatePath));
          }
        }

        // SPA fallback to index.html
        reply.header('Content-Type', 'text/html; charset=utf-8');
        if (hasDiskIndex) {
          return reply.send(fs.readFileSync(indexHtmlPath));
        }
        return reply.send(options.embeddedIndexHtml);
      });
    }
  }

  return app;
}
