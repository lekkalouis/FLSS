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
