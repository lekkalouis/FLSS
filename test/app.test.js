import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createApp } from '../src/app.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const templatesFile = path.join(__dirname, '..', 'data', 'liquid-templates.json');

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

async function removeTemplateFixture() {
  await fs.rm(templatesFile, { force: true });
}

test('GET /api/v1/healthz returns healthy payload', async () => {
  const { server, baseUrl } = await startServer();
  try {
    const response = await fetch(`${baseUrl}/api/v1/healthz`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.deepEqual(body, { ok: true });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('GET /api/v1/config returns expected config keys', async () => {
  const { server, baseUrl } = await startServer();
  try {
    const response = await fetch(`${baseUrl}/api/v1/config`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.equal(typeof body.COST_ALERT_THRESHOLD, 'number');
    assert.equal(typeof body.BOOKING_IDLE_MS, 'number');
    assert.equal(typeof body.PP_ENDPOINT, 'string');
    assert.equal(body.SHOPIFY.PROXY_BASE, '/api/v1/shopify');
    assert.equal(typeof body.FEATURE_FLAGS.MULTI_SHIP, 'boolean');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('liquid template endpoints support create/list/delete flow', async () => {
  await removeTemplateFixture();
  const { server, baseUrl } = await startServer();
  try {
    const createResponse = await fetch(`${baseUrl}/api/v1/liquid-templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Invoice Template',
        content: '{{ order.name }}'
      })
    });
    assert.equal(createResponse.status, 200);
    const createBody = await createResponse.json();
    assert.equal(createBody.ok, true);
    assert.equal(createBody.template.name, 'Invoice Template');

    const listResponse = await fetch(`${baseUrl}/api/v1/liquid-templates`);
    assert.equal(listResponse.status, 200);
    const listBody = await listResponse.json();
    assert.equal(Array.isArray(listBody.templates), true);
    assert.ok(listBody.templates.some((template) => template.id === createBody.template.id));

    const deleteResponse = await fetch(`${baseUrl}/api/v1/liquid-templates/${createBody.template.id}`, {
      method: 'DELETE'
    });
    assert.equal(deleteResponse.status, 200);
    const deleteBody = await deleteResponse.json();
    assert.equal(deleteBody.ok, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await removeTemplateFixture();
  }
});
