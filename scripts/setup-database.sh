#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required. Example: postgres://user:pass@host:5432/flss"
  exit 1
fi

echo "Applying schema to ${DATABASE_URL}"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/schema.sql

echo "Database schema installed successfully."
