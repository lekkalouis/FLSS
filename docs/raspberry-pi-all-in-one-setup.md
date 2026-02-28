# Raspberry Pi all-in-one FLSS deployment (frontend + backend + GPIO + PrintNode + kiosk boot)

This guide puts the **entire FLSS station on one Raspberry Pi**:

- FLSS backend API + frontend SPA served by Node
- GPIO physical controls (rotary + buttons)
- PrintNode desktop client
- Custom boot splash/logo
- Auto-login and auto-launch into fullscreen FLSS kiosk

## 1) Base OS and packages

Use Raspberry Pi OS Bookworm (64-bit, Desktop).

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

## 2) Get FLSS running locally on the Pi

```bash
cd /home/pi
git clone <YOUR_FLSS_REPO_URL> FLSS
cd FLSS
npm install
cp .env.example .env 2>/dev/null || true
```

Set these minimum values in `/home/pi/FLSS/.env`:

```dotenv
NODE_ENV=production
HOST=0.0.0.0
PORT=3000
FRONTEND_ORIGIN=http://127.0.0.1:3000
```

Then add your real Shopify / ParcelPerfect / SMTP / PrintNode credentials.

## 3) Physical button + rotary controller service

Install Python deps:

```bash
pip3 install gpiozero requests
```

Create `/home/pi/FLSS/.env.pi-buttons`:

```dotenv
FLSS_BASE_URL=http://127.0.0.1:3000/api/v1
ROTARY_SOURCE=rotary_pi
ROTARY_TOKEN=<same-token-as-server-if-enabled>
ROTARY_CLK_PIN=17
ROTARY_DT_PIN=27
ROTARY_SW_PIN=22
ROTARY_ACTION_BTN_PIN=5
ROTARY_BACK_BTN_PIN=6
ROTARY_RGB_RED_PIN=18
ROTARY_RGB_GREEN_PIN=23
ROTARY_RGB_BLUE_PIN=24
```

## 4) Install FLSS systemd services

Service templates are included in `scripts/raspberry-pi/`.

```bash
cd /home/pi/FLSS
sudo scripts/raspberry-pi/install-services.sh /home/pi/FLSS
sudo systemctl start flss flss-rotary
sudo systemctl status flss --no-pager
sudo systemctl status flss-rotary --no-pager
```

## 5) Install PrintNode on the Pi

PrintNode provides ARM builds; install from your PrintNode account downloads page.

Typical install flow:

```bash
# Example filename only; replace with your downloaded package.
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

## 6) Boot straight to fullscreen FLSS

Enable desktop auto-login for user `pi`:

```bash
sudo raspi-config
# System Options -> Boot / Auto Login -> Desktop Autologin
```

Enable kiosk service:

```bash
sudo systemctl enable flss-kiosk
sudo systemctl start flss-kiosk
sudo systemctl status flss-kiosk --no-pager
```

The kiosk service waits for `/api/v1/healthz`, then launches Chromium fullscreen at `http://127.0.0.1:3000`.

If needed, override URL in the service:

```bash
sudo systemctl edit flss-kiosk
# Add:
# [Service]
# Environment=FLSS_KIOSK_URL=http://127.0.0.1:3000/ops
```

## 7) Custom boot logo (Plymouth splash)

Create splash image (`png`, ideally 1920x1080) at:

`/usr/share/plymouth/themes/flss/flss.png`

Install a simple Plymouth script theme:

```bash
sudo mkdir -p /usr/share/plymouth/themes/flss
cat > /tmp/flss.plymouth <<'PLYMOUTH'
[Plymouth Theme]
Name=FLSS
Description=FLSS boot splash
ModuleName=script

[script]
ImageDir=/usr/share/plymouth/themes/flss
ScriptFile=/usr/share/plymouth/themes/flss/flss.script
PLYMOUTH

cat > /tmp/flss.script <<'SCRIPT'
wallpaper_image = Image("flss.png");
wallpaper_sprite = Sprite(wallpaper_image);
wallpaper_sprite.SetZ(-100);

screen_w = Window.GetWidth();
screen_h = Window.GetHeight();
img_w = wallpaper_image.GetWidth();
img_h = wallpaper_image.GetHeight();

wallpaper_sprite.SetX((screen_w - img_w) / 2);
wallpaper_sprite.SetY((screen_h - img_h) / 2);
SCRIPT

sudo install -m 0644 /tmp/flss.plymouth /usr/share/plymouth/themes/flss/flss.plymouth
sudo install -m 0644 /tmp/flss.script /usr/share/plymouth/themes/flss/flss.script
sudo plymouth-set-default-theme -R flss
```

Ensure `/boot/firmware/cmdline.txt` contains `quiet splash` (single line file), then reboot.

## 8) Validation checklist

```bash
curl -sf http://127.0.0.1:3000/api/v1/healthz
sudo systemctl is-active flss
sudo systemctl is-active flss-rotary
sudo systemctl is-active flss-kiosk
```

After reboot, you should see:

1. FLSS boot logo splash
2. Auto-login to desktop
3. Chromium fullscreen FLSS app
4. PrintNode connected
5. Physical rotary/button actions updating dispatch selection live
