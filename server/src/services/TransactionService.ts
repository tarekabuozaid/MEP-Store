import pg from 'pg';
import { pool } from '../db/pool.js';
import { log } from './AuditService.js';
import { incrementTxnCount } from '../middleware/tierLimits.js';

export interface TxnLine {
  itemCode: string;
  qty:      number;
}

export interface TxnPayload {
  txnType:       'Receipt' | 'Issuance' | 'Adjustment' | 'Transfer';
  date:          string;
  sourceLocation: string;
  destLocation?:  string;
  lpo?:          string;
  supplier?:     string;
  requester?:    string;
  receiver?:     string;
  notes?:        string;
  lines:         TxnLine[];
  confirmNegativeAdjustment?: boolean;
}

export interface TxnResult {
  success:              boolean;
  txnId?:              string;
  rowsWritten?:        number;
  errors:              string[];
  warnings:            string[];
  requiresConfirmation?: boolean;
}

const PREFIXES: Record<string, string> = {
  Receipt: 'REC', Issuance: 'ISS', Adjustment: 'ADJ', Transfer: 'TRF',
};

async function generateTxnId(client: pg.PoolClient, tenantId: string, txnType: string): Promise<string> {
  const prefix = PREFIXES[txnType];
  const year   = new Date().getFullYear();
  const { rows } = await client.query(
    `INSERT INTO txn_counters (tenant_id, prefix, year, last_seq)
     VALUES ($1,$2,$3,1)
     ON CONFLICT (tenant_id, prefix, year)
     DO UPDATE SET last_seq = txn_counters.last_seq + 1
     RETURNING last_seq`,
    [tenantId, prefix, year]
  );
  return `${prefix}-${year}-${String(rows[0].last_seq).padStart(4, '0')}`;
}

export async function submitTransaction(
  tenantId:   string,
  userId:     string,
  userEmail:  string,
  userRole:   string,
  userStore:  string | null,
  payload:    TxnPayload
): Promise<TxnResult> {
  const errors: string[]   = [];
  const warnings: string[] = [];

  // ── Authorization ──────────────────────────────────────────────────────────
  if (userRole === 'Viewer') {
    return { success: false, errors: ['صلاحية القراءة فقط — لا يمكن إدخال معاملات'], warnings: [] };
  }
  if (userRole === 'Keeper' && userStore !== payload.sourceLocation) {
    return { success: false, errors: [`غير مصرح لك بالوصول لمخزن ${payload.sourceLocation}`], warnings: [] };
  }

  // ── Header validation ──────────────────────────────────────────────────────
  if (!payload.txnType || !['Receipt','Issuance','Adjustment','Transfer'].includes(payload.txnType)) {
    errors.push('نوع المعاملة غير صالح');
  }
  if (!payload.date) errors.push('التاريخ مطلوب');
  if (!payload.sourceLocation) errors.push('المخزن مطلوب');
  if (payload.txnType === 'Transfer' && !payload.destLocation) {
    errors.push('مخزن الوجهة مطلوب للتحويل');
  }
  if (payload.txnType === 'Transfer' && payload.destLocation === payload.sourceLocation) {
    errors.push('مخزن الوجهة يجب أن يختلف عن المصدر');
  }
  if (!payload.lines?.length) errors.push('أضف صنفاً واحداً على الأقل');
  if (errors.length) return { success: false, errors, warnings };

  // Warn on old date
  const txnDate = new Date(payload.date);
  const daysDiff = Math.abs((Date.now() - txnDate.getTime()) / 86_400_000);
  if (daysDiff > 30) warnings.push(`تاريخ المعاملة قديم (${Math.round(daysDiff)} يوم)`);

  // Filter empty lines, merge duplicates
  const merged = new Map<string, number>();
  for (const line of payload.lines) {
    if (!line.itemCode || !line.qty) continue;
    const code = line.itemCode.toUpperCase();
    merged.set(code, (merged.get(code) ?? 0) + line.qty);
  }
  if (!merged.size) return { success: false, errors: ['لا يوجد أصناف صالحة'], warnings };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL app.tenant_id = '${tenantId}'`);

    // ── Validate locations exist ───────────────────────────────────────────
    const { rows: srcRows } = await client.query(
      'SELECT 1 FROM locations WHERE tenant_id=$1 AND store_code=$2 AND is_active=TRUE AND deleted_at IS NULL',
      [tenantId, payload.sourceLocation]
    );
    if (!srcRows.length) {
      await client.query('ROLLBACK');
      return { success: false, errors: [`المخزن ${payload.sourceLocation} غير موجود`], warnings };
    }

    // ── Balance checks for Issuance/Transfer (with row-level lock) ─────────
    if (payload.txnType === 'Issuance' || payload.txnType === 'Transfer') {
      for (const [code, qty] of merged) {
        const { rows } = await client.query(
          `SELECT balance FROM stock_balances
           WHERE tenant_id=$1 AND item_code=$2 AND location_code=$3
           FOR UPDATE`,
          [tenantId, code, payload.sourceLocation]
        );
        const balance = rows[0]?.balance ?? 0;
        if (balance < qty) {
          errors.push(`${code}: الرصيد المتاح ${balance} < المطلوب ${qty}`);
        }
      }
      if (errors.length) {
        await client.query('ROLLBACK');
        return { success: false, errors, warnings };
      }
    }

    // ── Adjustment negative-balance confirmation ────────────────────────────
    if (payload.txnType === 'Adjustment' && !payload.confirmNegativeAdjustment) {
      for (const [code, qty] of merged) {
        const { rows } = await client.query(
          'SELECT balance FROM stock_balances WHERE tenant_id=$1 AND item_code=$2 AND location_code=$3',
          [tenantId, code, payload.sourceLocation]
        );
        const balance = rows[0]?.balance ?? 0;
        if (balance + qty < 0) {
          warnings.push(`${code}: التسوية ستجعل الرصيد سالباً (${balance + qty})`);
        }
      }
      if (warnings.length) {
        await client.query('ROLLBACK');
        return { success: false, requiresConfirmation: true, errors: [], warnings };
      }
    }

    // ── Generate TxnID (inside lock) ───────────────────────────────────────
    const txnId = await generateTxnId(client, tenantId, payload.txnType);

    // ── Fetch item snapshots ───────────────────────────────────────────────
    const codes = [...merged.keys()];
    const { rows: itemRows } = await client.query(
      `SELECT item_code, item_name, unit, min_stock FROM master_items
       WHERE tenant_id=$1 AND item_code = ANY($2) AND deleted_at IS NULL`,
      [tenantId, codes]
    );
    const itemMap = new Map(itemRows.map((r: any) => [r.item_code, r]));

    // ── Write rows ─────────────────────────────────────────────────────────
    let rowsWritten = 0;
    const isTransfer = payload.txnType === 'Transfer';

    for (const [code, qty] of merged) {
      const item = itemMap.get(code) as any;
      const itemName = item?.item_name ?? code;
      const unit     = item?.unit ?? 'وحدة';
      const minStock = item?.min_stock ?? 0;

      const insertSql = `
        INSERT INTO stock_movement
          (tenant_id, txn_id, txn_date, txn_type, txn_suffix,
           item_code, item_name, unit, qty, location_code,
           lpo, supplier, requester, receiver, notes, user_email)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`;

      if (isTransfer) {
        // OUT row
        await client.query(insertSql, [
          tenantId, `${txnId}-OUT`, payload.date, 'Transfer', 'OUT',
          code, itemName, unit, qty, payload.sourceLocation,
          payload.lpo, payload.supplier, payload.requester, payload.receiver, payload.notes, userEmail,
        ]);
        // IN row
        await client.query(insertSql, [
          tenantId, `${txnId}-IN`, payload.date, 'Transfer', 'IN',
          code, itemName, unit, qty, payload.destLocation!,
          payload.lpo, payload.supplier, payload.requester, payload.receiver, payload.notes, userEmail,
        ]);
        rowsWritten += 2;
      } else {
        await client.query(insertSql, [
          tenantId, txnId, payload.date, payload.txnType, null,
          code, itemName, unit, qty, payload.sourceLocation,
          payload.lpo, payload.supplier, payload.requester, payload.receiver, payload.notes, userEmail,
        ]);
        rowsWritten += 1;

        // MinStock warning
        if (item && (payload.txnType === 'Issuance') && minStock > 0) {
          const newBal = (item.balance ?? qty) - qty;
          if (newBal < minStock) {
            warnings.push(`${code}: الرصيد سيصبح ${newBal} أقل من الحد الأدنى ${minStock}`);
          }
        }
      }
    }

    await client.query('COMMIT');

    // Audit + txn count (non-blocking)
    log({
      tenantId, actorId: userId, actorEmail: userEmail,
      action: 'TRANSACTION_SUBMITTED', entity: 'stock_movement', entityId: txnId,
      details: { txnType: payload.txnType, location: payload.sourceLocation, rowsWritten },
    }).catch(() => {});
    incrementTxnCount(tenantId).catch(() => {});

    return { success: true, txnId, rowsWritten, errors: [], warnings };
  } catch (err: any) {
    await client.query('ROLLBACK');
    return { success: false, errors: [err.message ?? 'خطأ في الخادم'], warnings };
  } finally {
    client.release();
  }
}
