import pg from "pg";

import { config } from "../config.js";

const { Pool } = pg;

let pool;

export function hasDatabaseConfig() {
  return Boolean(config.DATABASE_URL);
}

export function getDbPool() {
  if (!hasDatabaseConfig()) {
    throw new Error("DATABASE_URL is not configured.");
  }
  if (!pool) {
    pool = new Pool({
      connectionString: config.DATABASE_URL,
      ssl: config.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined
    });
  }
  return pool;
}

export async function query(text, params = []) {
  const db = getDbPool();
  return db.query(text, params);
}
