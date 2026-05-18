import type { FastifyRequest, FastifyReply } from 'fastify';
import { pool } from '../db/pool.js';

/** Sets PostgreSQL session variable so RLS policies activate for this tenant */
export async function tenantContext(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user?.tenantId) return;
  const client = (request as any)._pgClient;
  if (client) {
    await client.query(`SET LOCAL app.tenant_id = '${request.user.tenantId}'`);
  }
}
