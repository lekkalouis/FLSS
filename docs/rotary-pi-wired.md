# Raspberry Pi wired rotary setup (FLSS Repo 2.2)

Use `scripts/rotary-pi-wired.py` to control FLSS dispatch selection over HTTP.

## 1. Install dependencies on the Pi

```bash
sudo apt update
sudo apt install -y python3-pip
pip3 install gpiozero requests adafruit-circuitpython-dht
sudo apt-get install -y libgpiod2
```

## 2. Wire the controls and RGB LED (default BCM pins)

- `CLK` -> `GPIO17`
- `DT` -> `GPIO27`
- `SW` -> `GPIO22` (knob click / confirm)
- `CONFIRM BTN` -> `GPIO5`
- `BACK BTN` -> `GPIO6`
- `PRINT BTN` -> `GPIO19`
- `FULFILL BTN` -> `GPIO26`
- `RGB LED R` -> `GPIO18`
- `RGB LED G` -> `GPIO23`
- `RGB LED B` -> `GPIO24`
- `+` -> `3V3`
- `GND` -> `GND`

## 3. Configure environment

```bash
export FLSS_BASE_URL="http://<flss-host>:3000/api/v1"
export ROTARY_TOKEN="<same-token-as-FLSS-ROTARY_TOKEN>"
export REMOTE_TOKEN="<same-token-as-FLSS-REMOTE_TOKEN>"
export ROTARY_SOURCE="rotary_pi"
export REMOTE_ID="rotary_pi"
export REMOTE_FIRMWARE="rotary-pi-wired-2.2"
export STATION_ID="scan-station-01"
export DHT11_ENABLED=1
export DHT_PIN=4
export DHT_POLL_INTERVAL_S=5
```

Optional pin overrides:

```bash
export ROTARY_CLK_PIN=17
export ROTARY_DT_PIN=27
export ROTARY_SW_PIN=22
export ROTARY_CONFIRM_BTN_PIN=5
export ROTARY_BACK_BTN_PIN=6
export ROTARY_PRINT_BTN_PIN=19
export ROTARY_FULFILL_BTN_PIN=26
export ROTARY_CONFIRM_HOLD_TIME_S=0.6
export ROTARY_RGB_RED_PIN=18
export ROTARY_RGB_GREEN_PIN=23
export ROTARY_RGB_BLUE_PIN=24
export ROTARY_LED_FEEDBACK_S=0.25
export ROTARY_MIN_ACTION_GAP_S=0.18
export ROTARY_HTTP_TIMEOUT_S=2.5
export REMOTE_HEARTBEAT_INTERVAL_S=10
export ENV_TELEMETRY_INTERVAL_S=10
export REMOTE_LEGACY_FALLBACK=1
```

Legacy compatibility:

- `ROTARY_ACTION_BTN_PIN` is still accepted as the confirm button alias.
- `ROTARY_SW_HOLD_TIME_S` is still accepted as the confirm-hold alias.

Optional environment telemetry fallbacks:

```bash
export ENV_TEMPERATURE_C=22.4
export ENV_HUMIDITY_PCT=43.1
export ENV_SENSOR_CMD="python3 /usr/local/bin/dht11-read-json.py --pin 4"
```

## 4. Run the script

```bash
python3 scripts/rotary-pi-wired.py
```

## 5. Button behavior

- Rotate knob: `next` / `prev`
- Knob click: confirm flow
- Hold knob: `confirm_hold`
- Confirm side button: confirm flow
- Hold confirm side button: `confirm_hold`
- Back side button: context-aware `back`
- Print button: `print`
- Fulfill button: `fulfill`

When quantity mode is active, rotation changes packed quantity and the next confirm click commits `set_packed_qty`.

## 6. API contract used

- `POST /api/v1/dispatch/remote/heartbeat`
- `POST /api/v1/dispatch/remote/action`
- `POST /api/v1/dispatch/environment`
- `POST /api/v1/environment/ingest`
- Optional fallback: `POST /api/v1/dispatch/{next,prev,confirm,back,print,fulfill}`

## 7. DHT11 notes

The script can run a background DHT11 monitor and post to `POST /api/v1/environment/ingest`.

If `ENV_SENSOR_CMD` is set, the script also supports command-based temperature and humidity sampling for non-DHT sensors.

## 8. Troubleshooting

- `401 Unauthorized` means Pi-side tokens do not match the server.
- If rotation feels reversed, swap `CLK` and `DT` or swap the action mapping.
- If telemetry is skipped, check the sensor payload and the configured pin numbers.
