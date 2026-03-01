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

import json
import os
import random
import re
import shlex
import signal
import subprocess
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone

import requests
from gpiozero import Button, RGBLED

try:
    import adafruit_dht
    import board
except Exception:
    adafruit_dht = None
    board = None


@dataclass(frozen=True)
class Settings:
    base_url: str
    rotary_token: str
    remote_token: str
    source: str
    remote_id: str
    firmware_version: str
    heartbeat_interval_s: float
    telemetry_interval_s: float
    remote_legacy_fallback: bool
    env_sensor_cmd: str
    env_temperature_c: float | None
    env_humidity_pct: float | None
    dht_enabled: bool
    dht_pin: int
    dht_interval_s: float
    station_id: str
    request_timeout_s: float
    cw_pin: int
    ccw_pin: int
    sw_pin: int
    print_btn_pin: int
    fulfill_btn_pin: int
    sw_hold_time_s: float
    rgb_red_pin: int
    rgb_green_pin: int
    rgb_blue_pin: int
    led_feedback_s: float
    min_action_gap_s: float


def load_settings() -> Settings:
    base_url = os.getenv("FLSS_BASE_URL", "http://flss.flippenlekka.work:3000/api/v1").rstrip("/")
    rotary_token = os.getenv("ROTARY_TOKEN", "").strip()
    remote_token = os.getenv("REMOTE_TOKEN", "").strip() or rotary_token
    source = os.getenv("ROTARY_SOURCE", "rotary_pi")
    remote_id = os.getenv("REMOTE_ID", source).strip() or "rotary_pi"
    firmware_version = os.getenv("REMOTE_FIRMWARE", "rotary-pi-wired-1.0.0").strip() or "unknown"
    heartbeat_interval_s = float(os.getenv("REMOTE_HEARTBEAT_INTERVAL_S", "10"))
    telemetry_interval_s = float(os.getenv("ENV_TELEMETRY_INTERVAL_S", "10"))
    remote_legacy_fallback = os.getenv("REMOTE_LEGACY_FALLBACK", "1").strip().lower() not in {
        "0",
        "false",
        "no",
    }

    env_sensor_cmd = os.getenv("ENV_SENSOR_CMD", "").strip()

    def _float_env(name: str) -> float | None:
        raw = os.getenv(name, "").strip()
        if not raw:
            return None
        return float(raw)

    env_temperature_c = _float_env("ENV_TEMPERATURE_C")
    env_humidity_pct = _float_env("ENV_HUMIDITY_PCT")
    dht_enabled = os.getenv("DHT11_ENABLED", "1").strip().lower() not in {"0", "false", "no"}
    dht_pin = int(os.getenv("DHT_PIN", "4"))
    dht_interval_s = float(os.getenv("DHT_POLL_INTERVAL_S", "5"))
    station_id = os.getenv("STATION_ID", "scan-station-01").strip() or "scan-station-01"

    request_timeout_s = float(os.getenv("ROTARY_HTTP_TIMEOUT_S", "2.5"))

    # Typical KY-040-style rotary wiring.
    cw_pin = int(os.getenv("ROTARY_CLK_PIN", "17"))
    ccw_pin = int(os.getenv("ROTARY_DT_PIN", "27"))
    sw_pin = int(os.getenv("ROTARY_SW_PIN", "22"))
    print_btn_pin = int(os.getenv("ROTARY_PRINT_BTN_PIN", "5"))
    fulfill_btn_pin = int(os.getenv("ROTARY_FULFILL_BTN_PIN", "6"))
    sw_hold_time_s = float(os.getenv("ROTARY_SW_HOLD_TIME_S", "0.6"))

    # Common BCM defaults for a discrete RGB LED module.
    rgb_red_pin = int(os.getenv("ROTARY_RGB_RED_PIN", "18"))
    rgb_green_pin = int(os.getenv("ROTARY_RGB_GREEN_PIN", "23"))
    rgb_blue_pin = int(os.getenv("ROTARY_RGB_BLUE_PIN", "24"))
    led_feedback_s = float(os.getenv("ROTARY_LED_FEEDBACK_S", "0.25"))

    # Client-side throttle to complement server debounce.
    min_action_gap_s = float(os.getenv("ROTARY_MIN_ACTION_GAP_S", "0.18"))

    return Settings(
        base_url=base_url,
        rotary_token=rotary_token,
        remote_token=remote_token,
        source=source,
        remote_id=remote_id,
        firmware_version=firmware_version,
        heartbeat_interval_s=heartbeat_interval_s,
        telemetry_interval_s=telemetry_interval_s,
        remote_legacy_fallback=remote_legacy_fallback,
        env_sensor_cmd=env_sensor_cmd,
        env_temperature_c=env_temperature_c,
        env_humidity_pct=env_humidity_pct,
        dht_enabled=dht_enabled,
        dht_pin=dht_pin,
        dht_interval_s=dht_interval_s,
        station_id=station_id,
        request_timeout_s=request_timeout_s,
        cw_pin=cw_pin,
        ccw_pin=ccw_pin,
        sw_pin=sw_pin,
        print_btn_pin=print_btn_pin,
        fulfill_btn_pin=fulfill_btn_pin,
        sw_hold_time_s=sw_hold_time_s,
        rgb_red_pin=rgb_red_pin,
        rgb_green_pin=rgb_green_pin,
        rgb_blue_pin=rgb_blue_pin,
        led_feedback_s=led_feedback_s,
        min_action_gap_s=min_action_gap_s,
    )


class DHT11Monitor:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.flss_base_url = settings.base_url.rstrip("/")
        self.station_id = settings.station_id
        self.interval_s = max(1.0, settings.dht_interval_s)
        self.pin = settings.dht_pin
        self.request_timeout_s = settings.request_timeout_s

        self.dht = None
        self.last: dict[str, float] | None = None
        self.last_ok_ts: datetime | None = None
        self.read_errors = 0
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._last_sent_status: str | None = None

    def start(self) -> None:
        if not self.settings.dht_enabled:
            print("[INFO] DHT11 monitor disabled by DHT11_ENABLED=0")
            return

        if adafruit_dht is None or board is None:
            print("[WARN] DHT11 monitor unavailable: install adafruit-circuitpython-dht and libgpiod2")
            return

        board_pin = getattr(board, f"D{self.pin}", None)
        if board_pin is None:
            print(f"[WARN] DHT11 monitor disabled: unsupported board pin D{self.pin}")
            return

        try:
            self.dht = adafruit_dht.DHT11(board_pin, use_pulseio=False)
        except TypeError:
            self.dht = adafruit_dht.DHT11(board_pin)
        except Exception as exc:
            print(f"[WARN] DHT11 init failed: {exc}")
            self.dht = None
            return

        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()
        print(f"[INFO] DHT11 monitor started on GPIO{self.pin} at {self.interval_s:.1f}s interval")

    def stop(self) -> None:
        self._stop.set()
        if self.dht is not None:
            try:
                self.dht.exit()
            except Exception:
                pass

    def get_cached(self) -> dict[str, object]:
        status = self._calc_status()
        return {
            "stationId": self.station_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "temperatureC": self.last["temperatureC"] if self.last else None,
            "humidityPct": self.last["humidityPct"] if self.last else None,
            "lastUpdated": self.last_ok_ts.isoformat() if self.last_ok_ts else None,
            "status": status,
            "readErrorsSinceBoot": self.read_errors,
        }

    def _calc_status(self) -> str:
        if not self.last_ok_ts:
            return "offline"
        age_s = (datetime.now(timezone.utc) - self.last_ok_ts).total_seconds()
        if age_s < 15:
            return "ok"
        if age_s < 60:
            return "degraded"
        return "offline"

    def _post(self, payload: dict[str, object]) -> None:
        try:
            response = requests.post(
                f"{self.flss_base_url}/environment/ingest",
                json=payload,
                timeout=self.request_timeout_s,
            )
            if response.status_code >= 300:
                print(f"[WARN] DHT11 telemetry HTTP {response.status_code}: {response.text}")
        except Exception:
            # Keep the main controller resilient during network failures.
            pass

    def _run(self) -> None:
        while not self._stop.is_set():
            try:
                temperature_c = self.dht.temperature if self.dht is not None else None
                humidity_pct = self.dht.humidity if self.dht is not None else None
                if temperature_c is not None and humidity_pct is not None:
                    self.last = {
                        "temperatureC": float(temperature_c),
                        "humidityPct": float(humidity_pct),
                    }
                    self.last_ok_ts = datetime.now(timezone.utc)
            except RuntimeError:
                # DHT11 read errors are common; keep previous valid value.
                self.read_errors += 1
            except Exception:
                self.read_errors += 1

            payload = self.get_cached()
            status = str(payload["status"])
            has_valid_sample = payload["temperatureC"] is not None and payload["humidityPct"] is not None

            if has_valid_sample or self._last_sent_status != status:
                self._post(payload)
                self._last_sent_status = status

            self._stop.wait(self.interval_s)


class RotaryFlssClient:
    def __init__(self, settings: Settings, led: RGBLED) -> None:
        self.settings = settings
        self.led = led
        self.session = requests.Session()
        self.last_sent_at = 0.0
        self.last_sent_by_action: dict[str, float] = {}
        self.action_nonce = 0
        self.lock = threading.Lock()

    def _read_env_sensor_sample(self) -> dict[str, float | None]:
        command = self.settings.env_sensor_cmd
        if not command:
            return {}

        try:
            args = shlex.split(command)
        except ValueError as exc:
            print(f"[WARN] ENV_SENSOR_CMD could not be parsed: {exc}")
            return {}

        if not args:
            print("[WARN] ENV_SENSOR_CMD is empty after parsing")
            return {}

        try:
            result = subprocess.run(
                args,
                capture_output=True,
                text=True,
                check=False,
                timeout=max(1.0, self.settings.request_timeout_s),
            )
        except subprocess.TimeoutExpired:
            print("[WARN] ENV_SENSOR_CMD timed out")
            return {}
        except Exception as exc:
            print(f"[WARN] ENV_SENSOR_CMD failed to execute: {exc}")
            return {}

        if result.returncode != 0:
            stderr = result.stderr.strip()
            detail = f": {stderr}" if stderr else ""
            print(f"[WARN] ENV_SENSOR_CMD exited with code {result.returncode}{detail}")
            return {}

        stdout = result.stdout.strip()
        if not stdout:
            print("[WARN] ENV_SENSOR_CMD returned empty stdout; expected JSON sample")
            return {}

        try:
            payload = json.loads(stdout)
        except json.JSONDecodeError:
            last_line = stdout.splitlines()[-1].strip()
            try:
                payload = json.loads(last_line)
            except json.JSONDecodeError as exc:
                print(f"[WARN] ENV_SENSOR_CMD returned invalid JSON: {exc}")
                return {}

        if not isinstance(payload, dict):
            print("[WARN] ENV_SENSOR_CMD JSON payload must be an object")
            return {}

        field_aliases = {
            "temperatureC": ("temperatureC", "temperature", "tempC", "temperature_c"),
            "humidityPct": ("humidityPct", "humidity", "humidity_pct"),
        }

        sample: dict[str, float | None] = {}
        for key, aliases in field_aliases.items():
            raw_value = None
            for alias in aliases:
                if alias in payload:
                    raw_value = payload[alias]
                    break
            if raw_value is None:
                continue
            try:
                sample[key] = float(raw_value)
            except (TypeError, ValueError):
                print(f"[WARN] ENV_SENSOR_CMD field {key} is not numeric: {raw_value!r}")

        if "temperatureC" not in sample or "humidityPct" not in sample:
            regex_sample = self._parse_text_sensor_output(stdout)
            sample = {**regex_sample, **sample}
        return sample

    def _parse_text_sensor_output(self, output: str) -> dict[str, float]:
        values: dict[str, float] = {}
        temp_match = re.search(r"(?:temp(?:erature)?)[^0-9+-]*([+-]?\d+(?:\.\d+)?)", output, re.IGNORECASE)
        humidity_match = re.search(r"(?:humidity|humid)[^0-9+-]*([+-]?\d+(?:\.\d+)?)", output, re.IGNORECASE)

        if temp_match:
            try:
                values["temperatureC"] = float(temp_match.group(1))
            except (TypeError, ValueError):
                pass
        if humidity_match:
            try:
                values["humidityPct"] = float(humidity_match.group(1))
            except (TypeError, ValueError):
                pass
        return values

    def _flash_led(self, color: tuple[float, float, float], duration_s: float | None = None) -> None:
        def _worker() -> None:
            self.led.color = color
            time.sleep(duration_s if duration_s is not None else self.settings.led_feedback_s)
            self.led.off()

        threading.Thread(target=_worker, daemon=True).start()

    def _headers(self, token: str) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        return headers

    def _new_idempotency_key(self, action: str) -> str:
        with self.lock:
            self.action_nonce += 1
            nonce = self.action_nonce
        return f"{self.settings.remote_id}:{action}:{int(time.time() * 1000)}:{nonce}:{random.randint(1000, 9999)}"

    def _post_json(self, path: str, payload: dict[str, object], token: str) -> requests.Response:
        return self.session.post(
            f"{self.settings.base_url}{path}",
            json=payload,
            headers=self._headers(token),
            timeout=self.settings.request_timeout_s,
        )

    def probe_auth(self) -> bool:
        """Check auth config early so Unauthorized errors are obvious before button presses."""
        url = f"{self.settings.base_url}/dispatch/state"
        try:
            response = self.session.get(
                url,
                headers=self._headers(self.settings.rotary_token),
                timeout=self.settings.request_timeout_s,
            )
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
            if action in {"next", "prev"}:
                last_for_action = self.last_sent_by_action.get(action, 0.0)
                if now - last_for_action < self.settings.min_action_gap_s:
                    return
                opposite = "prev" if action == "next" else "next"
                last_opposite = self.last_sent_by_action.get(opposite, 0.0)
                if now - last_opposite < self.settings.min_action_gap_s:
                    return
            self.last_sent_at = now
            self.last_sent_by_action[action] = now

        remote_payload = {
            "action": action,
            "remoteId": self.settings.remote_id,
            "idempotencyKey": self._new_idempotency_key(action),
            "source": self.settings.source,
        }
        legacy_payload = {"source": self.settings.source}

        try:
            response = self._post_json(
                "/dispatch/remote/action",
                remote_payload,
                self.settings.remote_token,
            )
            if response.status_code in (404, 405, 500, 502, 503, 504) and self.settings.remote_legacy_fallback:
                response = self._post_json(
                    f"/dispatch/{action}",
                    legacy_payload,
                    self.settings.rotary_token,
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
            if self.settings.remote_legacy_fallback:
                try:
                    fallback = self._post_json(
                        f"/dispatch/{action}",
                        legacy_payload,
                        self.settings.rotary_token,
                    )
                    if fallback.status_code == 200:
                        print(f"[OK] {action}: remote API offline, fallback to legacy endpoint")
                        self._flash_led((0.0, 1.0, 0.0))
                        return
                except requests.RequestException:
                    pass
            print(f"[NET] {action}: {exc}")
            self._flash_led((1.0, 0.0, 0.0), duration_s=0.5)  # red

    def send_remote_heartbeat(self) -> None:
        payload = {
            "remoteId": self.settings.remote_id,
            "firmwareVersion": self.settings.firmware_version,
        }
        try:
            response = self._post_json("/dispatch/remote/heartbeat", payload, self.settings.remote_token)
            if response.status_code != 200:
                print(f"[WARN] heartbeat HTTP {response.status_code}: {response.text}")
        except requests.RequestException as exc:
            print(f"[NET] heartbeat: {exc}")

    def send_environment_telemetry(self) -> None:
        dynamic_sample = self._read_env_sensor_sample()
        temperature_c = dynamic_sample.get("temperatureC", self.settings.env_temperature_c)
        humidity_pct = dynamic_sample.get("humidityPct", self.settings.env_humidity_pct)

        if temperature_c is None or humidity_pct is None:
            if self.settings.env_sensor_cmd:
                print("[WARN] environment telemetry skipped: temperature/humidity missing from sensor payload")
            return

        payload = {
            "deviceId": self.settings.remote_id,
            "temperatureC": temperature_c,
            "humidityPct": humidity_pct,
            "recordedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
        try:
            response = self._post_json("/dispatch/environment", payload, self.settings.remote_token)
            if response.status_code != 200:
                print(f"[WARN] environment HTTP {response.status_code}: {response.text}")
            else:
                print(
                    "[OK] environment telemetry sent "
                    f"(temp={temperature_c:.1f}C humidity={humidity_pct:.1f}% device={self.settings.remote_id})"
                )
        except requests.RequestException as exc:
            print(f"[NET] environment: {exc}")


def main() -> int:
    settings = load_settings()

    print("Starting FLSS rotary client with settings:")
    print(f"  FLSS_BASE_URL={settings.base_url}")
    print(f"  ROTARY_SOURCE={settings.source}")
    print(f"  REMOTE_ID={settings.remote_id}")
    print(f"  REMOTE_FIRMWARE={settings.firmware_version}")
    print(f"  REMOTE_HEARTBEAT_INTERVAL_S={settings.heartbeat_interval_s}")
    print(f"  ENV_TELEMETRY_INTERVAL_S={settings.telemetry_interval_s}")
    print(f"  ENV_SENSOR_CMD configured={'yes' if bool(settings.env_sensor_cmd) else 'no'}")
    print(f"  STATION_ID={settings.station_id}")
    print(f"  DHT11_ENABLED={'yes' if settings.dht_enabled else 'no'}")
    print(f"  DHT_PIN={settings.dht_pin}")
    print(f"  DHT_POLL_INTERVAL_S={settings.dht_interval_s}")
    print(f"  Pins CLK/DT/SW={settings.cw_pin}/{settings.ccw_pin}/{settings.sw_pin}")
    print(f"  Push buttons Print/Fulfill={settings.print_btn_pin}/{settings.fulfill_btn_pin}")
    print(
        "  RGB LED pins R/G/B="
        f"{settings.rgb_red_pin}/{settings.rgb_green_pin}/{settings.rgb_blue_pin}"
    )
    print(f"  ROTARY_TOKEN configured={'yes' if bool(settings.rotary_token) else 'no'}")
    print(f"  REMOTE_TOKEN configured={'yes' if bool(settings.remote_token) else 'no'}")
    print(f"  ROTARY_SW_HOLD_TIME_S={settings.sw_hold_time_s}")

    led = RGBLED(settings.rgb_red_pin, settings.rgb_green_pin, settings.rgb_blue_pin)
    led.off()

    client = RotaryFlssClient(settings, led)
    dht_monitor = DHT11Monitor(settings)
    dht_monitor.start()

    if not client.probe_auth():
        print("Hint: export ROTARY_TOKEN=\"<same-token-as-server>\" before running this script.")

    # pull_up=True assumes switch/encoder outputs pull to GND when active.
    clk = Button(settings.cw_pin, pull_up=True, bounce_time=0.002)
    dt = Button(settings.ccw_pin, pull_up=True, bounce_time=0.002)
    sw = Button(settings.sw_pin, pull_up=True, bounce_time=0.05, hold_time=settings.sw_hold_time_s)
    print_btn = Button(settings.print_btn_pin, pull_up=True, bounce_time=0.05)
    fulfill_btn = Button(settings.fulfill_btn_pin, pull_up=True, bounce_time=0.05)

    mode_lock = threading.Lock()
    quantity_mode = False
    sw_press_nonce = 0

    def _send_rotary_turn(cw: bool) -> None:
        with mode_lock:
            in_quantity_mode = quantity_mode
        if in_quantity_mode:
            client.send_action("qty_increase" if cw else "qty_decrease")
            return
        client.send_action("next" if cw else "prev")

    def _on_sw_pressed() -> None:
        nonlocal quantity_mode, sw_press_nonce

        with mode_lock:
            if quantity_mode:
                quantity_mode = False
                sw_press_nonce += 1
                should_submit_qty = True
                press_nonce = sw_press_nonce
            else:
                sw_press_nonce += 1
                should_submit_qty = False
                press_nonce = sw_press_nonce

        if should_submit_qty:
            client.send_action("set_packed_qty")
            return

        def _send_confirm_after_hold_window(nonce: int) -> None:
            time.sleep(max(0.0, settings.sw_hold_time_s))
            with mode_lock:
                if nonce != sw_press_nonce or quantity_mode:
                    return
            if not sw.is_held:
                client.send_action("confirm")

        threading.Thread(target=_send_confirm_after_hold_window, args=(press_nonce,), daemon=True).start()

    def _on_sw_held() -> None:
        nonlocal quantity_mode, sw_press_nonce
        with mode_lock:
            quantity_mode = True
            sw_press_nonce += 1
        client.send_action("confirm_hold")

    # Simple edge mapping suitable for many detented encoders.
    # If direction is reversed, swap next/prev here or swap CLK/DT wiring.
    clk.when_pressed = lambda: _send_rotary_turn(cw=True)
    dt.when_pressed = lambda: _send_rotary_turn(cw=False)
    sw.when_pressed = _on_sw_pressed
    sw.when_held = _on_sw_held
    print_btn.when_pressed = lambda: client.send_action("print")
    fulfill_btn.when_pressed = lambda: client.send_action("fulfill")

    stop_event = threading.Event()

    def _handle_stop(signum, _frame):
        print(f"\nReceived signal {signum}; shutting down...")
        stop_event.set()

    signal.signal(signal.SIGINT, _handle_stop)
    signal.signal(signal.SIGTERM, _handle_stop)

    print("Rotary client running. Rotate knob or press button to send actions.")
    next_heartbeat_at = 0.0
    next_env_at = 0.0
    while not stop_event.is_set():
        now = time.monotonic()
        if now >= next_heartbeat_at:
            client.send_remote_heartbeat()
            next_heartbeat_at = now + max(5.0, settings.heartbeat_interval_s)
        if now >= next_env_at:
            client.send_environment_telemetry()
            next_env_at = now + max(5.0, settings.telemetry_interval_s)
        time.sleep(0.2)

    dht_monitor.stop()
    led.off()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
