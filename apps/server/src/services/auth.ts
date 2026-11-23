import type { FastifyRequest } from 'fastify';
import type { UserIdentity } from '@ai-dashboard/contracts';

export type AuthResolver = (request: FastifyRequest) => UserIdentity | null;

/**
 * Trusted server-side demo identity resolver.
 * IMPORTANT: Never trusts client-supplied ownerId in request body or query params.
 */
export function createDefaultAuthResolver(): AuthResolver {
  return (_request: FastifyRequest): UserIdentity => {
    const id = process.env.DEMO_USER_ID || 'demo-analyst-01';
    const name = process.env.DEMO_USER_NAME || 'BI Analyst';
    const roles = (process.env.DEMO_USER_ROLES || 'viewer,editor,ads:read')
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean);

    return { id, name, roles };
  };
}
