-- MEP-Store SaaS — PostgreSQL Schema
-- Compatible with Neon.tech (PostgreSQL 16)

-- ─── Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── TENANTS ─────────────────────────────────────────────────────────────────
CREATE TABLE tenants (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              TEXT UNIQUE NOT NULL,
  company_name      TEXT NOT NULL,
  company_name_ar   TEXT,
  plan              TEXT NOT NULL DEFAULT 'demo'
                    CHECK (plan IN ('demo','starter','pro')),
  demo_expires_at   TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days',
  txn_count_month   INT NOT NULL DEFAULT 0,
  txn_month_reset   DATE NOT NULL DEFAULT CURRENT_DATE,
  paddle_customer_id TEXT,
  paddle_sub_id      TEXT,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── LOCATIONS ────────────────────────────────────────────────────────────────
CREATE TABLE locations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  store_code    TEXT NOT NULL,
  store_name    TEXT NOT NULL,
  store_name_ar TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ,
  UNIQUE (tenant_id, store_code)
);
CREATE INDEX idx_locations_tenant ON locations(tenant_id) WHERE deleted_at IS NULL;

-- ─── MASTER_ITEMS ─────────────────────────────────────────────────────────────
CREATE TABLE master_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  item_code     TEXT NOT NULL,
  item_name     TEXT NOT NULL,
  item_name_ar  TEXT,
  unit          TEXT NOT NULL,
  min_stock     NUMERIC(12,3) NOT NULL DEFAULT 0,
  category      TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ,
  UNIQUE (tenant_id, item_code)
);
CREATE INDEX idx_items_tenant      ON master_items(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_items_tenant_code ON master_items(tenant_id, item_code) WHERE deleted_at IS NULL;

-- ─── USERS ───────────────────────────────────────────────────────────────────
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  password_hash TEXT,
  full_name     TEXT,
  full_name_ar  TEXT,
  role          TEXT NOT NULL CHECK (role IN ('Admin','Keeper','Viewer')),
  store_code    TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  google_sub    TEXT,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ,
  UNIQUE (tenant_id, email)
);
CREATE INDEX idx_users_tenant ON users(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_email  ON users(tenant_id, email) WHERE deleted_at IS NULL;

-- ─── REFRESH_TOKENS ───────────────────────────────────────────────────────────
CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id   UUID NOT NULL,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_refresh_user ON refresh_tokens(user_id, expires_at);

-- ─── TXN_COUNTERS ─────────────────────────────────────────────────────────────
CREATE TABLE txn_counters (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  prefix    TEXT NOT NULL CHECK (prefix IN ('REC','ISS','ADJ','TRF')),
  year      INT  NOT NULL,
  last_seq  INT  NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, prefix, year)
);

-- ─── STOCK_MOVEMENT (append-only ledger) ─────────────────────────────────────
CREATE TABLE stock_movement (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  txn_id        TEXT NOT NULL,
  txn_date      DATE NOT NULL,
  txn_type      TEXT NOT NULL CHECK (txn_type IN ('Receipt','Issuance','Adjustment','Transfer')),
  txn_suffix    TEXT CHECK (txn_suffix IN ('OUT','IN') OR txn_suffix IS NULL),
  item_code     TEXT NOT NULL,
  item_name     TEXT NOT NULL,
  unit          TEXT NOT NULL,
  qty           NUMERIC(12,3) NOT NULL,
  location_code TEXT NOT NULL,
  lpo           TEXT,
  supplier      TEXT,
  requester     TEXT,
  receiver      TEXT,
  notes         TEXT,
  user_email    TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_sm_balance  ON stock_movement(tenant_id, item_code, location_code);
CREATE INDEX idx_sm_date     ON stock_movement(tenant_id, txn_date DESC);
CREATE INDEX idx_sm_txnid    ON stock_movement(tenant_id, txn_id);
CREATE INDEX idx_sm_created  ON stock_movement(tenant_id, created_at DESC);
CREATE INDEX idx_sm_type     ON stock_movement(tenant_id, txn_type);

-- ─── STOCK_BALANCES (O(1) balance lookup) ────────────────────────────────────
CREATE TABLE stock_balances (
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  item_code     TEXT NOT NULL,
  location_code TEXT NOT NULL,
  balance       NUMERIC(12,3) NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, item_code, location_code)
);
CREATE INDEX idx_bal_tenant     ON stock_balances(tenant_id);
CREATE INDEX idx_bal_tenant_loc ON stock_balances(tenant_id, location_code);

-- Trigger: update stock_balances on every movement INSERT
CREATE OR REPLACE FUNCTION update_stock_balance() RETURNS TRIGGER AS $$
DECLARE
  delta NUMERIC(12,3);
BEGIN
  delta := CASE
    WHEN NEW.txn_type = 'Receipt'                              THEN  NEW.qty
    WHEN NEW.txn_type = 'Issuance'                             THEN -NEW.qty
    WHEN NEW.txn_type = 'Adjustment'                           THEN  NEW.qty
    WHEN NEW.txn_type = 'Transfer' AND NEW.txn_suffix = 'OUT'  THEN -NEW.qty
    WHEN NEW.txn_type = 'Transfer' AND NEW.txn_suffix = 'IN'   THEN  NEW.qty
    ELSE 0
  END;

  INSERT INTO stock_balances (tenant_id, item_code, location_code, balance, updated_at)
  VALUES (NEW.tenant_id, NEW.item_code, NEW.location_code, delta, NOW())
  ON CONFLICT (tenant_id, item_code, location_code)
  DO UPDATE SET
    balance    = stock_balances.balance + EXCLUDED.balance,
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_stock_balance
  AFTER INSERT ON stock_movement
  FOR EACH ROW EXECUTE FUNCTION update_stock_balance();

-- ─── AUDIT_LOG ────────────────────────────────────────────────────────────────
CREATE TABLE audit_log (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_id    UUID REFERENCES users(id),
  actor_email TEXT NOT NULL,
  action      TEXT NOT NULL,
  entity      TEXT,
  entity_id   TEXT,
  old_value   JSONB,
  new_value   JSONB,
  ip_address  INET,
  user_agent  TEXT,
  request_id  UUID,
  details     JSONB
);
CREATE INDEX idx_audit_tenant  ON audit_log(tenant_id, timestamp DESC);
CREATE INDEX idx_audit_action  ON audit_log(tenant_id, action);
CREATE INDEX idx_audit_unauth  ON audit_log(tenant_id, timestamp)
  WHERE action = 'UNAUTHORIZED_ACCESS';

-- ─── ROW-LEVEL SECURITY ───────────────────────────────────────────────────────
ALTER TABLE stock_movement  ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log       ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_balances  ENABLE ROW LEVEL SECURITY;
ALTER TABLE txn_counters    ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON stock_movement  USING (tenant_id = current_setting('app.tenant_id', TRUE)::UUID);
CREATE POLICY tenant_isolation ON master_items    USING (tenant_id = current_setting('app.tenant_id', TRUE)::UUID);
CREATE POLICY tenant_isolation ON locations       USING (tenant_id = current_setting('app.tenant_id', TRUE)::UUID);
CREATE POLICY tenant_isolation ON users           USING (tenant_id = current_setting('app.tenant_id', TRUE)::UUID);
CREATE POLICY tenant_isolation ON audit_log       USING (tenant_id = current_setting('app.tenant_id', TRUE)::UUID);
CREATE POLICY tenant_isolation ON stock_balances  USING (tenant_id = current_setting('app.tenant_id', TRUE)::UUID);
CREATE POLICY tenant_isolation ON txn_counters    USING (tenant_id = current_setting('app.tenant_id', TRUE)::UUID);
