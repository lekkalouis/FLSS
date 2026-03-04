# Offline storage and backups

## Local source of truth
- SQLite DB: `LOCAL_DB_PATH` (default `data/flss-products.sqlite`)
- Assets cache root: `ASSETS_PATH` (default `data/assets/products`)
- Backups root: `BACKUPS_PATH` (default `data/backups`)

## Durability choices
- SQLite uses WAL mode and FK constraints.
- Schema migrations are SQL files in `db/migrations` and auto-applied at startup.

## Backups
- Daily DB snapshot endpoint: `POST /api/v1/product-management/backups/daily`
  - writes `data/backups/YYYY-MM-DD.sqlite`
- Export snapshot endpoint: `POST /api/v1/product-management/backups/export`
  - writes zip containing sqlite + config template + cached assets

## Restore strategy
- Stop FLSS.
- Replace `data/flss-products.sqlite` with selected snapshot DB.
- Restore `data/assets/products` from snapshot zip if needed.
- Start FLSS and verify `/api/v1/product-management/sync/status` + dashboard.
