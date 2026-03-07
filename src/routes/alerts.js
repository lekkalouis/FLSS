import { Router } from "express";

import { config } from "../config.js";
import { getSmtpTransport } from "../services/email.js";
import {
  NOTIFICATION_EVENT_KEYS
} from "../services/notificationTemplateRegistry.js";
import { sendNotificationEmail } from "../services/notificationRuntime.js";
import { badRequest } from "../utils/http.js";

const router = Router();

function requireTruckEmailConfigured(res) {
  if (!config.SMTP_HOST) {
    res.status(501).json({
      error: "TRUCK_EMAIL_NOT_CONFIGURED",
      message: "Set SMTP_HOST in .env to send truck alerts."
    });
    return false;
  }
  return true;
}

router.post("/alerts/book-truck", async (req, res) => {
  if (!requireTruckEmailConfigured(res)) return;
  const { parcelCount, bookedParcelCount = 0, reason = "auto" } = req.body || {};
  const count = Number(parcelCount || 0);
  if (!count || Number.isNaN(count)) {
    return badRequest(res, "parcelCount is required");
  }

  try {
    const transport = getSmtpTransport();
    const result = await sendNotificationEmail({
      transport,
      eventKey: NOTIFICATION_EVENT_KEYS.TRUCK_COLLECTION,
      fallbackFrom: config.SMTP_FROM,
      context: {
        shop: {
          name: "Flippen Lekka Scan Station"
        },
        logistics: {
          provider_name: String(req.body?.providerName || "SWE Couriers"),
          collection_date: new Date().toLocaleDateString("en-ZA", {
            year: "numeric",
            month: "short",
            day: "numeric"
          }),
          reason: String(reason || "auto")
        },
        metrics: {
          parcel_count: count,
          booked_parcel_count: Number(bookedParcelCount || 0)
        }
      }
    });

    res.json({
      ok: true,
      messageId: result.info?.messageId || null,
      to: result.to,
      subject: result.subject,
      templateId: result.template?.id || null
    });
  } catch (err) {
    if (err?.code === "EMAIL_NOT_CONFIGURED") {
      return res.status(501).json({
        error: "TRUCK_EMAIL_NOT_CONFIGURED",
        message: "Configure a sender in settings or set SMTP_FROM in .env before sending truck alerts."
      });
    }
    if (err?.code === "NO_NOTIFICATION_RECIPIENTS") {
      return res.status(400).json({
        error: "TRUCK_EMAIL_RECIPIENTS_MISSING",
        message: err.message
      });
    }
    return res.status(500).json({ error: "TRUCK_EMAIL_ERROR", message: err?.message || String(err) });
  }
});

export default router;
