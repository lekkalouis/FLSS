import fs from "fs";
import path from "path";

import Database from "better-sqlite3";

import { config } from "../config.js";

const MIGRATIONS_DIR = path.resolve("db", "migrations");

let dbInstance;

function ensureParentDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function migrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

function applyMigrations(db) {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, applied_at TEXT NOT NULL DEFAULT (datetime('now')))");
  const hasMigration = db.prepare("SELECT 1 FROM schema_migrations WHERE name = ?");
  const markMigration = db.prepare("INSERT INTO schema_migrations(name) VALUES (?)");

  for (const fileName of migrationFiles()) {
    if (hasMigration.get(fileName)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, fileName), "utf8");
    const tx = db.transaction(() => {
      db.exec(sql);
      markMigration.run(fileName);
    });
    tx();
  }
}

export function getProductDb() {
  if (dbInstance) return dbInstance;
  const dbPath = path.resolve(config.LOCAL_DB_PATH || "data/flss-products.sqlite");
  ensureParentDir(dbPath);
  dbInstance = new Database(dbPath);
  dbInstance.pragma("journal_mode = WAL");
  dbInstance.pragma("foreign_keys = ON");
  applyMigrations(dbInstance);
  return dbInstance;
}

export function initProductDb() {
  return getProductDb();
}
