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

test('environment ingest endpoint stores telemetry and statusz includes summary', async () => {
  const { server, baseUrl } = await startServer();
  try {
    const nowIso = new Date().toISOString();
    const ingestResponse = await fetch(`${baseUrl}/api/v1/environment/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stationId: 'scan-station-01',
        timestamp: nowIso,
        temperatureC: 23.5,
        humidityPct: 51.2,
        status: 'ok',
        readErrorsSinceBoot: 4,
        lastUpdated: nowIso
      })
    });
    assert.equal(ingestResponse.status, 200);
    const ingestBody = await ingestResponse.json();
    assert.equal(ingestBody.ok, true);
    assert.equal(ingestBody.environment.stationId, 'scan-station-01');

    const environmentResponse = await fetch(`${baseUrl}/api/v1/environment`);
    assert.equal(environmentResponse.status, 200);
    const environmentBody = await environmentResponse.json();
    assert.equal(environmentBody.ok, true);
    assert.equal(environmentBody.environment.temperatureC, 23.5);
    assert.equal(environmentBody.environment.humidityPct, 51.2);
    assert.equal(environmentBody.environment.status, 'ok');

    const statusResponse = await fetch(`${baseUrl}/api/v1/statusz`);
    assert.equal(statusResponse.status, 200);
    const statusBody = await statusResponse.json();
    assert.equal(statusBody.environment.status, 'ok');
    assert.equal(statusBody.environment.temperatureC, 23.5);
    assert.equal(statusBody.environment.humidityPct, 51.2);
    assert.equal(statusBody.environment.lastUpdated, nowIso);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});





test('environment ingest accepts alias telemetry keys and deviceId fallback', async () => {
  const { server, baseUrl } = await startServer();
  try {
    const nowIso = new Date().toISOString();
    const ingestResponse = await fetch(`${baseUrl}/api/v1/environment/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: 'sensor-alias-01',
        timestamp: nowIso,
        temperature: 24.1,
        humidity: 49.7,
        status: 'ok',
        lastUpdated: nowIso
      })
    });
    assert.equal(ingestResponse.status, 200);
    const ingestBody = await ingestResponse.json();
    assert.equal(ingestBody.ok, true);
    assert.equal(ingestBody.environment.stationId, 'sensor-alias-01');
    assert.equal(ingestBody.environment.temperatureC, 24.1);
    assert.equal(ingestBody.environment.humidityPct, 49.7);

    const statusResponse = await fetch(`${baseUrl}/api/v1/statusz`);
    assert.equal(statusResponse.status, 200);
    const statusBody = await statusResponse.json();
    assert.equal(statusBody.environment.temperatureC, 24.1);
    assert.equal(statusBody.environment.humidityPct, 49.7);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
test('statusz uses dispatch environment when telemetry is empty', async () => {
  const { server, baseUrl } = await startServer();
  try {
    const dispatchEnvironmentResponse = await fetch(`${baseUrl}/api/v1/dispatch/environment`, {
      method: 'POST',
      headers: withRotaryAuth({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        deviceId: 'sensor-dispatch-1',
        temperatureC: 18.6,
        humidityPct: 67.4,
        recordedAt: new Date().toISOString()
      })
    });
    assert.equal(dispatchEnvironmentResponse.status, 200);

    const emptyTelemetryResponse = await fetch(`${baseUrl}/api/v1/environment/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stationId: 'scan-station-01',
        status: 'offline'
      })
    });
    assert.equal(emptyTelemetryResponse.status, 200);

    const statusResponse = await fetch(`${baseUrl}/api/v1/statusz`);
    assert.equal(statusResponse.status, 200);
    const statusBody = await statusResponse.json();
    assert.equal(statusBody.environment.status, 'ok');
    assert.equal(statusBody.environment.temperatureC, 18.6);
    assert.equal(statusBody.environment.humidityPct, 67.4);
    assert.ok(statusBody.environment.lastUpdated);
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
    assert.equal(stateBody.quantityPromptOpen, false);
    assert.equal(stateBody.quantityPromptTargetLineItemKey, null);
    assert.equal(stateBody.quantityPromptQty, null);
    assert.equal(stateBody.lastPackedQtyCommittedLineItemKey, null);
    assert.equal(stateBody.lastPackedQtyCommittedQty, null);
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

function extractFunctionSource(source, functionName) {
  const signature = `function ${functionName}`;
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `${functionName} should exist in public/app.js`);

  const signatureEnd = source.indexOf(')', start);
  assert.notEqual(signatureEnd, -1, `${functionName} should contain a closing signature parenthesis`);
  const bodyStart = source.indexOf('{', signatureEnd);
  assert.notEqual(bodyStart, -1, `${functionName} should contain an opening brace`);

  let depth = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    const char = source[i];
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) return source.slice(start, i + 1);
  }

  throw new Error(`Could not extract ${functionName}`);
}

function createClassList() {
  const classes = new Set();
  return {
    add: (...names) => names.forEach((name) => classes.add(name)),
    remove: (...names) => names.forEach((name) => classes.delete(name)),
    toggle: (name, force) => {
      const shouldAdd = typeof force === 'boolean' ? force : !classes.has(name);
      if (shouldAdd) classes.add(name);
      else classes.delete(name);
      return shouldAdd;
    },
    contains: (name) => classes.has(name)
  };
}

function createDispatchRow(orderNo, itemKey, { disabled = false } = {}) {
  const classList = createClassList();
  classList.add('dispatchPackingRow');
  const button = {
    disabled,
    dataset: { orderNo }
  };

  return {
    dataset: { itemKey },
    classList,
    querySelector: (selector) => (selector === '.dispatchPackQtyBtn' ? button : null),
    scrollIntoView: () => {}
  };
}

test('dispatch rotary selection UI follows controller-selected line item across focus reconciliation', async () => {
  const appJs = await fs.readFile(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');

  const runtimeFactory = new Function(
    `let dispatchBoard = null;
let dispatchControllerState = null;
let dispatchSelectedOrders = new Set();
let dispatchRotarySelectedKey = '';
let dispatchRotaryFocusIndex = -1;
let dispatchRotaryFocusKey = '';
let dispatchLastHandledConfirmAt = '';
let dispatchLastHandledPrintRequestAt = '';
let dispatchLastHandledFulfillRequestAt = '';
let remoteIndicatorState = { ok: true, detail: '' };
let dispatchOrderCache = new Map();
let refreshDispatchViews = () => {};
let renderEnvironmentHeaderWidget = () => {};
let renderRemoteStatusBadge = () => {};
let syncDispatchSelectionUI = () => {};
let updateDashboardKpis = () => {};
let markDispatchLineItemPacked = () => {};
let openDispatchOrderModal = () => {};
let handleDispatchAction = () => Promise.resolve();

${extractFunctionSource(appJs, 'dispatchRotaryKeyForRow')}
${extractFunctionSource(appJs, 'getDispatchRotaryRows')}
${extractFunctionSource(appJs, 'syncDispatchRotarySelectionUI')}
${extractFunctionSource(appJs, 'syncDispatchRotaryFocus')}
${extractFunctionSource(appJs, 'isDispatchControllerConnected')}
${extractFunctionSource(appJs, 'applyDispatchControllerState')}
${extractFunctionSource(appJs, 'applyIncomingDispatchControllerState')}

return ({ rows, state, selectedOrders, rotarySelection, focusIndex = -1, focusKey = '', refreshDispatchViewsSpy = [] }) => {
  dispatchBoard = {
    querySelectorAll: (selector) => {
      if (selector === '.dispatchPackingRow') return rows;
      return [];
    }
  };
  dispatchControllerState = state;
  dispatchSelectedOrders = selectedOrders;
  dispatchRotarySelectedKey = rotarySelection;
  dispatchRotaryFocusIndex = focusIndex;
  dispatchRotaryFocusKey = focusKey;
  dispatchLastHandledConfirmAt = '';
  dispatchLastHandledPrintRequestAt = '';
  dispatchLastHandledFulfillRequestAt = '';
  dispatchOrderCache = new Map();
  refreshDispatchViews = (orderId) => refreshDispatchViewsSpy.push(orderId);
  renderEnvironmentHeaderWidget = () => {};
  renderRemoteStatusBadge = () => {};
  syncDispatchSelectionUI = () => {};
  updateDashboardKpis = () => {};
  markDispatchLineItemPacked = () => {};
  openDispatchOrderModal = () => {};
  handleDispatchAction = () => Promise.resolve();

  return {
    applyIncomingDispatchControllerState,
    setState: (nextState) => {
      dispatchControllerState = nextState;
    },
    setButtonDisabled: (index, disabled) => {
      const button = rows[index]?.querySelector('.dispatchPackQtyBtn');
      if (button) button.disabled = disabled;
    },
    getSnapshot: () => ({
      dispatchRotaryFocusIndex,
      dispatchRotaryFocusKey,
      dispatchRotarySelectedKey,
      selectedRows: rows.filter((row) => row.classList.contains('is-rotary-selected')),
      focusedRows: rows.filter((row) => row.classList.contains('is-rotary-focus')),
      refreshDispatchViewsCalls: [...refreshDispatchViewsSpy]
    })
  };
};`
  )();

  const orderId = '1001';
  const lineItemA = 'line-1a';
  const lineItemB = 'line-1b';
  const rowA = createDispatchRow(orderId, lineItemA);
  const rowB = createDispatchRow(orderId, lineItemB);
  const rowC = createDispatchRow(orderId, 'line-1c');
  const refreshDispatchViewsSpy = [];
  const runtime = runtimeFactory({
    rows: [rowA, rowB, rowC],
    state: null,
    selectedOrders: new Set(),
    rotarySelection: '',
    refreshDispatchViewsSpy
  });

  runtime.applyIncomingDispatchControllerState({ selectedOrderId: orderId, selectedLineItemKey: lineItemA });
  const initialSnapshot = runtime.getSnapshot();
  assert.equal(initialSnapshot.dispatchRotarySelectedKey, `${orderId}:${lineItemA}`);
  assert.equal(initialSnapshot.selectedRows.length, 1);
  assert.equal(initialSnapshot.selectedRows[0].dataset.itemKey, lineItemA);

  runtime.setButtonDisabled(1, true);
  runtime.applyIncomingDispatchControllerState({ selectedOrderId: orderId, selectedLineItemKey: lineItemB });
  const movedSnapshot = runtime.getSnapshot();

  assert.equal(movedSnapshot.dispatchRotarySelectedKey, `${orderId}:${lineItemB}`);
  assert.equal(movedSnapshot.selectedRows.length, 1);
  assert.equal(movedSnapshot.selectedRows[0].dataset.itemKey, lineItemB);
  assert.equal(movedSnapshot.focusedRows.length, 1);
  assert.notEqual(
    movedSnapshot.focusedRows[0].dataset.itemKey,
    movedSnapshot.selectedRows[0].dataset.itemKey,
    'focus reconciliation may move focus away from disabled rows while keeping rotary selection on the controller-selected row'
  );
  assert.deepEqual(movedSnapshot.refreshDispatchViewsCalls, [orderId]);
});

test('environment header widget preserves last numeric reading across null updates', async () => {
  const appJs = await fs.readFile(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');

  const runtimeFactory = new Function(
    `let dispatchEnvironmentSummary = { textContent: '' };
let dispatchEnvironmentStatus = { textContent: '', classList: { add: () => {}, remove: () => {} } };
let sensorIndicatorState = null;
let lastEnvironmentForHeader = null;
let formatDispatchTime = () => 'moments ago';

${extractFunctionSource(appJs, 'setStatusClass')}
${extractFunctionSource(appJs, 'normalizeEnvironmentForHeader')}
${extractFunctionSource(appJs, 'renderEnvironmentHeaderWidget')}

return {
  renderEnvironmentHeaderWidget,
  normalizeEnvironmentForHeader,
  getSnapshot: () => ({
    summary: dispatchEnvironmentSummary.textContent,
    status: dispatchEnvironmentStatus.textContent,
    sensorIndicatorState,
    lastEnvironmentForHeader
  })
};`
  )();

  runtimeFactory.renderEnvironmentHeaderWidget({
    temperatureC: 22.25,
    humidityPct: 48.4,
    status: 'ok',
    lastUpdated: '2026-01-01T00:00:00.000Z'
  });

  const initialSnapshot = runtimeFactory.getSnapshot();
  assert.equal(initialSnapshot.summary, '🌡 22.3°C · 💧 48%');
  assert.match(initialSnapshot.status, /^Sensor ok/);
  assert.equal(initialSnapshot.sensorIndicatorState.ok, true);
  assert.equal(initialSnapshot.lastEnvironmentForHeader.current.temperatureC, 22.25);

  runtimeFactory.renderEnvironmentHeaderWidget({
    temperatureC: null,
    humidityPct: null,
    status: 'missing',
    lastUpdated: '2026-01-01T00:05:00.000Z'
  });

  const staleSnapshot = runtimeFactory.getSnapshot();
  assert.equal(staleSnapshot.summary, '🌡 22.3°C · 💧 48%');
  assert.match(staleSnapshot.status, /^Sensor missing \(stale\)/);
  assert.equal(staleSnapshot.sensorIndicatorState.ok, false);
  assert.equal(staleSnapshot.lastEnvironmentForHeader.current.temperatureC, 22.25);
});
