# Raspberry Pi All-in-One FLSS Deployment

This guide deploys the server, SPA, GPIO controller client, PrintNode, and kiosk shell on one Raspberry Pi.

## 1. Base OS and packages

Use Raspberry Pi OS Bookworm 64-bit with Desktop.

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y git curl ca-certificates chromium-browser unclutter python3-pip
```

Install Node.js 20 LTS:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

## 2. Get FLSS running locally

```bash
cd /home/pi
git clone <YOUR_FLSS_REPO_URL> FLSS
cd FLSS
npm install
npm run build
cp .env.example .env 2>/dev/null || true
```

Minimum `.env` values:

```dotenv
NODE_ENV=production
HOST=0.0.0.0
PORT=3000
FRONTEND_ORIGIN=http://127.0.0.1:3000
```

Add the real Shopify, ParcelPerfect, PrintNode, SMTP, and controller credentials before enabling services.

## 3. Physical controller service

Install Python dependencies:

```bash
pip3 install gpiozero requests adafruit-circuitpython-dht
sudo apt-get install -y libgpiod2
```

Create `/home/pi/FLSS/.env.pi-buttons`:

```dotenv
FLSS_BASE_URL=http://127.0.0.1:3000/api/v1
ROTARY_SOURCE=rotary_pi
ROTARY_TOKEN=<same-token-as-server-if-enabled>
REMOTE_TOKEN=<same-remote-token-as-server-if-enabled>
ROTARY_CLK_PIN=17
ROTARY_DT_PIN=27
ROTARY_SW_PIN=22
ROTARY_CONFIRM_BTN_PIN=5
ROTARY_BACK_BTN_PIN=6
ROTARY_PRINT_BTN_PIN=19
ROTARY_FULFILL_BTN_PIN=26
ROTARY_RGB_RED_PIN=18
ROTARY_RGB_GREEN_PIN=23
ROTARY_RGB_BLUE_PIN=24
```

Current default button behavior:

- knob click and confirm button -> confirm flow
- back button -> context-aware `back`
- print button -> `print`
- fulfill button -> `fulfill`

## 4. Install FLSS systemd services

Service templates live in `scripts/raspberry-pi/`.

```bash
cd /home/pi/FLSS
sudo scripts/raspberry-pi/install-services.sh /home/pi/FLSS
sudo systemctl start flss flss-rotary
sudo systemctl status flss --no-pager
sudo systemctl status flss-rotary --no-pager
```

`flss` should use `npm start`, which is the repo's cross-platform production launcher.

## 5. Install PrintNode on the Pi

```bash
sudo dpkg -i ~/Downloads/PrintNode-*.deb || sudo apt -f install -y
```

Open PrintNode once in the desktop session, sign in, and select the local printer.

To auto-start PrintNode at login:

```bash
mkdir -p /home/pi/.config/autostart
cat > /home/pi/.config/autostart/printnode.desktop <<'DESKTOP'
[Desktop Entry]
Type=Application
Name=PrintNode
Exec=/usr/bin/printnode
X-GNOME-Autostart-enabled=true
DESKTOP
```

## 6. Boot straight to fullscreen FLSS

Enable desktop auto-login for user `pi`:

```bash
sudo raspi-config
```

Then enable the kiosk service:

```bash
sudo systemctl enable flss-kiosk
sudo systemctl start flss-kiosk
sudo systemctl status flss-kiosk --no-pager
```

The kiosk waits for `/api/v1/healthz`, then launches Chromium fullscreen at `http://127.0.0.1:3000`.

## 7. Validation checklist

```bash
curl -sf http://127.0.0.1:3000/api/v1/healthz
sudo systemctl is-active flss
sudo systemctl is-active flss-rotary
sudo systemctl is-active flss-kiosk
```

After reboot, confirm:

1. FLSS starts in kiosk mode.
2. The Orders, Stock, Buy, Make, and Admin views load.
3. The dispatch overlay appears only in the Orders view when the controller is connected.
4. Rotary, Back, Confirm, Print, and Fulfill actions all register.
5. Notification test sends work if SMTP is configured.

## 8. Compatibility notes

> Compatibility / legacy: old standalone pages still redirect inside the app. Build the kiosk workflow around `/`, `/stock`, `/buy`, `/make`, `/admin`, and `/docs`.
