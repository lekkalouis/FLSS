#!/usr/bin/env python3
"""Raspberry Pi hardware bridge for FLSS dispatch kiosk.

Maps GPIO events to keyboard input so the web app can be controlled from
physical controls in Chromium kiosk mode.

Default mapping:
- Rotary clockwise: Tab (next target)
- Rotary anticlockwise: Shift+Tab (previous target)
- Rotary press: Enter (activate focused target)
- BTN1 press: Enter (quick confirm)
- BTN2 press: Escape (close modal/back)

Requires:
- gpiozero
- xdotool (for key injection into active X11 window)
"""

from __future__ import annotations

import signal
import subprocess
import sys
import threading
import time
from dataclasses import dataclass

from gpiozero import Button, PWMLED, RotaryEncoder

# ---- GPIO pin config (BCM numbering) ----
ENCODER_A = 17
ENCODER_B = 27
ENCODER_SW = 22
BTN1 = 23
BTN2 = 24

LED_R = 18
LED_G = 12
LED_B = 13

# ---- Timing ----
BUTTON_BOUNCE_SEC = 0.03
ENCODER_BOUNCE_SEC = 0.003
LONG_PRESS_SEC = 0.7
HEARTBEAT_SEC = 1.4


@dataclass
class RgbLed:
    r: PWMLED
    g: PWMLED
    b: PWMLED

    def set(self, red: float, green: float, blue: float) -> None:
        self.r.value = max(0.0, min(1.0, red))
        self.g.value = max(0.0, min(1.0, green))
        self.b.value = max(0.0, min(1.0, blue))

    def off(self) -> None:
        self.set(0.0, 0.0, 0.0)


class Bridge:
    def __init__(self) -> None:
        self.encoder = RotaryEncoder(
            ENCODER_A,
            ENCODER_B,
            wrap=False,
            max_steps=0,
            bounce_time=ENCODER_BOUNCE_SEC,
        )
        self.encoder_btn = Button(ENCODER_SW, pull_up=True, bounce_time=BUTTON_BOUNCE_SEC, hold_time=LONG_PRESS_SEC)
        self.btn1 = Button(BTN1, pull_up=True, bounce_time=BUTTON_BOUNCE_SEC)
        self.btn2 = Button(BTN2, pull_up=True, bounce_time=BUTTON_BOUNCE_SEC)

        self.led = RgbLed(PWMLED(LED_R), PWMLED(LED_G), PWMLED(LED_B))
        self.running = True
        self._lock = threading.Lock()

        self.encoder.when_rotated_clockwise = self.on_rotary_next
        self.encoder.when_rotated_counter_clockwise = self.on_rotary_prev
        self.encoder_btn.when_pressed = self.on_rotary_press
        self.encoder_btn.when_held = self.on_rotary_long_press
        self.btn1.when_pressed = self.on_btn1
        self.btn2.when_pressed = self.on_btn2

    def key(self, key_spec: str) -> None:
        subprocess.run(["xdotool", "key", "--delay", "0", key_spec], check=False)

    def pulse(self, color: tuple[float, float, float], duration: float = 0.08) -> None:
        with self._lock:
            self.led.set(*color)
            time.sleep(duration)
            self.led.off()

    def on_rotary_next(self) -> None:
        self.key("Tab")
        self.pulse((0.0, 0.35, 1.0))

    def on_rotary_prev(self) -> None:
        self.key("Shift+Tab")
        self.pulse((0.0, 0.35, 1.0))

    def on_rotary_press(self) -> None:
        self.key("Return")
        self.pulse((0.0, 1.0, 0.25))

    def on_rotary_long_press(self) -> None:
        # Matches app behavior where long press on line item opens qty prompt.
        self.key("Return")
        self.pulse((1.0, 0.45, 0.0), duration=0.12)

    def on_btn1(self) -> None:
        self.key("Return")
        self.pulse((0.0, 1.0, 0.15))

    def on_btn2(self) -> None:
        self.key("Escape")
        self.pulse((1.0, 0.1, 0.1))

    def heartbeat(self) -> None:
        while self.running:
            with self._lock:
                self.led.set(0.0, 0.04, 0.12)
                time.sleep(0.06)
                self.led.off()
            time.sleep(HEARTBEAT_SEC)

    def close(self) -> None:
        self.running = False
        self.encoder.close()
        self.encoder_btn.close()
        self.btn1.close()
        self.btn2.close()
        self.led.off()
        self.led.r.close()
        self.led.g.close()
        self.led.b.close()


def main() -> int:
    bridge = Bridge()

    def stop_handler(signum, frame):  # type: ignore[no-untyped-def]
        del signum, frame
        bridge.running = False

    signal.signal(signal.SIGINT, stop_handler)
    signal.signal(signal.SIGTERM, stop_handler)

    thread = threading.Thread(target=bridge.heartbeat, daemon=True)
    thread.start()

    print("FLSS Pi bridge running. Press Ctrl+C to stop.")
    try:
        while bridge.running:
            time.sleep(0.25)
    finally:
        bridge.close()

    return 0


if __name__ == "__main__":
    sys.exit(main())
