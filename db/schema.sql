-- FLSS PostgreSQL schema
-- Run with:
--   psql "$DATABASE_URL" -f db/schema.sql

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Pricing module ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS price_lists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'ZAR',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS price_rules (
  id TEXT PRIMARY KEY,
  price_list_id TEXT NOT NULL REFERENCES price_lists(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  action JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_rules_list_priority
  ON price_rules (price_list_id, priority, active);

-- Traceability module ------------------------------------------------------
CREATE TABLE IF NOT EXISTS open_purchase_orders (
  po_number TEXT PRIMARY KEY,
  supplier TEXT,
  flavor TEXT,
  expected_date DATE,
  status TEXT NOT NULL DEFAULT 'open',
  capture_image_path TEXT,
  capture_logged_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoices (
  invoice_number TEXT PRIMARY KEY,
  po_number TEXT NOT NULL REFERENCES open_purchase_orders(po_number) ON UPDATE CASCADE,
  supplier TEXT,
  flavor TEXT,
  received_batch_number TEXT,
  pdf_url TEXT,
  capture_image_path TEXT,
  capture_logged_at TIMESTAMPTZ,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT NOT NULL REFERENCES invoices(invoice_number) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  lot_batch_number TEXT,
  qty NUMERIC(12, 3) NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'units'
);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice
  ON invoice_items (invoice_number);

CREATE INDEX IF NOT EXISTS idx_invoice_items_lot_batch
  ON invoice_items (lot_batch_number);

CREATE TABLE IF NOT EXISTS document_captures (
  capture_id TEXT PRIMARY KEY,
  po_number TEXT NOT NULL REFERENCES open_purchase_orders(po_number) ON UPDATE CASCADE,
  invoice_number TEXT NOT NULL REFERENCES invoices(invoice_number) ON UPDATE CASCADE,
  image_path TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'pi-doc-station',
  captured_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_document_captures_po
  ON document_captures (po_number, captured_at DESC);

CREATE TABLE IF NOT EXISTS coas (
  coa_number TEXT PRIMARY KEY,
  product_name TEXT,
  batch_number TEXT NOT NULL,
  supplier TEXT,
  pdf_url TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coas_batch_number
  ON coas (batch_number);

CREATE TABLE IF NOT EXISTS incoming_inspections (
  inspection_id TEXT PRIMARY KEY,
  invoice_number TEXT NOT NULL REFERENCES invoices(invoice_number) ON UPDATE CASCADE,
  po_number TEXT NOT NULL REFERENCES open_purchase_orders(po_number) ON UPDATE CASCADE,
  supplier TEXT,
  received_qty NUMERIC(12, 3) NOT NULL DEFAULT 0,
  vehicle_reg TEXT,
  driver_name TEXT,
  quantity_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  packaging_intact BOOLEAN NOT NULL DEFAULT FALSE,
  seal_intact BOOLEAN NOT NULL DEFAULT FALSE,
  coa_attached BOOLEAN NOT NULL DEFAULT FALSE,
  comments TEXT,
  signature TEXT,
  capture_image_path TEXT,
  capture_logged_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending',
  print_job JSONB,
  printed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incoming_inspections_invoice
  ON incoming_inspections (invoice_number);

CREATE TABLE IF NOT EXISTS finished_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finished_batch_number TEXT NOT NULL,
  flavor TEXT NOT NULL,
  production_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (finished_batch_number, flavor)
);

CREATE TABLE IF NOT EXISTS finished_batch_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finished_batch_id UUID NOT NULL REFERENCES finished_batches(id) ON DELETE CASCADE,
  item_name TEXT,
  source_batch_number TEXT,
  invoice_number TEXT REFERENCES invoices(invoice_number) ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_finished_batch_components_source
  ON finished_batch_components (source_batch_number);


-- Order Economics module ----------------------------------------------------

CREATE TABLE IF NOT EXISTS flss_cost_categories (
  code VARCHAR(50) PRIMARY KEY,
  label VARCHAR(100) NOT NULL,
  default_allocation_type VARCHAR(20) NOT NULL DEFAULT 'monthly',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_flss_cost_categories_allocation CHECK (
    default_allocation_type IN ('monthly', 'per_order', 'hybrid')
  )
);

INSERT INTO flss_cost_categories (code, label, default_allocation_type)
VALUES
  ('labour', 'Labour', 'monthly'),
  ('packaging', 'Packaging', 'monthly'),
  ('courier', 'Courier', 'monthly'),
  ('payment_fees', 'Payment Fees', 'per_order'),
  ('utilities', 'Utilities', 'monthly'),
  ('software', 'Software', 'monthly'),
  ('warehouse_overhead', 'Warehouse Overhead', 'monthly'),
  ('misc', 'Misc', 'monthly')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS flss_cost_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  month VARCHAR(7) NOT NULL,
  cost_category VARCHAR(50) NOT NULL,
  cost_name VARCHAR(100),
  amount_zar DECIMAL(12, 2) NOT NULL,
  allocation_type VARCHAR(20) NOT NULL DEFAULT 'monthly',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_flss_cost_ledger_category
    FOREIGN KEY (cost_category) REFERENCES flss_cost_categories(code),
  CONSTRAINT chk_flss_cost_ledger_allocation CHECK (
    allocation_type IN ('monthly', 'per_order', 'hybrid')
  )
);

CREATE INDEX IF NOT EXISTS idx_flss_cost_ledger_month ON flss_cost_ledger (month, date DESC);

CREATE TABLE IF NOT EXISTS flss_kpi_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  total_orders INT NOT NULL DEFAULT 0,
  total_revenue DECIMAL(12, 2) NOT NULL DEFAULT 0,
  avg_sale_price DECIMAL(10, 2) NOT NULL DEFAULT 0,
  cost_per_order DECIMAL(10, 2) NOT NULL DEFAULT 0,
  profit_per_order DECIMAL(10, 2) NOT NULL DEFAULT 0,
  margin_percent DECIMAL(5, 2) NOT NULL DEFAULT 0,
  avg_fulfillment_seconds INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flss_kpi_snapshots_date ON flss_kpi_snapshots (date DESC);

COMMIT;
