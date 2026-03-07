import { Router } from "express";

import { config } from "../config.js";
import { getSmtpTransport } from "../services/email.js";
import {
  buildNotificationTestContext,
  sendNotificationEmail
} from "../services/notificationRuntime.js";
import {
  DEFAULT_SYSTEM_SETTINGS,
  getSystemSettings,
  patchSystemSettings
} from "../services/systemSettings.js";

const router = Router();

router.get("/system/settings", (_req, res) => {
  try {
    const settings = getSystemSettings();
    return res.json({
      ok: true,
      settings
    });
  } catch (error) {
    return res.status(500).json({
      error: "SETTINGS_READ_FAILED",
      message: String(error?.message || error),
      defaults: DEFAULT_SYSTEM_SETTINGS
    });
  }
});

router.put("/system/settings", (req, res) => {
  try {
    const incoming = req.body && typeof req.body === "object" ? req.body : {};
    const settings = patchSystemSettings(incoming);
    return res.json({ ok: true, settings });
  } catch (error) {
    return res.status(500).json({
      error: "SETTINGS_WRITE_FAILED",
      message: String(error?.message || error)
    });
  }
});

router.post("/system/settings/notifications/test", async (req, res) => {
  try {
    const settings = getSystemSettings();
    const eventKey = String(req.body?.eventKey || "").trim() || "pickup-ready";
    const overrideRecipients = req.body?.to ?? req.body?.recipients ?? null;
    const transport = getSmtpTransport();
    const result = await sendNotificationEmail({
      transport,
      eventKey,
      settings,
      fallbackFrom: config.SMTP_FROM,
      overrideRecipients,
      ignoreEventEnabled: true,
      context: buildNotificationTestContext(eventKey)
    });

    return res.json({
      ok: true,
      eventKey,
      templateId: result.template?.id || null,
      to: result.to || [],
      subject: result.subject,
      messageId: result.info?.messageId || null
    });
  } catch (error) {
    if (error?.code === "EMAIL_NOT_CONFIGURED") {
      return res.status(501).json({
        error: "EMAIL_NOT_CONFIGURED",
        message: "Configure SMTP_HOST and SMTP_FROM before sending notification tests."
      });
    }
    if (error?.code === "NO_NOTIFICATION_RECIPIENTS") {
      return res.status(400).json({
        error: "NO_NOTIFICATION_RECIPIENTS",
        message: error.message
      });
    }
    if (error?.code === "TEMPLATE_NOT_FOUND" || error?.code === "INVALID_NOTIFICATION_EVENT") {
      return res.status(400).json({
        error: error.code,
        message: error.message
      });
    }
    return res.status(500).json({
      error: "NOTIFICATION_TEST_FAILED",
      message: String(error?.message || error)
    });
  }
});

router.post("/system/printers/:printerId/reboot", (req, res) => {
  const printerId = Number(req.params.printerId);
  if (!Number.isInteger(printerId) || printerId <= 0) {
    return res.status(400).json({ error: "BAD_REQUEST", message: "Invalid printerId" });
  }
  return res.status(501).json({
    error: "REBOOT_NOT_CONFIGURED",
    message: "Printer relay reboot is not configured yet. Map relayTarget/relayChannel in system settings first."
  });
});

export default router;
