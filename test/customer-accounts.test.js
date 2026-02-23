import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import http from "node:http";
import path from "path";

import { createApp } from "../src/app.js";

const accountsFile = path.resolve("data", "customer-accounts.json");
const ordersFile = path.resolve("data", "customer-orders.json");

function resetCustomerData() {
  if (fs.existsSync(accountsFile)) fs.unlinkSync(accountsFile);
  if (fs.existsSync(ordersFile)) fs.unlinkSync(ordersFile);
}

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

test("customer account register, login, profile update, and tier-priced order flow", async () => {
  resetCustomerData();
  const { server, baseUrl } = await startServer();

  try {
    const registerRes = await fetch(`${baseUrl}/api/v1/customer-accounts/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "customer@example.com",
        password: "S3curePass!",
        firstName: "Casey",
        lastName: "Smith",
        phone: "0123456789"
      })
    });
    assert.equal(registerRes.status, 201);

    const loginRes = await fetch(`${baseUrl}/api/v1/customer-accounts/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "customer@example.com", password: "S3curePass!" })
    });
    assert.equal(loginRes.status, 200);
    const loginBody = await loginRes.json();
    assert.equal(typeof loginBody.token, "string");

    const meRes = await fetch(`${baseUrl}/api/v1/customer-accounts/me`, {
      headers: { authorization: `Bearer ${loginBody.token}` }
    });
    assert.equal(meRes.status, 200);

    const updateRes = await fetch(`${baseUrl}/api/v1/customer-accounts/me`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${loginBody.token}`
      },
      body: JSON.stringify({ city: "Cape Town", province: "Western Cape", postalCode: "8001" })
    });
    assert.equal(updateRes.status, 200);

    const catalogRes = await fetch(`${baseUrl}/api/v1/customer-accounts/catalog`, {
      headers: { authorization: `Bearer ${loginBody.token}` }
    });
    assert.equal(catalogRes.status, 200);
    const catalogBody = await catalogRes.json();
    assert.ok(Array.isArray(catalogBody.products));
    assert.ok(catalogBody.products.length > 0);

    const firstProduct = catalogBody.products[0];
    const orderRes = await fetch(`${baseUrl}/api/v1/customer-accounts/orders`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${loginBody.token}`
      },
      body: JSON.stringify({ items: [{ productId: firstProduct.id, quantity: 2 }], notes: "Tablet test order" })
    });
    assert.equal(orderRes.status, 201);
    const orderBody = await orderRes.json();
    assert.equal(orderBody.order.lines[0].quantity, 2);
    assert.equal(orderBody.order.subtotal, Number((firstProduct.unitPrice * 2).toFixed(2)));

    const ordersRes = await fetch(`${baseUrl}/api/v1/customer-accounts/orders`, {
      headers: { authorization: `Bearer ${loginBody.token}` }
    });
    assert.equal(ordersRes.status, 200);
    const ordersBody = await ordersRes.json();
    assert.ok(Array.isArray(ordersBody.orders));
    assert.equal(ordersBody.orders.length, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    resetCustomerData();
  }
});
