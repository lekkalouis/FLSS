import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createApp } from '../src/app.js';
import { getDb, runMigrations } from '../src/db/sqlite.js';
import { sendNotificationEmail, buildNotificationEmail } from '../src/services/notificationRuntime.js';
import { NOTIFICATION_EVENT_KEYS } from '../src/services/notificationTemplateRegistry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const templatesFile = path.join(__dirname, '..', 'data', 'liquid-templates.json');
process.env.LOCAL_DB_PATH = path.join(__dirname, '..', 'data', 'test-app.sqlite');

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

test('system settings API loads defaults and persists updates', async () => {
  runMigrations();
  getDb().prepare('DELETE FROM system_settings').run();
  const { server, baseUrl } = await startServer();
  try {
    const initialResponse = await fetch(`${baseUrl}/api/v1/system/settings`);
    assert.equal(initialResponse.status, 200);
    const initialBody = await initialResponse.json();
    assert.equal(initialBody.ok, true);
    assert.equal(typeof initialBody.settings.sticker.shelfLifeMonths, 'number');
    assert.equal(typeof initialBody.settings.printHistory.retentionDays, 'number');
    assert.equal(initialBody.settings.sticker.layoutProfile, 'continuous_4up');
    assert.equal(initialBody.settings.sticker.calibration.xOffsetMm, 0);
    assert.equal(initialBody.settings.sticker.calibration.yOffsetMm, 0);
    assert.equal(initialBody.settings.sticker.calibration.labelWidthMm, 22);
    assert.equal(initialBody.settings.sticker.calibration.labelHeightMm, 16);
    assert.equal(initialBody.settings.sticker.calibration.columnGapMm, 3);
    assert.equal(initialBody.settings.sticker.calibration.line1YMm, 2);
    assert.equal(initialBody.settings.sticker.calibration.line2YMm, 6.5);
    assert.equal(initialBody.settings.sticker.calibration.line3YMm, 11);
    assert.equal(initialBody.settings.sticker.calibration.textRotation, 0);
    assert.equal(initialBody.settings.controller.showOnScreenButtons, true);
    assert.equal(initialBody.settings.controller.requireConnectedRemote, true);
    assert.equal(initialBody.settings.controller.highVisibilityMode, true);
    assert.equal(initialBody.settings.notifications.events.pickupReady.enabled, true);
    assert.equal(initialBody.settings.notifications.events.truckCollection.useCustomerEmail, false);

    const updateResponse = await fetch(`${baseUrl}/api/v1/system/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sticker: {
          shelfLifeMonths: 18,
          defaultButtonQty: 64,
          commandLanguage: 'PPLB',
          stickerPrinterId: 4567,
          layoutProfile: 'continuous_4up',
          calibration: {
            xOffsetMm: 1.7,
            yOffsetMm: -2.3,
            labelWidthMm: 24.1,
            labelHeightMm: 17.4,
            columnGapMm: 3.3,
            line1YMm: 2.2,
            line2YMm: 6.9,
            line3YMm: 11.8,
            textRotation: 7
          }
        },
        printHistory: {
          retentionDays: 180
        },
        controller: {
          showOnScreenButtons: false,
          requireConnectedRemote: false
        },
        notifications: {
          senderOverride: 'dispatch@example.com',
          fallbackRecipient: 'backup@example.com',
          events: {
            pickupReady: {
              recipients: 'pack@example.com, floor@example.com',
              fallbackRecipient: 'pickup-fallback@example.com'
            },
            truckCollection: {
              enabled: false,
              recipients: ['fleet@example.com']
            }
          }
        }
      })
    });
    assert.equal(updateResponse.status, 200);
    const updateBody = await updateResponse.json();
    assert.equal(updateBody.ok, true);
    assert.equal(updateBody.settings.sticker.shelfLifeMonths, 18);
    assert.equal(updateBody.settings.sticker.defaultButtonQty, 64);
    assert.equal(updateBody.settings.sticker.stickerPrinterId, 4567);
    assert.equal(updateBody.settings.sticker.layoutProfile, 'continuous_4up');
    assert.equal(updateBody.settings.sticker.calibration.xOffsetMm, 1.7);
    assert.equal(updateBody.settings.sticker.calibration.yOffsetMm, -2.3);
    assert.equal(updateBody.settings.sticker.calibration.labelWidthMm, 24.1);
    assert.equal(updateBody.settings.sticker.calibration.labelHeightMm, 17.4);
    assert.equal(updateBody.settings.sticker.calibration.columnGapMm, 3.3);
    assert.equal(updateBody.settings.sticker.calibration.line1YMm, 2.2);
    assert.equal(updateBody.settings.sticker.calibration.line2YMm, 6.9);
    assert.equal(updateBody.settings.sticker.calibration.line3YMm, 11.8);
    assert.equal(updateBody.settings.sticker.calibration.textRotation, 0);
    assert.equal(updateBody.settings.printHistory.retentionDays, 180);
    assert.equal(updateBody.settings.controller.showOnScreenButtons, false);
    assert.equal(updateBody.settings.controller.requireConnectedRemote, false);
    assert.equal(updateBody.settings.controller.highVisibilityMode, true);
    assert.equal(updateBody.settings.notifications.senderOverride, 'dispatch@example.com');
    assert.equal(updateBody.settings.notifications.fallbackRecipient, 'backup@example.com');
    assert.deepEqual(updateBody.settings.notifications.events.pickupReady.recipients, [
      'pack@example.com',
      'floor@example.com'
    ]);
    assert.equal(updateBody.settings.notifications.events.pickupReady.fallbackRecipient, 'pickup-fallback@example.com');
    assert.equal(updateBody.settings.notifications.events.pickupReady.useCustomerEmail, true);
    assert.equal(updateBody.settings.notifications.events.truckCollection.enabled, false);
    assert.deepEqual(updateBody.settings.notifications.events.truckCollection.recipients, ['fleet@example.com']);
    assert.equal(updateBody.settings.notifications.events.truckCollection.useCustomerEmail, false);

    const verifyResponse = await fetch(`${baseUrl}/api/v1/system/settings`);
    assert.equal(verifyResponse.status, 200);
    const verifyBody = await verifyResponse.json();
    assert.equal(verifyBody.ok, true);
    assert.equal(verifyBody.settings.sticker.stickerPrinterId, 4567);
    assert.equal(verifyBody.settings.sticker.layoutProfile, 'continuous_4up');
    assert.equal(verifyBody.settings.sticker.calibration.textRotation, 0);
    assert.equal(verifyBody.settings.printHistory.retentionDays, 180);
    assert.equal(verifyBody.settings.controller.showOnScreenButtons, false);
    assert.equal(verifyBody.settings.controller.highVisibilityMode, true);
    assert.equal(verifyBody.settings.notifications.senderOverride, 'dispatch@example.com');
    assert.deepEqual(verifyBody.settings.notifications.events.pickupReady.recipients, [
      'pack@example.com',
      'floor@example.com'
    ]);

    const clampResponse = await fetch(`${baseUrl}/api/v1/system/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sticker: {
          layoutProfile: 'unsupported-layout',
          calibration: {
            xOffsetMm: 999,
            yOffsetMm: -999,
            labelWidthMm: 1,
            labelHeightMm: 500,
            columnGapMm: -5,
            line1YMm: -1,
            line2YMm: 999,
            line3YMm: 999,
            textRotation: -1
          }
        }
      })
    });
    assert.equal(clampResponse.status, 200);
    const clampBody = await clampResponse.json();
    assert.equal(clampBody.settings.sticker.layoutProfile, 'continuous_4up');
    assert.equal(clampBody.settings.sticker.calibration.xOffsetMm, 12);
    assert.equal(clampBody.settings.sticker.calibration.yOffsetMm, -12);
    assert.equal(clampBody.settings.sticker.calibration.labelWidthMm, 8);
    assert.equal(clampBody.settings.sticker.calibration.labelHeightMm, 80);
    assert.equal(clampBody.settings.sticker.calibration.columnGapMm, 0);
    assert.equal(clampBody.settings.sticker.calibration.line1YMm, 0);
    assert.equal(clampBody.settings.sticker.calibration.line2YMm, 50);
    assert.equal(clampBody.settings.sticker.calibration.line3YMm, 70);
    assert.equal(clampBody.settings.sticker.calibration.textRotation, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('print history API supports pagination and type alias filtering', async () => {
  runMigrations();
  const db = getDb();
  db.prepare('DELETE FROM print_history').run();
  db.prepare(
    `INSERT INTO print_history (job_type, status, printer_id, title, source, upstream_status, upstream_status_text, upstream_job_id, error_message, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    'delivery_note',
    'failed',
    44,
    'Delivery Note 1001',
    'test-suite',
    422,
    'unprocessable',
    'job-001',
    'Upstream validation error',
    new Date('2026-01-02T08:00:00.000Z').toISOString()
  );
  db.prepare(
    `INSERT INTO print_history (job_type, status, printer_id, title, source, upstream_status, upstream_status_text, upstream_job_id, error_message, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    'best_before_sticker',
    'success',
    55,
    'Best-before labels',
    'test-suite',
    201,
    'created',
    'job-002',
    null,
    new Date('2026-01-03T09:00:00.000Z').toISOString()
  );

  const { server, baseUrl } = await startServer();
  try {
    const response = await fetch(`${baseUrl}/api/v1/print-history?page=1&pageSize=1&type=delivery_note&status=failed`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.page, 1);
    assert.equal(body.pageSize, 1);
    assert.equal(body.total, 1);
    assert.equal(Array.isArray(body.rows), true);
    assert.equal(body.rows.length, 1);
    assert.equal(body.rows[0].jobType, 'delivery_note');
    assert.equal(body.rows[0].status, 'failed');
    assert.equal(body.rows[0].printerId, 44);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    db.prepare('DELETE FROM print_history').run();
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

test('notification runtime resolves pickup email sender, recipients, and template tokens from settings', async () => {
  const email = await buildNotificationEmail({
    eventKey: NOTIFICATION_EVENT_KEYS.PICKUP_READY,
    fallbackFrom: 'default@example.com',
    settings: {
      notifications: {
        senderOverride: 'dispatch@example.com',
        fallbackRecipient: 'fallback@example.com',
        events: {
          pickupReady: {
            enabled: true,
            templateId: 'flss-pickup-ready-email',
            useCustomerEmail: true,
            recipients: ['packing@example.com']
          }
        }
      }
    },
    context: {
      shop: { name: 'Flippen Lekka Spices' },
      customer: { name: 'Ada Lovelace', email: 'customer@example.com' },
      order: { name: '#1001', email: 'customer@example.com' },
      pickup: {
        barcode_value: 'FLSS-1001',
        barcode_image_url: 'https://example.com/barcode.png',
        pin: '123'
      },
      metrics: {
        parcel_count: 3,
        weight_kg: '9.50'
      }
    }
  });

  assert.equal(email.skipped, false);
  assert.equal(email.from, 'dispatch@example.com');
  assert.deepEqual(email.to, ['customer@example.com', 'packing@example.com']);
  assert.equal(email.template.id, 'flss-pickup-ready-email');
  assert.match(email.subject, /#1001/);
  assert.match(email.text, /Ada Lovelace/);
  assert.match(email.text, /FLSS-1001/);
});

test('notification runtime uses fallback recipients and sends truck collection emails through the provided transport', async () => {
  let sentPayload = null;
  const transport = {
    sendMail: async (payload) => {
      sentPayload = payload;
      return { messageId: 'message-001' };
    }
  };

  const result = await sendNotificationEmail({
    transport,
    eventKey: NOTIFICATION_EVENT_KEYS.TRUCK_COLLECTION,
    fallbackFrom: 'alerts@example.com',
    settings: {
      notifications: {
        fallbackRecipient: 'ops@example.com',
        events: {
          truckCollection: {
            enabled: true,
            templateId: 'flss-truck-collection-email',
            useCustomerEmail: false,
            recipients: [],
            fallbackRecipient: 'fleet@example.com'
          }
        }
      }
    },
    context: {
      shop: { name: 'Flippen Lekka Scan Station' },
      logistics: {
        provider_name: 'SWE Couriers',
        collection_date: '06 Mar 2026',
        reason: 'overflow'
      },
      metrics: {
        parcel_count: 48,
        booked_parcel_count: 12
      }
    }
  });

  assert.equal(result.skipped, false);
  assert.equal(result.info.messageId, 'message-001');
  assert.equal(result.from, 'alerts@example.com');
  assert.deepEqual(result.to, ['fleet@example.com', 'ops@example.com']);
  assert.equal(result.template.id, 'flss-truck-collection-email');
  assert.ok(sentPayload);
  assert.equal(sentPayload.from, 'alerts@example.com');
  assert.equal(sentPayload.to, 'fleet@example.com, ops@example.com');
  assert.match(sentPayload.subject, /48 parcels/);
  assert.match(sentPayload.text, /SWE Couriers/);
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
    assert.equal(syncBody.selectedLineItemKey, null);
    assert.equal(syncBody.selectionMode, 'order');

    const nextOneResponse = await fetch(`${baseUrl}/api/v1/dispatch/next`, {
      method: 'POST',
      headers: withRotaryAuth({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ source: 'rotary_pi' })
    });
    assert.equal(nextOneResponse.status, 200);
    const nextOneBody = await nextOneResponse.json();
    assert.equal(nextOneBody.ok, true);
    assert.equal(nextOneBody.selectedOrderId, '1002');
    assert.equal(nextOneBody.selectedLineItemKey, null);
    assert.equal(nextOneBody.selectionMode, 'order');

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
    assert.equal(prevBody.selectedLineItemKey, null);
    assert.equal(prevBody.selectionMode, 'order');

    await new Promise((resolve) => setTimeout(resolve, 45));

    const confirmEnterLineModeResponse = await fetch(`${baseUrl}/api/v1/dispatch/confirm`, {
      method: 'POST',
      headers: withRotaryAuth({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ source: 'rotary_pi' })
    });
    assert.equal(confirmEnterLineModeResponse.status, 200);
    const confirmEnterLineModeBody = await confirmEnterLineModeResponse.json();
    assert.equal(confirmEnterLineModeBody.ok, true);
    assert.equal(confirmEnterLineModeBody.selectedOrderId, '1001');
    assert.equal(confirmEnterLineModeBody.selectedLineItemKey, 'line-1a');
    assert.equal(confirmEnterLineModeBody.selectionMode, 'line');

    await new Promise((resolve) => setTimeout(resolve, 45));

    const nextInLineModeResponse = await fetch(`${baseUrl}/api/v1/dispatch/next`, {
      method: 'POST',
      headers: withRotaryAuth({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ source: 'rotary_pi' })
    });
    assert.equal(nextInLineModeResponse.status, 200);
    const nextInLineModeBody = await nextInLineModeResponse.json();
    assert.equal(nextInLineModeBody.ok, true);
    assert.equal(nextInLineModeBody.selectedOrderId, '1001');
    assert.equal(nextInLineModeBody.selectedLineItemKey, 'line-1b');
    assert.equal(nextInLineModeBody.selectionMode, 'line');

    await new Promise((resolve) => setTimeout(resolve, 45));

    const boundedNextResponse = await fetch(`${baseUrl}/api/v1/dispatch/next`, {
      method: 'POST',
      headers: withRotaryAuth({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ source: 'rotary_pi' })
    });
    assert.equal(boundedNextResponse.status, 200);
    const boundedNextBody = await boundedNextResponse.json();
    assert.equal(boundedNextBody.ok, true);
    assert.equal(boundedNextBody.selectedOrderId, '1001');
    assert.equal(boundedNextBody.selectedLineItemKey, 'line-1b');
    assert.equal(boundedNextBody.selectionMode, 'line');

    await new Promise((resolve) => setTimeout(resolve, 45));

    const confirmPackedResponse = await fetch(`${baseUrl}/api/v1/dispatch/confirm`, {
      method: 'POST',
      headers: withRotaryAuth({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ source: 'rotary_pi' })
    });
    assert.equal(confirmPackedResponse.status, 200);
    const confirmPackedBody = await confirmPackedResponse.json();
    assert.equal(confirmPackedBody.ok, true);
    assert.equal(confirmPackedBody.selectedOrderId, '1001');
    assert.equal(confirmPackedBody.selectedLineItemKey, 'line-1b');
    assert.equal(confirmPackedBody.selectionMode, 'line');

    await new Promise((resolve) => setTimeout(resolve, 45));

    const backToOrderModeResponse = await fetch(`${baseUrl}/api/v1/dispatch/back`, {
      method: 'POST',
      headers: withRotaryAuth({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ source: 'rotary_pi' })
    });
    assert.equal(backToOrderModeResponse.status, 200);
    const backToOrderModeBody = await backToOrderModeResponse.json();
    assert.equal(backToOrderModeBody.ok, true);
    assert.equal(backToOrderModeBody.selectedOrderId, '1001');
    assert.equal(backToOrderModeBody.selectedLineItemKey, null);
    assert.equal(backToOrderModeBody.selectionMode, 'order');

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
    assert.equal(stateBody.selectedLineItemKey, null);
    assert.equal(stateBody.selectionMode, 'order');
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
let dispatchRotaryInputEnabled = true;
let dispatchLastHandledConfirmAt = '';
let dispatchLastHandledPrintRequestAt = '';
let dispatchLastHandledFulfillRequestAt = '';
let remoteIndicatorState = { ok: true, detail: '' };
let dispatchOrderCache = new Map();
let dispatchOrderLookup = new Map();
let dispatchOrdersLatest = [];
let refreshDispatchViews = () => {};
let renderEnvironmentHeaderWidget = () => {};
let renderRemoteStatusBadge = () => {};
let renderDispatchControllerOverlay = () => {};
let syncDispatchSelectionUI = () => {};
let updateDashboardKpis = () => {};
let markDispatchLineItemPacked = () => {};
let openDispatchOrderModal = () => {};
let handleDispatchAction = () => Promise.resolve();
let statusExplain = () => {};

${extractFunctionSource(appJs, 'orderNoFromName')}
${extractFunctionSource(appJs, 'normalizeDispatchSelectionKey')}
${extractFunctionSource(appJs, 'setDispatchOrderLookupEntry')}
${extractFunctionSource(appJs, 'buildDispatchOrderLookupIndexes')}
${extractFunctionSource(appJs, 'resolveDispatchOrderFromSelectionKey')}
${extractFunctionSource(appJs, 'resolveSelectedDispatchOrders')}
${extractFunctionSource(appJs, 'dispatchRotaryKeyForRow')}
${extractFunctionSource(appJs, 'getDispatchRotaryRows')}
${extractFunctionSource(appJs, 'syncDispatchRotarySelectionUI')}
${extractFunctionSource(appJs, 'syncDispatchRotaryFocus')}
${extractFunctionSource(appJs, 'isDispatchControllerConnected')}
${extractFunctionSource(appJs, 'getResolvedDispatchControllerSelection')}
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
  dispatchOrdersLatest = rows.map((row, index) => {
    const rowOrderNo = String(row?.querySelector('.dispatchPackQtyBtn')?.dataset?.orderNo || '').trim();
    return rowOrderNo
      ? { id: String(5000 + index), name: '#' + rowOrderNo, line_items: [] }
      : null;
  }).filter(Boolean);
  dispatchOrderCache = new Map(dispatchOrdersLatest.map((order) => [String(order.name || '').replace('#', '').trim(), order]));
  buildDispatchOrderLookupIndexes(dispatchOrdersLatest, dispatchOrderCache);
  refreshDispatchViews = (orderId) => refreshDispatchViewsSpy.push(orderId);
  renderEnvironmentHeaderWidget = () => {};
  renderRemoteStatusBadge = () => {};
  renderDispatchControllerOverlay = () => {};
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

  runtime.applyIncomingDispatchControllerState({
    selectedOrderId: orderId,
    selectedLineItemKey: lineItemA,
    selectionMode: 'line'
  });
  const initialSnapshot = runtime.getSnapshot();
  assert.equal(initialSnapshot.dispatchRotarySelectedKey, `${orderId}:${lineItemA}`);
  assert.equal(initialSnapshot.selectedRows.length, 1);
  assert.equal(initialSnapshot.selectedRows[0].dataset.itemKey, lineItemA);

  runtime.setButtonDisabled(1, true);
  runtime.applyIncomingDispatchControllerState({
    selectedOrderId: orderId,
    selectedLineItemKey: lineItemB,
    selectionMode: 'line'
  });
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

test('dispatch selection resolver normalizes keys and prunes stale selection references', async () => {
  const appJs = await fs.readFile(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');

  const runtime = new Function(
    `let dispatchSelectedOrders = new Set();
let dispatchOrderCache = new Map();
let dispatchOrderLookup = new Map();
let dispatchOrdersLatest = [];
let statusMessages = [];
let statusExplain = (message) => statusMessages.push(String(message || ''));

${extractFunctionSource(appJs, 'orderNoFromName')}
${extractFunctionSource(appJs, 'normalizeDispatchSelectionKey')}
${extractFunctionSource(appJs, 'setDispatchOrderLookupEntry')}
${extractFunctionSource(appJs, 'buildDispatchOrderLookupIndexes')}
${extractFunctionSource(appJs, 'resolveDispatchOrderFromSelectionKey')}
${extractFunctionSource(appJs, 'resolveSelectedDispatchOrders')}

return {
  primeOrders: (orders) => {
    dispatchOrdersLatest = Array.isArray(orders) ? orders : [];
    dispatchOrderCache = new Map(
      dispatchOrdersLatest.map((order) => [String(order?.name || '').replace('#', '').trim(), order])
    );
    buildDispatchOrderLookupIndexes(dispatchOrdersLatest, dispatchOrderCache);
  },
  setSelection: (keys) => {
    dispatchSelectedOrders = new Set(Array.isArray(keys) ? keys : []);
  },
  resolve: (notify = false) => resolveSelectedDispatchOrders({ notifyOnPrune: notify }),
  snapshot: () => ({
    selected: [...dispatchSelectedOrders],
    statusMessages: [...statusMessages]
  })
};`
  )();

  runtime.primeOrders([
    { id: '9001', name: '#1001', line_items: [] }
  ]);

  runtime.setSelection(['#1001']);
  const hashResult = runtime.resolve();
  assert.deepEqual(hashResult.orderNos, ['1001']);
  assert.deepEqual(runtime.snapshot().selected, ['1001']);

  runtime.setSelection(['9001']);
  const idResult = runtime.resolve();
  assert.deepEqual(idResult.orderNos, ['1001']);
  assert.deepEqual(runtime.snapshot().selected, ['1001']);

  runtime.setSelection(['missing-key']);
  const missingResult = runtime.resolve(true);
  assert.equal(missingResult.rows.length, 0);
  const snapshot = runtime.snapshot();
  assert.deepEqual(snapshot.selected, []);
  assert.ok(
    snapshot.statusMessages.some((message) =>
      message.includes('Selection updated: some stale order references were cleared.')
    )
  );
});

test('applyDispatchControllerState resolves controller keys and preserves manual selection when unresolved', async () => {
  const appJs = await fs.readFile(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');

  const runtime = new Function(
    `let dispatchControllerState = null;
let dispatchSelectedOrders = new Set();
let dispatchRotarySelectedKey = '';
let dispatchLastHandledConfirmAt = '';
let dispatchLastHandledPrintRequestAt = '';
let dispatchLastHandledFulfillRequestAt = '';
let dispatchOrderCache = new Map();
let dispatchOrderLookup = new Map();
let dispatchOrdersLatest = [];
let dispatchBoard = { querySelector: () => null };
let handleDispatchAction = () => Promise.resolve();
let openDispatchOrderModal = () => {};
let toggleDispatchLineItemPacked = () => {};
let setDispatchLinePackedQuantity = () => {};
let syncDispatchRotarySelectionUI = () => {};
let dispatchPackedQtyPromptState = null;
let statusExplain = () => {};

${extractFunctionSource(appJs, 'orderNoFromName')}
${extractFunctionSource(appJs, 'normalizeDispatchSelectionKey')}
${extractFunctionSource(appJs, 'setDispatchOrderLookupEntry')}
${extractFunctionSource(appJs, 'buildDispatchOrderLookupIndexes')}
${extractFunctionSource(appJs, 'resolveDispatchOrderFromSelectionKey')}
${extractFunctionSource(appJs, 'resolveSelectedDispatchOrders')}
${extractFunctionSource(appJs, 'applyDispatchControllerState')}

return {
  primeOrders: (orders) => {
    dispatchOrdersLatest = Array.isArray(orders) ? orders : [];
    dispatchOrderCache = new Map(
      dispatchOrdersLatest.map((order) => [String(order?.name || '').replace('#', '').trim(), order])
    );
    buildDispatchOrderLookupIndexes(dispatchOrdersLatest, dispatchOrderCache);
  },
  setSelection: (keys) => {
    dispatchSelectedOrders = new Set(Array.isArray(keys) ? keys : []);
  },
  applyState: (state) => {
    dispatchControllerState = state;
    return applyDispatchControllerState();
  },
  snapshot: () => ({
    selected: [...dispatchSelectedOrders],
    rotaryKey: dispatchRotarySelectedKey
  })
};`
  )();

  runtime.primeOrders([
    { id: '9001', name: '#1001', line_items: [] }
  ]);

  runtime.setSelection([]);
  const resolvedFromId = runtime.applyState({ selectedOrderId: '9001', selectedLineItemKey: 'line-1a' });
  assert.equal(resolvedFromId.selectedOrderId, '1001');
  assert.deepEqual(runtime.snapshot().selected, ['1001']);
  assert.equal(runtime.snapshot().rotaryKey, '1001:line-1a');

  runtime.setSelection(['1001']);
  const unresolved = runtime.applyState({ selectedOrderId: 'does-not-exist', selectedLineItemKey: 'line-2b' });
  assert.equal(unresolved.selectedOrderChanged, false);
  assert.deepEqual(runtime.snapshot().selected, ['1001']);
  assert.equal(runtime.snapshot().rotaryKey, '');
});

test('dispatch line item clicks require order selection before packed state toggles', async () => {
  const appJs = await fs.readFile(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');

  assert.match(
    appJs,
    /const orderAlreadySelected = dispatchSelectedOrders\.size === 1 && dispatchSelectedOrders\.has\(orderNo\);[\s\S]+if \(!orderAlreadySelected\) {[\s\S]+dispatchSelectedOrders\.clear\(\);[\s\S]+syncDispatchSelectionUI\(\);[\s\S]+return;[\s\S]+}\s+toggleDispatchLineItemPacked\(orderNo, itemKey\);/
  );
});

test('dispatch controller overlay only renders in the active orders view and respects connection gating', async () => {
  const appJs = await fs.readFile(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');

  assert.match(
    appJs,
    /const shouldShow = Boolean\(controllerSettings\.showOnScreenButtons !== false\) &&[\s\S]+activeViewId === "viewScan" &&[\s\S]+controllerSettings\.requireConnectedRemote === false \|\| controllerConnected/
  );
  assert.match(appJs, /dispatch-controller-high-visibility/);
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

test('order modal exposes 150x100 order label print action and popup renderer', async () => {
  const appJs = await fs.readFile(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');

  assert.match(appJs, /data-action="print-order-label"/);
  assert.match(appJs, /function printOrderLabel\(orderNo\)/);
  assert.match(appJs, /@page \{ size: 150mm 100mm; margin: 0; \}/);
  assert.match(appJs, /if \(actionType === "print-order-label"\)/);
});

test('sticker calibration controls and order-label style hooks are present in index', async () => {
  const indexHtml = await fs.readFile(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

  assert.match(indexHtml, /id="settingsStickerLayoutProfile"/);
  assert.match(indexHtml, /id="settingsStickerXOffsetMm"/);
  assert.match(indexHtml, /id="settingsStickerYOffsetMm"/);
  assert.match(indexHtml, /id="settingsStickerLabelWidthMm"/);
  assert.match(indexHtml, /id="settingsStickerLabelHeightMm"/);
  assert.match(indexHtml, /id="settingsStickerColumnGapMm"/);
  assert.match(indexHtml, /id="settingsStickerLine1YMm"/);
  assert.match(indexHtml, /id="settingsStickerLine2YMm"/);
  assert.match(indexHtml, /id="settingsStickerLine3YMm"/);
  assert.match(indexHtml, /id="settingsStickerTextRotation"/);
  assert.match(indexHtml, /\.orderLabel150x100/);
});

test('printnode best-before sticker builder uses configurable calibration values', async () => {
  const printnodeRoute = await fs.readFile(path.join(__dirname, '..', 'src', 'routes', 'printnode.js'), 'utf8');

  assert.match(printnodeRoute, /const calibration = settings\?\.sticker\?\.calibration \|\| \{\};/);
  assert.match(printnodeRoute, /labelWidthMm/);
  assert.match(printnodeRoute, /labelHeightMm/);
  assert.match(printnodeRoute, /columnGapMm/);
  assert.match(printnodeRoute, /line1YMm/);
  assert.match(printnodeRoute, /line2YMm/);
  assert.match(printnodeRoute, /line3YMm/);
  assert.match(printnodeRoute, /textRotation/);
  assert.match(printnodeRoute, /A\$\{x\},\$\{lineOneY\},\$\{textRotation\}/);
});

test('legacy unified-operations entrypoints redirect into integrated routes', async () => {
  const { server, baseUrl } = await startServer();
  try {
    const cases = [
      ['/admin', '/stock'],
      ['/purchase-orders.html', '/buy'],
      ['/manufacturing.html', '/make'],
      ['/product-management.html', '/stock?section=inventory&tab=raw-materials'],
      ['/dispatch-settings', '/stock?notice=tool-retired'],
      ['/logs', '/stock?notice=tool-retired']
    ];

    for (const [source, target] of cases) {
      const response = await fetch(`${baseUrl}${source}`, { redirect: 'manual' });
      assert.equal(response.status, 302, `${source} should redirect`);
      assert.equal(response.headers.get('location'), target);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('main index uses unified stock-buy-make shell without embedded admin iframe', async () => {
  const indexHtml = await fs.readFile(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

  assert.match(indexHtml, /id="navBuy"/);
  assert.match(indexHtml, /id="navMake"/);
  assert.match(indexHtml, /id="navAgentCommissions"/);
  assert.match(indexHtml, /id="viewBuy"/);
  assert.match(indexHtml, /id="viewMake"/);
  assert.match(indexHtml, /id="viewAgentCommissions"/);
  assert.match(indexHtml, /data-stock-primary="inventory"/);
  assert.match(indexHtml, /data-stock-primary="batches"/);
  assert.match(indexHtml, /data-stock-primary="stocktakes"/);
  assert.doesNotMatch(indexHtml, /<iframe/i);
  assert.doesNotMatch(indexHtml, /id="viewAdmin"/);
  assert.doesNotMatch(indexHtml, /id="navFooterAdmin"/);
});
