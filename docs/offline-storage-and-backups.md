# Offline Storage and Backups

## Storage locations

- SQLite DB: `LOCAL_DB_PATH` (default `data/flss-products.sqlite`)
- Asset cache root: `ASSETS_PATH` (default `data/assets`)
- Backups: `BACKUPS_PATH` (default `data/backups`)

## Backups

Snapshot endpoint:

- `POST /api/v1/product-management/backups/snapshot`

Creates:

1. Daily sqlite copy: `data/backups/YYYY-MM-DD.sqlite`
2. Export snapshot zip containing:
   - `flss-products.sqlite`
   - `assets/` (if present)
   - `config.template.env`

## Restore

Restore endpoint:

- `POST /api/v1/product-management/backups/restore`
- body: `{ "zip_path": "data/backups/snapshot-...zip" }`

The restore process unzips into a temp folder, replaces local sqlite, and restores assets if present.
