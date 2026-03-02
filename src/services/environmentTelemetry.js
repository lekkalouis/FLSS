import path from "path";
import { promises as fs } from "fs";

const TELEMETRY_DIR = path.join(process.cwd(), "data", "telemetry");
const TELEMETRY_FILE = path.join(TELEMETRY_DIR, "environment.json");

let latestEnvironment = null;

function normalizeNumber(value, field) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    const err = new Error(`${field} must be a valid number`);
    err.code = "INVALID_ENVIRONMENT_TELEMETRY";
    throw err;
  }
  return parsed;
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

function normalizePayload(payload = {}) {
  const stationId = String(firstDefined(payload.stationId, payload.deviceId) || "").trim();
  if (!stationId) {
    const err = new Error("stationId is required");
    err.code = "INVALID_ENVIRONMENT_TELEMETRY";
    throw err;
  }

  const timestampRaw = String(payload.timestamp || "").trim();
  const timestamp = timestampRaw || new Date().toISOString();
  if (Number.isNaN(new Date(timestamp).getTime())) {
    const err = new Error("timestamp must be ISO8601");
    err.code = "INVALID_ENVIRONMENT_TELEMETRY";
    throw err;
  }

  const statusRaw = String(payload.status || "").trim().toLowerCase();
  const status = statusRaw || "offline";
  if (!["ok", "degraded", "offline"].includes(status)) {
    const err = new Error("status must be one of: ok, degraded, offline");
    err.code = "INVALID_ENVIRONMENT_TELEMETRY";
    throw err;
  }

  const rawTemperature = firstDefined(payload.temperatureC, payload.temperature, payload.tempC, payload.temperature_c);
  const rawHumidity = firstDefined(payload.humidityPct, payload.humidity, payload.humidity_pct);
  const hasTemp = rawTemperature !== null;
  const hasHumidity = rawHumidity !== null;

  return {
    stationId,
    timestamp,
    temperatureC: hasTemp ? normalizeNumber(rawTemperature, "temperatureC") : null,
    humidityPct: hasHumidity ? normalizeNumber(rawHumidity, "humidityPct") : null,
    lastUpdated: payload.lastUpdated ? String(payload.lastUpdated) : null,
    status,
    readErrorsSinceBoot: Number.isFinite(Number(payload.readErrorsSinceBoot))
      ? Number(payload.readErrorsSinceBoot)
      : 0,
    receivedAt: new Date().toISOString()
  };
}

async function persistLatestEnvironment() {
  if (!latestEnvironment) return;
  try {
    await fs.mkdir(TELEMETRY_DIR, { recursive: true });
    await fs.writeFile(TELEMETRY_FILE, JSON.stringify(latestEnvironment, null, 2));
  } catch {
    // Keep API non-blocking even when disk persistence fails.
  }
}

export async function ingestEnvironmentTelemetry(payload) {
  latestEnvironment = normalizePayload(payload);
  await persistLatestEnvironment();
  return latestEnvironment;
}

export function getLatestEnvironmentTelemetry() {
  return latestEnvironment ? { ...latestEnvironment } : null;
}
