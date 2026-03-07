PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'raw-material',
  uom TEXT NOT NULL DEFAULT 'unit',
  icon TEXT,
  source_type TEXT,
  source_ref_id TEXT,
  reorder_point REAL NOT NULL DEFAULT 0,
  lead_time_days INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS supplier_materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id INTEGER NOT NULL,
  material_id INTEGER NOT NULL,
  supplier_sku TEXT,
  is_preferred INTEGER NOT NULL DEFAULT 0,
  price_per_unit REAL NOT NULL DEFAULT 0,
  min_order_qty REAL NOT NULL DEFAULT 0,
  lead_time_days INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE,
  FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_supplier_materials_pair ON supplier_materials(supplier_id, material_id);
CREATE INDEX IF NOT EXISTS idx_supplier_materials_preferred ON supplier_materials(material_id, is_preferred DESC, updated_at DESC);

CREATE TABLE IF NOT EXISTS bom_headers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER,
  product_sku TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT 'v1',
  effective_from TEXT NOT NULL,
  yield_pct REAL NOT NULL DEFAULT 100,
  waste_pct REAL NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  source_recipe_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_bom_headers_lookup ON bom_headers(product_sku, effective_from DESC);

CREATE TABLE IF NOT EXISTS bom_material_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bom_header_id INTEGER NOT NULL,
  material_id INTEGER NOT NULL,
  quantity REAL NOT NULL DEFAULT 0,
  uom TEXT NOT NULL DEFAULT 'g',
  line_type TEXT NOT NULL DEFAULT 'ingredient',
  source_ref_type TEXT,
  source_ref_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (bom_header_id) REFERENCES bom_headers(id) ON DELETE CASCADE,
  FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_bom_material_lines_lookup ON bom_material_lines(bom_header_id, line_type, material_id);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  note TEXT,
  request_id TEXT,
  shopify_draft_order_id TEXT,
  shopify_draft_order_name TEXT,
  shopify_admin_url TEXT,
  generated_document_path TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier_status ON purchase_orders(supplier_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS purchase_order_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_order_id INTEGER NOT NULL,
  material_id INTEGER NOT NULL,
  quantity REAL NOT NULL DEFAULT 0,
  received_qty REAL NOT NULL DEFAULT 0,
  title_snapshot TEXT NOT NULL,
  sku_snapshot TEXT NOT NULL,
  uom_snapshot TEXT NOT NULL DEFAULT 'unit',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_purchase_order_lines_po ON purchase_order_lines(purchase_order_id);

CREATE TABLE IF NOT EXISTS purchase_order_dispatches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_order_id INTEGER NOT NULL,
  channel TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TEXT,
  details_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_order_dispatch_channel ON purchase_order_dispatches(purchase_order_id, channel);

CREATE TABLE IF NOT EXISTS manufacturing_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT NOT NULL DEFAULT 'draft',
  target_date TEXT,
  notes TEXT,
  request_id TEXT,
  shopify_draft_order_id TEXT,
  shopify_draft_order_name TEXT,
  shopify_admin_url TEXT,
  batch_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_manufacturing_orders_status ON manufacturing_orders(status, created_at DESC);

CREATE TABLE IF NOT EXISTS manufacturing_order_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  manufacturing_order_id INTEGER NOT NULL,
  product_sku TEXT NOT NULL,
  product_title TEXT NOT NULL,
  variant_id TEXT,
  quantity REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (manufacturing_order_id) REFERENCES manufacturing_orders(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_manufacturing_order_lines_order ON manufacturing_order_lines(manufacturing_order_id);

CREATE TABLE IF NOT EXISTS manufacturing_material_requirements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  manufacturing_order_id INTEGER NOT NULL,
  material_id INTEGER NOT NULL,
  required_qty REAL NOT NULL DEFAULT 0,
  reserved_qty REAL NOT NULL DEFAULT 0,
  available_qty REAL NOT NULL DEFAULT 0,
  shortage_qty REAL NOT NULL DEFAULT 0,
  uom TEXT NOT NULL DEFAULT 'g',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (manufacturing_order_id) REFERENCES manufacturing_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_manufacturing_material_requirements_order ON manufacturing_material_requirements(manufacturing_order_id, material_id);

CREATE TABLE IF NOT EXISTS manufacturing_material_allocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  manufacturing_requirement_id INTEGER NOT NULL,
  batch_id INTEGER,
  allocated_qty REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (manufacturing_requirement_id) REFERENCES manufacturing_material_requirements(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_code TEXT NOT NULL UNIQUE,
  batch_type TEXT NOT NULL,
  product_sku TEXT,
  material_id INTEGER,
  supplier_id INTEGER,
  purchase_order_id INTEGER,
  manufacturing_order_id INTEGER,
  bom_header_id INTEGER,
  qty_total REAL NOT NULL DEFAULT 0,
  qty_remaining REAL NOT NULL DEFAULT 0,
  supplier_lot TEXT,
  coa_status TEXT,
  expiry_date TEXT,
  details_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE SET NULL,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL,
  FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE SET NULL,
  FOREIGN KEY (manufacturing_order_id) REFERENCES manufacturing_orders(id) ON DELETE SET NULL,
  FOREIGN KEY (bom_header_id) REFERENCES bom_headers(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_batches_lookup ON batches(batch_type, created_at DESC);

CREATE TABLE IF NOT EXISTS stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  movement_type TEXT NOT NULL,
  location_key TEXT,
  product_sku TEXT,
  material_id INTEGER,
  batch_id INTEGER,
  quantity REAL NOT NULL,
  unit_cost REAL,
  reference_type TEXT,
  reference_id TEXT,
  actor_type TEXT,
  actor_id TEXT,
  details_json TEXT,
  FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE SET NULL,
  FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_stock_movements_material ON stock_movements(material_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_sku, occurred_at DESC);

CREATE TABLE IF NOT EXISTS stocktakes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT NOT NULL DEFAULT 'open',
  scope TEXT NOT NULL,
  location_key TEXT,
  notes TEXT,
  actor_type TEXT,
  actor_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at TEXT
);

CREATE TABLE IF NOT EXISTS stocktake_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stocktake_id INTEGER NOT NULL,
  entity_type TEXT NOT NULL,
  product_sku TEXT,
  material_id INTEGER,
  counted_qty REAL NOT NULL DEFAULT 0,
  before_qty REAL NOT NULL DEFAULT 0,
  diff_qty REAL NOT NULL DEFAULT 0,
  batch_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (stocktake_id) REFERENCES stocktakes(id) ON DELETE CASCADE,
  FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE SET NULL,
  FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_stocktake_lines_stocktake ON stocktake_lines(stocktake_id);

CREATE TABLE IF NOT EXISTS app_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actor_type TEXT,
  actor_id TEXT,
  surface TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  related_entity_type TEXT,
  related_entity_id TEXT,
  status TEXT NOT NULL DEFAULT 'ok',
  request_id TEXT,
  details_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_app_audit_log_lookup ON app_audit_log(occurred_at DESC, action, entity_type);

INSERT INTO materials (sku, title, category, uom, icon, source_type, source_ref_id, created_at, updated_at)
SELECT
  'ING-' || i.id,
  i.name,
  'ingredient',
  'g',
  '*',
  'ingredients',
  CAST(i.id AS TEXT),
  COALESCE(i.created_at, CURRENT_TIMESTAMP),
  COALESCE(i.updated_at, CURRENT_TIMESTAMP)
FROM ingredients i
WHERE NOT EXISTS (
  SELECT 1 FROM materials m WHERE m.source_type = 'ingredients' AND m.source_ref_id = CAST(i.id AS TEXT)
);

INSERT INTO materials (sku, title, category, uom, icon, source_type, source_ref_id, created_at, updated_at)
SELECT
  'PKG-' || p.id,
  p.name,
  'packaging',
  COALESCE(NULLIF(p.uom, ''), 'unit'),
  '#',
  'packaging_items',
  CAST(p.id AS TEXT),
  COALESCE(p.created_at, CURRENT_TIMESTAMP),
  COALESCE(p.updated_at, CURRENT_TIMESTAMP)
FROM packaging_items p
WHERE NOT EXISTS (
  SELECT 1 FROM materials m WHERE m.source_type = 'packaging_items' AND m.source_ref_id = CAST(p.id AS TEXT)
);

INSERT INTO supplier_materials (supplier_id, material_id, supplier_sku, is_preferred, price_per_unit, min_order_qty, lead_time_days, created_at, updated_at)
SELECT
  ip.supplier_id,
  m.id,
  NULL,
  CASE
    WHEN ip.id = (
      SELECT ip2.id
      FROM ingredient_prices ip2
      WHERE ip2.ingredient_id = ip.ingredient_id AND ip2.supplier_id = ip.supplier_id
      ORDER BY ip2.effective_from DESC, ip2.id DESC
      LIMIT 1
    ) THEN 1
    ELSE 0
  END,
  COALESCE(ip.price_per_kg, 0),
  0,
  0,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM ingredient_prices ip
JOIN materials m
  ON m.source_type = 'ingredients'
 AND m.source_ref_id = CAST(ip.ingredient_id AS TEXT)
WHERE ip.supplier_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM supplier_materials sm
    WHERE sm.supplier_id = ip.supplier_id
      AND sm.material_id = m.id
  );

INSERT INTO bom_headers (product_id, product_sku, version, effective_from, yield_pct, waste_pct, is_active, source_recipe_id, created_at, updated_at)
SELECT
  p.id,
  p.sku,
  br.version,
  br.effective_from,
  COALESCE(br.yield_pct, 100),
  COALESCE(br.waste_pct, 0),
  COALESCE(br.is_active, 1),
  br.id,
  COALESCE(br.created_at, CURRENT_TIMESTAMP),
  CURRENT_TIMESTAMP
FROM bom_recipes br
JOIN products p ON p.id = br.product_id
WHERE NOT EXISTS (
  SELECT 1 FROM bom_headers bh WHERE bh.source_recipe_id = br.id
);

INSERT INTO bom_material_lines (bom_header_id, material_id, quantity, uom, line_type, source_ref_type, source_ref_id, created_at)
SELECT
  bh.id,
  m.id,
  COALESCE(bl.grams_used, 0),
  'g',
  'ingredient',
  'bom_lines',
  CAST(bl.id AS TEXT),
  CURRENT_TIMESTAMP
FROM bom_lines bl
JOIN bom_headers bh ON bh.source_recipe_id = bl.recipe_id
JOIN materials m
  ON m.source_type = 'ingredients'
 AND m.source_ref_id = CAST(bl.ingredient_id AS TEXT)
WHERE NOT EXISTS (
  SELECT 1 FROM bom_material_lines bml WHERE bml.source_ref_type = 'bom_lines' AND bml.source_ref_id = CAST(bl.id AS TEXT)
);

INSERT INTO bom_material_lines (bom_header_id, material_id, quantity, uom, line_type, source_ref_type, source_ref_id, created_at)
SELECT
  bh.id,
  m.id,
  COALESCE(pl.qty, 0),
  COALESCE(pi.uom, 'unit'),
  'packaging',
  'packaging_lines',
  CAST(pl.id AS TEXT),
  CURRENT_TIMESTAMP
FROM packaging_lines pl
JOIN packaging_profiles pp ON pp.id = pl.profile_id
JOIN products p ON p.id = pp.product_id
JOIN bom_headers bh ON bh.product_sku = p.sku
JOIN packaging_items pi ON pi.id = pl.packaging_item_id
JOIN materials m
  ON m.source_type = 'packaging_items'
 AND m.source_ref_id = CAST(pi.id AS TEXT)
WHERE NOT EXISTS (
  SELECT 1 FROM bom_material_lines bml WHERE bml.source_ref_type = 'packaging_lines' AND bml.source_ref_id = CAST(pl.id AS TEXT)
);
