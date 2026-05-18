-- MEP-Store — Demo seed data for development/testing
-- Run AFTER schema.sql

-- Demo tenant
INSERT INTO tenants (id, slug, company_name, plan, demo_expires_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'demo-company',
  'شركة التجربة للمقاولات',
  'demo',
  NOW() + INTERVAL '30 days'
) ON CONFLICT DO NOTHING;

-- Admin user (password: Admin@1234)
INSERT INTO users (tenant_id, email, password_hash, full_name, role, is_active)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'admin@demo.com',
  '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMUOZG9qOHm8v1iFbfVGXB7fHW', -- Admin@1234
  'مدير النظام',
  'Admin',
  TRUE
) ON CONFLICT DO NOTHING;

-- Keeper user (password: Keeper@1234)
INSERT INTO users (tenant_id, email, password_hash, full_name, role, store_code, is_active)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'keeper@demo.com',
  '$2b$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/VhAkMGgBWoqOKoijO', -- Keeper@1234
  'أمين المخزن الرئيسي',
  'Keeper',
  'MAIN',
  TRUE
) ON CONFLICT DO NOTHING;

-- Locations
INSERT INTO locations (tenant_id, store_code, store_name, store_name_ar, is_active) VALUES
  ('00000000-0000-0000-0000-000000000001', 'MAIN', 'Main Warehouse',   'المخزن الرئيسي',    TRUE),
  ('00000000-0000-0000-0000-000000000001', 'SITE', 'Site Store',       'مخزن الموقع',       TRUE)
ON CONFLICT DO NOTHING;

-- Txn counters
INSERT INTO txn_counters (tenant_id, prefix, year, last_seq) VALUES
  ('00000000-0000-0000-0000-000000000001', 'REC', 2026, 0),
  ('00000000-0000-0000-0000-000000000001', 'ISS', 2026, 0),
  ('00000000-0000-0000-0000-000000000001', 'ADJ', 2026, 0),
  ('00000000-0000-0000-0000-000000000001', 'TRF', 2026, 0)
ON CONFLICT DO NOTHING;

-- Sample items
INSERT INTO master_items (tenant_id, item_code, item_name, item_name_ar, unit, min_stock, category) VALUES
  ('00000000-0000-0000-0000-000000000001', 'PVC-32',    'PVC Pipe 32mm',    'أنبوب PVC 32 مم',        'pcs',  50,  'Plumbing'),
  ('00000000-0000-0000-0000-000000000001', 'PVC-63',    'PVC Pipe 63mm',    'أنبوب PVC 63 مم',        'pcs',  20,  'Plumbing'),
  ('00000000-0000-0000-0000-000000000001', 'ELBOW-90',  'Elbow 90° 32mm',   'كوع 90 درجة 32 مم',      'pcs',  30,  'Plumbing'),
  ('00000000-0000-0000-0000-000000000001', 'WIRE-2.5',  'Cable 2.5mm²',     'كابل 2.5 ملم مربع',      'mtr',  200, 'Electrical'),
  ('00000000-0000-0000-0000-000000000001', 'WIRE-4',    'Cable 4mm²',       'كابل 4 ملم مربع',        'mtr',  100, 'Electrical'),
  ('00000000-0000-0000-0000-000000000001', 'CB-20A',    'Circuit Breaker 20A','قاطع تلقائي 20 أمبير', 'pcs',  10,  'Electrical'),
  ('00000000-0000-0000-0000-000000000001', 'VALVE-25',  'Ball Valve 25mm',  'صمام كروي 25 مم',        'pcs',  15,  'Plumbing'),
  ('00000000-0000-0000-0000-000000000001', 'DUCT-100',  'Duct 100mm',       'مجرى هواء 100 مم',       'mtr',  50,  'HVAC')
ON CONFLICT DO NOTHING;
