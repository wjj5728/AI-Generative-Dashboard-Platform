import 'dotenv/config';
import { buildApp } from './app.js';
import { disconnectPrisma } from './repositories/prisma.js';

const PORT = Number(process.env.PORT || 3001);
const HOST =
  process.env.HOST ||
  (process.env.NODE_ENV === 'production' || process.env.RENDER ? '0.0.0.0' : '127.0.0.1');

async function main() {
  const app = await buildApp({ logger: true });

  const shutdown = async () => {
    await app.close();
    await disconnectPrisma();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await app.listen({ port: PORT, host: HOST });
  console.log(`API server listening at http://${HOST}:${PORT}`);
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
