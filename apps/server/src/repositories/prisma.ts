import { PrismaClient } from '@prisma/client';

let prismaInstance: PrismaClient | null = null;

/**
 * Resolves a writable SQLite DATABASE_URL.
 * On Vercel Serverless (`process.env.VERCEL`), `/tmp` is the only writable directory,
 * so relative SQLite URLs automatically fall back to `file:/tmp/ai-dashboard.db`.
 */
export function resolveDatabaseUrl(): string {
  const configured = process.env.DATABASE_URL?.trim();
  if (process.env.VERCEL) {
    if (
      !configured ||
      !configured.startsWith('file:') ||
      configured.startsWith('file:./') ||
      configured.startsWith('file:dev.db')
    ) {
      return 'file:/tmp/ai-dashboard.db';
    }
  }
  if (!configured || !configured.startsWith('file:')) {
    return 'file:./dev.db';
  }
  return configured;
}

export function getPrismaClient(): PrismaClient {
  if (!prismaInstance) {
    const url = resolveDatabaseUrl();
    process.env.DATABASE_URL = url;
    prismaInstance = new PrismaClient({
      datasources: {
        db: { url },
      },
    });
  }
  return prismaInstance;
}

export async function disconnectPrisma(): Promise<void> {
  if (prismaInstance) {
    await prismaInstance.$disconnect();
    prismaInstance = null;
  }
}
