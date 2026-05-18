import 'dotenv/config';
import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyCookie from '@fastify/cookie';

import { authRoutes }        from './routes/auth.js';
import { transactionRoutes } from './routes/transactions.js';
import { stockRoutes }       from './routes/stock.js';
import { adminRoutes }       from './routes/admin.js';
import { reportRoutes }      from './routes/reports.js';
import { tenantRoutes }      from './routes/tenant.js';
import { paddleWebhook }     from './routes/webhooks/paddle.js';

const app = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  },
});

// CORS
await app.register(fastifyCors, {
  origin: [
    process.env.FRONTEND_URL ?? 'http://localhost:5173',
    'https://mepstore.vercel.app',
  ],
  credentials: true,
});

// Cookies (for refresh token)
await app.register(fastifyCookie);

// Health check (Railway requires this)
app.get('/health', () => ({ status: 'ok', ts: new Date().toISOString() }));

// API Routes
app.register(authRoutes,        { prefix: '/api/v1' });
app.register(tenantRoutes,      { prefix: '/api/v1' });
app.register(transactionRoutes, { prefix: '/api/v1' });
app.register(stockRoutes,       { prefix: '/api/v1' });
app.register(adminRoutes,       { prefix: '/api/v1' });
app.register(reportRoutes,      { prefix: '/api/v1' });
app.register(paddleWebhook,     { prefix: '/api/v1/webhooks' });

// Global error handler
app.setErrorHandler((error, _req, reply) => {
  app.log.error(error);
  const status = error.statusCode ?? 500;
  reply.code(status).send({
    error: error.message ?? 'INTERNAL_SERVER_ERROR',
  });
});

const port = Number(process.env.PORT) || 3000;
await app.listen({ port, host: '0.0.0.0' });
app.log.info(`MEP Store API running on port ${port}`);
