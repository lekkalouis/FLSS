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
export ROTARY_TOKEN="<same-token-as-FLSS-ROTARY_TOKEN>"  # required when server ROTARY_TOKEN is set
export ROTARY_SOURCE="rotary_pi"
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
```

## 4) Run script

```bash
python3 scripts/rotary-pi-wired.py
```

## API contract used

- `POST /api/v1/dispatch/next` body `{ "source": "rotary_pi" }`
- `POST /api/v1/dispatch/prev` body `{ "source": "rotary_pi" }`
- `POST /api/v1/dispatch/confirm` body `{ "source": "rotary_pi" }`
- Header `Authorization: Bearer <ROTARY_TOKEN>`

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
