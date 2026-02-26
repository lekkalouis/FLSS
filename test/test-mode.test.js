import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

process.env.TEST_MODE = 'true';
process.env.TEST_PRINTNODE_PRINTER_ID = '12345';
process.env.TEST_PRINTNODE_DELIVERY_NOTE_PRINTER_IDS = '23456,34567';

const { createApp } = await import('../src/app.js');

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

test('test mode simulates upstream integrations', async () => {
  const { server, baseUrl } = await startServer();
  try {
    const configResp = await fetch(`${baseUrl}/api/v1/config`);
    const configBody = await configResp.json();
    assert.equal(configBody.TEST_MODE, true);

    const statusResp = await fetch(`${baseUrl}/api/v1/statusz`);
    const statusBody = await statusResp.json();
    assert.equal(statusBody.ok, true);
    assert.equal(statusBody.services.shopify.ok, true);

    const ppResp = await fetch(`${baseUrl}/api/v1/pp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'requestQuote', class: 'Quote', params: { details: {}, contents: [] } })
    });
    const ppBody = await ppResp.json();
    assert.equal(ppBody.mode, 'test');

    const printResp = await fetch(`${baseUrl}/api/v1/printnode/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pdfBase64: Buffer.from('test').toString('base64'), title: 'Test Label' })
    });
    const printBody = await printResp.json();
    assert.equal(printBody.ok, true);
    assert.equal(printBody.mode, 'test');
    assert.equal(printBody.printJob.printerId, 12345);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
