import { config } from "./src/config.js";
import { createApp } from "./src/app.js";
import { startOrderEconomicsCron, stopOrderEconomicsCron } from "./src/services/order-economics-cron.js";

const { app, allowAllOrigins, allowedOrigins } = createApp();

const server = app.listen(config.PORT, config.HOST, () => {
  startOrderEconomicsCron();
  const hostLabel = config.HOST === "0.0.0.0" ? "all interfaces" : config.HOST;
  const shopifyConfigured = Boolean(
    config.SHOPIFY_STORE && config.SHOPIFY_CLIENT_ID && config.SHOPIFY_CLIENT_SECRET
  );

  console.log(`Scan Station server listening on http://${hostLabel}:${config.PORT}`);
  console.log(`NODE_ENV: ${config.NODE_ENV}`);
  console.log(`HOST: ${config.HOST}`);
  console.log(`PORT: ${config.PORT}`);
  console.log(`FRONTEND_ORIGIN: ${config.FRONTEND_ORIGIN || "(NOT SET)"}`);
  if (config.HOST === "localhost" || config.HOST === "127.0.0.1") {
    console.warn("Warning: HOST is loopback-only; other devices on your LAN cannot connect.");
  }
  console.log(`Allowed origins: ${allowAllOrigins ? "*" : [...allowedOrigins].join(", ") || "(none)"}`);
  console.log("PP_BASE_URL:", config.PP_BASE_URL || "(NOT SET)");
  console.log("Shopify configured:", shopifyConfigured);
});

function shutdown(signal) {
  console.log(`${signal} received. Shutting down FLSS server...`);
  server.close((err) => {
    if (err) {
      console.error("Error while closing server:", err);
      process.exit(1);
    }
    stopOrderEconomicsCron();
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
