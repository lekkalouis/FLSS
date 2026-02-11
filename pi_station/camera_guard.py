#!/usr/bin/env python3
"""Camera + PIR guard script for FLSS Raspberry Pi station."""

import os
import time
from datetime import datetime

import requests
from gpiozero import Buzzer, LED, MotionSensor
from picamera2 import Picamera2

FLSS_BASE = os.getenv("FLSS_BASE", "http://127.0.0.1:3000/api/v1")
OUT_DIR = os.getenv("OUT_DIR", "/home/pi/captures")

pir = MotionSensor(24)
alert_led = LED(25)
buzzer = Buzzer(26)

cam = Picamera2()
cam.configure(cam.create_still_configuration())
cam.start()


def notify_event(image_path):
    payload = {
        "type": "motion_capture",
        "capturedAt": datetime.utcnow().isoformat() + "Z",
        "imagePath": image_path,
        "source": "pi-guard-station",
    }

    # If you add /iot/events in FLSS later, post payload there.
    # For now we at least verify server reachability.
    try:
        requests.get(f"{FLSS_BASE}/statusz", timeout=4)
    except Exception:
        pass


def capture_motion():
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    path = f"{OUT_DIR}/motion_{ts}.jpg"
    cam.capture_file(path)
    alert_led.on()
    buzzer.on()
    time.sleep(0.15)
    buzzer.off()
    alert_led.off()
    notify_event(path)


if __name__ == "__main__":
    while True:
        pir.wait_for_motion()
        capture_motion()
        time.sleep(1.5)
