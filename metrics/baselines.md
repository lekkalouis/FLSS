# FLSS Hours Saved Baselines

This file documents how baseline timings are maintained for the Hours Saved module.

## Principles
- Baselines represent manual operations with no FLSS automations.
- Automated timings represent expected touch time when FLSS handles the action.
- Values are measured in seconds and treated as constants until re-benchmarked.

## Measurement protocol
1. Capture at least 30 samples per action across normal shifts.
2. Trim top/bottom 10% outliers.
3. Store median as `manual_seconds` and FLSS-assisted median as `automated_seconds`.
4. Update error rates from quality incident logs monthly.

## Governance
- Action catalog updates must be versioned (`actions.vN.json`).
- Any change in action timings should include a short rationale in the commit message.
- Cost model changes (hourly rates/FTE baseline) should be approved by Ops lead.
