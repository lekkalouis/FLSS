#!/usr/bin/env python3
"""FLSS Raspberry Pi station controller daemon."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import signal
from dataclasses import dataclass
from datetime import datetime, timezone

import websockets
from gpiozero import Button

try:
    import adafruit_dht
    import board
except Exception:  # pragma: no cover - optional runtime dependency on non-Pi hosts
    adafruit_dht = None
    board = None


logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
LOGGER = logging.getLogger("flss-pi-controller")


@dataclass(frozen=True)
class PinMap:
    dht: int = 4
    enc_clk: int = 17
    enc_dt: int = 27
    enc_sw: int = 22
    confirm: int = 5
    back: int = 6
    quick: int = 13
    mode: int = 19
    shift: int = 26


class ControllerDaemon:
    def __init__(self) -> None:
        self.ws_url = os.getenv("FLSS_CONTROLLER_WS", "ws://localhost:3000/ws/controller")
        self.source = os.getenv("FLSS_CONTROLLER_SOURCE", "pi-station-01")
        self.sensor_interval_s = float(os.getenv("DHT_INTERVAL_S", "10"))
        self.debounce_s = float(os.getenv("BUTTON_DEBOUNCE_S", "0.05"))
        self.long_press_s = float(os.getenv("LONG_PRESS_S", "0.8"))
        self.encoder_batch_ms = float(os.getenv("ENCODER_BATCH_MS", "30")) / 1000.0

        self.pin_map = PinMap()
        self.event_q: asyncio.Queue[dict] = asyncio.Queue()
        self.stop = asyncio.Event()

        self.shift_held = False
        self._encoder_steps = 0
        self._encoder_dir = None
        self._encoder_flush_task = None
        self._dht = None

    @staticmethod
    def ts() -> str:
        return datetime.now(timezone.utc).astimezone().isoformat(timespec="milliseconds")

    def _base_event(self, event: str, data: dict) -> dict:
        return {
            "type": "controller",
            "source": self.source,
            "ts": self.ts(),
            "event": event,
            "data": data,
        }

    async def emit(self, event: str, data: dict) -> None:
        await self.event_q.put(self._base_event(event, data))

    def setup_gpio(self) -> None:
        self.enc_clk = Button(self.pin_map.enc_clk, pull_up=True, bounce_time=self.debounce_s)
        self.enc_dt = Button(self.pin_map.enc_dt, pull_up=True, bounce_time=self.debounce_s)
        self.enc_sw = Button(self.pin_map.enc_sw, pull_up=True, bounce_time=self.debounce_s, hold_time=self.long_press_s)

        self.buttons = {
            "CONFIRM": Button(self.pin_map.confirm, pull_up=True, bounce_time=self.debounce_s, hold_time=self.long_press_s),
            "BACK": Button(self.pin_map.back, pull_up=True, bounce_time=self.debounce_s, hold_time=self.long_press_s),
            "QUICK": Button(self.pin_map.quick, pull_up=True, bounce_time=self.debounce_s, hold_time=self.long_press_s),
            "MODE": Button(self.pin_map.mode, pull_up=True, bounce_time=self.debounce_s, hold_time=self.long_press_s),
            "SHIFT": Button(self.pin_map.shift, pull_up=True, bounce_time=self.debounce_s, hold_time=self.long_press_s),
        }

        self.enc_clk.when_pressed = lambda: self.on_encoder_edge("CW" if self.enc_dt.is_pressed else "CCW")
        self.enc_sw.when_pressed = lambda: asyncio.create_task(self.emit_press("CONFIRM", "down"))
        self.enc_sw.when_released = lambda: asyncio.create_task(self.emit_press("CONFIRM", "up"))
        self.enc_sw.when_held = lambda: asyncio.create_task(self.emit_press("CONFIRM", "long"))

        for name, button in self.buttons.items():
            button.when_pressed = lambda n=name: asyncio.create_task(self.on_button_down(n))
            button.when_released = lambda n=name: asyncio.create_task(self.on_button_up(n))
            button.when_held = lambda n=name: asyncio.create_task(self.emit_press(n, "long"))

    async def emit_press(self, button: str, action: str) -> None:
        await self.emit("PRESS", {"button": button, "action": action, "shift": self.shift_held})

    async def on_button_down(self, name: str) -> None:
        if name == "SHIFT":
            self.shift_held = True
        await self.emit_press(name, "down")

    async def on_button_up(self, name: str) -> None:
        await self.emit_press(name, "up")
        await self.emit_press(name, "click")
        if name == "SHIFT":
            self.shift_held = False

    def on_encoder_edge(self, direction: str) -> None:
        if direction == self._encoder_dir:
            self._encoder_steps += 1
        else:
            self._encoder_dir = direction
            self._encoder_steps = 1
        if self._encoder_flush_task and not self._encoder_flush_task.done():
            self._encoder_flush_task.cancel()
        self._encoder_flush_task = asyncio.create_task(self.flush_encoder_after_delay())

    async def flush_encoder_after_delay(self) -> None:
        try:
            await asyncio.sleep(self.encoder_batch_ms)
        except asyncio.CancelledError:
            return
        if self._encoder_steps > 0 and self._encoder_dir:
            await self.emit("ROTATE", {"dir": self._encoder_dir, "steps": self._encoder_steps, "shift": self.shift_held})
        self._encoder_steps = 0
        self._encoder_dir = None

    async def sensor_loop(self) -> None:
        if adafruit_dht is None or board is None:
            LOGGER.warning("DHT11 dependencies unavailable; SENSOR events disabled")
            return

        pin = getattr(board, "D4", None)
        if pin is None:
            LOGGER.warning("Board D4 pin not available; SENSOR events disabled")
            return

        self._dht = adafruit_dht.DHT11(pin, use_pulseio=False)
        while not self.stop.is_set():
            try:
                temp = self._dht.temperature
                humidity = self._dht.humidity
                if temp is not None and humidity is not None:
                    payload = {"temp_c": float(temp), "humidity": float(humidity)}
                    LOGGER.info("SENSOR %s", payload)
                    await self.emit("SENSOR", payload)
            except RuntimeError:
                pass
            except Exception as exc:
                LOGGER.warning("DHT11 read failed: %s", exc)
            await asyncio.sleep(self.sensor_interval_s)

    async def ws_loop(self) -> None:
        backoff_s = 1
        while not self.stop.is_set():
            try:
                ws_target = f"{self.ws_url}?source={self.source}"
                async with websockets.connect(ws_target, ping_interval=20, ping_timeout=20) as ws:
                    LOGGER.info("Connected to %s", ws_target)
                    backoff_s = 1
                    while not self.stop.is_set():
                        event = await asyncio.wait_for(self.event_q.get(), timeout=1)
                        await ws.send(json.dumps(event))
            except asyncio.TimeoutError:
                continue
            except Exception as exc:
                LOGGER.warning("WS disconnected: %s", exc)
                await asyncio.sleep(backoff_s)
                backoff_s = min(30, backoff_s * 2)

    async def run(self) -> None:
        self.setup_gpio()
        sensor_task = asyncio.create_task(self.sensor_loop())
        ws_task = asyncio.create_task(self.ws_loop())
        await self.stop.wait()
        sensor_task.cancel()
        ws_task.cancel()


def main() -> None:
    daemon = ControllerDaemon()
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    def shutdown(*_args):
        daemon.stop.set()

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    loop.run_until_complete(daemon.run())


if __name__ == "__main__":
    main()
