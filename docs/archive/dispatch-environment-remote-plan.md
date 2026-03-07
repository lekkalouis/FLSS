# Dispatch Board Expansion Plan: Environment Data + Dedicated Remote

## Objectives

1. Pull **temperature** and **humidity** readings from a connected sensor into FLSS.
2. Show live environment conditions in the **dispatch board header navigation**.
3. Add a **dedicated remote control flow** for dispatch actions (next/previous/confirm + utility actions).
4. Keep reliability high with offline tolerance, heartbeat monitoring, and role-safe control.

---

## Feature Set A: Temperature + Humidity in Dispatch Header

### A1) Sensor ingestion pipeline

- Add a new sensor ingestion endpoint for edge devices (Pi/ESP32/controller):
  - `POST /api/v1/dispatch/environment`
- Payload:
  - `deviceId`, `temperatureC`, `humidityPct`, `recordedAt`, optional `batteryPct`, optional `signalRssi`.
- Validate and normalize values:
  - Temperature range check (e.g., `-20` to `80` °C).
  - Humidity range check (`0` to `100` %).
  - Reject stale timestamps beyond configured tolerance.

### A2) Live state + streaming

- Extend dispatch state with environment block:
  - `environment.current`
  - `environment.status` (`ok`, `stale`, `missing`, `error`)
  - `environment.lastUpdatedAt`
- Broadcast updates on SSE (`/api/v1/dispatch/events`) with event type:
  - `environment-update`

### A3) Dispatch header UI widget

- Add header badges/cards in dispatch top navigation:
  - `🌡 Temp: 22.4°C`
  - `💧 Humidity: 48%`
- Include quality indicators:
  - Green = fresh data, amber = stale warning, red = missing/error.
- Add hover/tap details:
  - Sensor ID, last update age, optional battery and signal.

### A4) Threshold alerts

- Configurable threshold limits in config:
  - `ENV_TEMP_MIN_C`, `ENV_TEMP_MAX_C`
  - `ENV_HUMIDITY_MIN`, `ENV_HUMIDITY_MAX`
  - `ENV_STALE_MS`
- When values breach limits:
  - Show warning pill in header.
  - Emit internal event for logs/notification templates.

### A5) History and diagnostics panel (optional phase 2)

- Add mini trend graph for last 60 minutes.
- Add diagnostics card in `/dispatch-settings`:
  - Last packet time, packet rate, dropped packet count, drift stats.

---

## Feature Set B: Dedicated Remote for Dispatch System

### B1) Remote identity + pairing

- Register remote devices by `remoteId` and `secret` (or signed token).
- Pairing modes:
  - Pre-shared key (simple local setup).
  - Time-limited pairing code from dispatch settings.

### B2) Remote command API

- Add secure command route:
  - `POST /api/v1/dispatch/remote/action`
- Supported actions:
  - `next`, `prev`, `confirm`, `clear-selection`, `toggle-expand`, `refresh`.
- Include idempotency key to prevent duplicate confirms.

### B3) Remote heartbeat and availability

- `POST /api/v1/dispatch/remote/heartbeat` every N seconds.
- Track:
  - `lastSeenAt`, firmware version, battery, signal, active profile.
- Header/system indicator:
  - `Remote Connected` / `Remote Stale` / `Remote Offline`.

### B4) Permission model

- Roles for remote actions:
  - `viewer` (read state only)
  - `operator` (next/prev)
  - `dispatcher` (confirm/clear)
  - `admin` (pair/unpair/config)
- Audit each command with source metadata.

### B5) Failsafe behavior

- If remote is offline, keep existing keyboard/UI/manual flow active.
- Rate-limit confirm actions.
- Optional "hold-to-confirm" (long press) for irreversible actions.

---

## Proposed Functions and Modules

### Backend functions (`src/services/dispatchController.js` + new modules)

- `upsertEnvironmentReading(reading)`
  - Validate, normalize, update in-memory state/store.
- `getEnvironmentState()`
  - Return current values + freshness + threshold status.
- `evaluateEnvironmentThresholds(reading, config)`
  - Produce alert flags and severity.
- `emitEnvironmentUpdate(state)`
  - Push to dispatch SSE subscribers.
- `registerRemote(remoteMeta)`
  - Create/update known remote profile.
- `authorizeRemoteAction(remoteToken, action)`
  - Enforce role + source policy.
- `applyRemoteAction(action, context)`
  - Map remote inputs to existing dispatch actions.
- `recordRemoteHeartbeat(remoteId, heartbeat)`
  - Refresh availability and health data.

### API routes (`src/routes/dispatch.controller.js`)

- `POST /dispatch/environment`
- `GET /dispatch/environment`
- `POST /dispatch/remote/action`
- `POST /dispatch/remote/heartbeat`
- `GET /dispatch/remote/status`

### Front-end functions (`public/app.js`)

- `renderEnvironmentHeaderWidget(environmentState)`
- `formatEnvironmentValue(value, unit)`
- `getEnvironmentFreshnessClass(lastUpdatedAt)`
- `handleEnvironmentEvent(eventPayload)`
- `renderRemoteStatusBadge(remoteState)`
- `handleRemoteStatusEvent(eventPayload)`

---

## Suggested Rollout Plan

1. **MVP 1:** Sensor API + header display + SSE updates.
2. **MVP 2:** Remote action endpoint (secured) + heartbeat + status badge.
3. **MVP 3:** Threshold alerts + settings UI + audit logs.
4. **MVP 4:** Trend history + remote pairing UX + firmware metadata.

---

## Acceptance Criteria

- Dispatch header shows temperature and humidity within 2 seconds of a new sensor payload.
- If no sensor packet arrives within `ENV_STALE_MS`, header shows stale warning.
- Remote can execute `next/prev/confirm` with authenticated requests only.
- Every remote command is logged with timestamp, remote ID, action, result.
- Existing manual dispatch controls continue to work when sensor/remote is unavailable.
