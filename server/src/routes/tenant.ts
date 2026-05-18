import type { FastifyInstance } from 'fastify';
import { registerTenant, getTenantUsage } from '../services/TenantService.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorizeRole } from '../middleware/authorizeRole.js';

export async function tenantRoutes(app: FastifyInstance) {
  // POST /tenant/register — public, no auth
  app.post<{
    Body: { companyName: string; email: string; password: string; lang?: 'ar' | 'en' };
  }>('/tenant/register', async (req, reply) => {
    const { companyName, email, password } = req.body;
    if (!companyName?.trim() || !email?.trim() || !password) {
      return reply.code(400).send({ error: 'MISSING_FIELDS', required: ['companyName', 'email', 'password'] });
    }
    if (password.length < 8) {
      return reply.code(400).send({ error: 'PASSWORD_TOO_SHORT', message: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' });
    }
    try {
      const result = await registerTenant(req.body);
      reply.code(201).send(result);
    } catch (err: any) {
      if (err.code === '23505') {
        return reply.code(409).send({ error: 'EMAIL_EXISTS', message: 'البريد الإلكتروني مسجل مسبقاً' });
      }
      throw err;
    }
  });

  // GET /tenant/usage — Admin only
  app.get('/tenant/usage', {
    preHandler: [authenticate, authorizeRole(['Admin'])],
  }, async (req, reply) => {
    const usage = await getTenantUsage(req.user.tenantId);
    reply.send(usage);
  });

  // GET /tenant — Admin only
  app.get('/tenant', {
    preHandler: [authenticate, authorizeRole(['Admin'])],
  }, async (req, reply) => {
    const { rows } = await import('../db/pool.js').then(m =>
      m.pool.query('SELECT id, slug, company_name, plan, demo_expires_at, created_at FROM tenants WHERE id=$1',
        [req.user.tenantId])
    );
    reply.send(rows[0] ?? null);
  });
}
