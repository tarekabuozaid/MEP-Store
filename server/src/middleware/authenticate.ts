import type { FastifyRequest, FastifyReply } from 'fastify';
import { jwtVerify } from 'jose';

export interface JWTPayload {
  sub: string;
  tenantId: string;
  email: string;
  role: 'Admin' | 'Keeper' | 'Viewer';
  storeCode: string | null;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: JWTPayload;
  }
}

const secret = new TextEncoder().encode(process.env.JWT_SECRET!);

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const auth = request.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'MISSING_TOKEN' });
  }
  try {
    const { payload } = await jwtVerify(auth.slice(7), secret);
    request.user = payload as unknown as JWTPayload;
  } catch {
    return reply.code(401).send({ error: 'INVALID_TOKEN' });
  }
}
