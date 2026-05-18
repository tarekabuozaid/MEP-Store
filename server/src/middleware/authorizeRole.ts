import type { FastifyRequest, FastifyReply } from 'fastify';
import type { JWTPayload } from './authenticate.js';

type Role = 'Admin' | 'Keeper' | 'Viewer';

export function authorizeRole(allowed: Role[]) {
  return async function (request: FastifyRequest, reply: FastifyReply) {
    if (!allowed.includes(request.user.role)) {
      return reply.code(403).send({ error: 'FORBIDDEN', required: allowed });
    }
  };
}

export function authorizeStore(locationCode: string, user: JWTPayload): boolean {
  if (user.role === 'Admin') return true;
  return user.storeCode === locationCode;
}
