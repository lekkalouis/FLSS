import dotenv from "dotenv";

dotenv.config();

export const config = {
  PORT: process.env.PORT || 3000,
  HOST: process.env.HOST || "0.0.0.0",
  NODE_ENV: process.env.NODE_ENV || "development",

  PP_BASE_URL: process.env.PP_BASE_URL || "",
  PP_TOKEN: process.env.PP_TOKEN || "",
  PP_REQUIRE_TOKEN: process.env.PP_REQUIRE_TOKEN || "true",
  PP_ACCNUM: process.env.PP_ACCNUM,
  PP_PLACE_ID: process.env.PP_PLACE_ID,

  SHOPIFY_STORE: process.env.SHOPIFY_STORE,
  SHOPIFY_CLIENT_ID: process.env.SHOPIFY_CLIENT_ID,
  SHOPIFY_CLIENT_SECRET: process.env.SHOPIFY_CLIENT_SECRET,
  SHOPIFY_API_VERSION: process.env.SHOPIFY_API_VERSION || "2025-10",
  SHOPIFY_FLOW_TAG: process.env.SHOPIFY_FLOW_TAG || "dispatch_flow",

  PRINTNODE_API_KEY: process.env.PRINTNODE_API_KEY,
  PRINTNODE_PRINTER_ID: process.env.PRINTNODE_PRINTER_ID,

  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: process.env.SMTP_PORT || 587,
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  SMTP_SECURE: process.env.SMTP_SECURE || "false",
  SMTP_FROM: process.env.SMTP_FROM,
  TRUCK_EMAIL_TO: process.env.TRUCK_EMAIL_TO,

  FRONTEND_ORIGIN: process.env.FRONTEND_ORIGIN,
  UI_COST_ALERT_THRESHOLD: Number(process.env.UI_COST_ALERT_THRESHOLD ?? 250),
  UI_BOOKING_IDLE_MS: Number(process.env.UI_BOOKING_IDLE_MS ?? 6000),
  UI_TRUCK_ALERT_THRESHOLD: Number(process.env.UI_TRUCK_ALERT_THRESHOLD ?? 25),
  UI_BOX_DIM1: Number(process.env.UI_BOX_DIM1 ?? 40),
  UI_BOX_DIM2: Number(process.env.UI_BOX_DIM2 ?? 40),
  UI_BOX_DIM3: Number(process.env.UI_BOX_DIM3 ?? 30),
  UI_BOX_MASS_KG: Number(process.env.UI_BOX_MASS_KG ?? 5),
  UI_PP_ENDPOINT: process.env.UI_PP_ENDPOINT || "/pp",
  UI_SHOPIFY_PROXY_BASE: process.env.UI_SHOPIFY_PROXY_BASE || "/shopify",
  UI_FEATURE_FLOW_TRIGGER: process.env.UI_FEATURE_FLOW_TRIGGER || "true",
  UI_ORIG_PERS: process.env.UI_ORIG_PERS || "Flippen Lekka Holdings (Pty) Ltd",
  UI_ORIG_PER_ADD1: process.env.UI_ORIG_PER_ADD1 || "7 Papawer Street",
  UI_ORIG_PER_ADD2: process.env.UI_ORIG_PER_ADD2 || "Blomtuin, Bellville",
  UI_ORIG_PER_ADD3: process.env.UI_ORIG_PER_ADD3 || "Cape Town, Western Cape",
  UI_ORIG_PER_ADD4: process.env.UI_ORIG_PER_ADD4 || "ZA",
  UI_ORIG_PER_PCODE: process.env.UI_ORIG_PER_PCODE || "7530",
  UI_ORIG_TOWN: process.env.UI_ORIG_TOWN || "Cape Town",
  UI_ORIG_PLACE: Number(process.env.UI_ORIG_PLACE ?? 4663),
  UI_ORIG_PER_CONTACT: process.env.UI_ORIG_PER_CONTACT || "Louis",
  UI_ORIG_PER_PHONE: process.env.UI_ORIG_PER_PHONE || "0730451885",
  UI_ORIG_PER_CELL: process.env.UI_ORIG_PER_CELL || "0730451885",
  UI_ORIG_NOTIFY_PERS: Number(process.env.UI_ORIG_NOTIFY_PERS ?? 1),
  UI_ORIG_PER_EMAIL: process.env.UI_ORIG_PER_EMAIL || "admin@flippenlekkaspices.co.za",
  UI_ORIG_NOTES: process.env.UI_ORIG_NOTES || "Louis 0730451885 / Michael 0783556277"
};

export function getFrontendOrigin() {
  if (config.FRONTEND_ORIGIN) return config.FRONTEND_ORIGIN;
  return "*";
}
