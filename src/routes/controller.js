import { Router } from "express";

import { controllerBridge } from "../services/controllerBridge.js";

const router = Router();

router.get("/controller/status", (_req, res) => {
  res.json({ ok: true, ...controllerBridge.getStatus() });
});

router.get("/controller/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const sendEvent = (eventName, payload) => {
    res.write(`event: ${eventName}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  sendEvent("ready", controllerBridge.getStatus());

  const unsubscribeEvent = controllerBridge.onEvent((payload) => sendEvent("controller-event", payload));
  const unsubscribeStatus = controllerBridge.onStatus((payload) => sendEvent("controller-status", payload));

  const keepAlive = setInterval(() => {
    res.write(`: keepalive ${Date.now()}\n\n`);
  }, 15000);

  req.on("close", () => {
    clearInterval(keepAlive);
    unsubscribeEvent();
    unsubscribeStatus();
  });
});

export default router;
