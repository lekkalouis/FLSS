# Raspberry Pi wired rotary setup (FLSS)

Use `scripts/rotary-pi-wired.py` to control FLSS dispatch selection over HTTP.

## 1) Install dependencies on Pi

```bash
sudo apt update
sudo apt install -y python3-pip
pip3 install gpiozero requests
```

## 2) Wire the controls + RGB LED (default BCM pins)

- `CLK` -> `GPIO17`
- `DT` -> `GPIO27`
- `SW` -> `GPIO22`
- `Action push button` -> `GPIO5`
- `Back/Close push button` -> `GPIO6`
- `RGB LED R` -> `GPIO18`
- `RGB LED G` -> `GPIO23`
- `RGB LED B` -> `GPIO24`
- `+` -> `3V3`
- `GND` -> `GND`

## 3) Configure environment

```bash
export FLSS_BASE_URL="http://<flss-host>:3000/api/v1"
export ROTARY_TOKEN="<same-token-as-FLSS-ROTARY_TOKEN>"   # legacy /dispatch/{next|prev|confirm}
export REMOTE_TOKEN="<same-token-as-FLSS-REMOTE_TOKEN>"   # /dispatch/remote/* and /dispatch/environment
export ROTARY_SOURCE="rotary_pi"
export REMOTE_ID="rotary_pi"
export REMOTE_FIRMWARE="rotary-pi-wired-1.0.0"
```

Optional tuning:

```bash
export ROTARY_CLK_PIN=17
export ROTARY_DT_PIN=27
export ROTARY_SW_PIN=22
export ROTARY_ACTION_BTN_PIN=5
export ROTARY_BACK_BTN_PIN=6
export ROTARY_RGB_RED_PIN=18
export ROTARY_RGB_GREEN_PIN=23
export ROTARY_RGB_BLUE_PIN=24
export ROTARY_LED_FEEDBACK_S=0.25
export ROTARY_MIN_ACTION_GAP_S=0.05
export ROTARY_HTTP_TIMEOUT_S=2.5
export REMOTE_HEARTBEAT_INTERVAL_S=10
export ENV_TELEMETRY_INTERVAL_S=10
export REMOTE_LEGACY_FALLBACK=1

# Optional environment telemetry (if sensor attached to Pi)
export ENV_DEVICE_ID="pi-env-01"
export ENV_TEMPERATURE_C=22.4
export ENV_HUMIDITY_PCT=43.1
export ENV_BATTERY_PCT=99
export ENV_SIGNAL_RSSI=-58

# Dynamic sensor command (recommended for real sensors like CNT5)
# Command must print JSON: {"temperatureC": <num>, "humidityPct": <num>, "batteryPct": <num?>, "signalRssi": <num?>}
export ENV_SENSOR_CMD="python3 /home/pi/cnt5_reader.py"
```

## CNT5 sensor notes

If you are using a CNT5 sensor, set `ENV_SENSOR_CMD` to a script/command that reads CNT5 values and prints one JSON object to stdout.

Example output format:

```json
{"temperatureC": 21.7, "humidityPct": 46.2, "batteryPct": 88, "signalRssi": -61}
```

The rotary client executes `ENV_SENSOR_CMD` on each telemetry interval and uses those values for `POST /api/v1/dispatch/environment`.
If the command fails or returns invalid JSON, the script logs a warning and keeps running.

## 4) Run script

```bash
python3 scripts/rotary-pi-wired.py
```

## API contract used

- Remote heartbeat: `POST /api/v1/dispatch/remote/heartbeat` every `REMOTE_HEARTBEAT_INTERVAL_S` seconds.
  - Body includes `remoteId`, `firmware`, `battery`, `signal` (plus compatibility fields).
- Remote actions: `POST /api/v1/dispatch/remote/action` with `{ "action", "remoteId", "idempotencyKey" }`.
- Optional sensor telemetry: `POST /api/v1/dispatch/environment` with `{ "deviceId", "temperatureC", "humidityPct", "recordedAt" }`.
- Legacy fallback (optional): `POST /api/v1/dispatch/{next|prev|confirm}` if remote API returns unavailable errors or is unreachable.
- Headers:
  - `Authorization: Bearer <REMOTE_TOKEN>` for `/dispatch/remote/*` and `/dispatch/environment`
  - `Authorization: Bearer <ROTARY_TOKEN>` for legacy fallback endpoints

## Real-time browser sync

- Dispatch controller state now streams to browser clients over `GET /api/v1/dispatch/events` (Server-Sent Events).
- Rotary `next`, `prev`, `confirm`, and state sync updates are pushed immediately so dispatch card selection updates without high-frequency polling.
- The web UI still keeps a low-frequency fallback poll (`/api/v1/dispatch/state`) every few seconds. This fallback is only for legacy browsers or temporary SSE disconnects/reconnect windows.

## Notes

- If direction feels inverted, either swap `CLK` and `DT` wires or swap action mapping in script.
- Server already debounces burst input (`ROTARY_DEBOUNCE_MS`); script also has a small client-side action gap.
- Button mapping: `Action` sends `confirm`, `Back/Close` sends `prev`.
- RGB feedback: green on HTTP 200, blue on HTTP 409 state conflict, red on network/auth/other errors.


## Troubleshooting

- If you see `{ "ok": false, "error": "Unauthorized" }`, your Pi token does not match the server token.
- Set `ROTARY_TOKEN` on the Pi to exactly the same value configured on the FLSS server and restart the script.
- The script now runs an auth probe at startup and prints a clear `[AUTH]` message if token validation fails.
