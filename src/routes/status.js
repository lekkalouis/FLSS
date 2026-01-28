import { Router } from "express";

import { config } from "../config.js";
import { getShopifyAdminToken } from "../services/shopify.js";
import { buildServiceStatus } from "../utils/http.js";

const router = Router();

router.get("/healthz", (_req, res) => res.json({ ok: true }));

router.get("/statusz", async (_req, res) => {
  const services = {
    server: buildServiceStatus(true, "Online")
  };

  const ppTokenRequired = String(config.PP_REQUIRE_TOKEN).toLowerCase() !== "false";
  const ppConfigured = Boolean(config.PP_BASE_URL) && (!ppTokenRequired || Boolean(config.PP_TOKEN));
  services.parcelPerfect = buildServiceStatus(
    ppConfigured,
    ppConfigured ? "Configured" : "Missing PP_BASE_URL or PP_TOKEN"
  );

  const printNodeConfigured = Boolean(config.PRINTNODE_API_KEY && config.PRINTNODE_PRINTER_ID);
  services.printNode = buildServiceStatus(
    printNodeConfigured,
    printNodeConfigured ? "Configured" : "Missing PRINTNODE settings"
  );

  const emailConfigured = Boolean(config.SMTP_HOST && config.SMTP_FROM);
  services.email = buildServiceStatus(
    emailConfigured,
    emailConfigured ? "Configured" : "Missing SMTP settings"
  );

  const shopifyConfigured = Boolean(
    config.SHOPIFY_STORE && config.SHOPIFY_CLIENT_ID && config.SHOPIFY_CLIENT_SECRET
  );
  if (!shopifyConfigured) {
    services.shopify = buildServiceStatus(false, "Missing Shopify settings");
  } else {
    try {
      await getShopifyAdminToken();
      services.shopify = buildServiceStatus(true, "Authenticated");
    } catch (err) {
      services.shopify = buildServiceStatus(false, "Auth failed");
    }
  }

  const ok = Object.values(services).every((service) => service.ok);
  res.json({ ok, checkedAt: new Date().toISOString(), services });
});

export default router;
