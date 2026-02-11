#!/usr/bin/env python3
"""Physical dispatch console for FLSS on Raspberry Pi."""

import os
import time
from signal import pause

import requests
from gpiozero import Button, Buzzer, LED

FLSS_BASE = os.getenv("FLSS_BASE", "http://127.0.0.1:3000/api/v1")
TRUCK_TO = os.getenv("TRUCK_EMAIL_TO", "dispatch@example.com")
READY_ORDER = os.getenv("READY_ORDER_NAME", "#1001")

btn_book = Button(17, pull_up=True)
btn_refresh = Button(27, pull_up=True)
btn_ready = Button(22, pull_up=True)

led_ok = LED(5)
led_warn = LED(6)
led_err = LED(13)
buzzer = Buzzer(19)


def set_state(ok=False, warn=False, err=False):
    led_ok.value = ok
    led_warn.value = warn
    led_err.value = err


def chirp(times=1, on=0.08, off=0.08):
    for _ in range(times):
        buzzer.on()
        time.sleep(on)
        buzzer.off()
        time.sleep(off)


def refresh_health():
    try:
        response = requests.get(f"{FLSS_BASE}/statusz", timeout=4)
        response.raise_for_status()
        data = response.json()
        vals = [str(v).lower() for v in data.values() if isinstance(v, (str, bool, int))]
        joined = " ".join(vals)
        if "down" in joined or "error" in joined or "false" in joined:
            set_state(err=True)
            chirp(2)
        elif "degraded" in joined or "warn" in joined:
            set_state(warn=True)
        else:
            set_state(ok=True)
    except Exception:
        set_state(err=True)
        chirp(3, on=0.05, off=0.05)


def book_truck():
    payload = {
        "to": TRUCK_TO,
        "subject": "Truck booking request",
        "message": "Triggered from Raspberry Pi dispatch console.",
    }
    try:
        response = requests.post(f"{FLSS_BASE}/alerts/book-truck", json=payload, timeout=6)
        response.raise_for_status()
        set_state(ok=True)
    except Exception:
        set_state(err=True)
        chirp(2)


def ready_for_collection():
    payload = {"orderName": READY_ORDER}
    try:
        response = requests.post(
            f"{FLSS_BASE}/shopify/ready-for-pickup", json=payload, timeout=6
        )
        response.raise_for_status()
        set_state(ok=True)
    except Exception:
        set_state(err=True)
        chirp(2)


btn_book.when_pressed = book_truck
btn_refresh.when_pressed = refresh_health
btn_ready.when_pressed = ready_for_collection

refresh_health()
pause()
