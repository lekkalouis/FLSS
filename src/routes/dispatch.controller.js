import { Router } from "express";

import { config } from "../config.js";
import {
  confirm,
  requestFulfill,
  requestPrint,
  confirmHold,
  setPackedQty,
  adjustPackedQty,
  getEnvironmentState,
  getRemoteState,
  getState,
  next,
  onCustomEvent,
  onStateChange,
  prev,
  recordRemoteHeartbeat,
  syncState,
  upsertEnvironmentReading
} from "../services/dispatchController.js";

const router = Router();
const lastActionAtByKey = new Map();
const remoteIdempotencyByRemote = new Map();

function getRequestIp(req) {
  const raw = String(req.ip || req.socket?.remoteAddress || "");
  return raw.replace("::ffff:", "") || "unknown";
}

function isPrivateIp(ip) {
  if (!ip) return false;
  if (ip === "127.0.0.1" || ip === "::1") return true;
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return false;
  if (parts[0] === 10) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  return false;
}

function isAuthorized(req) {
  const token = String(config.ROTARY_TOKEN || "").trim();
  const authHeader = String(req.get("authorization") || "").trim();
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  if (token) {
    return bearerToken && bearerToken === token;
  }

  return isPrivateIp(getRequestIp(req));
}

function isRemoteAuthorized(req) {
  const token = String(config.REMOTE_TOKEN || "").trim();
  if (!token) return isAuthorized(req);
  const authHeader = String(req.get("authorization") || "").trim();
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  return bearerToken && bearerToken === token;
}

function unauthorizedResponse(res) {
  const hasToken = Boolean(String(config.ROTARY_TOKEN || "").trim());
  return res.status(hasToken ? 401 : 403).json({
    ok: false,
    error: hasToken ? "Unauthorized" : "Forbidden"
  });
}

function remoteUnauthorizedResponse(res) {
  const hasToken = Boolean(String(config.REMOTE_TOKEN || "").trim());
  return res.status(hasToken ? 401 : 403).json({
    ok: false,
    error: hasToken ? "Unauthorized" : "Forbidden"
  });
}

function shouldDebounce(req, actionName) {
  const debounceMs = Number(config.ROTARY_DEBOUNCE_MS) || 40;
  const source = String(req.body?.source || "unknown").trim() || "unknown";
  const key = `${getRequestIp(req)}:${source}:${actionName}`;
  const now = Date.now();
  const lastAt = lastActionAtByKey.get(key) || 0;
  if (now - lastAt < debounceMs) {
    return true;
  }
  lastActionAtByKey.set(key, now);
  return false;
}

function logAction(action, req, beforeState, afterState) {
  if (config.NODE_ENV === "production") return;
  console.debug("[rotary] action", {
    action,
    sourceIp: getRequestIp(req),
    source: req.body?.source || null,
    selectedBefore: beforeState?.selectedOrderId || null,
    selectedAfter: afterState?.selectedOrderId || null
  });
}

router.get("/dispatch/state", (req, res) => {
  const state = getState();
  res.json({ ok: true, ...state });
});

router.post("/dispatch/state", (req, res) => {
  const state = syncState({
    queueOrderIds: req.body?.queueOrderIds,
    lineItemKeysByOrderId: req.body?.lineItemKeysByOrderId,
    mode: req.body?.mode
  });
  res.json({ ok: true, ...state });
});

router.get("/dispatch/environment", (req, res) => {
  const environment = getEnvironmentState({ staleMs: config.ENV_STALE_MS });
  res.json({ ok: true, environment });
});

router.post("/dispatch/environment", (req, res) => {
  if (!isRemoteAuthorized(req)) {
    return remoteUnauthorizedResponse(res);
  }
  try {
    const environment = upsertEnvironmentReading(req.body, {
      staleMs: config.ENV_STALE_MS,
      tempMin: config.ENV_TEMP_MIN_C,
      tempMax: config.ENV_TEMP_MAX_C,
      humidityMin: config.ENV_HUMIDITY_MIN,
      humidityMax: config.ENV_HUMIDITY_MAX
    });
    return res.json({ ok: true, environment });
  } catch (error) {
    if (error?.code === "INVALID_ENVIRONMENT_PAYLOAD") {
      return res.status(400).json({ ok: false, error: error.message });
    }
    return res.status(500).json({ ok: false, error: "Failed to save environment reading" });
  }
});

router.post("/dispatch/remote/heartbeat", (req, res) => {
  if (!isRemoteAuthorized(req)) {
    return remoteUnauthorizedResponse(res);
  }
  try {
    const remote = recordRemoteHeartbeat(req.body, { staleMs: config.REMOTE_HEARTBEAT_STALE_MS });
    return res.json({ ok: true, remote });
  } catch (error) {
    if (error?.code === "INVALID_REMOTE_PAYLOAD") {
      return res.status(400).json({ ok: false, error: error.message });
    }
    return res.status(500).json({ ok: false, error: "Failed to record remote heartbeat" });
  }
});

router.get("/dispatch/remote/status", (req, res) => {
  const remote = getRemoteState({ staleMs: config.REMOTE_HEARTBEAT_STALE_MS });
  res.json({ ok: true, remote });
});

router.post("/dispatch/remote/action", (req, res) => {
  if (!isRemoteAuthorized(req)) {
    return remoteUnauthorizedResponse(res);
  }

  const action = String(req.body?.action || "").trim().toLowerCase();
  const remoteId = String(req.body?.remoteId || "unknown").trim() || "unknown";
  const idempotencyKey = String(req.body?.idempotencyKey || "").trim();
  if (!action) {
    return res.status(400).json({ ok: false, error: "action is required" });
  }

  const allowed = new Set(["next", "prev", "confirm", "print", "fulfill", "confirm_hold", "set_packed_qty", "qty_increase", "qty_decrease"]);
  if (!allowed.has(action)) {
    return res.status(400).json({ ok: false, error: "Unsupported remote action" });
  }

  if (idempotencyKey) {
    const lastKey = remoteIdempotencyByRemote.get(remoteId);
    if (lastKey && lastKey === idempotencyKey) {
      const state = getState();
      return res.json({ ok: true, action, selectedOrderId: state.selectedOrderId, selectedLineItemKey: state.selectedLineItemKey, deduped: true });
    }
    remoteIdempotencyByRemote.set(remoteId, idempotencyKey);
  }

  try {
    let state;
    if (action === "next") state = next();
    if (action === "prev") state = prev();
    if (action === "confirm") state = confirm();
    if (action === "print") state = requestPrint();
    if (action === "fulfill") state = requestFulfill();
    if (action === "confirm_hold") state = confirmHold();
    if (action === "set_packed_qty") {
      state = setPackedQty({
        lineItemKey: req.body?.lineItemKey ?? req.body?.selectedLineItemKey,
        qty: req.body?.qty
      });
    }
    if (action === "qty_increase") {
      state = adjustPackedQty({
        lineItemKey: req.body?.lineItemKey ?? req.body?.selectedLineItemKey,
        delta: 1
      });
    }
    if (action === "qty_decrease") {
      state = adjustPackedQty({
        lineItemKey: req.body?.lineItemKey ?? req.body?.selectedLineItemKey,
        delta: -1
      });
    }
    return res.json({ ok: true, action, selectedOrderId: state?.selectedOrderId || null, selectedLineItemKey: state?.selectedLineItemKey || null });
  } catch (error) {
    if (error?.code === "NO_SELECTED_ORDER") {
      return res.status(409).json({ ok: false, action, error: error.message });
    }
    if (error?.code === "INVALID_REMOTE_PAYLOAD") {
      return res.status(400).json({ ok: false, action, error: error.message });
    }
    return res.status(500).json({ ok: false, action, error: "Failed to apply remote action" });
  }
});

router.get("/dispatch/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const sendEvent = (eventName, payload) => {
    res.write(`event: ${eventName}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  sendEvent("ready", {
    state: getState(),
    environment: getEnvironmentState({ staleMs: config.ENV_STALE_MS }),
    remote: getRemoteState({ staleMs: config.REMOTE_HEARTBEAT_STALE_MS }),
    connectedAt: new Date().toISOString()
  });

  const unsubscribeState = onStateChange((payload) => {
    sendEvent("state-change", payload);
  });

  const unsubscribeCustom = onCustomEvent((payload) => {
    sendEvent(payload.event || "dispatch-event", payload.payload || {});
  });

  const keepAlive = setInterval(() => {
    res.write(`: keepalive ${Date.now()}\n\n`);
  }, 15000);

  req.on("close", () => {
    clearInterval(keepAlive);
    unsubscribeState();
    unsubscribeCustom();
  });
});

function handleAction(actionName, fn) {
  return (req, res) => {
    if (!isAuthorized(req)) {
      return unauthorizedResponse(res);
    }

    if (shouldDebounce(req, actionName)) {
      const state = getState();
      return res.json({ ok: true, action: actionName, selectedOrderId: state.selectedOrderId, selectedLineItemKey: state.selectedLineItemKey, debounced: true });
    }

    const beforeState = getState();
    try {
      const state = fn();
      logAction(actionName, req, beforeState, state);
      return res.json({ ok: true, action: actionName, selectedOrderId: state.selectedOrderId, selectedLineItemKey: state.selectedLineItemKey });
    } catch (error) {
      if (error?.code === "NO_SELECTED_ORDER") {
        return res.status(409).json({ ok: false, action: actionName, error: error.message });
      }
      return res.status(500).json({ ok: false, action: actionName, error: "Failed to apply action" });
    }
  };
}

router.post("/dispatch/next", handleAction("next", () => next()));
router.post("/dispatch/prev", handleAction("prev", () => prev()));
router.post("/dispatch/confirm", handleAction("confirm", () => confirm()));
router.post("/dispatch/print", handleAction("print", () => requestPrint()));
router.post("/dispatch/fulfill", handleAction("fulfill", () => requestFulfill()));

export default router;
