import { config } from "./src/config.js";
import { createApp } from "./src/app.js";

const { app, allowAllOrigins, allowedOrigins } = createApp();

app.listen(config.PORT, config.HOST, () => {
  const hostLabel = config.HOST === "0.0.0.0" ? "all interfaces" : config.HOST;
  console.log(`Scan Station server listening on http://${hostLabel}:${config.PORT}`);
  if (config.HOST === "localhost" || config.HOST === "127.0.0.1") {
    console.warn("Warning: HOST is loopback-only; other devices on your LAN cannot connect.");
  }
  console.log(`Allowed origins: ${allowAllOrigins ? "*" : [...allowedOrigins].join(", ")}`);
  console.log("PP_BASE_URL:", config.PP_BASE_URL || "(NOT SET)");
  console.log(
    "Shopify configured:",
    Boolean(config.SHOPIFY_STORE && config.SHOPIFY_CLIENT_ID && config.SHOPIFY_CLIENT_SECRET)
  );
});
