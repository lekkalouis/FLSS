import dotenv from "dotenv";

dotenv.config();

const nodeEnv = process.env.NODE_ENV || "development";
const frontendOrigin = process.env.FRONTEND_ORIGIN || "";

if (nodeEnv === "production" && !frontendOrigin) {
  console.warn(
    "[config] FRONTEND_ORIGIN is not set in production; CORS will deny browser origins until an explicit origin is configured."
  );
}

export const config = {
  PORT: process.env.PORT || 3000,
  HOST: process.env.HOST || "0.0.0.0",
  NODE_ENV: nodeEnv,

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
  CUSTOMER_DOCS_DIR: process.env.CUSTOMER_DOCS_DIR,

  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: process.env.SMTP_PORT || 587,
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  SMTP_SECURE: process.env.SMTP_SECURE || "false",
  SMTP_FROM: process.env.SMTP_FROM,
  TRUCK_EMAIL_TO: process.env.TRUCK_EMAIL_TO,

  FRONTEND_ORIGIN: frontendOrigin,
  ADMIN_TOKEN: process.env.ADMIN_TOKEN,

  UI_COST_ALERT_THRESHOLD: process.env.UI_COST_ALERT_THRESHOLD,
  UI_BOOKING_IDLE_MS: process.env.UI_BOOKING_IDLE_MS,
  UI_TRUCK_ALERT_THRESHOLD: process.env.UI_TRUCK_ALERT_THRESHOLD,
  UI_BOX_DIM_1: process.env.UI_BOX_DIM_1,
  UI_BOX_DIM_2: process.env.UI_BOX_DIM_2,
  UI_BOX_DIM_3: process.env.UI_BOX_DIM_3,
  UI_BOX_MASS_KG: process.env.UI_BOX_MASS_KG,
  UI_ORIGIN_PERSON: process.env.UI_ORIGIN_PERSON,
  UI_ORIGIN_ADDR1: process.env.UI_ORIGIN_ADDR1,
  UI_ORIGIN_ADDR2: process.env.UI_ORIGIN_ADDR2,
  UI_ORIGIN_ADDR3: process.env.UI_ORIGIN_ADDR3,
  UI_ORIGIN_ADDR4: process.env.UI_ORIGIN_ADDR4,
  UI_ORIGIN_POSTCODE: process.env.UI_ORIGIN_POSTCODE,
  UI_ORIGIN_TOWN: process.env.UI_ORIGIN_TOWN,
  UI_ORIGIN_PLACE_ID: process.env.UI_ORIGIN_PLACE_ID,
  UI_ORIGIN_CONTACT: process.env.UI_ORIGIN_CONTACT,
  UI_ORIGIN_PHONE: process.env.UI_ORIGIN_PHONE,
  UI_ORIGIN_CELL: process.env.UI_ORIGIN_CELL,
  UI_ORIGIN_NOTIFY: process.env.UI_ORIGIN_NOTIFY,
  UI_ORIGIN_EMAIL: process.env.UI_ORIGIN_EMAIL,
  UI_ORIGIN_NOTES: process.env.UI_ORIGIN_NOTES,
  UI_FEATURE_MULTI_SHIP: process.env.UI_FEATURE_MULTI_SHIP
};

export function getFrontendOrigin() {
  if (config.FRONTEND_ORIGIN) return config.FRONTEND_ORIGIN;
  return config.NODE_ENV === "production" ? "" : "*";
}
