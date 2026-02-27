#!/usr/bin/env python3
"""
Wired Raspberry Pi rotary encoder client for FLSS Dispatch Controller API.

Endpoints used:
  POST /api/v1/dispatch/next
  POST /api/v1/dispatch/prev
  POST /api/v1/dispatch/confirm

Auth:
  Authorization: Bearer <ROTARY_TOKEN>

Wiring (default BCM pins):
  CLK -> GPIO17
  DT  -> GPIO27
  SW  -> GPIO22
  +   -> 3V3
  GND -> GND
"""

from __future__ import annotations

import os
import signal
import threading
import time
from dataclasses import dataclass

import requests
from gpiozero import Button


@dataclass(frozen=True)
class Settings:
    base_url: str
    rotary_token: str
    source: str
    request_timeout_s: float
    cw_pin: int
    ccw_pin: int
    sw_pin: int
    min_action_gap_s: float


def load_settings() -> Settings:
    base_url = os.getenv("FLSS_BASE_URL", "http://127.0.0.1:3000/api/v1").rstrip("/")
    rotary_token = os.getenv("ROTARY_TOKEN", "")
    source = os.getenv("ROTARY_SOURCE", "rotary_pi")
    request_timeout_s = float(os.getenv("ROTARY_HTTP_TIMEOUT_S", "2.5"))

    # Typical KY-040-style rotary wiring.
    cw_pin = int(os.getenv("ROTARY_CLK_PIN", "17"))
    ccw_pin = int(os.getenv("ROTARY_DT_PIN", "27"))
    sw_pin = int(os.getenv("ROTARY_SW_PIN", "22"))

    # Client-side throttle to complement server debounce.
    min_action_gap_s = float(os.getenv("ROTARY_MIN_ACTION_GAP_S", "0.05"))

    return Settings(
        base_url=base_url,
        rotary_token=rotary_token,
        source=source,
        request_timeout_s=request_timeout_s,
        cw_pin=cw_pin,
        ccw_pin=ccw_pin,
        sw_pin=sw_pin,
        min_action_gap_s=min_action_gap_s,
    )


class RotaryFlssClient:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.session = requests.Session()
        self.last_sent_at = 0.0
        self.lock = threading.Lock()

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.settings.rotary_token:
            headers["Authorization"] = f"Bearer {self.settings.rotary_token}"
        return headers

    def send_action(self, action: str) -> None:
        now = time.monotonic()
        with self.lock:
            if now - self.last_sent_at < self.settings.min_action_gap_s:
                return
            self.last_sent_at = now

        url = f"{self.settings.base_url}/dispatch/{action}"
        payload = {"source": self.settings.source}

        try:
            response = self.session.post(
                url,
                json=payload,
                headers=self._headers(),
                timeout=self.settings.request_timeout_s,
            )
            try:
                data = response.json()
            except Exception:
                data = {"raw": response.text}

            if response.status_code == 200:
                print(f"[OK] {action}: {data}")
            elif response.status_code in (401, 403):
                print(f"[AUTH] {action}: HTTP {response.status_code} {data}")
            elif response.status_code == 409:
                print(f"[STATE] {action}: HTTP 409 {data}")
            else:
                print(f"[ERR] {action}: HTTP {response.status_code} {data}")
        except requests.RequestException as exc:
            print(f"[NET] {action}: {exc}")


def main() -> int:
    settings = load_settings()

    print("Starting FLSS rotary client with settings:")
    print(f"  FLSS_BASE_URL={settings.base_url}")
    print(f"  ROTARY_SOURCE={settings.source}")
    print(f"  Pins CLK/DT/SW={settings.cw_pin}/{settings.ccw_pin}/{settings.sw_pin}")
    print(f"  Token configured={'yes' if bool(settings.rotary_token) else 'no'}")

    client = RotaryFlssClient(settings)

    # pull_up=True assumes switch/encoder outputs pull to GND when active.
    clk = Button(settings.cw_pin, pull_up=True, bounce_time=0.002)
    dt = Button(settings.ccw_pin, pull_up=True, bounce_time=0.002)
    sw = Button(settings.sw_pin, pull_up=True, bounce_time=0.05)

    # Simple edge mapping suitable for many detented encoders.
    # If direction is reversed, swap next/prev here or swap CLK/DT wiring.
    clk.when_pressed = lambda: client.send_action("next")
    dt.when_pressed = lambda: client.send_action("prev")
    sw.when_pressed = lambda: client.send_action("confirm")

    stop_event = threading.Event()

    def _handle_stop(signum, _frame):
        print(f"\nReceived signal {signum}; shutting down...")
        stop_event.set()

    signal.signal(signal.SIGINT, _handle_stop)
    signal.signal(signal.SIGTERM, _handle_stop)

    print("Rotary client running. Rotate knob or press button to send actions.")
    while not stop_event.is_set():
        time.sleep(0.2)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
