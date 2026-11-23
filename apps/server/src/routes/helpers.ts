import type { FastifyReply } from 'fastify';
import type { ApiErrorResponse, ApiSuccessResponse } from '@ai-dashboard/contracts';

export function sendOk<T>(reply: FastifyReply, data: T, statusCode = 200) {
  const payload: ApiSuccessResponse<T> = { ok: true, data };
  return reply.code(statusCode).send(payload);
}

export function sendError(
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string,
  details?: unknown,
) {
  const payload: ApiErrorResponse = {
    ok: false,
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
  };
  return reply.code(statusCode).send(payload);
}
