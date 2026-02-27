import { Router } from "express";

import { config } from "../config.js";
import {
  confirm,
  getState,
  next,
  prev,
  syncState
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

function enforceAuth(req, res, nextMiddleware) {
  if (isAuthorized(req)) return nextMiddleware();
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

router.use("/dispatch", enforceAuth);

router.get("/dispatch/state", (req, res) => {
  const state = getState();
  res.json({ ok: true, ...state });
});

router.post("/dispatch/state", (req, res) => {
  const state = syncState({
    queueOrderIds: req.body?.queueOrderIds,
    mode: req.body?.mode
  });
  res.json({ ok: true, ...state });
});

function handleAction(actionName, fn) {
  return (req, res) => {
    if (shouldDebounce(req, actionName)) {
      const state = getState();
      return res.json({ ok: true, action: actionName, selectedOrderId: state.selectedOrderId, debounced: true });
    }

    const beforeState = getState();
    try {
      const state = fn();
      logAction(actionName, req, beforeState, state);
      return res.json({ ok: true, action: actionName, selectedOrderId: state.selectedOrderId });
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

export default router;
