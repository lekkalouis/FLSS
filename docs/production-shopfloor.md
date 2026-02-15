# Production / Shopfloor Module Blueprint

## Why this module

This blueprint turns your ideas into a concrete feature set for FLSS so the shop floor can:

- See the live production schedule and active production orders.
- Track who is on duty and who is hitting target.
- Capture run-times (average, today, records), production scores, and task progress.
- Plan weekly output and handle Saturday overtime requests.
- Auto-start and auto-stop timing sessions with sensor input, while still allowing manual override.
- Log quality data (including sample weights from smart scales).

---

## Core workflows

### 1) Production board

A dedicated **Shopfloor** view should include:

- **Production orders queue**
  - Planned, in-progress, blocked, completed states.
  - Priority and due-time indicators.
- **Schedule lane**
  - Shift timeline with expected start/finish windows.
- **Staff on duty**
  - Active roster, role, station assignment.
- **KPI strip**
  - Average cycle time.
  - Today's average cycle time.
  - Fastest (record) cycle time.
  - Output vs target (units/hour, units/shift).
- **Task and week plan widgets**
  - Short task cards with status.
  - Week plan target by day and by line.

### 2) Session timing (start/stop)

Support three trigger modes for operation timers:

1. **Manual mode**
   - Operator starts/stops a session from UI.
   - Emergency stop available.
2. **Button mode (Arduino/RPi GPIO)**
   - Physical Start and Stop buttons post events to FLSS.
   - UI gives sound + visual confirmation when events are accepted.
3. **Sound mode (automatic)**
   - Microphone stream sampled on device (RPi).
   - Feature extraction (RMS volume + dominant frequency band).
   - Classifier determines `RUNNING` vs `IDLE` based on threshold window.
   - Debounce logic prevents flapping:
     - Start requires sustained signal (e.g. 5-10 seconds).
     - Stop requires sustained silence/noise-below-threshold (e.g. 20-45 seconds).

Manual override should always win over automatic mode.

### 3) Staff targets and scoring

Each staff member can have:

- Shift target (units, batches, or tasks).
- Real-time achieved count.
- Efficiency score (actual vs expected time).
- Quality score (scrap/rework/weight variance penalties).
- Attendance or on-duty score weighting.

Suggested rollup formula:

`overall_score = (throughput_weight * throughput_score) + (quality_weight * quality_score) + (time_weight * time_score)`

Store weights in admin settings so supervisors can tune scoring per line.

### 4) Overtime flow (Saturday request)

Add an **Overtime Request** flow:

- Supervisor opens planned Saturday production load.
- Select required roles, headcount, and expected duration.
- FLSS sends request notifications to selected staff.
- Staff can accept/decline from a simple response link or internal kiosk.
- Dashboard shows fill-rate and gaps.

Minimum data fields:

- Date, start/end time, shift code.
- Role required.
- Requested staff count.
- Accepted count.
- Approval status + notes.

### 5) Sample weight logging (smart scales)

Create a quality logging stream for sample weights:

- Device posts readings with timestamp, station, production order, and operator.
- Save accepted and rejected readings (with rejection reason).
- Display trend chart and min/max/target bands per product.
- Alert when readings drift outside tolerance.

Required record fields:

- `sample_id`
- `captured_at`
- `production_order_id`
- `product_sku`
- `station_id`
- `operator_id`
- `gross_weight_g`
- `tare_weight_g` (optional)
- `net_weight_g`
- `target_weight_g`
- `tolerance_plus_g`
- `tolerance_minus_g`
- `status` (`PASS` / `FAIL`)
- `source` (`scale_auto` / `manual_entry`)

---

## Suggested technical architecture

### Edge hardware

- **Raspberry Pi station agent**
  - Reads microphone + optional GPIO buttons.
  - Publishes normalized machine state events (`RUNNING`, `STOPPED`).
- **Arduino sensor/button nodes**
  - Send button presses or sensor values over serial/MQTT/HTTP.
- **Smart scale interface**
  - USB serial, BLE, or Wi-Fi module.
  - Standardize incoming payload to JSON before sending to FLSS API.

### FLSS backend additions

Add new API groups under `/api/v1/shopfloor`:

- `POST /sessions/start`
- `POST /sessions/stop`
- `POST /sessions/event` (sensor/button input)
- `GET /sessions/active`
- `POST /weights`
- `GET /weights/history`
- `GET /kpis/live`
- `POST /overtime/requests`
- `POST /overtime/respond`
- `GET /targets/staff`
- `POST /targets/staff`

### Data model (high level)

- `production_orders`
- `production_sessions`
- `session_events`
- `staff_roster`
- `staff_targets`
- `staff_scores`
- `overtime_requests`
- `overtime_responses`
- `weight_samples`

---

## Rollout plan

### Phase 1: Manual-first MVP

- Shopfloor dashboard (orders, roster, KPIs, targets).
- Manual start/stop session buttons.
- Basic staff scorecard.
- Manual sample weight entry.

### Phase 2: Hardware-assisted automation

- GPIO/Arduino button ingestion.
- Sound-based auto start/stop classifier on RPi.
- Smart scale automatic capture.

### Phase 3: Advanced planning and optimization

- Overtime request + response workflow.
- Week plan balancing with target gaps.
- Predictive alerts for missed daily targets.

---

## Guardrails and reliability notes

- Keep **event sourcing** for session changes: never lose raw start/stop evidence.
- Include **source confidence** on auto-detected events.
- Require **supervisor confirmation** before closing critical production orders on automatic stop events.
- Use **time synchronization (NTP)** across devices for trustworthy metrics.
- Implement **offline buffering** on RPi/Arduino gateway so events sync when network returns.

---

## UX notes for shop floor adoption

- Large touch targets and high-contrast status colors.
- Loud but short positive/negative tones for button actions.
- Full-screen kiosk mode support.
- Clear state banner: `RUNNING`, `STOPPED`, `PAUSED`, `AWAITING CONFIRMATION`.
- Minimal typing during production; barcode/staff badge scan preferred.

---

## Next implementation step in FLSS

1. Add a new SPA route `/shopfloor` with a dashboard shell.
2. Add backend skeleton endpoints under `/api/v1/shopfloor` returning mock data.
3. Wire one hardware ingress endpoint (`/sessions/event`) and log events to storage.
4. Add staff target CRUD and live KPI calculations.
5. Add weight logging form + API, then replace with smart scale stream.

This sequence gives you fast operator value while keeping room for deeper automation.
