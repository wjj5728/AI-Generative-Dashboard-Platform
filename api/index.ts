import type { IncomingMessage, ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../apps/server/dist/app.js';

let appPromise: Promise<FastifyInstance> | null = null;

async function getReadyApp(): Promise<FastifyInstance> {
  if (!appPromise) {
    appPromise = (async () => {
      const app = await buildApp({
        logger: false,
        autoBootstrap: true,
        serveStaticWeb: false,
      });
      await app.ready();
      return app;
    })().catch((err) => {
      appPromise = null;
      throw err;
    });
  }
  return appPromise;
}

/**
 * Vercel Serverless Function entrypoint for all `/api/*` routes.
 * Delegates directly to Fastify's underlying Node HTTP server (`app.server.emit`)
 * so both standard JSON routes and live SSE streaming (`text/event-stream`) work seamlessly.
 */
export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const app = await getReadyApp();
  app.server.emit('request', req, res);
}
