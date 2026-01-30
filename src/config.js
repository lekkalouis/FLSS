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

  CUSTOMER_AUTH_SECRET: process.env.CUSTOMER_AUTH_SECRET,
  CUSTOMER_AUTH_TTL_MINUTES: Number(process.env.CUSTOMER_AUTH_TTL_MINUTES || 60),
  SPECIAL_CUSTOMERS: parseSpecialCustomers(process.env.SPECIAL_CUSTOMERS)
};

export function getFrontendOrigin() {
  if (config.FRONTEND_ORIGIN) return config.FRONTEND_ORIGIN;
  return "*";
}

function parseSpecialCustomers(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter(Boolean);
    if (parsed && typeof parsed === "object") {
      return Object.entries(parsed)
        .map(([email, passcode]) => ({ email, passcode }))
        .filter((entry) => entry.email && entry.passcode);
    }
  } catch {
    return [];
  }
  return [];
}
