# Offline Storage and Backups

This note covers the current local persistence layout plus the retained snapshot endpoints from the legacy product-management module.

## 1. Storage locations

Primary local paths:

- `LOCAL_DB_PATH` - main SQLite database used by stock, buy, make, print history, and system settings
- `ASSETS_PATH` - generated files and asset cache root
- `BACKUPS_PATH` - snapshot output and restore staging area

Common examples from `.env.example`:

- `data/flss-products.sqlite`
- `data/assets`
- `data/backups`

Other persisted local files:

- `data/liquid-templates.json`
- `data/notification-templates.json`
- generated files under `data/assets/generated`

## 2. What lives in SQLite

The local database is not just a cache. It stores operational records such as:

- materials, suppliers, and BOMs
- inventory movements and batches
- stocktakes
- purchase orders and dispatch attempts
- manufacturing orders and material reservations
- print history
- system settings
- audit data used by unified operations

See [data-model.md](data-model.md) for the full entity map.

## 3. Snapshot endpoints

> Compatibility / legacy: these endpoints are retained from the older product-management module. They still work, but they are maintenance tools rather than the primary runtime flow.

Endpoints:

- `POST /api/v1/product-management/backups/snapshot`
- `POST /api/v1/product-management/backups/restore`

Current snapshot behavior:

- copies the SQLite file into `BACKUPS_PATH/YYYY-MM-DD.sqlite`
- creates a temporary snapshot folder
- includes `flss-products.sqlite`
- includes `assets/` if `ASSETS_PATH` exists
- writes `config.template.env` containing `LOCAL_DB_PATH`, `ASSETS_PATH`, `BACKUPS_PATH`, and `SYNC_ENABLED`
- zips the snapshot into `BACKUPS_PATH/snapshot-<timestamp>.zip`

Current restore behavior:

- expects a request body containing `zip_path`
- unzips into a temporary restore folder under `BACKUPS_PATH`
- restores `flss-products.sqlite` into `LOCAL_DB_PATH`
- restores `assets/` into `ASSETS_PATH` when present

## 4. Host requirements

The snapshot implementation shells out to:

- `bash`
- `zip`
- `unzip`

On Windows hosts, install compatible tools such as Git Bash if you plan to use the compatibility snapshot endpoints.

## 5. Operating guidance

- Back up the SQLite file before major schema or integration changes.
- Keep generated assets with the database when moving a workstation or Raspberry Pi.
- Verify free disk space under `BACKUPS_PATH` if snapshots start failing.
- Prefer tested restore rehearsals over assuming the zip can be restored later.
