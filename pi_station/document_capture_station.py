#!/usr/bin/env python3
"""Document capture station for Raspberry Pi traceability workflows.

Flow:
1) Detect when a document is present on the stand (GPIO sensor input).
2) Capture an image with Picamera2.
3) Attach capture metadata to traceability PO/invoice via FLSS API.
4) Auto-print a driver's vehicle inspection sheet for the linked inspection.
"""

import os
import time
from datetime import datetime

import requests
from gpiozero import Button, Buzzer, LED
from picamera2 import Picamera2

FLSS_BASE = os.getenv("FLSS_BASE", "http://127.0.0.1:3000/api/v1")
OUT_DIR = os.getenv("OUT_DIR", "/home/pi/captures")
PO_NUMBER = os.getenv("DOC_PO_NUMBER", "")
INVOICE_NUMBER = os.getenv("DOC_INVOICE_NUMBER", "")
SOURCE = os.getenv("DOC_SOURCE", "pi-doc-station")
SENSOR_GPIO = int(os.getenv("DOC_SENSOR_GPIO", "24"))
SENSOR_ACTIVE_LOW = os.getenv("DOC_SENSOR_ACTIVE_LOW", "true").lower() == "true"
TRIGGER_COOLDOWN_SEC = float(os.getenv("DOC_TRIGGER_COOLDOWN_SEC", "2.0"))

sensor = Button(SENSOR_GPIO, pull_up=SENSOR_ACTIVE_LOW)
status_led = LED(25)
error_led = LED(8)
buzzer = Buzzer(26)

camera = Picamera2()
camera.configure(camera.create_still_configuration())
camera.start()


# Internal guard against repeated captures while same paper remains in place.
document_already_processed = False
last_capture_ts = 0.0


def blink_error(times=2, on=0.12, off=0.1):
    for _ in range(times):
        error_led.on()
        buzzer.on()
        time.sleep(on)
        buzzer.off()
        error_led.off()
        time.sleep(off)


def request_or_raise(method, url, **kwargs):
    response = requests.request(method, url, timeout=kwargs.pop("timeout", 8), **kwargs)
    response.raise_for_status()
    return response


def capture_document_image():
    os.makedirs(OUT_DIR, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"doc_{INVOICE_NUMBER or 'unknown'}_{ts}.jpg"
    file_path = os.path.join(OUT_DIR, filename)
    camera.capture_file(file_path)
    return file_path


def log_capture_and_print(image_path):
    payload = {
        "poNumber": PO_NUMBER,
        "invoiceNumber": INVOICE_NUMBER,
        "imagePath": image_path,
        "source": SOURCE,
        "capturedAt": datetime.utcnow().isoformat() + "Z"
    }

    capture_resp = request_or_raise("POST", f"{FLSS_BASE}/traceability/document-captures", json=payload)
    capture_data = capture_resp.json()

    inspection = capture_data.get("inspection") or {}
    inspection_id = inspection.get("inspectionId")
    if not inspection_id:
        print("Capture logged but no inspection matched. Skipping print.")
        return

    print_payload = {"trigger": "pi-doc-station"}
    print_resp = request_or_raise(
        "POST",
        f"{FLSS_BASE}/traceability/inspections/{inspection_id}/print-sheet",
        json=print_payload,
        timeout=15
    )
    print_data = print_resp.json()
    print_job = print_data.get("printJob")
    print(f"Printed inspection sheet for {inspection_id}. PrintNode response: {print_job}")


def handle_document_present():
    global last_capture_ts

    if not PO_NUMBER or not INVOICE_NUMBER:
        print("DOC_PO_NUMBER and DOC_INVOICE_NUMBER must be set before starting capture loop.")
        blink_error(3)
        return

    now = time.monotonic()
    if now - last_capture_ts < TRIGGER_COOLDOWN_SEC:
        return

    status_led.on()
    try:
        image_path = capture_document_image()
        log_capture_and_print(image_path)
        last_capture_ts = now
        buzzer.on()
        time.sleep(0.05)
        buzzer.off()
    except Exception as exc:
        print(f"Capture/print workflow failed: {exc}")
        blink_error(3)
    finally:
        status_led.off()


def main_loop():
    global document_already_processed

    print("Document capture station ready.")
    print(f"Watching GPIO {SENSOR_GPIO} for document presence (active_low={SENSOR_ACTIVE_LOW}).")

    while True:
        is_present = sensor.is_pressed
        if is_present and not document_already_processed:
            handle_document_present()
            document_already_processed = True
        elif not is_present:
            document_already_processed = False
        time.sleep(0.1)


if __name__ == "__main__":
    main_loop()
