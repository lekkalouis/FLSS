# Raspberry Pi Station Controller Schematic

This schematic is for a **simple station controller** using:
- 1 × indicator light (LED)
- 1 × rotary encoder with integrated push button (EC11/KY-040 style)
- Raspberry Pi GPIO (3.3V logic)

## 1) Wiring Overview

```text
Raspberry Pi (40-pin)                    Components
---------------------                    -------------------------------
Pin 1   (3V3) -------------------------> Rotary encoder VCC
Pin 6   (GND) -------------------------> Rotary encoder GND
Pin 11  (GPIO17) <--------------------- Rotary encoder CLK (A)
Pin 13  (GPIO27) <--------------------- Rotary encoder DT  (B)
Pin 15  (GPIO22) <--------------------- Rotary encoder SW  (push button)

Pin 12  (GPIO18) ----[330Ω resistor]---> LED Anode (+)
Pin 14  (GND)  <------------------------ LED Cathode (-)
```

## 2) Pin Assignment Table

| Function | Pi Physical Pin | GPIO (BCM) | Direction | Notes |
|---|---:|---:|---|---|
| Encoder A / CLK | 11 | GPIO17 | Input | Use internal pull-up |
| Encoder B / DT | 13 | GPIO27 | Input | Use internal pull-up |
| Encoder Switch / SW | 15 | GPIO22 | Input | Use internal pull-up |
| Indicator LED | 12 | GPIO18 | Output | Series resistor 220–470 Ω |
| 3.3V Supply | 1 | 3V3 | Power | For encoder module VCC |
| Ground | 6 (and/or 14) | GND | Power return | Common ground for all |

## 3) Electrical Notes

- Keep everything at **3.3V logic** for Raspberry Pi GPIO safety.
- If using a raw mechanical encoder (not module board), connect A/B/SW to GPIO and enable pull-ups in software.
- Typical LED resistor: **330 Ω** (safe and bright for most 3 mm / 5 mm LEDs).
- Debouncing may be required for cleaner button reads.

## 4) Minimal ASCII Schematic

```text
                 +3V3 (Pin 1)
                    |
                    +-------------------+
                                        |
                                   [Rotary Encoder Module]
GND (Pin 6) ---------------------------- GND
GPIO17 (Pin 11) <----------------------- CLK (A)
GPIO27 (Pin 13) <----------------------- DT  (B)
GPIO22 (Pin 15) <----------------------- SW

GPIO18 (Pin 12) ----[330Ω]----|>|------ GND (Pin 14)
                              LED
```

## 5) Suggested Python GPIO Setup (optional)

Use pull-ups for encoder inputs:

- `GPIO17`, `GPIO27`, `GPIO22` as `INPUT` + pull-up
- `GPIO18` as `OUTPUT` for the indicator LED

This produces a robust baseline station controller for menu navigation (rotary) and confirmation/select (push button), with one status/heartbeat light.
