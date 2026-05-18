import bcrypt from 'bcrypt';
import { SignJWT, jwtVerify } from 'jose';
import crypto from 'crypto';
import { pool } from '../db/pool.js';

const accessSecret  = new TextEncoder().encode(process.env.JWT_SECRET!);
const refreshSecret = new TextEncoder().encode(process.env.JWT_REFRESH_SECRET!);

export interface UserRecord {
  id: string;
  tenantId: string;
  email: string;
  fullName: string | null;
  role: 'Admin' | 'Keeper' | 'Viewer';
  storeCode: string | null;
}

export async function signAccessToken(user: UserRecord): Promise<string> {
  return new SignJWT({
    tenantId:  user.tenantId,
    email:     user.email,
    role:      user.role,
    storeCode: user.storeCode,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(accessSecret);
}

export async function issueRefreshToken(userId: string, tenantId: string): Promise<string> {
  const token     = crypto.randomBytes(32).toString('hex');
  const tokenHash = await bcrypt.hash(token, 10);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await pool.query(
    'INSERT INTO refresh_tokens (user_id, tenant_id, token_hash, expires_at) VALUES ($1,$2,$3,$4)',
    [userId, tenantId, tokenHash, expiresAt]
  );
  return token;
}

export async function loginWithPassword(
  tenantSlug: string,
  email: string,
  password: string
): Promise<{ accessToken: string; refreshToken: string; user: UserRecord } | null> {
  const { rows: tenantRows } = await pool.query(
    'SELECT id FROM tenants WHERE slug=$1 AND is_active=TRUE',
    [tenantSlug]
  );
  if (!tenantRows[0]) return null;
  const tenantId = tenantRows[0].id;

  const { rows } = await pool.query(
    `SELECT id, email, password_hash, full_name, role, store_code
     FROM users WHERE tenant_id=$1 AND email=$2 AND is_active=TRUE AND deleted_at IS NULL`,
    [tenantId, email.toLowerCase().trim()]
  );
  const user = rows[0];
  if (!user || !user.password_hash) return null;

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) return null;

  await pool.query('UPDATE users SET last_login_at=NOW() WHERE id=$1', [user.id]);

  const userRecord: UserRecord = {
    id:        user.id,
    tenantId,
    email:     user.email,
    fullName:  user.full_name,
    role:      user.role,
    storeCode: user.store_code,
  };

  return {
    accessToken:  await signAccessToken(userRecord),
    refreshToken: await issueRefreshToken(user.id, tenantId),
    user:         userRecord,
  };
}

export async function rotateRefreshToken(
  rawToken: string
): Promise<{ accessToken: string; refreshToken: string } | null> {
  const { rows } = await pool.query(
    `SELECT rt.id, rt.user_id, rt.tenant_id, rt.token_hash, rt.expires_at,
            u.email, u.role, u.store_code, u.full_name, u.is_active
     FROM refresh_tokens rt
     JOIN users u ON u.id = rt.user_id
     WHERE rt.revoked_at IS NULL AND rt.expires_at > NOW()
     ORDER BY rt.created_at DESC`
  );

  for (const row of rows) {
    const match = await bcrypt.compare(rawToken, row.token_hash);
    if (!match) continue;
    if (!row.is_active) return null;

    // Revoke old token
    await pool.query('UPDATE refresh_tokens SET revoked_at=NOW() WHERE id=$1', [row.id]);

    const userRecord: UserRecord = {
      id:        row.user_id,
      tenantId:  row.tenant_id,
      email:     row.email,
      fullName:  row.full_name,
      role:      row.role,
      storeCode: row.store_code,
    };

    return {
      accessToken:  await signAccessToken(userRecord),
      refreshToken: await issueRefreshToken(row.user_id, row.tenant_id),
    };
  }
  return null;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}
