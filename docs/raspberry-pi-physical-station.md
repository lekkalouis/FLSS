# Raspberry Pi 4 Physical Station Implementations

This guide gives you **practical, buildable implementations** for turning a Raspberry Pi 4 + camera + mixed sensor kit into a useful ops station for FLSS.

All examples assume your FLSS server is reachable at:

- `http://<flss-host>:3000/api/v1`

---

## 1) Smart Dispatch Console (buttons + status LEDs + buzzer)

### What it does

A desk-mounted control panel with:

- **Book Truck button** → triggers `/alerts/book-truck`
- **Refresh Status button** → polls `/statusz`
- **Ready-for-Collection button** → sends `/shopify/ready-for-pickup` for the active order
- **RGB LED** shows system state:
  - Green: all integrations healthy
  - Yellow: degraded
  - Red: error/offline
- **Buzzer** chirps on failures

This gives operators a one-touch fallback when the main UI is busy.

### Suggested parts from your kit

- 3 momentary buttons
- 1 RGB LED module (or 3 single LEDs)
- 1 active buzzer module
- Jumper wires + breadboard
- Optional: small OLED/LCD for showing status text

### GPIO wiring suggestion

| Function | GPIO (BCM) | Notes |
|---|---:|---|
| Book Truck button | 17 | Use internal pull-up, button to GND |
| Refresh button | 27 | Use internal pull-up, button to GND |
| Ready button | 22 | Use internal pull-up, button to GND |
| LED Green | 5 | Through resistor |
| LED Yellow | 6 | Through resistor |
| LED Red | 13 | Through resistor |
| Buzzer | 19 | Active buzzer module input |

### Python implementation (`pi_station/dispatch_console.py`)

```python
#!/usr/bin/env python3
import os
import time
import requests
from gpiozero import Button, LED, Buzzer
from signal import pause

FLSS_BASE = os.getenv("FLSS_BASE", "http://127.0.0.1:3000/api/v1")
TRUCK_TO = os.getenv("TRUCK_EMAIL_TO", "dispatch@example.com")
READY_ORDER = os.getenv("READY_ORDER_NAME", "#1001")

btn_book = Button(17, pull_up=True)
btn_refresh = Button(27, pull_up=True)
btn_ready = Button(22, pull_up=True)

led_ok = LED(5)
led_warn = LED(6)
led_err = LED(13)
buzzer = Buzzer(19)


def set_state(ok=False, warn=False, err=False):
    led_ok.value = ok
    led_warn.value = warn
    led_err.value = err


def chirp(times=1, on=0.08, off=0.08):
    for _ in range(times):
        buzzer.on()
        time.sleep(on)
        buzzer.off()
        time.sleep(off)


def refresh_health():
    try:
        r = requests.get(f"{FLSS_BASE}/statusz", timeout=4)
        r.raise_for_status()
        data = r.json()

        # Generic health interpretation for mixed status payloads
        vals = [str(v).lower() for v in data.values() if isinstance(v, (str, bool, int))]
        joined = " ".join(vals)
        if "down" in joined or "error" in joined or "false" in joined:
            set_state(err=True)
            chirp(2)
        elif "degraded" in joined or "warn" in joined:
            set_state(warn=True)
        else:
            set_state(ok=True)
    except Exception:
        set_state(err=True)
        chirp(3, on=0.05, off=0.05)


def book_truck():
    payload = {
        "to": TRUCK_TO,
        "subject": "Truck booking request",
        "message": "Triggered from Raspberry Pi dispatch console.",
    }
    try:
        r = requests.post(f"{FLSS_BASE}/alerts/book-truck", json=payload, timeout=6)
        r.raise_for_status()
        set_state(ok=True)
    except Exception:
        set_state(err=True)
        chirp(2)


def ready_for_collection():
    payload = {"orderName": READY_ORDER}
    try:
        r = requests.post(f"{FLSS_BASE}/shopify/ready-for-pickup", json=payload, timeout=6)
        r.raise_for_status()
        set_state(ok=True)
    except Exception:
        set_state(err=True)
        chirp(2)


btn_book.when_pressed = book_truck
btn_refresh.when_pressed = refresh_health
btn_ready.when_pressed = ready_for_collection

refresh_health()
pause()
```

---

## 2) Pick-to-Light Shelf Assistant (joystick + LEDs + optional relay/fan)

### What it does

A warehouse helper where the Pi acts as a **physical picker companion**:

- Polls `GET /shopify/orders/open`
- Chooses the next order
- Lights a color to indicate action:
  - Blue: picking in progress
  - Green: picked and packed
  - Red: issue/exception
- Joystick press confirms each stage
- Optional relay toggles stack light / fan / signal lamp

### Why this is useful

You reduce context switching: picker doesn’t need to keep touching keyboard/mouse for every micro-step.

### Suggested flow

1. Poll open orders every 10–15 seconds.
2. Show current order on mini display (or serial terminal).
3. Joystick press = mark stage complete.
4. On final press, call:
   - `/shopify/orders/parcel-count` (if needed), then
   - `/shopify/fulfill`

### Python skeleton (`pi_station/pick_to_light.py`)

```python
#!/usr/bin/env python3
import os
import time
import requests
from gpiozero import Button, LED

FLSS_BASE = os.getenv("FLSS_BASE", "http://127.0.0.1:3000/api/v1")
POLL_SEC = int(os.getenv("POLL_SEC", "12"))

# Reuse available LED pins; swap as needed
led_pick = LED(20)   # blue equivalent if RGB module supports
led_done = LED(21)   # green
led_issue = LED(16)  # red

btn_confirm = Button(23, pull_up=True)

current_order = None
stage = "idle"


def set_stage(new_stage):
    global stage
    stage = new_stage
    led_pick.off(); led_done.off(); led_issue.off()
    if stage == "picking":
        led_pick.on()
    elif stage == "done":
        led_done.on()
    elif stage == "issue":
        led_issue.on()


def load_next_order():
    global current_order
    try:
        r = requests.get(f"{FLSS_BASE}/shopify/orders/open", timeout=8)
        r.raise_for_status()
        orders = r.json() or []
        if orders:
            current_order = orders[0]
            set_stage("picking")
        else:
            current_order = None
            set_stage("idle")
    except Exception:
        set_stage("issue")


def fulfill_current_order():
    if not current_order:
        return

    order_id = current_order.get("id")
    payload = {
        "orderId": order_id,
        "notifyCustomer": False,
    }
    try:
        r = requests.post(f"{FLSS_BASE}/shopify/fulfill", json=payload, timeout=10)
        r.raise_for_status()
        set_stage("done")
    except Exception:
        set_stage("issue")


def on_confirm():
    if stage == "picking":
        fulfill_current_order()
    elif stage in ("done", "issue", "idle"):
        load_next_order()


btn_confirm.when_pressed = on_confirm

while True:
    if stage in ("idle", "done"):
        load_next_order()
    time.sleep(POLL_SEC)
```

---

## 3) Camera Guard + Motion Trigger (PIR + camera + event calls)

### What it does

Uses your Raspberry Pi camera + PIR module to create a smart guard station:

- PIR motion detection activates image capture
- Captures timestamped evidence frame
- Optional CV check (barcode/label presence, human detection)
- Calls an FLSS endpoint or webhook to log anomalies
- Flashes LED + buzzer when suspicious event occurs

### Suggested modules

- PIR module (you appear to have one)
- Pi Camera (CSI)
- LED + buzzer
- Optional relay for alarm light

### Minimal implementation (`pi_station/camera_guard.py`)

```python
#!/usr/bin/env python3
import os
import time
from datetime import datetime
import requests
from gpiozero import MotionSensor, LED, Buzzer
from picamera2 import Picamera2

FLSS_BASE = os.getenv("FLSS_BASE", "http://127.0.0.1:3000/api/v1")
OUT_DIR = os.getenv("OUT_DIR", "/home/pi/captures")

pir = MotionSensor(24)
alert_led = LED(25)
buzzer = Buzzer(26)

cam = Picamera2()
cam.configure(cam.create_still_configuration())
cam.start()


def notify_event(image_path):
    payload = {
        "type": "motion_capture",
        "capturedAt": datetime.utcnow().isoformat() + "Z",
        "imagePath": image_path,
        "source": "pi-guard-station",
    }
    # If you add a dedicated endpoint later, point there.
    # Using /statusz GET for health check fallback in this starter.
    try:
        requests.get(f"{FLSS_BASE}/statusz", timeout=4)
    except Exception:
        pass


def capture_motion():
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    path = f"{OUT_DIR}/motion_{ts}.jpg"
    cam.capture_file(path)
    alert_led.on()
    buzzer.on()
    time.sleep(0.15)
    buzzer.off()
    alert_led.off()
    notify_event(path)


while True:
    pir.wait_for_motion()
    capture_motion()
    time.sleep(1.5)
```

---

## 4) “Half-button” / dual-action UX ideas (interesting interactions)

Here are interaction patterns that feel advanced but are simple to wire:

- **Short press / long press / double press** on same button:
  - short: refresh order
  - long: emergency pause workflow
  - double: skip to next order
- **Two-button chord** (press both within 300 ms):
  - confirm destructive actions (cancel fulfillment, clear queue)
- **Hold-to-arm mode**:
  - hold 2 sec to enter “admin mode” (changes LED color), prevents accidental operations
- **Progressive LED feedback**:
  - blink count indicates number of pending tasks

Use `gpiozero.Button(hold_time=2)` and callbacks like `when_held` to implement this quickly.

---

## 5) Recommended architecture split (Pi + FLSS server)

### Run on Raspberry Pi

- GPIO scanning (buttons, joystick, PIR)
- LED/buzzer/relay output control
- Camera capture and local buffering
- Edge safety logic (debounce, retry, offline queue)

### Keep in FLSS backend (existing Node service)

- Shopify, ParcelPerfect, PrintNode API calls
- Business rules, auth tokens, retries
- Event/audit logs

This split keeps hardware brittle bits local and business-critical API logic centralized.

---

## 6) Add-on endpoint suggestions for FLSS (small, high-value)

If you want tighter integration, add these API endpoints in FLSS:

- `POST /api/v1/iot/events` — ingest button/camera/motion events
- `GET /api/v1/iot/commands/:stationId` — station command queue
- `POST /api/v1/iot/ack` — acknowledge executed command

This gives you future support for multiple stations (dispatch desk, packing table, security post).

---

## 7) Deployment quick-start on Pi OS

```bash
sudo apt update
sudo apt install -y python3-pip
python3 -m pip install gpiozero requests picamera2
```

Create a service file for auto-start (example for dispatch console):

```ini
# /etc/systemd/system/flss-dispatch-console.service
[Unit]
Description=FLSS Raspberry Pi Dispatch Console
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/pi_station
Environment=FLSS_BASE=http://192.168.1.40:3000/api/v1
ExecStart=/usr/bin/python3 /home/pi/pi_station/dispatch_console.py
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

Enable:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now flss-dispatch-console.service
sudo systemctl status flss-dispatch-console.service
```

---

## 8) Practical build order (weekend plan)

1. Build **Dispatch Console** first (fastest ROI).
2. Add **Pick-to-Light** next for packing workflow.
3. Add **Camera Guard** once enclosure/power is stable.
4. Add `/iot/events` backend endpoint last for long-term scalability.

That sequence gets you something useful quickly, then layers sophistication.

---

## 9) Document Capture Stand (PO/Invoice imaging + auto inspection print)

### What it does

When a document is placed on your stand:

1. A GPIO document-presence sensor triggers the Pi.
2. The Pi camera captures an image to local storage.
3. The Pi calls FLSS `POST /traceability/document-captures` to attach image metadata to the purchase order and invoice records.
4. FLSS finds the linked incoming inspection and automatically prints a driver's vehicle inspection sheet through PrintNode.

### New Pi script

Use `pi_station/document_capture_station.py`.

Required environment variables:

- `FLSS_BASE` (example: `http://192.168.1.40:3000/api/v1`)
- `DOC_PO_NUMBER` (PO number to link)
- `DOC_INVOICE_NUMBER` (invoice number to link)

Optional:

- `OUT_DIR` (capture folder, default `/home/pi/captures`)
- `DOC_SOURCE` (capture source tag)
- `DOC_SENSOR_GPIO` (sensor pin, default `24`)
- `DOC_SENSOR_ACTIVE_LOW` (default `true`)
- `DOC_TRIGGER_COOLDOWN_SEC` (default `2.0`)

Example run:

```bash
export FLSS_BASE=http://192.168.1.40:3000/api/v1
export DOC_PO_NUMBER=PO-24001
export DOC_INVOICE_NUMBER=INV-9011
python3 pi_station/document_capture_station.py
```

### Backend endpoints used

- `POST /api/v1/traceability/document-captures`
- `GET /api/v1/traceability/document-captures`
- `POST /api/v1/traceability/inspections/:inspectionId/print-sheet`

### Notes

- Ensure PrintNode credentials are set in FLSS (`PRINTNODE_API_KEY`, `PRINTNODE_PRINTER_ID`).
- The script intentionally captures once per placement event; remove/reinsert the page to trigger a new capture.
