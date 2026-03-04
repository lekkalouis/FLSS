import fs from "fs";
import path from "path";

import Database from "better-sqlite3";

import { config } from "../config.js";

const MIGRATIONS_DIR = path.resolve("db", "migrations");
const DEFAULT_DB_PATH = path.resolve("data", "flss-products.sqlite");

let db = null;
let dbPathCurrent = null;

function ensureDirFor(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function getDb() {
  const filePath = path.resolve(process.env.LOCAL_DB_PATH || config.LOCAL_DB_PATH || DEFAULT_DB_PATH);
  if (db && dbPathCurrent === filePath) return db;
  if (db && dbPathCurrent !== filePath) { db.close(); db = null; }
  ensureDirFor(filePath);
  db = new Database(filePath);
  dbPathCurrent = filePath;
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec("CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
  return db;
}

export function runMigrations() {
  const conn = getDb();
  if (!fs.existsSync(MIGRATIONS_DIR)) return;
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith(".sql")).sort();

  for (const file of files) {
    const applied = conn.prepare("SELECT 1 FROM _migrations WHERE name = ?").get(file);
    if (applied) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    const tx = conn.transaction(() => {
      conn.exec(sql);
      conn.prepare("INSERT INTO _migrations (name) VALUES (?)").run(file);
    });
    tx();
  }
}


export function closeDb() {
  if (!db) return;
  db.close();
  db = null;
  dbPathCurrent = null;
}
