import { pool, withTenant } from '../db/pool.js';
import { hashPassword, signAccessToken, issueRefreshToken } from './AuthService.js';
import { sendWelcomeEmail } from './EmailService.js';

const PREFIXES = ['REC', 'ISS', 'ADJ', 'TRF'];
const YEAR = new Date().getFullYear();

function makeSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 30);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}-${suffix}`;
}

export interface RegisterInput {
  companyName: string;
  email: string;
  password: string;
  lang?: 'ar' | 'en';
}

export async function registerTenant(input: RegisterInput) {
  const slug         = makeSlug(input.companyName);
  const passwordHash = await hashPassword(input.password);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Create tenant
    const { rows: [tenant] } = await client.query(
      `INSERT INTO tenants (slug, company_name, plan, demo_expires_at)
       VALUES ($1, $2, 'demo', NOW() + INTERVAL '30 days')
       RETURNING id, slug`,
      [slug, input.companyName]
    );

    const tenantId: string = tenant.id;

    // 2. Set RLS context for seeding
    await client.query(`SET LOCAL app.tenant_id = '${tenantId}'`);

    // 3. Create first Admin user
    const { rows: [user] } = await client.query(
      `INSERT INTO users (tenant_id, email, password_hash, role, is_active)
       VALUES ($1, $2, $3, 'Admin', TRUE)
       RETURNING id, email, role, store_code, full_name`,
      [tenantId, input.email.toLowerCase().trim(), passwordHash]
    );

    // 4. Seed default location
    await client.query(
      `INSERT INTO locations (tenant_id, store_code, store_name, is_active)
       VALUES ($1, 'MAIN', 'المخزن الرئيسي', TRUE)`,
      [tenantId]
    );

    // 5. Seed txn counters
    for (const prefix of PREFIXES) {
      await client.query(
        'INSERT INTO txn_counters (tenant_id, prefix, year, last_seq) VALUES ($1,$2,$3,0)',
        [tenantId, prefix, YEAR]
      );
    }

    await client.query('COMMIT');

    // 6. Issue tokens
    const userRecord = {
      id:        user.id,
      tenantId,
      email:     user.email,
      fullName:  user.full_name,
      role:      user.role as 'Admin',
      storeCode: user.store_code,
    };

    const [accessToken, refreshToken] = await Promise.all([
      signAccessToken(userRecord),
      issueRefreshToken(user.id, tenantId),
    ]);

    // 7. Welcome email (non-blocking)
    sendWelcomeEmail(input.email, input.companyName, slug).catch(() => {});

    return { accessToken, refreshToken, tenant: { id: tenantId, slug }, user: userRecord };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getTenantUsage(tenantId: string) {
  const [tenantRes, userCount, storeCount] = await Promise.all([
    pool.query(
      'SELECT plan, demo_expires_at, txn_count_month, txn_month_reset FROM tenants WHERE id=$1',
      [tenantId]
    ),
    pool.query(
      'SELECT COUNT(*) FROM users WHERE tenant_id=$1 AND is_active=TRUE AND deleted_at IS NULL',
      [tenantId]
    ),
    pool.query(
      'SELECT COUNT(*) FROM locations WHERE tenant_id=$1 AND is_active=TRUE AND deleted_at IS NULL',
      [tenantId]
    ),
  ]);

  const tenant = tenantRes.rows[0];
  return {
    plan:          tenant.plan,
    demoExpiresAt: tenant.demo_expires_at,
    txnCount:      tenant.txn_count_month,
    userCount:     Number(userCount.rows[0].count),
    storeCount:    Number(storeCount.rows[0].count),
  };
}

export async function upgradeTenantPlan(
  paddleCustomerId: string,
  paddleSubId: string,
  plan: 'starter' | 'pro',
  customerEmail: string
): Promise<void> {
  await pool.query(
    `UPDATE tenants SET
       plan=$1, paddle_customer_id=$2, paddle_sub_id=$3,
       demo_expires_at = NULL, updated_at=NOW()
     WHERE paddle_customer_id=$2
        OR id=(SELECT tenant_id FROM users WHERE email=$4 LIMIT 1)`,
    [plan, paddleCustomerId, paddleSubId, customerEmail]
  );
}

export async function cancelTenantPlan(paddleSubId: string): Promise<void> {
  await pool.query(
    `UPDATE tenants SET
       plan='demo', demo_expires_at=NOW()+INTERVAL '7 days', updated_at=NOW()
     WHERE paddle_sub_id=$1`,
    [paddleSubId]
  );
}
