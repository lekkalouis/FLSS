import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

async function startServerWithRotaryToken(token) {
  const previousToken = process.env.ROTARY_TOKEN;
  process.env.ROTARY_TOKEN = token;
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
