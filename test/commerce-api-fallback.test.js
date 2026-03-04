import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { createApp } from "../src/app.js";
import { config } from "../src/config.js";

function startServer() {
  const { app } = createApp();
  const server = http.createServer(app);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${address.port}` });
    });
  });
}

function withShopifyDisabled(fn) {
  const previous = {
    SHOPIFY_STORE: config.SHOPIFY_STORE,
    SHOPIFY_CLIENT_ID: config.SHOPIFY_CLIENT_ID,
    SHOPIFY_CLIENT_SECRET: config.SHOPIFY_CLIENT_SECRET
  };

  config.SHOPIFY_STORE = "";
  config.SHOPIFY_CLIENT_ID = "";
  config.SHOPIFY_CLIENT_SECRET = "";

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      config.SHOPIFY_STORE = previous.SHOPIFY_STORE;
      config.SHOPIFY_CLIENT_ID = previous.SHOPIFY_CLIENT_ID;
      config.SHOPIFY_CLIENT_SECRET = previous.SHOPIFY_CLIENT_SECRET;
    });
}

test("agent commissions dashboard API includes machine-readable degraded metadata", async () => {
  await withShopifyDisabled(async () => {
    const { server, baseUrl } = await startServer();
    try {
      const response = await fetch(`${baseUrl}/api/v1/agent-commissions/dashboard`);
      assert.equal(response.status, 200);
      const body = await response.json();

      assert.equal(body.meta?.degraded, true);
      assert.equal(body.meta?.source, "local_only");
      assert.equal(body.meta?.shopify?.configured, false);
      assert.equal(typeof body.warning, "string");
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

test("order payments allocation API returns sync metadata when Shopify is disabled", async () => {
  await withShopifyDisabled(async () => {
    const { server, baseUrl } = await startServer();
    try {
      const response = await fetch(`${baseUrl}/api/v1/order-payments/allocate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          amount: 100,
          reference: "API-TEST",
          allocations: [{ orderId: "12345", amount: 50 }]
        })
      });

      assert.equal(response.status, 201);
      const body = await response.json();
      assert.equal(body.payment.amount, 100);
      assert.equal(body.sync.configured, false);
      assert.equal(body.sync.attempted, 1);
      assert.equal(body.sync.succeeded, 0);
      assert.deepEqual(body.sync.failed, []);
      assert.equal(typeof body.warning, "string");
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
