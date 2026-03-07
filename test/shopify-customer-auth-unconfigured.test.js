import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function withEnv(overrides) {
  const previous = new Map();
  Object.entries(overrides).forEach(([key, value]) => {
    previous.set(key, process.env[key]);
    if (value == null) {
      delete process.env[key];
    } else {
      process.env[key] = String(value);
    }
  });

  return () => {
    previous.forEach((value, key) => {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
  };
}

async function closeServer(server) {
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
}

async function startApp(overrides) {
  const restoreEnv = withEnv(overrides);
  const mod = await import(`../src/app.js?shopify-customer-auth-unconfigured=${Date.now()}-${Math.random()}`);
  const { app } = mod.createApp();
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();

  return {
    server,
    restoreEnv,
    baseUrl: `http://127.0.0.1:${address.port}`
  };
}

test("portal returns 503 when shopify customer auth is not configured", async () => {
  const appServer = await startApp({
    FRONTEND_ORIGIN: "",
    LOCAL_DB_PATH: path.join(__dirname, "..", "data", "test-shopify-customer-auth-unconfigured.sqlite"),
    SHOPIFY_CUSTOMER_ACCOUNT_DOMAIN: "",
    SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID: "",
    SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_SECRET: "",
    SHOPIFY_CUSTOMER_ACCOUNT_REDIRECT_URI: "",
    SHOPIFY_CUSTOMER_ACCOUNT_POST_LOGOUT_REDIRECT_URI: "",
    SHOPIFY_CUSTOMER_ACCOUNT_COOKIE_SECURE: "false"
  });

  try {
    const response = await fetch(`${appServer.baseUrl}/portal`, { redirect: "manual" });
    assert.equal(response.status, 503);
    const body = await response.text();
    assert.match(body, /Shopify customer account login is not configured/i);
  } finally {
    appServer.restoreEnv();
    await closeServer(appServer.server);
  }
});
