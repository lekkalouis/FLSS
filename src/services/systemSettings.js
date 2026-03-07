import { getDb } from "../db/sqlite.js";

const SETTINGS_KEY = "global";

const ALLOWED_STICKER_LANGUAGES = new Set(["PPLB", "PPLA", "ZPL"]);

const DEFAULT_NOTIFICATION_EVENTS = Object.freeze({
  pickupReady: {
    enabled: true,
    templateId: "flss-pickup-ready-email",
    useCustomerEmail: true,
    recipients: [],
    fallbackRecipient: null
  },
  truckCollection: {
    enabled: true,
    templateId: "flss-truck-collection-email",
    useCustomerEmail: false,
    recipients: [],
    fallbackRecipient: null
  }
});

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
  },
  controller: {
    showOnScreenButtons: true,
    requireConnectedRemote: true,
    highVisibilityMode: true
  },
  notifications: {
    senderOverride: null,
    fallbackRecipient: null,
    events: {
      pickupReady: { ...DEFAULT_NOTIFICATION_EVENTS.pickupReady },
      truckCollection: { ...DEFAULT_NOTIFICATION_EVENTS.truckCollection }
    }
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

function normalizeNullableEmail(value) {
  const email = String(value || "").trim();
  if (!email || !email.includes("@")) return null;
  return email;
}

function normalizeEmailList(value) {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .map((entry) => normalizeNullableEmail(entry))
          .filter(Boolean)
          .map((entry) => entry.toLowerCase())
      )
    );
  }

  if (typeof value === "string") {
    return normalizeEmailList(
      value
        .split(/[,\n;]/)
        .map((entry) => entry.trim())
        .filter(Boolean)
    );
  }

  return [];
}

function normalizeNotificationEventSettings(eventSource = {}, defaults = {}) {
  const source = eventSource && typeof eventSource === "object" ? eventSource : {};
  return {
    enabled: normalizeBool(source.enabled, defaults.enabled ?? true),
    templateId: String(source.templateId || defaults.templateId || "").trim() || null,
    useCustomerEmail: normalizeBool(source.useCustomerEmail, defaults.useCustomerEmail ?? false),
    recipients: normalizeEmailList(source.recipients),
    fallbackRecipient: normalizeNullableEmail(source.fallbackRecipient) || defaults.fallbackRecipient || null
  };
}

export function normalizeSystemSettings(rawSettings = {}) {
  const source = rawSettings && typeof rawSettings === "object" ? rawSettings : {};
  const stickerSource = source.sticker && typeof source.sticker === "object" ? source.sticker : {};
  const printHistorySource = source.printHistory && typeof source.printHistory === "object"
    ? source.printHistory
    : {};
  const relaySource = source.relay && typeof source.relay === "object" ? source.relay : {};
  const controllerSource = source.controller && typeof source.controller === "object" ? source.controller : {};
  const notificationsSource = source.notifications && typeof source.notifications === "object" ? source.notifications : {};
  const notificationEventsSource =
    notificationsSource.events && typeof notificationsSource.events === "object"
      ? notificationsSource.events
      : {};

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
    },
    controller: {
      showOnScreenButtons: normalizeBool(
        controllerSource.showOnScreenButtons,
        DEFAULT_SYSTEM_SETTINGS.controller.showOnScreenButtons
      ),
      requireConnectedRemote: normalizeBool(
        controllerSource.requireConnectedRemote,
        DEFAULT_SYSTEM_SETTINGS.controller.requireConnectedRemote
      ),
      highVisibilityMode: normalizeBool(
        controllerSource.highVisibilityMode,
        DEFAULT_SYSTEM_SETTINGS.controller.highVisibilityMode
      )
    },
    notifications: {
      senderOverride: normalizeNullableEmail(notificationsSource.senderOverride),
      fallbackRecipient: normalizeNullableEmail(notificationsSource.fallbackRecipient),
      events: {
        pickupReady: normalizeNotificationEventSettings(
          notificationEventsSource.pickupReady,
          DEFAULT_NOTIFICATION_EVENTS.pickupReady
        ),
        truckCollection: normalizeNotificationEventSettings(
          notificationEventsSource.truckCollection,
          DEFAULT_NOTIFICATION_EVENTS.truckCollection
        )
      }
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
  const incoming = partialSettings && typeof partialSettings === "object" ? partialSettings : {};
  const incomingNotifications = incoming.notifications && typeof incoming.notifications === "object"
    ? incoming.notifications
    : {};
  const incomingNotificationEvents = incomingNotifications.events && typeof incomingNotifications.events === "object"
    ? incomingNotifications.events
    : {};
  const merged = {
    ...current,
    ...incoming,
    sticker: {
      ...(current.sticker || {}),
      ...(incoming.sticker || {})
    },
    printHistory: {
      ...(current.printHistory || {}),
      ...(incoming.printHistory || {})
    },
    relay: {
      ...(current.relay || {}),
      ...(incoming.relay || {}),
      targets: ((incoming.relay && incoming.relay.targets) || current.relay?.targets || [])
    },
    controller: {
      ...(current.controller || {}),
      ...(incoming.controller || {}),
    },
    notifications: {
      ...(current.notifications || {}),
      ...incomingNotifications,
      events: {
        ...(current.notifications?.events || {}),
        ...incomingNotificationEvents,
        pickupReady: {
          ...(current.notifications?.events?.pickupReady || {}),
          ...(incomingNotificationEvents.pickupReady || {})
        },
        truckCollection: {
          ...(current.notifications?.events?.truckCollection || {}),
          ...(incomingNotificationEvents.truckCollection || {})
        }
      }
    }
  };
  return saveSystemSettings(merged);
}
