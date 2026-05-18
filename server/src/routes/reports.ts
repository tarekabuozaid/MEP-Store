import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';
import { authorizeRole } from '../middleware/authorizeRole.js';
import { pool } from '../db/pool.js';

export async function reportRoutes(app: FastifyInstance) {
  const rls = (id: string) => pool.query(`SET LOCAL app.tenant_id = '${id}'`);

  // GET /reports/dashboard
  app.get('/reports/dashboard', {
    preHandler: [authenticate, authorizeRole(['Admin', 'Viewer'])],
  }, async (req, reply) => {
    const tid = req.user.tenantId;
    await rls(tid);

    const today = new Date().toISOString().slice(0, 10);

    const [todayRes, lowRes, recentRes, locRes] = await Promise.all([
      pool.query(
        `SELECT txn_type, COUNT(*) as count
         FROM stock_movement WHERE tenant_id=$1 AND txn_date=$2
         GROUP BY txn_type`,
        [tid, today]
      ),
      pool.query(
        `SELECT b.item_code, b.location_code, b.balance, i.item_name, i.unit, i.min_stock,
                CASE WHEN b.balance<=0 THEN 'ZERO' ELSE 'LOW' END as status
         FROM stock_balances b
         JOIN master_items i USING (tenant_id, item_code)
         WHERE b.tenant_id=$1 AND i.min_stock>0 AND b.balance<i.min_stock AND i.deleted_at IS NULL
         ORDER BY (b.balance/NULLIF(i.min_stock,0)) ASC LIMIT 20`,
        [tid]
      ),
      pool.query(
        `SELECT txn_id, txn_date, txn_type, location_code, item_code, item_name, qty, unit, user_email
         FROM stock_movement WHERE tenant_id=$1
         ORDER BY created_at DESC LIMIT 10`,
        [tid]
      ),
      pool.query(
        `SELECT l.store_code, l.store_name,
                COUNT(CASE WHEN b.balance>0 THEN 1 END)  as in_stock,
                COUNT(CASE WHEN b.balance<=0 THEN 1 END) as zero_stock,
                COUNT(CASE WHEN i.min_stock>0 AND b.balance<i.min_stock AND b.balance>0 THEN 1 END) as low_stock
         FROM locations l
         LEFT JOIN stock_balances b ON b.tenant_id=l.tenant_id AND b.location_code=l.store_code
         LEFT JOIN master_items i   ON i.tenant_id=l.tenant_id AND i.item_code=b.item_code AND i.deleted_at IS NULL
         WHERE l.tenant_id=$1 AND l.is_active=TRUE AND l.deleted_at IS NULL
         GROUP BY l.store_code, l.store_name`,
        [tid]
      ),
    ]);

    reply.send({
      todayByType:       todayRes.rows,
      lowStockItems:     lowRes.rows,
      recentTransactions: recentRes.rows,
      locationSummary:   locRes.rows,
    });
  });

  // GET /reports/keeper-kpis
  app.get('/reports/keeper-kpis', {
    preHandler: [authenticate, authorizeRole(['Admin', 'Keeper'])],
  }, async (req, reply) => {
    const { tenantId, storeCode } = req.user;
    await rls(tenantId);
    const { rows } = await pool.query(
      `SELECT
         COUNT(CASE WHEN b.balance>0 THEN 1 END)  as in_stock,
         COUNT(CASE WHEN b.balance<=0 THEN 1 END) as zero_stock,
         COUNT(CASE WHEN i.min_stock>0 AND b.balance<i.min_stock AND b.balance>0 THEN 1 END) as low_stock
       FROM stock_balances b
       JOIN master_items i USING (tenant_id, item_code)
       WHERE b.tenant_id=$1 AND b.location_code=$2 AND i.deleted_at IS NULL`,
      [tenantId, storeCode]
    );
    reply.send(rows[0] ?? {});
  });

  // GET /reports/ledger
  app.get<{
    Querystring: { location?: string; txnType?: string; dateFrom?: string; dateTo?: string; limit?: string; offset?: string };
  }>('/reports/ledger', { preHandler: [authenticate] }, async (req, reply) => {
    const { tenantId, role, storeCode } = req.user;
    await rls(tenantId);

    const conditions: string[] = ['tenant_id=$1'];
    const params: unknown[] = [tenantId];
    let p = 2;

    const loc = role === 'Keeper' ? storeCode : req.query.location;
    if (loc) { conditions.push(`location_code=$${p++}`); params.push(loc); }
    if (req.query.txnType) { conditions.push(`txn_type=$${p++}`); params.push(req.query.txnType); }
    if (req.query.dateFrom) { conditions.push(`txn_date>=$${p++}`); params.push(req.query.dateFrom); }
    if (req.query.dateTo)   { conditions.push(`txn_date<=$${p++}`); params.push(req.query.dateTo); }

    const { rows } = await pool.query(
      `SELECT * FROM stock_movement WHERE ${conditions.join(' AND ')}
       ORDER BY txn_date DESC, created_at DESC LIMIT $${p++} OFFSET $${p++}`,
      [...params, Math.min(Number(req.query.limit ?? 500), 1000), Number(req.query.offset ?? 0)]
    );
    reply.send(rows);
  });

  // GET /reports/audit-log
  app.get('/reports/audit-log', {
    preHandler: [authenticate, authorizeRole(['Admin'])],
  }, async (req, reply) => {
    const { rows } = await pool.query(
      `SELECT id, timestamp, actor_email, action, entity, entity_id, details, ip_address
       FROM audit_log WHERE tenant_id=$1 ORDER BY timestamp DESC LIMIT 500`,
      [req.user.tenantId]
    );
    reply.send(rows);
  });
}
