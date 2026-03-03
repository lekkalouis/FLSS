import test from "node:test";
import assert from "node:assert/strict";

import { ControllerBridge } from "../src/services/controllerBridge.js";

test("ingests valid rotate event", () => {
  const bridge = new ControllerBridge({ minIntervalMs: 1 });
  const result = bridge.ingest({
    type: "controller",
    source: "pi-station-01",
    ts: new Date().toISOString(),
    event: "ROTATE",
    data: { dir: "CW", steps: 1, shift: false }
  });

  assert.equal(result.ok, true);
  assert.equal(result.event.data.dir, "CW");
});

test("rejects invalid payload", () => {
  const bridge = new ControllerBridge({ minIntervalMs: 1 });
  assert.throws(() => {
    bridge.ingest({ type: "controller", source: "x", event: "SENSOR", data: {} });
  }, /SENSOR requires numeric/);
});

test("applies per-source rate limit", () => {
  const bridge = new ControllerBridge({ minIntervalMs: 1000 });
  const one = bridge.ingest({
    type: "controller",
    source: "pi-station-01",
    event: "PRESS",
    data: { button: "MODE", action: "click", shift: false }
  });
  const two = bridge.ingest({
    type: "controller",
    source: "pi-station-01",
    event: "PRESS",
    data: { button: "MODE", action: "click", shift: false }
  });

  assert.equal(one.ok, true);
  assert.equal(two.ok, false);
  assert.equal(two.code, "RATE_LIMITED");
});
