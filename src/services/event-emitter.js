const MAX_EVENTS = 50000;
const eventLedger = [];

function normalizeEvent(payload = {}) {
  const timestamp = payload.timestamp ? new Date(payload.timestamp) : new Date();
  if (Number.isNaN(timestamp.getTime())) {
    throw new Error("Invalid timestamp");
  }
  if (!payload.order_id || !payload.action_code) {
    throw new Error("order_id and action_code are required");
  }

  return {
    order_id: String(payload.order_id),
    action_code: String(payload.action_code),
    system: payload.system ? String(payload.system) : "FLSS",
    automated: payload.automated !== false,
    operator_id: payload.operator_id ? String(payload.operator_id) : null,
    timestamp: timestamp.toISOString()
  };
}

export function emitEvent(payload) {
  const event = normalizeEvent(payload);
  eventLedger.push(event);
  if (eventLedger.length > MAX_EVENTS) {
    eventLedger.splice(0, eventLedger.length - MAX_EVENTS);
  }
  return event;
}

export function emitEvents(batch = []) {
  if (!Array.isArray(batch)) throw new Error("events must be an array");
  return batch.map((entry) => emitEvent(entry));
}

export function getEvents() {
  return [...eventLedger];
}

export function clearEvents() {
  eventLedger.length = 0;
}
