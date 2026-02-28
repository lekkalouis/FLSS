import { Router } from "express";

import { config } from "../config.js";
import {
  confirm,
  getState,
  next,
  prev,
  requestFulfill,
  requestPrint,
  syncState,
  onStateChange
} from "../services/dispatchController.js";

const router = Router();
const lastActionAtByKey = new Map();

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

function unauthorizedResponse(res) {
  const hasToken = Boolean(String(config.ROTARY_TOKEN || "").trim());
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


router.get("/dispatch/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const sendEvent = (eventName, payload) => {
    res.write(`event: ${eventName}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  sendEvent("ready", { state: getState(), connectedAt: new Date().toISOString() });

  const unsubscribe = onStateChange((payload) => {
    sendEvent("state-change", payload);
  });

  const keepAlive = setInterval(() => {
    res.write(`: keepalive ${Date.now()}\n\n`);
  }, 15000);

  req.on("close", () => {
    clearInterval(keepAlive);
    unsubscribe();
  });
});

function handleAction(actionName, fn) {
  return (req, res) => {
    if (!isAuthorized(req)) {
      return unauthorizedResponse(res);
    }

    if (shouldDebounce(req, actionName)) {
      const state = getState();
      return res.json({
        ok: true,
        action: actionName,
        selectedOrderId: state.selectedOrderId,
        selectedLineItemKey: state.selectedLineItemKey || null,
        debounced: true
      });
    }

    const beforeState = getState();
    try {
      const state = fn();
      logAction(actionName, req, beforeState, state);
      return res.json({
        ok: true,
        action: actionName,
        selectedOrderId: state.selectedOrderId,
        selectedLineItemKey: state.selectedLineItemKey || null
      });
    } catch (error) {
      if (error?.code === "NO_SELECTED_ORDER" || error?.code === "NO_SELECTED_LINE_ITEM") {
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
