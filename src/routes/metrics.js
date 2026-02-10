import { Router } from "express";

import { emitEvent, emitEvents, getEvents, clearEvents } from "../services/event-emitter.js";
import { buildSavingsSummary, getActionLibrary, getCostModel } from "../services/savings-engine.js";

const router = Router();

router.get("/metrics/actions", (_req, res) => {
  res.json({ actions: getActionLibrary() });
});

router.get("/metrics/cost-model", (_req, res) => {
  res.json(getCostModel());
});

router.post("/metrics/events", (req, res) => {
  try {
    if (Array.isArray(req.body?.events)) {
      const events = emitEvents(req.body.events);
      return res.status(201).json({ count: events.length, events });
    }
    const event = emitEvent(req.body || {});
    return res.status(201).json({ event });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

router.delete("/metrics/events", (_req, res) => {
  clearEvents();
  res.status(204).end();
});

router.get("/metrics/summary", (req, res) => {
  const { window = "all", hourlyRate } = req.query;
  const summary = buildSavingsSummary(getEvents(), { window, hourlyRate });
  res.json(summary);
});

router.get("/metrics/dashboard", (req, res) => {
  const hourlyRate = Number(req.query.hourlyRate) || undefined;
  const allEvents = getEvents();
  const today = buildSavingsSummary(allEvents, { window: "today", hourlyRate });
  const month = buildSavingsSummary(allEvents, { window: "month", hourlyRate });
  res.json({
    hourly_rate: today.hourly_rate,
    today: today.totals,
    month_to_date: month.totals,
    diagnostics: month.diagnostics,
    by_stage: month.by_stage,
    top_actions_time_saved: month.top_actions_time_saved,
    top_actions_error_saved: month.top_actions_error_saved
  });
});

export default router;
