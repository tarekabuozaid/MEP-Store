import type { FastifyInstance } from 'fastify';
import { loginWithPassword, rotateRefreshToken } from '../services/AuthService.js';
import { authenticate } from '../middleware/authenticate.js';

export async function authRoutes(app: FastifyInstance) {
  // POST /auth/login
  app.post<{
    Body: { tenantSlug: string; email: string; password: string };
  }>('/auth/login', async (req, reply) => {
    const { tenantSlug, email, password } = req.body;
    if (!tenantSlug || !email || !password) {
      return reply.code(400).send({ error: 'MISSING_FIELDS' });
    }
    const result = await loginWithPassword(tenantSlug, email, password);
    if (!result) {
      return reply.code(401).send({ error: 'INVALID_CREDENTIALS' });
    }
    reply
      .setCookie('mep_refresh', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 30 * 24 * 60 * 60,
        path: '/api/v1/auth/refresh',
      })
      .send({ accessToken: result.accessToken, user: result.user });
  });

  // POST /auth/refresh
  app.post('/auth/refresh', async (req, reply) => {
    const rawToken = (req.cookies as any)?.mep_refresh;
    if (!rawToken) return reply.code(401).send({ error: 'NO_REFRESH_TOKEN' });
    const result = await rotateRefreshToken(rawToken);
    if (!result) return reply.code(401).send({ error: 'INVALID_REFRESH_TOKEN' });
    reply
      .setCookie('mep_refresh', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 30 * 24 * 60 * 60,
        path: '/api/v1/auth/refresh',
      })
      .send({ accessToken: result.accessToken });
  });

  // POST /auth/logout
  app.post('/auth/logout', { preHandler: [authenticate] }, async (req, reply) => {
    reply.clearCookie('mep_refresh', { path: '/api/v1/auth/refresh' });
    reply.send({ ok: true });
  });

  // GET /auth/me
  app.get('/auth/me', { preHandler: [authenticate] }, async (req, reply) => {
    reply.send(req.user);
  });
}
