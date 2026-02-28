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

function withRotaryAuth(headers = {}) {
  const token = String(process.env.ROTARY_TOKEN || '').trim();
  if (!token) return headers;
  return { ...headers, Authorization: `Bearer ${token}` };
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


test('notification template endpoints provide defaults and CRUD updates', async () => {
  const notificationTemplatesFile = path.join(__dirname, '..', 'data', 'notification-templates.json');
  await fs.rm(notificationTemplatesFile, { force: true });

  const { server, baseUrl } = await startServer();
  try {
    const defaultsResponse = await fetch(`${baseUrl}/api/v1/notification-templates`);
    assert.equal(defaultsResponse.status, 200);
    const defaultsBody = await defaultsResponse.json();
    assert.equal(Array.isArray(defaultsBody.templates), true);
    assert.ok(defaultsBody.templates.length >= 2);

    const createResponse = await fetch(`${baseUrl}/api/v1/notification-templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Internal Delay Alert',
        eventKey: 'dispatch.delay',
        source: 'flss',
        channel: 'internal',
        enabled: true,
        subject: 'Dispatch delay on {{ order.name }}',
        body: 'Order {{ order.name }} is delayed by {{ metrics.minutes_waiting }} minutes.'
      })
    });
    assert.equal(createResponse.status, 200);
    const createBody = await createResponse.json();
    assert.equal(createBody.ok, true);

    const listResponse = await fetch(`${baseUrl}/api/v1/notification-templates`);
    assert.equal(listResponse.status, 200);
    const listBody = await listResponse.json();
    assert.ok(listBody.templates.some((template) => template.id === createBody.template.id));

    const deleteResponse = await fetch(`${baseUrl}/api/v1/notification-templates/${createBody.template.id}`, {
      method: 'DELETE'
    });
    assert.equal(deleteResponse.status, 200);
    const deleteBody = await deleteResponse.json();
    assert.equal(deleteBody.ok, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(notificationTemplatesFile, { force: true });
  }
});

test('dispatch controller endpoints support line-item traversal and action requests', async () => {
  const { server, baseUrl } = await startServer();
  try {
    const syncResponse = await fetch(`${baseUrl}/api/v1/dispatch/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        queueOrderIds: ['1001', '1002'],
        lineItemKeysByOrderId: {
          '1001': ['line-1a', 'line-1b'],
          '1002': ['line-2a']
        },
        mode: 'dispatch'
      })
    });
    assert.equal(syncResponse.status, 200);
    const syncBody = await syncResponse.json();
    assert.equal(syncBody.ok, true);
    assert.equal(syncBody.selectedOrderId, '1001');
    assert.equal(syncBody.selectedLineItemKey, 'line-1a');

    const nextOneResponse = await fetch(`${baseUrl}/api/v1/dispatch/next`, {
      method: 'POST',
      headers: withRotaryAuth({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ source: 'rotary_pi' })
    });
    assert.equal(nextOneResponse.status, 200);
    const nextOneBody = await nextOneResponse.json();
    assert.equal(nextOneBody.ok, true);
    assert.equal(nextOneBody.selectedOrderId, '1001');
    assert.equal(nextOneBody.selectedLineItemKey, 'line-1b');

    await new Promise((resolve) => setTimeout(resolve, 45));

    const nextTwoResponse = await fetch(`${baseUrl}/api/v1/dispatch/next`, {
      method: 'POST',
      headers: withRotaryAuth({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ source: 'rotary_pi' })
    });
    assert.equal(nextTwoResponse.status, 200);
    const nextTwoBody = await nextTwoResponse.json();
    assert.equal(nextTwoBody.ok, true);
    assert.equal(nextTwoBody.selectedOrderId, '1002');
    assert.equal(nextTwoBody.selectedLineItemKey, 'line-2a');

    await new Promise((resolve) => setTimeout(resolve, 45));

    const prevResponse = await fetch(`${baseUrl}/api/v1/dispatch/prev`, {
      method: 'POST',
      headers: withRotaryAuth({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ source: 'rotary_pi' })
    });
    assert.equal(prevResponse.status, 200);
    const prevBody = await prevResponse.json();
    assert.equal(prevBody.ok, true);
    assert.equal(prevBody.selectedOrderId, '1001');
    assert.equal(prevBody.selectedLineItemKey, 'line-1b');

    await new Promise((resolve) => setTimeout(resolve, 45));

    const confirmResponse = await fetch(`${baseUrl}/api/v1/dispatch/confirm`, {
      method: 'POST',
      headers: withRotaryAuth({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ source: 'rotary_pi' })
    });
    assert.equal(confirmResponse.status, 200);
    const confirmBody = await confirmResponse.json();
    assert.equal(confirmBody.ok, true);
    assert.equal(confirmBody.selectedOrderId, '1001');
    assert.equal(confirmBody.selectedLineItemKey, 'line-1b');

    await new Promise((resolve) => setTimeout(resolve, 45));

    const printResponse = await fetch(`${baseUrl}/api/v1/dispatch/print`, {
      method: 'POST',
      headers: withRotaryAuth({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ source: 'rotary_pi' })
    });
    assert.equal(printResponse.status, 200);
    const printBody = await printResponse.json();
    assert.equal(printBody.ok, true);
    assert.equal(printBody.action, 'print');
    assert.equal(printBody.selectedOrderId, '1001');

    await new Promise((resolve) => setTimeout(resolve, 45));

    const fulfillResponse = await fetch(`${baseUrl}/api/v1/dispatch/fulfill`, {
      method: 'POST',
      headers: withRotaryAuth({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ source: 'rotary_pi' })
    });
    assert.equal(fulfillResponse.status, 200);
    const fulfillBody = await fulfillResponse.json();
    assert.equal(fulfillBody.ok, true);
    assert.equal(fulfillBody.action, 'fulfill');
    assert.equal(fulfillBody.selectedOrderId, '1001');

    const stateResponse = await fetch(`${baseUrl}/api/v1/dispatch/state`);
    assert.equal(stateResponse.status, 200);
    const stateBody = await stateResponse.json();
    assert.equal(stateBody.selectedOrderId, '1001');
    assert.equal(stateBody.selectedLineItemKey, 'line-1b');
    assert.equal(stateBody.lastConfirmedOrderId, '1001');
    assert.equal(stateBody.lastConfirmedLineItemKey, 'line-1b');
    assert.equal(stateBody.lastPrintRequestedOrderId, '1001');
    assert.equal(stateBody.lastFulfillRequestedOrderId, '1001');
    assert.equal(Array.isArray(stateBody.queueOrderIds), true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});


test('dispatch controller selection updates trigger dispatch refresh path in frontend state handler', async () => {
  const appJs = await fs.readFile(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');

  const changeGuardSnippet = 'if (selectedOrderChanged) {';
  const refreshSnippet = 'refreshDispatchViews(selectedOrderId);';
  const rotarySnippet = 'syncDispatchRotaryFocus({ keepKey: true });';

  const guardIndex = appJs.indexOf(changeGuardSnippet);
  const refreshIndex = appJs.indexOf(refreshSnippet, guardIndex);
  const rotaryIndex = appJs.indexOf(rotarySnippet, refreshIndex);

  assert.notEqual(guardIndex, -1, 'selected order change guard should exist');
  assert.notEqual(refreshIndex, -1, 'selection change should call refreshDispatchViews');
  assert.notEqual(rotaryIndex, -1, 'rotary focus should sync after dispatch view refresh');
  assert.ok(refreshIndex < rotaryIndex, 'refresh should happen before rotary focus sync');

  assert.match(
    appJs,
    /selectedOrderChanged:\s*previousSelectedOrderId\s*!==\s*selectedOrderId/,
    'applyDispatchControllerState should detect selection changes and avoid unnecessary rerenders'
  );
});
