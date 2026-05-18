import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';
import { authorizeRole } from '../middleware/authorizeRole.js';
import { tierLimits } from '../middleware/tierLimits.js';
import { submitTransaction } from '../services/TransactionService.js';
import { pool } from '../db/pool.js';

export async function transactionRoutes(app: FastifyInstance) {
  // POST /transactions
  app.post('/transactions', {
    preHandler: [authenticate, authorizeRole(['Admin', 'Keeper']), tierLimits],
  }, async (req, reply) => {
    const { user } = req;
    const result = await submitTransaction(
      user.tenantId,
      user.sub,
      user.email,
      user.role,
      user.storeCode,
      req.body as any
    );
    const status = result.success ? 201 : result.requiresConfirmation ? 200 : 422;
    reply.code(status).send(result);
  });

  // GET /transactions
  app.get<{
    Querystring: {
      location?: string; txnType?: string; itemCode?: string;
      dateFrom?: string; dateTo?: string; limit?: string; offset?: string;
    };
  }>('/transactions', {
    preHandler: [authenticate],
  }, async (req, reply) => {
    const { user }   = req;
    const { location, txnType, itemCode, dateFrom, dateTo, limit = '100', offset = '0' } = req.query;

    const conditions: string[] = ['tenant_id=$1'];
    const params: unknown[]    = [user.tenantId];
    let p = 2;

    // Keeper auto-scoped
    const loc = user.role === 'Keeper' ? user.storeCode : location;
    if (loc)      { conditions.push(`location_code=$${p++}`); params.push(loc); }
    if (txnType)  { conditions.push(`txn_type=$${p++}`); params.push(txnType); }
    if (itemCode) { conditions.push(`item_code=$${p++}`); params.push(itemCode.toUpperCase()); }
    if (dateFrom) { conditions.push(`txn_date>=$${p++}`); params.push(dateFrom); }
    if (dateTo)   { conditions.push(`txn_date<=$${p++}`); params.push(dateTo); }

    const sql = `
      SELECT * FROM stock_movement
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT $${p++} OFFSET $${p++}`;
    params.push(Math.min(Number(limit), 1000), Number(offset));

    await pool.query(`SET LOCAL app.tenant_id = '${user.tenantId}'`);
    const { rows } = await pool.query(sql, params);
    reply.send(rows);
  });
}
