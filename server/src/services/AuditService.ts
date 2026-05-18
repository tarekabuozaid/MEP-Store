import { pool } from '../db/pool.js';

export interface AuditEntry {
  tenantId:   string;
  actorId?:   string;
  actorEmail: string;
  action:     string;
  entity?:    string;
  entityId?:  string;
  oldValue?:  Record<string, unknown>;
  newValue?:  Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  details?:   Record<string, unknown>;
}

export async function log(entry: AuditEntry): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO audit_log
         (tenant_id, actor_id, actor_email, action, entity, entity_id,
          old_value, new_value, ip_address, user_agent, request_id, details)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::INET,$10,$11::UUID,$12)`,
      [
        entry.tenantId,
        entry.actorId   ?? null,
        entry.actorEmail,
        entry.action,
        entry.entity    ?? null,
        entry.entityId  ?? null,
        entry.oldValue  ? JSON.stringify(entry.oldValue)  : null,
        entry.newValue  ? JSON.stringify(entry.newValue)  : null,
        entry.ipAddress ?? null,
        entry.userAgent ?? null,
        entry.requestId ?? null,
        entry.details   ? JSON.stringify(entry.details)   : null,
      ]
    );
  } catch {
    // Audit failures must never block transactions
  }
}
