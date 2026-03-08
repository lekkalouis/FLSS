import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';

import { createApp } from '../src/app.js';

function startServer() {
  const { app } = createApp();
  const server = http.createServer(app);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${address.port}`
      });
    });
  });
}

test('agent portal endpoints require Shopify customer context', async () => {
  const { server, baseUrl } = await startServer();
  try {
    const response = await fetch(`${baseUrl}/api/v1/customer-accounts/agent-portal/session`);
    assert.equal(response.status, 401);
    const body = await response.json();
    assert.match(body.error, /Customer identity missing/i);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('agent portal returns promo materials and generated campaign copy', async () => {
  const { server, baseUrl } = await startServer();
  const query = '?logged_in_customer_email=agent%40example.com&logged_in_customer_first_name=Alex&logged_in_customer_last_name=Agent';
  try {
    const materialsResponse = await fetch(`${baseUrl}/api/v1/customer-accounts/agent-portal/promo-materials${query}`);
    assert.equal(materialsResponse.status, 200);
    const materialsBody = await materialsResponse.json();
    assert.equal(materialsBody.customer.displayName, 'Alex Agent');
    assert.equal(Array.isArray(materialsBody.materials), true);
    assert.equal(materialsBody.materials.length > 0, true);

    const generateResponse = await fetch(`${baseUrl}/api/v1/customer-accounts/agent-portal/generate-marketing-material${query}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaignGoal: 'Build weekly re-orders',
        offer: '10% launch discount',
        audience: 'Retail stores',
        channel: 'Email',
        productFocus: 'Chili bites, Droewors',
        callToAction: 'Reply YES to secure stock'
      })
    });
    assert.equal(generateResponse.status, 201);
    const generateBody = await generateResponse.json();
    assert.match(generateBody.material.headline, /Build weekly re-orders/);
    assert.match(generateBody.material.message, /Reply YES to secure stock/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
