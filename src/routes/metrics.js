import { Router } from "express";

import { emitEvent, emitEventsBulk, getAllEvents, listEvents } from "../services/event-emitter.js";
import { getActionsLibrary, getCostModel } from "../services/metrics-catalog.js";
import { summarizeEvents } from "../services/savings-engine.js";

const router = Router();

router.get("/metrics/actions", (_req, res) => {
  res.json(getActionsLibrary());
});

router.get("/metrics/cost-model", (_req, res) => {
  res.json(getCostModel());
});

router.get("/metrics/events", (req, res) => {
  const limit = Number(req.query.limit || 200);
  res.json({ events: listEvents(limit) });
});

router.post("/metrics/events", (req, res) => {
  try {
    const event = emitEvent(req.body || {});
    res.status(201).json({ event });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message || "Unable to emit event" });
  }
});

router.post("/metrics/events/bulk", (req, res) => {
  try {
    const rows = Array.isArray(req.body?.events) ? req.body.events : [];
    const events = emitEventsBulk(rows);
    res.status(201).json({ count: events.length, events });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message || "Unable to emit events" });
  }
});

router.get("/metrics/summary", (req, res) => {
  const costModel = getCostModel();
  const range = String(req.query.range || "month");
  const hourlyRate = Number(req.query.hourlyRate || costModel.default_hourly_rate);

  const summary = summarizeEvents(getAllEvents(), {
    range,
    hourlyRate,
    fteHoursPerMonth: costModel.fte_hours_per_month
  });

  res.json(summary);
});

export default router;
