#!/usr/bin/env python3
"""
Wired Raspberry Pi rotary encoder client for FLSS Dispatch Controller API.

Endpoints used:
  POST /api/v1/dispatch/next
  POST /api/v1/dispatch/prev
  POST /api/v1/dispatch/confirm
  POST /api/v1/dispatch/print
  POST /api/v1/dispatch/fulfill

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
from gpiozero import Button, RGBLED


@dataclass(frozen=True)
class Settings:
    base_url: str
    rotary_token: str
    source: str
    request_timeout_s: float
    cw_pin: int
    ccw_pin: int
    sw_pin: int
    print_btn_pin: int
    fulfill_btn_pin: int
    back_btn_pin: int
    rgb_red_pin: int
    rgb_green_pin: int
    rgb_blue_pin: int
    led_feedback_s: float
    min_action_gap_s: float


def load_settings() -> Settings:
    base_url = os.getenv("FLSS_BASE_URL", "http://flss.flippenlekka.work:3000/api/v1").rstrip("/")
    rotary_token = os.getenv("ROTARY_TOKEN", "").strip()
    source = os.getenv("ROTARY_SOURCE", "rotary_pi")
    request_timeout_s = float(os.getenv("ROTARY_HTTP_TIMEOUT_S", "2.5"))

    # Typical KY-040-style rotary wiring.
    cw_pin = int(os.getenv("ROTARY_CLK_PIN", "17"))
    ccw_pin = int(os.getenv("ROTARY_DT_PIN", "27"))
    sw_pin = int(os.getenv("ROTARY_SW_PIN", "22"))
    print_btn_pin = int(os.getenv("ROTARY_PRINT_BTN_PIN", "5"))
    fulfill_btn_pin = int(os.getenv("ROTARY_FULFILL_BTN_PIN", "6"))
    back_btn_pin = int(os.getenv("ROTARY_BACK_BTN_PIN", "13"))

    # Common BCM defaults for a discrete RGB LED module.
    rgb_red_pin = int(os.getenv("ROTARY_RGB_RED_PIN", "18"))
    rgb_green_pin = int(os.getenv("ROTARY_RGB_GREEN_PIN", "23"))
    rgb_blue_pin = int(os.getenv("ROTARY_RGB_BLUE_PIN", "24"))
    led_feedback_s = float(os.getenv("ROTARY_LED_FEEDBACK_S", "0.25"))

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
        print_btn_pin=print_btn_pin,
        fulfill_btn_pin=fulfill_btn_pin,
        back_btn_pin=back_btn_pin,
        rgb_red_pin=rgb_red_pin,
        rgb_green_pin=rgb_green_pin,
        rgb_blue_pin=rgb_blue_pin,
        led_feedback_s=led_feedback_s,
        min_action_gap_s=min_action_gap_s,
    )


class RotaryFlssClient:
    def __init__(self, settings: Settings, led: RGBLED) -> None:
        self.settings = settings
        self.led = led
        self.session = requests.Session()
        self.last_sent_at = 0.0
        self.lock = threading.Lock()

    def _flash_led(self, color: tuple[float, float, float], duration_s: float | None = None) -> None:
        def _worker() -> None:
            self.led.color = color
            time.sleep(duration_s if duration_s is not None else self.settings.led_feedback_s)
            self.led.off()

        threading.Thread(target=_worker, daemon=True).start()

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.settings.rotary_token:
            headers["Authorization"] = f"Bearer {self.settings.rotary_token}"
        return headers


    def probe_auth(self) -> bool:
        """Check auth config early so Unauthorized errors are obvious before button presses."""
        url = f"{self.settings.base_url}/dispatch/state"
        try:
            response = self.session.get(url, headers=self._headers(), timeout=self.settings.request_timeout_s)
        except requests.RequestException as exc:
            print(f"[NET] auth probe failed: {exc}")
            self._flash_led((1.0, 0.0, 0.0), duration_s=0.5)
            return False

        if response.status_code == 200:
            print("[OK] Auth probe passed.")
            self._flash_led((0.0, 1.0, 0.0), duration_s=0.15)
            return True

        if response.status_code in (401, 403):
            print(
                "[AUTH] Auth probe failed with "
                f"HTTP {response.status_code}. Set ROTARY_TOKEN to the same value as FLSS ROTARY_TOKEN."
            )
            self._flash_led((1.0, 0.0, 0.0), duration_s=0.6)
            return False

        print(f"[WARN] Auth probe got HTTP {response.status_code}; continuing anyway.")
        self._flash_led((0.0, 0.0, 1.0), duration_s=0.4)
        return True

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
                self._flash_led((0.0, 1.0, 0.0))  # green
            elif response.status_code in (401, 403):
                print(f"[AUTH] {action}: HTTP {response.status_code} {data}")
                self._flash_led((1.0, 0.0, 0.0), duration_s=0.5)  # red
            elif response.status_code == 409:
                print(f"[STATE] {action}: HTTP 409 {data}")
                self._flash_led((0.0, 0.0, 1.0))  # blue
            else:
                print(f"[ERR] {action}: HTTP {response.status_code} {data}")
                self._flash_led((1.0, 0.0, 0.0), duration_s=0.5)  # red
        except requests.RequestException as exc:
            print(f"[NET] {action}: {exc}")
            self._flash_led((1.0, 0.0, 0.0), duration_s=0.5)  # red


def main() -> int:
    settings = load_settings()

    print("Starting FLSS rotary client with settings:")
    print(f"  FLSS_BASE_URL={settings.base_url}")
    print(f"  ROTARY_SOURCE={settings.source}")
    print(f"  Pins CLK/DT/SW={settings.cw_pin}/{settings.ccw_pin}/{settings.sw_pin}")
    print(
        "  Push buttons Print/Fulfill/Back="
        f"{settings.print_btn_pin}/{settings.fulfill_btn_pin}/{settings.back_btn_pin}"
    )
    print(
        "  RGB LED pins R/G/B="
        f"{settings.rgb_red_pin}/{settings.rgb_green_pin}/{settings.rgb_blue_pin}"
    )
    print(f"  Token configured={'yes' if bool(settings.rotary_token) else 'no'}")

    led = RGBLED(settings.rgb_red_pin, settings.rgb_green_pin, settings.rgb_blue_pin)
    led.off()

    client = RotaryFlssClient(settings, led)


    if not client.probe_auth():
        print("Hint: export ROTARY_TOKEN=\"<same-token-as-server>\" before running this script.")

    # pull_up=True assumes switch/encoder outputs pull to GND when active.
    clk = Button(settings.cw_pin, pull_up=True, bounce_time=0.002)
    dt = Button(settings.ccw_pin, pull_up=True, bounce_time=0.002)
    sw = Button(settings.sw_pin, pull_up=True, bounce_time=0.05)
    print_btn = Button(settings.print_btn_pin, pull_up=True, bounce_time=0.05)
    fulfill_btn = Button(settings.fulfill_btn_pin, pull_up=True, bounce_time=0.05)
    back_btn = Button(settings.back_btn_pin, pull_up=True, bounce_time=0.05)

    # Simple edge mapping suitable for many detented encoders.
    # If direction is reversed, swap next/prev here or swap CLK/DT wiring.
    clk.when_pressed = lambda: client.send_action("next")
    dt.when_pressed = lambda: client.send_action("prev")
    sw.when_pressed = lambda: client.send_action("confirm")
    print_btn.when_pressed = lambda: client.send_action("print")
    fulfill_btn.when_pressed = lambda: client.send_action("fulfill")
    back_btn.when_pressed = lambda: client.send_action("prev")

    stop_event = threading.Event()

    def _handle_stop(signum, _frame):
        print(f"\nReceived signal {signum}; shutting down...")
        stop_event.set()

    signal.signal(signal.SIGINT, _handle_stop)
    signal.signal(signal.SIGTERM, _handle_stop)

    print("Rotary client running. Rotate knob or press button to send actions.")
    while not stop_event.is_set():
        time.sleep(0.2)

    led.off()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
