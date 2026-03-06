PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS print_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL,
  printer_id INTEGER,
  title TEXT,
  source TEXT,
  upstream_status INTEGER,
  upstream_status_text TEXT,
  upstream_job_id TEXT,
  request_payload_json TEXT,
  response_payload_json TEXT,
  metadata_json TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_print_history_created_at ON print_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_print_history_status ON print_history(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_print_history_job_type ON print_history(job_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_print_history_printer_id ON print_history(printer_id, created_at DESC);
