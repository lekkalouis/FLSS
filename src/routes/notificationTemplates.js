import { Router } from "express";

import {
  deleteNotificationTemplate,
  loadNotificationTemplates,
  upsertNotificationTemplate
} from "../services/notificationTemplateRegistry.js";

const router = Router();

router.get("/notification-templates", async (_req, res) => {
  try {
    const templates = await loadNotificationTemplates();
    res.json({ templates });
  } catch (error) {
    res.status(500).json({ error: "Failed to load notification templates", details: error.message });
  }
});

router.post("/notification-templates", async (req, res) => {
  try {
    const template = await upsertNotificationTemplate(req.body || {});
    return res.json({ ok: true, template });
  } catch (error) {
    if (error?.code === "INVALID_TEMPLATE") {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: "Failed to save notification template", details: error.message });
  }
});

router.delete("/notification-templates/:id", async (req, res) => {
  try {
    await deleteNotificationTemplate(req.params.id);
    return res.json({ ok: true });
  } catch (error) {
    if (error?.code === "INVALID_TEMPLATE") {
      return res.status(400).json({ error: error.message });
    }
    if (error?.code === "TEMPLATE_NOT_FOUND") {
      return res.status(404).json({ error: error.message });
    }
    return res.status(500).json({ error: "Failed to delete notification template", details: error.message });
  }
});

export default router;
