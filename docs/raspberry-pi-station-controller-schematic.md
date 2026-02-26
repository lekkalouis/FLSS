# Raspberry Pi Station Controller Schematic (Optional Hardware Concept)

This document describes a simple GPIO controller concept that can be used alongside FLSS operations stations. It is **not required** for normal FLSS deployment.

## Components

- 1x LED indicator
- 1x rotary encoder with push switch (EC11/KY-040 style)
- Raspberry Pi GPIO (3.3V logic)

## Wiring

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

## Electrical notes

- Keep GPIO logic at 3.3V.
- Use pull-ups on encoder input lines.
- Typical LED resistor range: 220–470Ω (330Ω common).
- Debounce encoder/button in software for clean input events.

## Example GPIO role map

| Function | Pi Pin | GPIO | Direction |
|---|---:|---:|---|
| Encoder CLK | 11 | GPIO17 | Input + pull-up |
| Encoder DT | 13 | GPIO27 | Input + pull-up |
| Encoder SW | 15 | GPIO22 | Input + pull-up |
| LED | 12 | GPIO18 | Output |

## Integration note

If you implement this, map rotary/button actions to browser shortcuts or a small local controller service that interacts with FLSS UI actions.
