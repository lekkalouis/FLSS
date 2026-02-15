import { Router } from "express";

import { config } from "../../config.js";
import { getSmtpTransport } from "../../services/email.js";
import { badRequest } from "../../utils/http.js";
import { requireCustomerEmailConfigured } from "./shared.js";

const router = Router();
router.post("/shopify/notify-collection", async (req, res) => {
  try {
    if (!requireCustomerEmailConfigured(res)) return;
    const { orderNo, email, customerName, parcelCount = 0, weightKg = 0 } = req.body || {};

    if (!email) {
      return badRequest(res, "Missing customer email address");
    }

    const safeOrderNo = orderNo ? `#${String(orderNo).replace("#", "")}` : "your order";
    const safeName = customerName || "there";
    const weightLabel = Number(weightKg || 0).toFixed(2);
    const parcelsLabel = Number(parcelCount || 0);
    const subject = `Order ${safeOrderNo} ready for collection`;
    const text = `Hi ${safeName},

Your order ${safeOrderNo} is ready for collection by your courier.

Order weight: ${weightLabel} kg
Parcels packed: ${parcelsLabel}

Thank you.`;

    const transport = getSmtpTransport();
    await transport.sendMail({
      from: config.SMTP_FROM,
      to: email,
      subject,
      text
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error("Notify collection error:", err);
    return res.status(502).json({
      error: "UPSTREAM_ERROR",
      message: String(err?.message || err)
    });
  }
});


export default router;
