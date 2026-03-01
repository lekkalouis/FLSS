import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

async function startServerWithRotaryToken(token, remoteToken = '') {
  const previousToken = process.env.ROTARY_TOKEN;
  const previousRemoteToken = process.env.REMOTE_TOKEN;
  process.env.ROTARY_TOKEN = token;
  process.env.REMOTE_TOKEN = remoteToken;
  const mod = await import(`../src/app.js?dispatch-auth=${Date.now()}-${Math.random()}`);
  const { app } = mod.createApp();
  const server = http.createServer(app);

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();

  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
    restoreEnv: () => {
      if (previousToken === undefined) {
        delete process.env.ROTARY_TOKEN;
      } else {
        process.env.ROTARY_TOKEN = previousToken;
      }
      if (previousRemoteToken === undefined) {
        delete process.env.REMOTE_TOKEN;
      } else {
        process.env.REMOTE_TOKEN = previousRemoteToken;
      }
    }
  };
}

test('dispatch state endpoints remain available while action endpoints require token when ROTARY_TOKEN is set', async () => {
  const rotaryToken = 'test-rotary-token';
  const { server, baseUrl, restoreEnv } = await startServerWithRotaryToken(rotaryToken);
  try {
    const syncResponse = await fetch(`${baseUrl}/api/v1/dispatch/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queueOrderIds: ['1001', '1002'], mode: 'dispatch' })
    });
    assert.equal(syncResponse.status, 200);

    const stateResponse = await fetch(`${baseUrl}/api/v1/dispatch/state`);
    assert.equal(stateResponse.status, 200);

    const unauthorizedNextResponse = await fetch(`${baseUrl}/api/v1/dispatch/next`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'rotary_pi' })
    });
    assert.equal(unauthorizedNextResponse.status, 401);

    const authorizedNextResponse = await fetch(`${baseUrl}/api/v1/dispatch/next`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${rotaryToken}`
      },
      body: JSON.stringify({ source: 'rotary_pi' })
    });
    assert.equal(authorizedNextResponse.status, 200);
    const body = await authorizedNextResponse.json();
    assert.equal(body.selectedOrderId, '1002');
  } finally {
    restoreEnv();
    await new Promise((resolve) => server.close(resolve));
  }
});


async function readNextSseEvent(reader, decoder, timeoutMs = 2000) {
  let buffer = '';
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Timed out waiting for SSE event')), timeoutMs));

  while (true) {
    const { value, done } = await Promise.race([reader.read(), timeout]);
    if (done) throw new Error('SSE stream closed before event was received');
    buffer += decoder.decode(value, { stream: true });

    const delimiter = buffer.indexOf('\n\n');
    if (delimiter === -1) continue;

    const chunk = buffer.slice(0, delimiter);
    buffer = buffer.slice(delimiter + 2);

    const lines = chunk.split('\n');
    let event = 'message';
    const dataLines = [];
    lines.forEach((line) => {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    });

    if (!dataLines.length) continue;
    return { event, data: JSON.parse(dataLines.join('\n')) };
  }
}

test('dispatch event stream publishes immediate state changes', async () => {
  const { server, baseUrl, restoreEnv } = await startServerWithRotaryToken('');
  const decoder = new TextDecoder();

  try {
    const streamResponse = await fetch(`${baseUrl}/api/v1/dispatch/events`, {
      headers: { Accept: 'text/event-stream' }
    });

    assert.equal(streamResponse.status, 200);
    assert.equal(streamResponse.headers.get('content-type'), 'text/event-stream');
    assert.ok(streamResponse.body);

    const reader = streamResponse.body.getReader();

    const readyEvent = await readNextSseEvent(reader, decoder);
    assert.equal(readyEvent.event, 'ready');
    assert.ok(readyEvent.data.state);

    const syncResponse = await fetch(`${baseUrl}/api/v1/dispatch/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queueOrderIds: ['2001', '2002'], mode: 'dispatch' })
    });
    assert.equal(syncResponse.status, 200);

    const stateChange = await readNextSseEvent(reader, decoder);
    assert.equal(stateChange.event, 'state-change');
    assert.equal(stateChange.data.action, 'syncState');
    assert.equal(stateChange.data.state.selectedOrderId, '2001');

    await reader.cancel();
  } finally {
    restoreEnv();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('dispatch environment and remote endpoints support telemetry and remote actions', async () => {
  const authToken = 'test-rotary-token';
  const { server, baseUrl, restoreEnv } = await startServerWithRotaryToken(authToken, authToken);

  try {
    const unauthorizedEnvironment = await fetch(`${baseUrl}/api/v1/dispatch/environment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: 'sensor-1', temperatureC: 23.4, humidityPct: 52 })
    });
    assert.ok(unauthorizedEnvironment.status === 401 || unauthorizedEnvironment.status === 403);

    const environmentResponse = await fetch(`${baseUrl}/api/v1/dispatch/environment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({
        deviceId: 'sensor-1',
        tempC: 23.4,
        humidity_pct: 52,
        recordedAt: new Date().toISOString()
      })
    });
    assert.equal(environmentResponse.status, 200);

    const environmentStateResponse = await fetch(`${baseUrl}/api/v1/dispatch/environment`);
    assert.equal(environmentStateResponse.status, 200);
    const environmentStateBody = await environmentStateResponse.json();
    assert.equal(environmentStateBody.environment.current.deviceId, 'sensor-1');

    const heartbeatResponse = await fetch(`${baseUrl}/api/v1/dispatch/remote/heartbeat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({ remoteId: 'remote-main', firmwareVersion: '1.0.2' })
    });
    assert.equal(heartbeatResponse.status, 200);

    const remoteStatusResponse = await fetch(`${baseUrl}/api/v1/dispatch/remote/status`);
    assert.equal(remoteStatusResponse.status, 200);
    const remoteStatusBody = await remoteStatusResponse.json();
    assert.equal(remoteStatusBody.remote.remoteId, 'remote-main');

    const syncResponse = await fetch(`${baseUrl}/api/v1/dispatch/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        queueOrderIds: ['3001', '3002'],
        lineItemKeysByOrderId: {
          '3001': ['line-3001-a'],
          '3002': ['line-3002-a']
        },
        mode: 'dispatch'
      })
    });
    assert.equal(syncResponse.status, 200);

    const remoteActionResponse = await fetch(`${baseUrl}/api/v1/dispatch/remote/action`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({
        remoteId: 'remote-main',
        action: 'next',
        idempotencyKey: 'abc-1'
      })
    });
    assert.equal(remoteActionResponse.status, 200);
    const remoteActionBody = await remoteActionResponse.json();
    assert.equal(remoteActionBody.selectedOrderId, '3002');

    const confirmHoldResponse = await fetch(`${baseUrl}/api/v1/dispatch/remote/action`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({
        remoteId: 'remote-main',
        action: 'confirm_hold',
        idempotencyKey: 'abc-2'
      })
    });
    assert.equal(confirmHoldResponse.status, 200);

    const setPackedQtyResponse = await fetch(`${baseUrl}/api/v1/dispatch/remote/action`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({
        remoteId: 'remote-main',
        action: 'set_packed_qty',
        lineItemKey: 'line-3002-a',
        qty: 4,
        idempotencyKey: 'abc-3'
      })
    });
    assert.equal(setPackedQtyResponse.status, 200);

    const duplicateSetPackedQtyResponse = await fetch(`${baseUrl}/api/v1/dispatch/remote/action`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({
        remoteId: 'remote-main',
        action: 'set_packed_qty',
        lineItemKey: 'line-3002-a',
        qty: 4,
        idempotencyKey: 'abc-3'
      })
    });
    assert.equal(duplicateSetPackedQtyResponse.status, 200);
    const duplicateSetPackedQtyBody = await duplicateSetPackedQtyResponse.json();
    assert.equal(duplicateSetPackedQtyBody.deduped, true);

    const stateResponse = await fetch(`${baseUrl}/api/v1/dispatch/state`);
    assert.equal(stateResponse.status, 200);
    const stateBody = await stateResponse.json();
    assert.equal(stateBody.quantityPromptOpen, false);
    assert.equal(stateBody.lastPackedQtyCommittedLineItemKey, 'line-3002-a');
    assert.equal(stateBody.lastPackedQtyCommittedQty, 4);

  } finally {
    restoreEnv();
    await new Promise((resolve) => server.close(resolve));
  }
});
