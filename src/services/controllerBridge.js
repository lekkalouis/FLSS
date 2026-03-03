import { EventEmitter } from "events";

const VALID_EVENTS = new Set(["ROTATE", "PRESS", "HOLD", "SENSOR"]);
const VALID_ROTATE_DIR = new Set(["CW", "CCW"]);
const VALID_BUTTONS = new Set(["CONFIRM", "BACK", "QUICK", "MODE", "SHIFT"]);
const VALID_ACTIONS = new Set(["down", "up", "click", "long"]);

function nowIso() {
  return new Date().toISOString();
}

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export class ControllerBridge {
  constructor({ minIntervalMs = 25, staleAfterMs = 30000 } = {}) {
    this.minIntervalMs = Math.max(1, Number(minIntervalMs) || 25);
    this.staleAfterMs = Math.max(1000, Number(staleAfterMs) || 30000);
    this.events = new EventEmitter();
    this.controllers = new Map();
    this.lastAcceptedAtBySource = new Map();
  }

  touchConnection(source, connectionMeta = {}) {
    const key = String(source || "unknown").trim() || "unknown";
    const previous = this.controllers.get(key) || {};
    this.controllers.set(key, {
      ...previous,
      source: key,
      connected: true,
      lastSeenAt: nowIso(),
      lastHeartbeatAt: nowIso(),
      remoteAddress: connectionMeta.remoteAddress || previous.remoteAddress || null,
      protocol: connectionMeta.protocol || previous.protocol || "ws",
      lastEvent: previous.lastEvent || null,
      sensor: previous.sensor || null
    });
    this.events.emit("controller-status", this.getControllerSnapshot(key));
  }

  disconnect(source) {
    const key = String(source || "unknown").trim() || "unknown";
    const previous = this.controllers.get(key);
    if (!previous) return;
    this.controllers.set(key, {
      ...previous,
      connected: false,
      lastSeenAt: nowIso()
    });
    this.events.emit("controller-status", this.getControllerSnapshot(key));
  }

  ingest(rawEvent) {
    const parsed = this.#validateEvent(rawEvent);
    const source = parsed.source;
    const lastAcceptedAt = this.lastAcceptedAtBySource.get(source) || 0;
    const nowMs = Date.now();
    if (nowMs - lastAcceptedAt < this.minIntervalMs) {
      return { ok: false, code: "RATE_LIMITED", reason: "Event dropped due to rate limit" };
    }
    this.lastAcceptedAtBySource.set(source, nowMs);

    const previous = this.controllers.get(source) || {};
    const next = {
      ...previous,
      source,
      connected: true,
      lastSeenAt: nowIso(),
      lastHeartbeatAt: nowIso(),
      lastEvent: parsed
    };

    if (parsed.event === "SENSOR") {
      next.sensor = {
        tempC: parsed.data.temp_c,
        humidity: parsed.data.humidity,
        ts: parsed.ts
      };
    }

    this.controllers.set(source, next);
    this.events.emit("controller-event", parsed);
    this.events.emit("controller-status", this.getControllerSnapshot(source));

    return { ok: true, event: parsed };
  }

  getControllerSnapshot(source) {
    const key = String(source || "").trim();
    const controller = this.controllers.get(key);
    if (!controller) return null;
    const stale = Date.now() - new Date(controller.lastSeenAt).getTime() > this.staleAfterMs;
    return { ...controller, stale };
  }

  getStatus() {
    return {
      controllers: [...this.controllers.values()].map((controller) => ({
        ...controller,
        stale: Date.now() - new Date(controller.lastSeenAt).getTime() > this.staleAfterMs
      })),
      updatedAt: nowIso()
    };
  }

  onEvent(listener) {
    this.events.on("controller-event", listener);
    return () => this.events.off("controller-event", listener);
  }

  onStatus(listener) {
    this.events.on("controller-status", listener);
    return () => this.events.off("controller-status", listener);
  }

  #validateEvent(rawEvent) {
    if (!rawEvent || typeof rawEvent !== "object") {
      throw this.#invalid("Payload must be an object");
    }

    const type = String(rawEvent.type || "").trim();
    const source = String(rawEvent.source || "").trim();
    const event = String(rawEvent.event || "").trim().toUpperCase();
    const ts = String(rawEvent.ts || nowIso()).trim();
    const data = rawEvent.data && typeof rawEvent.data === "object" ? rawEvent.data : {};

    if (type !== "controller") throw this.#invalid("type must be controller");
    if (!source) throw this.#invalid("source is required");
    if (!VALID_EVENTS.has(event)) throw this.#invalid(`Unsupported event: ${event}`);

    if (event === "ROTATE") {
      const dir = String(data.dir || "").trim().toUpperCase();
      const steps = Math.trunc(toFiniteNumber(data.steps) ?? 0);
      const shift = Boolean(data.shift);
      if (!VALID_ROTATE_DIR.has(dir)) throw this.#invalid("ROTATE dir must be CW or CCW");
      if (!Number.isInteger(steps) || steps < 1) throw this.#invalid("ROTATE steps must be >= 1");
      return { type, source, ts, event, data: { dir, steps, shift } };
    }

    if (event === "PRESS" || event === "HOLD") {
      const button = String(data.button || "").trim().toUpperCase();
      const action = String(data.action || "").trim().toLowerCase();
      const shift = Boolean(data.shift);
      if (!VALID_BUTTONS.has(button)) throw this.#invalid("Invalid button");
      if (!VALID_ACTIONS.has(action)) throw this.#invalid("Invalid press action");
      return { type, source, ts, event, data: { button, action, shift } };
    }

    const temp = toFiniteNumber(data.temp_c);
    const humidity = toFiniteNumber(data.humidity);
    if (temp === null || humidity === null) throw this.#invalid("SENSOR requires numeric temp_c and humidity");
    return { type, source, ts, event, data: { temp_c: temp, humidity } };
  }

  #invalid(message) {
    const error = new Error(message);
    error.code = "INVALID_CONTROLLER_EVENT";
    return error;
  }
}

export const controllerBridge = new ControllerBridge();
