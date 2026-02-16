#!/usr/bin/env python3
"""Physical dispatch console for FLSS on Raspberry Pi.

Supports either:
- legacy 3-button control panel, and
- rotary-encoder workflow for selecting an order + packing actions.
"""

from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass, field
from pathlib import Path
from signal import pause
from typing import Any

import requests
from gpiozero import Button, Buzzer, LED, RotaryEncoder

FLSS_BASE = os.getenv("FLSS_BASE", "http://127.0.0.1:3000/api/v1")
TRUCK_TO = os.getenv("TRUCK_EMAIL_TO", "dispatch@example.com")
READY_ORDER = os.getenv("READY_ORDER_NAME", "#1001")
ROTARY_ENABLED = os.getenv("ROTARY_ENABLED", "true").strip().lower() in {"1", "true", "yes", "on"}
ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "").strip()

STATE_FILE = Path(os.getenv("PACKING_STATE_FILE", "pi_station/packing_state.json"))

btn_book = Button(17, pull_up=True)
btn_refresh = Button(27, pull_up=True)
btn_ready = Button(22, pull_up=True)

# Rotary encoder wiring defaults:
#   CLK/A -> GPIO23, DT/B -> GPIO24, SW -> GPIO25
encoder = RotaryEncoder(23, 24, wrap=True, max_steps=200) if ROTARY_ENABLED else None
btn_encoder = Button(25, pull_up=True) if ROTARY_ENABLED else None

led_ok = LED(5)
led_warn = LED(6)
led_err = LED(13)
buzzer = Buzzer(19)


@dataclass
class PackedLine:
    title: str
    quantity: int
    packed: int = 0


@dataclass
class PackedOrder:
    name: str
    started_at: float
    finished_at: float | None = None
    items: list[PackedLine] = field(default_factory=list)


order_cache: list[dict[str, Any]] = []
order_selection_index = 0
action_selection_index = 0
mode = "orders"  # orders | actions
last_encoder_steps = 0
packing_state: dict[str, PackedOrder] = {}

def admin_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {ADMIN_TOKEN}"}


def set_state(ok: bool = False, warn: bool = False, err: bool = False):
    led_ok.value = ok
    led_warn.value = warn
    led_err.value = err


def chirp(times: int = 1, on: float = 0.08, off: float = 0.08):
    for _ in range(times):
        buzzer.on()
        time.sleep(on)
        buzzer.off()
        time.sleep(off)


def save_packing_state():
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    payload: dict[str, dict[str, Any]] = {}
    for order_name, state in packing_state.items():
        payload[order_name] = {
            "name": state.name,
            "started_at": state.started_at,
            "finished_at": state.finished_at,
            "items": [
                {"title": item.title, "quantity": item.quantity, "packed": item.packed}
                for item in state.items
            ],
        }
    STATE_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def load_packing_state():
    if not STATE_FILE.exists():
        return
    try:
        data = json.loads(STATE_FILE.read_text(encoding="utf-8"))
        for order_name, raw in data.items():
            items = [
                PackedLine(
                    title=str(item.get("title", "Item")),
                    quantity=max(0, int(item.get("quantity", 0))),
                    packed=max(0, int(item.get("packed", 0))),
                )
                for item in raw.get("items") or []
            ]
            packing_state[order_name] = PackedOrder(
                name=str(raw.get("name") or order_name),
                started_at=float(raw.get("started_at") or time.time()),
                finished_at=float(raw["finished_at"]) if raw.get("finished_at") else None,
                items=items,
            )
    except Exception:
        set_state(err=True)
        chirp(2)


def get_open_orders() -> list[dict[str, Any]]:
    response = requests.get(f"{FLSS_BASE}/shopify/orders/open", headers=admin_headers(), timeout=6)
    response.raise_for_status()
    payload = response.json()
    orders = payload.get("orders") if isinstance(payload, dict) else None
    return orders if isinstance(orders, list) else []


def extract_lines(order: dict[str, Any]) -> list[PackedLine]:
    lines = []
    for line in order.get("line_items") or []:
        title = str(line.get("title") or "Item")
        quantity = max(0, int(line.get("quantity") or 0))
        if quantity > 0:
            lines.append(PackedLine(title=title, quantity=quantity, packed=0))
    return lines


def get_selected_order_name() -> str:
    if not order_cache:
        return READY_ORDER
    return str(order_cache[order_selection_index % len(order_cache)].get("name") or READY_ORDER)


def get_actions_for_selected_order() -> list[str]:
    order_name = get_selected_order_name()
    state = packing_state.get(order_name)
    actions = ["Back"]
    if not state:
        actions.append("Start packing")
    else:
        actions.append("Mark next item packed")
        if not state.finished_at:
            actions.append("Finish packing")
        actions.append("Ready for collection")
    return actions


def render():
    os.system("clear")
    print("=== FLSS Pi Packing Console ===")
    if not order_cache:
        print("No open orders available. Press Refresh.")
        return

    selected_name = get_selected_order_name()
    print("\nOrders (rotate knob):")
    for idx, order in enumerate(order_cache):
        marker = ">" if idx == order_selection_index else " "
        order_name = str(order.get("name") or "Unknown")
        state = packing_state.get(order_name)
        if state and state.finished_at:
            suffix = " [packed ✅]"
        elif state:
            packed = sum(item.packed for item in state.items)
            qty = sum(item.quantity for item in state.items)
            suffix = f" [packing {packed}/{qty}]"
        else:
            suffix = ""
        print(f" {marker} {order_name}{suffix}")

    if mode == "actions":
        actions = get_actions_for_selected_order()
        print(f"\nActions for {selected_name}:")
        for idx, action in enumerate(actions):
            marker = ">" if idx == action_selection_index else " "
            print(f" {marker} {action}")


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


def refresh_orders():
    global order_cache, order_selection_index, action_selection_index
    try:
        order_cache = get_open_orders()
        if not order_cache:
            order_selection_index = 0
        else:
            order_selection_index = order_selection_index % len(order_cache)
        action_selection_index = 0
        set_state(ok=True)
        render()
    except Exception:
        set_state(err=True)
        chirp(2)


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
        chirp(1)
    except Exception:
        set_state(err=True)
        chirp(2)


def ready_for_collection(order_name: str | None = None):
    payload = {"orderName": order_name or READY_ORDER}
    try:
        response = requests.post(
            f"{FLSS_BASE}/shopify/ready-for-pickup",
            json=payload,
            headers=admin_headers(),
            timeout=6
        )
        response.raise_for_status()
        set_state(ok=True)
        chirp(1)
    except Exception:
        set_state(err=True)
        chirp(2)


def start_packing_selected_order():
    order_name = get_selected_order_name()
    order = next((o for o in order_cache if str(o.get("name")) == order_name), None)
    if not order:
        set_state(err=True)
        chirp(2)
        return
    packing_state[order_name] = PackedOrder(
        name=order_name,
        started_at=time.time(),
        items=extract_lines(order),
    )
    save_packing_state()
    set_state(ok=True)
    chirp(1)


def mark_next_item_packed_selected_order():
    order_name = get_selected_order_name()
    state = packing_state.get(order_name)
    if not state:
        set_state(warn=True)
        chirp(1)
        return

    for item in state.items:
        if item.packed < item.quantity:
            item.packed += 1
            save_packing_state()
            set_state(ok=True)
            chirp(1, on=0.05, off=0.04)
            return

    set_state(warn=True)
    chirp(2, on=0.04, off=0.04)


def finish_packing_selected_order():
    order_name = get_selected_order_name()
    state = packing_state.get(order_name)
    if not state:
        return
    state.finished_at = time.time()
    save_packing_state()
    set_state(ok=True)
    chirp(2, on=0.05, off=0.05)


def on_encoder_rotated():
    global last_encoder_steps, order_selection_index, action_selection_index
    if not encoder:
        return
    new_steps = encoder.steps
    delta = new_steps - last_encoder_steps
    if delta == 0:
        return
    last_encoder_steps = new_steps

    if mode == "orders" and order_cache:
        order_selection_index = (order_selection_index + delta) % len(order_cache)
    elif mode == "actions":
        actions = get_actions_for_selected_order()
        if actions:
            action_selection_index = (action_selection_index + delta) % len(actions)
    render()


def on_encoder_click():
    global mode, action_selection_index
    if not order_cache:
        refresh_orders()
        return

    if mode == "orders":
        mode = "actions"
        action_selection_index = 0
        render()
        return

    actions = get_actions_for_selected_order()
    if not actions:
        mode = "orders"
        render()
        return

    action = actions[action_selection_index]
    if action == "Back":
        mode = "orders"
    elif action == "Start packing":
        start_packing_selected_order()
    elif action == "Mark next item packed":
        mark_next_item_packed_selected_order()
    elif action == "Finish packing":
        finish_packing_selected_order()
    elif action == "Ready for collection":
        ready_for_collection(get_selected_order_name())
    render()


btn_book.when_pressed = book_truck
btn_refresh.when_pressed = refresh_orders
btn_ready.when_pressed = lambda: ready_for_collection(get_selected_order_name())

if encoder and btn_encoder:
    encoder.when_rotated = on_encoder_rotated
    btn_encoder.when_pressed = on_encoder_click

load_packing_state()
refresh_health()
refresh_orders()
pause()
