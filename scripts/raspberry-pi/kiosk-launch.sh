#!/usr/bin/env bash
set -euo pipefail

URL="${FLSS_KIOSK_URL:-http://127.0.0.1:3000}"
PROFILE_DIR="${FLSS_KIOSK_PROFILE_DIR:-/home/pi/.config/flss-kiosk}"

mkdir -p "${PROFILE_DIR}"

/usr/bin/chromium-browser \
  --kiosk \
  --no-first-run \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-features=TranslateUI \
  --check-for-update-interval=31536000 \
  --autoplay-policy=no-user-gesture-required \
  --simulate-outdated-no-au='Tue, 31 Dec 2099 23:59:59 GMT' \
  --user-data-dir="${PROFILE_DIR}" \
  --app="${URL}"
