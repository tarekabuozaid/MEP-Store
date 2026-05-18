import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';
import { pool } from '../db/pool.js';

export async function stockRoutes(app: FastifyInstance) {
  const setRLS = (tenantId: string) =>
    pool.query(`SET LOCAL app.tenant_id = '${tenantId}'`);

  // GET /stock/items
  app.get('/stock/items', { preHandler: [authenticate] }, async (req, reply) => {
    await setRLS(req.user.tenantId);
    const { rows } = await pool.query(
      `SELECT item_code, item_name, item_name_ar, unit, min_stock, category, is_active
       FROM master_items WHERE tenant_id=$1 AND deleted_at IS NULL ORDER BY item_code`,
      [req.user.tenantId]
    );
    reply.send(rows);
  });

  // GET /stock/locations
  app.get('/stock/locations', { preHandler: [authenticate] }, async (req, reply) => {
    await setRLS(req.user.tenantId);
    const { rows } = await pool.query(
      `SELECT store_code, store_name, store_name_ar, is_active
       FROM locations WHERE tenant_id=$1 AND deleted_at IS NULL ORDER BY store_code`,
      [req.user.tenantId]
    );
    reply.send(rows);
  });

  // GET /stock/balance?itemCode=X&location=Y
  app.get<{ Querystring: { itemCode?: string; location?: string } }>(
    '/stock/balance', { preHandler: [authenticate] }, async (req, reply) => {
      await setRLS(req.user.tenantId);
      const { itemCode, location } = req.query;
      if (!itemCode || !location) {
        return reply.code(400).send({ error: 'itemCode and location required' });
      }
      const { rows } = await pool.query(
        'SELECT balance FROM stock_balances WHERE tenant_id=$1 AND item_code=$2 AND location_code=$3',
        [req.user.tenantId, itemCode.toUpperCase(), location]
      );
      reply.send({ itemCode, location, balance: rows[0]?.balance ?? 0 });
    }
  );

  // GET /stock — current inventory (with status: OK/LOW/ZERO)
  app.get<{ Querystring: { location?: string } }>(
    '/stock', { preHandler: [authenticate] }, async (req, reply) => {
      await setRLS(req.user.tenantId);
      const location = req.user.role === 'Keeper' ? req.user.storeCode : req.query.location;

      const conditions = ['b.tenant_id=$1'];
      const params: unknown[] = [req.user.tenantId];
      if (location) { conditions.push('b.location_code=$2'); params.push(location); }

      const { rows } = await pool.query(
        `SELECT b.item_code, b.location_code, b.balance,
                i.item_name, i.item_name_ar, i.unit, i.min_stock, i.category,
                CASE
                  WHEN b.balance <= 0 THEN 'ZERO'
                  WHEN i.min_stock > 0 AND b.balance < i.min_stock THEN 'LOW'
                  ELSE 'OK'
                END AS status
         FROM stock_balances b
         JOIN master_items i USING (tenant_id, item_code)
         WHERE ${conditions.join(' AND ')} AND i.deleted_at IS NULL
         ORDER BY b.location_code, b.item_code`,
        params
      );
      reply.send(rows);
    }
  );
}
