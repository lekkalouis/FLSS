# Raspberry Pi Setup (Rotary + 2 Buttons + RGB LED)

This guide sets up a Pi as a **hardware controller + kiosk** for FLSS Dispatch.
It uses keyboard injection (`Tab`, `Shift+Tab`, `Enter`, `Escape`) because the web app already supports tab-loop style navigation and activation for dispatch packing targets.

## 1) Hardware wiring (BCM)

> Keep all GPIO at **3.3V logic**.

| Control | BCM | Physical pin | Direction |
|---|---:|---:|---|
| Rotary A (CLK) | 17 | 11 | Input (pull-up) |
| Rotary B (DT) | 27 | 13 | Input (pull-up) |
| Rotary push | 22 | 15 | Input (pull-up) |
| Button 1 | 23 | 16 | Input (pull-up) |
| Button 2 | 24 | 18 | Input (pull-up) |
| RGB LED Red | 18 | 12 | PWM output |
| RGB LED Green | 12 | 32 | PWM output |
| RGB LED Blue | 13 | 33 | PWM output |
| 3.3V | — | 1 | Power |
| GND | — | 6/9/14/etc | Ground |

### LED resistor note
Use a resistor (220–470 Ω) on **each** RGB channel unless your RGB module already includes current limiting.

## 2) Install Raspberry Pi OS packages

```bash
sudo apt update
sudo apt install -y python3-gpiozero xdotool unclutter
```

## 3) Copy bridge script to Pi

From this repo, use:

- `scripts/pi-rotary-kiosk-bridge.py`

Then on Pi:

```bash
mkdir -p ~/flss
cp /path/to/repo/scripts/pi-rotary-kiosk-bridge.py ~/flss/
chmod +x ~/flss/pi-rotary-kiosk-bridge.py
```

## 4) Keyboard mapping used by bridge

- Rotary clockwise → `Tab` (next target)
- Rotary anticlockwise → `Shift+Tab` (previous target)
- Rotary push → `Enter` (activate focused target)
- Button 1 → `Enter`
- Button 2 → `Escape`

This matches the dispatch screen behavior:
- navigation cycles infinitely,
- line-items are in the focus order before action buttons per order card,
- focused control has stronger glow/highlight.

## 5) Create a systemd service for the GPIO bridge

`sudo nano /etc/systemd/system/flss-pi-bridge.service`

```ini
[Unit]
Description=FLSS Raspberry Pi GPIO bridge
After=graphical.target

[Service]
Type=simple
User=pi
Environment=DISPLAY=:0
Environment=XAUTHORITY=/home/pi/.Xauthority
WorkingDirectory=/home/pi/flss
ExecStart=/usr/bin/python3 /home/pi/flss/pi-rotary-kiosk-bridge.py
Restart=always
RestartSec=1

[Install]
WantedBy=graphical.target
```

Enable:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now flss-pi-bridge.service
sudo systemctl status flss-pi-bridge.service
```

## 6) Chromium kiosk autostart

Create:

`~/.config/autostart/flss-kiosk.desktop`

```ini
[Desktop Entry]
Type=Application
Name=FLSS Kiosk
Exec=sh -c 'xset s off && xset -dpms && xset s noblank && unclutter -idle 0.2 -root && chromium-browser --kiosk --incognito --disable-infobars --noerrdialogs --check-for-update-interval=31536000 http://localhost:3000/dispatch'
X-GNOME-Autostart-enabled=true
```

If FLSS runs on another host, replace `http://localhost:3000/dispatch`.

## 7) Optional: run FLSS server on boot

If the Pi is hosting FLSS itself:

```bash
cd /path/to/FLSS
npm ci
```

Systemd service example:

```ini
[Unit]
Description=FLSS Node server
After=network-online.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/FLSS
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=2
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

## 8) Quick verification checklist

1. Boot Pi and wait for Chromium kiosk page.
2. Turn rotary: focus should move and wrap infinitely.
3. Verify focus glow is clearly visible from operator distance.
4. Press rotary: focused line item toggles packed (or focused button activates).
5. Press Button 2: modal should close (`Escape`) if one is open.
6. Run logs if needed:

```bash
journalctl -u flss-pi-bridge.service -f
```

## 9) Troubleshooting

- `xdotool` does nothing:
  - confirm service has `DISPLAY=:0` and valid `XAUTHORITY`.
  - ensure Chromium is running in the same desktop session.
- Encoder direction feels reversed:
  - swap A/B wires, or swap `Tab`/`Shift+Tab` handlers in script.
- Unstable button/encoder behavior:
  - shorten wires, ensure common ground, tune bounce values in script.
- LED too dim/too bright:
  - adjust PWM values in `pulse()` and `heartbeat()`.
