import type { IncomingMessage, ServerResponse } from 'node:http';
import Fastify, { type FastifyInstance } from 'fastify';
import { buildApp } from '../apps/server/dist/app.js';

// Reference Fastify import so Vercel's Fastify framework detector recognizes this entrypoint
void Fastify;

let appPromise: Promise<FastifyInstance> | null = null;

async function getReadyApp(): Promise<FastifyInstance> {
  if (!appPromise) {
    appPromise = (async () => {
      const app = await buildApp({
        logger: false,
        autoBootstrap: true,
        serveStaticWeb: true,
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

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const app = await getReadyApp();
  app.server.emit('request', req, res);
}
