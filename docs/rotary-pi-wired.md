# Raspberry Pi wired rotary setup (FLSS)

Use `scripts/rotary-pi-wired.py` to control FLSS dispatch selection over HTTP.

## 1) Install dependencies on Pi

```bash
sudo apt update
sudo apt install -y python3-pip
pip3 install gpiozero requests
```

## 2) Wire the encoder (default BCM pins)

- `CLK` -> `GPIO17`
- `DT` -> `GPIO27`
- `SW` -> `GPIO22`
- `+` -> `3V3`
- `GND` -> `GND`

## 3) Configure environment

```bash
export FLSS_BASE_URL="http://<flss-host>:3000/api/v1"
export ROTARY_TOKEN="<same-token-as-FLSS-ROTARY_TOKEN>"
export ROTARY_SOURCE="rotary_pi"
```

Optional tuning:

```bash
export ROTARY_CLK_PIN=17
export ROTARY_DT_PIN=27
export ROTARY_SW_PIN=22
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

## Notes

- If direction feels inverted, either swap `CLK` and `DT` wires or swap action mapping in script.
- Server already debounces burst input (`ROTARY_DEBOUNCE_MS`); script also has a small client-side action gap.
