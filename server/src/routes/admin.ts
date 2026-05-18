import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';
import { authorizeRole } from '../middleware/authorizeRole.js';
import { hashPassword } from '../services/AuthService.js';
import { log } from '../services/AuditService.js';
import { pool } from '../db/pool.js';

export async function adminRoutes(app: FastifyInstance) {
  const adminOnly = { preHandler: [authenticate, authorizeRole(['Admin'])] };
  const tid = (req: any) => req.user.tenantId;
  const rls = (tenantId: string) => pool.query(`SET LOCAL app.tenant_id = '${tenantId}'`);

  // ── USERS ──────────────────────────────────────────────────────────────────
  app.get('/admin/users', adminOnly, async (req, reply) => {
    await rls(tid(req));
    const { rows } = await pool.query(
      `SELECT id, email, full_name, role, store_code, is_active, created_at
       FROM users WHERE tenant_id=$1 AND deleted_at IS NULL ORDER BY created_at`,
      [tid(req)]
    );
    reply.send(rows);
  });

  app.post<{ Body: { email: string; password: string; fullName?: string; role: string; storeCode?: string } }>(
    '/admin/users', adminOnly, async (req, reply) => {
      const { email, password, fullName, role, storeCode } = req.body;
      if (!['Admin','Keeper','Viewer'].includes(role)) {
        return reply.code(400).send({ error: 'INVALID_ROLE' });
      }
      const hash = await hashPassword(password);
      await rls(tid(req));
      try {
        const { rows: [user] } = await pool.query(
          `INSERT INTO users (tenant_id, email, password_hash, full_name, role, store_code)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, email, role`,
          [tid(req), email.toLowerCase(), hash, fullName ?? null, role, storeCode ?? null]
        );
        log({ tenantId: tid(req), actorId: req.user.sub, actorEmail: req.user.email,
              action: 'USER_ADDED', entity: 'users', entityId: user.id,
              newValue: { email, role, storeCode } });
        reply.code(201).send(user);
      } catch (e: any) {
        if (e.code === '23505') return reply.code(409).send({ error: 'EMAIL_EXISTS' });
        throw e;
      }
    }
  );

  app.patch<{ Params: { email: string }; Body: Record<string, unknown> }>(
    '/admin/users/:email', adminOnly, async (req, reply) => {
      const targetEmail = req.params.email.toLowerCase();
      const allowed = ['full_name', 'role', 'store_code', 'is_active'];
      const sets: string[] = [];
      const vals: unknown[] = [tid(req), targetEmail];
      let p = 3;
      for (const [k, v] of Object.entries(req.body)) {
        if (allowed.includes(k)) { sets.push(`${k}=$${p++}`); vals.push(v); }
      }
      if (!sets.length) return reply.code(400).send({ error: 'NO_VALID_FIELDS' });
      await rls(tid(req));
      await pool.query(
        `UPDATE users SET ${sets.join(',')}, updated_at=NOW()
         WHERE tenant_id=$1 AND email=$2 AND deleted_at IS NULL`,
        vals
      );
      log({ tenantId: tid(req), actorId: req.user.sub, actorEmail: req.user.email,
            action: 'USER_UPDATED', entity: 'users', entityId: targetEmail,
            newValue: req.body as any });
      reply.send({ ok: true });
    }
  );

  // ── ITEMS ──────────────────────────────────────────────────────────────────
  app.get('/admin/items', adminOnly, async (req, reply) => {
    await rls(tid(req));
    const { rows } = await pool.query(
      'SELECT * FROM master_items WHERE tenant_id=$1 ORDER BY item_code',
      [tid(req)]
    );
    reply.send(rows);
  });

  app.post<{ Body: { itemCode: string; itemName: string; unit: string; minStock?: number; category?: string } }>(
    '/admin/items', adminOnly, async (req, reply) => {
      const { itemCode, itemName, unit, minStock = 0, category } = req.body;
      await rls(tid(req));
      try {
        const { rows: [item] } = await pool.query(
          `INSERT INTO master_items (tenant_id, item_code, item_name, unit, min_stock, category)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, item_code`,
          [tid(req), itemCode.toUpperCase(), itemName, unit, minStock, category ?? null]
        );
        reply.code(201).send(item);
      } catch (e: any) {
        if (e.code === '23505') return reply.code(409).send({ error: 'ITEM_CODE_EXISTS' });
        throw e;
      }
    }
  );

  app.patch<{ Params: { itemCode: string }; Body: Record<string, unknown> }>(
    '/admin/items/:itemCode', adminOnly, async (req, reply) => {
      const allowed = ['item_name', 'item_name_ar', 'unit', 'min_stock', 'category', 'is_active'];
      const sets: string[] = [];
      const vals: unknown[] = [tid(req), req.params.itemCode.toUpperCase()];
      let p = 3;
      for (const [k, v] of Object.entries(req.body)) {
        if (allowed.includes(k)) { sets.push(`${k}=$${p++}`); vals.push(v); }
      }
      if (!sets.length) return reply.code(400).send({ error: 'NO_VALID_FIELDS' });
      await rls(tid(req));
      await pool.query(
        `UPDATE master_items SET ${sets.join(',')}, updated_at=NOW()
         WHERE tenant_id=$1 AND item_code=$2 AND deleted_at IS NULL`,
        vals
      );
      reply.send({ ok: true });
    }
  );

  // ── LOCATIONS ──────────────────────────────────────────────────────────────
  app.get('/admin/locations', adminOnly, async (req, reply) => {
    await rls(tid(req));
    const { rows } = await pool.query(
      'SELECT * FROM locations WHERE tenant_id=$1 ORDER BY store_code',
      [tid(req)]
    );
    reply.send(rows);
  });

  app.post<{ Body: { storeCode: string; storeName: string; storeNameAr?: string } }>(
    '/admin/locations', adminOnly, async (req, reply) => {
      const { storeCode, storeName, storeNameAr } = req.body;
      await rls(tid(req));
      try {
        const { rows: [loc] } = await pool.query(
          `INSERT INTO locations (tenant_id, store_code, store_name, store_name_ar)
           VALUES ($1,$2,$3,$4) RETURNING id, store_code`,
          [tid(req), storeCode.toUpperCase(), storeName, storeNameAr ?? null]
        );
        reply.code(201).send(loc);
      } catch (e: any) {
        if (e.code === '23505') return reply.code(409).send({ error: 'STORE_CODE_EXISTS' });
        throw e;
      }
    }
  );

  app.patch<{ Params: { storeCode: string }; Body: Record<string, unknown> }>(
    '/admin/locations/:storeCode', adminOnly, async (req, reply) => {
      const allowed = ['store_name', 'store_name_ar', 'is_active'];
      const sets: string[] = [];
      const vals: unknown[] = [tid(req), req.params.storeCode.toUpperCase()];
      let p = 3;
      for (const [k, v] of Object.entries(req.body)) {
        if (allowed.includes(k)) { sets.push(`${k}=$${p++}`); vals.push(v); }
      }
      if (!sets.length) return reply.code(400).send({ error: 'NO_VALID_FIELDS' });
      await rls(tid(req));
      await pool.query(
        `UPDATE locations SET ${sets.join(',')}, updated_at=NOW()
         WHERE tenant_id=$1 AND store_code=$2 AND deleted_at IS NULL`,
        vals
      );
      reply.send({ ok: true });
    }
  );
}
