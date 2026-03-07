ALTER TABLE materials ADD COLUMN shopify_variant_id INTEGER;
ALTER TABLE materials ADD COLUMN shopify_inventory_item_id INTEGER;
ALTER TABLE materials ADD COLUMN shopify_inventory_unit TEXT;
ALTER TABLE materials ADD COLUMN shopify_inventory_multiplier INTEGER;

CREATE INDEX IF NOT EXISTS idx_materials_shopify_variant_id ON materials(shopify_variant_id);
