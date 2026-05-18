import type { FastifyRequest, FastifyReply } from 'fastify';
import { pool } from '../db/pool.js';

export const PLAN_LIMITS = {
  demo:    { txnsPerMonth: 100,  stores: 1, users: 3,  durationDays: 30 },
  starter: { txnsPerMonth: 1000, stores: 1, users: 5,  durationDays: null },
  pro:     { txnsPerMonth: null, stores: 5, users: 15, durationDays: null },
} as const;

function startOfCurrentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

/** Applied only to POST /transactions */
export async function tierLimits(request: FastifyRequest, reply: FastifyReply) {
  const { tenantId } = request.user;
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      'SELECT plan, demo_expires_at, txn_count_month, txn_month_reset FROM tenants WHERE id=$1',
      [tenantId]
    );
    if (!rows[0]) return reply.code(404).send({ error: 'TENANT_NOT_FOUND' });

    const tenant = rows[0];
    const plan = tenant.plan as keyof typeof PLAN_LIMITS;

    // ① Demo period expired
    if (plan === 'demo' && new Date(tenant.demo_expires_at) < new Date()) {
      return reply.code(402).send({
        error: 'DEMO_EXPIRED',
        message: 'انتهت فترة التجربة المجانية (30 يوم). اشترك للاستمرار.',
        upgradeUrl: `${process.env.FRONTEND_URL}/#pricing`,
      });
    }

    const limit = PLAN_LIMITS[plan].txnsPerMonth;
    if (limit !== null) {
      // Reset monthly counter if new month started
      if (tenant.txn_month_reset < startOfCurrentMonth()) {
        await client.query(
          'UPDATE tenants SET txn_count_month=0, txn_month_reset=$2 WHERE id=$1',
          [tenantId, startOfCurrentMonth()]
        );
        tenant.txn_count_month = 0;
      }

      // ② Monthly limit reached
      if (tenant.txn_count_month >= limit) {
        return reply.code(402).send({
          error: 'LIMIT_REACHED',
          message: `وصلت لحد ${limit} معاملة هذا الشهر. رقّي لباقة أعلى للاستمرار.`,
          used: tenant.txn_count_month,
          limit,
          upgradeUrl: `${process.env.FRONTEND_URL}/#pricing`,
        });
      }
    }
  } finally {
    client.release();
  }
}

/** Increment txn_count_month after a successful transaction */
export async function incrementTxnCount(tenantId: string): Promise<void> {
  await pool.query(
    'UPDATE tenants SET txn_count_month = txn_count_month + 1 WHERE id=$1',
    [tenantId]
  );
}
