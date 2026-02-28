#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo $0"
  exit 1
fi

REPO_DIR="${1:-/home/pi/FLSS}"
SYSTEMD_DIR="/etc/systemd/system"

install -m 0644 "${REPO_DIR}/scripts/raspberry-pi/flss.service" "${SYSTEMD_DIR}/flss.service"
install -m 0644 "${REPO_DIR}/scripts/raspberry-pi/flss-rotary.service" "${SYSTEMD_DIR}/flss-rotary.service"
install -m 0644 "${REPO_DIR}/scripts/raspberry-pi/flss-kiosk.service" "${SYSTEMD_DIR}/flss-kiosk.service"

systemctl daemon-reload
systemctl enable flss.service flss-rotary.service flss-kiosk.service

echo "Installed and enabled: flss.service, flss-rotary.service, flss-kiosk.service"
echo "Use: sudo systemctl start flss flss-rotary flss-kiosk"
