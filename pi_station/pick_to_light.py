#!/usr/bin/env python3
"""Pick-to-light helper station for FLSS on Raspberry Pi."""

import os
import time

import requests
from gpiozero import Button, LED

FLSS_BASE = os.getenv("FLSS_BASE", "http://127.0.0.1:3000/api/v1")
POLL_SEC = int(os.getenv("POLL_SEC", "12"))
ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "").strip()


def auth_headers():
    return {"Authorization": f"Bearer {ADMIN_TOKEN}"}

led_pick = LED(20)
led_done = LED(21)
led_issue = LED(16)
btn_confirm = Button(23, pull_up=True)

current_order = None
stage = "idle"


def set_stage(new_stage):
    global stage
    stage = new_stage
    led_pick.off()
    led_done.off()
    led_issue.off()
    if stage == "picking":
        led_pick.on()
    elif stage == "done":
        led_done.on()
    elif stage == "issue":
        led_issue.on()


def load_next_order():
    global current_order
    try:
        response = requests.get(f"{FLSS_BASE}/shopify/orders/open", headers=auth_headers(), timeout=8)
        response.raise_for_status()
        orders = response.json() or []
        if orders:
            current_order = orders[0]
            set_stage("picking")
        else:
            current_order = None
            set_stage("idle")
    except Exception:
        set_stage("issue")


def fulfill_current_order():
    if not current_order:
        return

    order_id = current_order.get("id")
    payload = {
        "orderId": order_id,
        "notifyCustomer": False,
    }
    try:
        response = requests.post(f"{FLSS_BASE}/shopify/fulfill", json=payload, headers=auth_headers(), timeout=10)
        response.raise_for_status()
        set_stage("done")
    except Exception:
        set_stage("issue")


def on_confirm():
    if stage == "picking":
        fulfill_current_order()
    elif stage in ("done", "issue", "idle"):
        load_next_order()


btn_confirm.when_pressed = on_confirm

if __name__ == "__main__":
    while True:
        if stage in ("idle", "done"):
            load_next_order()
        time.sleep(POLL_SEC)
