import { getDb } from "../db/sqlite.js";

const SETTINGS_KEY = "global";

const ALLOWED_STICKER_LANGUAGES = new Set(["PPLB", "PPLA", "ZPL"]);

export const DEFAULT_SYSTEM_SETTINGS = Object.freeze({
  sticker: {
    shelfLifeMonths: 12,
    defaultButtonQty: 50,
    commandLanguage: "PPLB",
    stickerPrinterId: null
  },
  printHistory: {
    retentionDays: 365
  },
  relay: {
    enabled: false,
    targets: []
  }
});

function asFiniteInt(value, fallback, options = {}) {
  const min = Number.isFinite(options.min) ? options.min : Number.MIN_SAFE_INTEGER;
  const max = Number.isFinite(options.max) ? options.max : Number.MAX_SAFE_INTEGER;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.trunc(parsed);
  if (normalized < min) return min;
  if (normalized > max) return max;
  return normalized;
}

function normalizeBool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return fallback;
}

function normalizeRelayTargets(targets) {
  if (!Array.isArray(targets)) return [];
  return targets
    .map((target, index) => {
      const source = target && typeof target === "object" ? target : {};
      const name = String(source.name || "").trim();
      const relayTarget = String(source.relayTarget || "").trim();
      const relayChannel = source.relayChannel == null
        ? null
        : asFiniteInt(source.relayChannel, null, { min: 1, max: 32 });
      const printerId = source.printerId == null
        ? null
        : asFiniteInt(source.printerId, null, { min: 1 });
      return {
        id: String(source.id || `relay-target-${index + 1}`).trim() || `relay-target-${index + 1}`,
        name: name || `Target ${index + 1}`,
        relayTarget: relayTarget || "",
        relayChannel,
        printerId
      };
    })
    .filter((target) => target.relayTarget || target.printerId != null);
}

export function normalizeSystemSettings(rawSettings = {}) {
  const source = rawSettings && typeof rawSettings === "object" ? rawSettings : {};
  const stickerSource = source.sticker && typeof source.sticker === "object" ? source.sticker : {};
  const printHistorySource = source.printHistory && typeof source.printHistory === "object"
    ? source.printHistory
    : {};
  const relaySource = source.relay && typeof source.relay === "object" ? source.relay : {};

  const commandLanguage = String(stickerSource.commandLanguage || DEFAULT_SYSTEM_SETTINGS.sticker.commandLanguage)
    .trim()
    .toUpperCase();

  const stickerPrinterId = stickerSource.stickerPrinterId == null || stickerSource.stickerPrinterId === ""
    ? null
    : asFiniteInt(stickerSource.stickerPrinterId, null, { min: 1 });

  return {
    sticker: {
      shelfLifeMonths: asFiniteInt(
        stickerSource.shelfLifeMonths,
        DEFAULT_SYSTEM_SETTINGS.sticker.shelfLifeMonths,
        { min: 1, max: 120 }
      ),
      defaultButtonQty: asFiniteInt(
        stickerSource.defaultButtonQty,
        DEFAULT_SYSTEM_SETTINGS.sticker.defaultButtonQty,
        { min: 1, max: 10000 }
      ),
      commandLanguage: ALLOWED_STICKER_LANGUAGES.has(commandLanguage)
        ? commandLanguage
        : DEFAULT_SYSTEM_SETTINGS.sticker.commandLanguage,
      stickerPrinterId
    },
    printHistory: {
      retentionDays: asFiniteInt(
        printHistorySource.retentionDays,
        DEFAULT_SYSTEM_SETTINGS.printHistory.retentionDays,
        { min: 1, max: 3650 }
      )
    },
    relay: {
      enabled: normalizeBool(relaySource.enabled, DEFAULT_SYSTEM_SETTINGS.relay.enabled),
      targets: normalizeRelayTargets(relaySource.targets)
    }
  };
}

function parseSettingsRow(row) {
  if (!row?.value_json) return { ...DEFAULT_SYSTEM_SETTINGS };
  try {
    const parsed = JSON.parse(row.value_json);
    return normalizeSystemSettings(parsed);
  } catch {
    return { ...DEFAULT_SYSTEM_SETTINGS };
  }
}

export function getSystemSettings() {
  const db = getDb();
  const row = db.prepare("SELECT value_json FROM system_settings WHERE key = ?").get(SETTINGS_KEY);
  return parseSettingsRow(row);
}

export function saveSystemSettings(nextSettings) {
  const normalized = normalizeSystemSettings(nextSettings);
  const db = getDb();
  db.prepare(
    `INSERT INTO system_settings (key, value_json, updated_at)
     VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP`
  ).run(SETTINGS_KEY, JSON.stringify(normalized));
  return normalized;
}

export function patchSystemSettings(partialSettings = {}) {
  const current = getSystemSettings();
  const merged = {
    ...current,
    ...(partialSettings && typeof partialSettings === "object" ? partialSettings : {}),
    sticker: {
      ...(current.sticker || {}),
      ...((partialSettings && partialSettings.sticker) || {})
    },
    printHistory: {
      ...(current.printHistory || {}),
      ...((partialSettings && partialSettings.printHistory) || {})
    },
    relay: {
      ...(current.relay || {}),
      ...((partialSettings && partialSettings.relay) || {}),
      targets: ((partialSettings && partialSettings.relay && partialSettings.relay.targets) || current.relay?.targets || [])
    }
  };
  return saveSystemSettings(merged);
}

