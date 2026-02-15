# FLSS Full-System Deployment on Raspberry Pi 4

This runbook explains how to run the **entire FLSS stack** (Node backend + SPA frontend + optional Pi hardware scripts) directly on a Raspberry Pi 4.

> Recommended target: Raspberry Pi 4 (4 GB or 8 GB RAM), Raspberry Pi OS Bookworm 64-bit.

---

## 1) Hardware and OS baseline

- Raspberry Pi 4 with stable power supply (5V/3A).
- 32+ GB microSD (or SSD for better reliability).
- Wired Ethernet recommended for warehouse deployments.
- Raspberry Pi OS Bookworm 64-bit.

After first boot:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl build-essential
```

---

## 2) Install Node.js LTS on Pi

Use Node 20 LTS (stable on ARM64 and supports FLSS dependencies):

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

---

## 3) Clone and install FLSS

```bash
cd /opt
sudo git clone <your-flss-repo-url> FLSS
sudo chown -R $USER:$USER /opt/FLSS
cd /opt/FLSS
npm install
```

---

## 4) Configure environment variables

Create `.env` in `/opt/FLSS`:

```bash
PORT=3000
HOST=0.0.0.0
FRONTEND_ORIGIN=http://<pi-ip>:3000

# ParcelPerfect
PP_BASE_URL=
PP_REQUIRE_TOKEN=true
PP_TOKEN=
PP_ACCNUM=
PP_PLACE_ID=

# Shopify
SHOPIFY_STORE=
SHOPIFY_CLIENT_ID=
SHOPIFY_CLIENT_SECRET=
SHOPIFY_API_VERSION=2025-10
SHOPIFY_FLOW_TAG=dispatch_flow

# PrintNode
PRINTNODE_API_KEY=
PRINTNODE_PRINTER_ID=

# SMTP
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=ops@example.com
TRUCK_EMAIL_TO=dispatch@example.com

# UI tuning
UI_BOOKING_IDLE_MS=6000
UI_COST_ALERT_THRESHOLD=250
UI_TRUCK_ALERT_THRESHOLD=25
UI_FEATURE_MULTI_SHIP=true
```

---

## 5) Configure PrintNode for shipping labels and inspection sheets

FLSS sends print jobs through the PrintNode cloud API from the backend route `/api/v1/printnode/print`.

### 5.1 Register printer in PrintNode

1. Create/sign in to your PrintNode account.
2. Install the PrintNode client on an always-on machine connected to the target printer:
   - this can be the same Raspberry Pi (if your printer + drivers are stable there), or
   - a separate Windows/macOS/Linux print host on the same network.
3. In PrintNode dashboard, note the numeric `printerId` of the target printer.
4. Set these in `/opt/FLSS/.env`:

```bash
PRINTNODE_API_KEY=<your-printnode-api-key>
PRINTNODE_PRINTER_ID=<numeric-printer-id>
```

### 5.2 Validate PrintNode wiring from FLSS

After FLSS starts, check service status:

```bash
curl http://127.0.0.1:3000/api/v1/statusz
```

Expected: `services.printNode.ok` should be `true`.

---

## 6) Test run on the Pi

```bash
cd /opt/FLSS
npm run dev
```

From another device on the same network:

- Open `http://<pi-ip>:3000`
- Validate API health at `http://<pi-ip>:3000/api/v1/healthz`

---

## 7) Run FLSS as a systemd service

Create `/etc/systemd/system/flss.service`:

```ini
[Unit]
Description=FLSS Node Server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=pi
WorkingDirectory=/opt/FLSS
EnvironmentFile=/opt/FLSS/.env
ExecStart=/usr/bin/node /opt/FLSS/server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

Enable + start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now flss.service
sudo systemctl status flss.service
```

Follow logs:

```bash
journalctl -u flss.service -f
```

---

## 8) Make the Pi boot directly into the FLSS dashboard (kiosk mode)

If the Pi has a display attached, you can auto-launch Chromium in fullscreen on startup.

1. Install desktop/browser packages (if not already present):

```bash
sudo apt install -y --no-install-recommends xserver-xorg x11-xserver-utils xinit openbox chromium-browser
```

2. Enable desktop autologin:

```bash
sudo raspi-config
```

Then set:

- `System Options` -> `Boot / Auto Login` -> `Desktop Autologin`.

3. Configure LXDE autostart for kiosk launch:

```bash
mkdir -p /home/pi/.config/lxsession/LXDE-pi
cat >/home/pi/.config/lxsession/LXDE-pi/autostart <<'EOF'
@xset s off
@xset -dpms
@xset s noblank
@chromium-browser --kiosk --incognito --noerrdialogs --disable-infobars http://127.0.0.1:3000/
EOF
```

4. Reboot and verify the dashboard opens automatically:

```bash
sudo reboot
```

> Tip: Keep `flss.service` enabled so the Node server starts before operators interact with the kiosk UI.

---

## 9) Optional reverse proxy (Nginx)

Use Nginx if you want a cleaner hostname and future TLS:

```bash
sudo apt install -y nginx
```

Example `/etc/nginx/sites-available/flss`:

```nginx
server {
  listen 80;
  server_name flss.local;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Enable site:

```bash
sudo ln -s /etc/nginx/sites-available/flss /etc/nginx/sites-enabled/flss
sudo nginx -t
sudo systemctl reload nginx
```

---

## 10) Performance and reliability tips for Raspberry Pi 4

- Prefer Ethernet over Wi-Fi.
- Use SSD boot/storage where possible.
- Keep swap enabled but avoid memory-heavy side processes.
- Add a UPS HAT or clean shutdown policy for load shedding scenarios.
- Monitor temperature (`vcgencmd measure_temp`) and avoid thermal throttling.

---

## 11) Optional: run Pi hardware stations on the same device

If your Pi also controls GPIO devices (buttons, camera, PIR, etc.), use the scripts under `pi_station/` alongside the FLSS service.

Install Python dependencies:

```bash
sudo apt install -y python3-pip
python3 -m pip install gpiozero requests picamera2
```

Then configure services for scripts described in `docs/raspberry-pi-physical-station.md`.

---

## 12) Troubleshooting checklist

- `systemctl status flss.service` shows crash loop:
  - Check `.env` formatting and missing required credentials.
- Port not reachable from LAN:
  - Confirm `HOST=0.0.0.0`, firewall rules, and correct Pi IP.
- Slow responses:
  - Check CPU temp and memory pressure; disable unnecessary background services.
- Shopify/PrintNode issues:
  - Validate API keys and outbound internet connectivity from Pi.
- PrintNode is configured but nothing prints:
  - Confirm the selected `PRINTNODE_PRINTER_ID` matches an online printer in PrintNode dashboard.
  - Confirm the PrintNode client machine is online and has working local printer drivers.
- Pi boots but does not show FLSS dashboard:
  - Re-check `Desktop Autologin` setting and `/home/pi/.config/lxsession/LXDE-pi/autostart` entries.
  - Verify Chromium path (`chromium-browser`) exists on your image.
