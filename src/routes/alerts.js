import { Router } from "express";

import { config } from "../config.js";
import { getSmtpTransport } from "../services/email.js";
import { badRequest } from "../utils/http.js";

const router = Router();

function requireTruckEmailConfigured(res) {
  if (!config.SMTP_HOST || !config.SMTP_FROM || !config.TRUCK_EMAIL_TO) {
    res.status(501).json({
      error: "TRUCK_EMAIL_NOT_CONFIGURED",
      message: "Set SMTP_HOST, SMTP_FROM, and TRUCK_EMAIL_TO in .env to send truck alerts."
    });
    return false;
  }
  return true;
}

router.post("/alerts/book-truck", async (req, res) => {
  if (!requireTruckEmailConfigured(res)) return;
  const { parcelCount, reason = "auto" } = req.body || {};
  const count = Number(parcelCount || 0);
  if (!count || Number.isNaN(count)) {
    return badRequest(res, "parcelCount is required");
  }

  const toList = String(config.TRUCK_EMAIL_TO || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (!toList.length) {
    return badRequest(res, "TRUCK_EMAIL_TO is empty");
  }

  const subject = `Truck collection request - ${count} parcels`;
  const today = new Date().toLocaleDateString("en-ZA", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
  const text = `Hi SWE Couriers,

Please arrange a truck collection for today's parcels.

Date: ${today}
Parcel count: ${count}
Reason: ${reason}

Thank you,
Flippen Lekka Scan Station`;

  try {
    const transport = getSmtpTransport();
    const info = await transport.sendMail({
      from: config.SMTP_FROM,
      to: toList.join(", "),
      subject,
      text
    });
    res.json({ ok: true, messageId: info.messageId, to: toList, subject });
  } catch (err) {
    res.status(500).json({ error: "TRUCK_EMAIL_ERROR", message: err?.message || String(err) });
  }
});

export default router;
