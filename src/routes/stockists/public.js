import { Router } from "express";

import {
  getAgentLocatorDetail,
  listLocatorAgents,
  listRetailersByAgent
} from "../../services/stockists/locator.js";

const router = Router();

router.get("/locator/agents", async (_req, res) => {
  try {
    const agents = await listLocatorAgents();
    return res.json({ agents });
  } catch (err) {
    return res.status(500).json({ error: "LOCATOR_AGENT_LIST_FAILED", message: err.message });
  }
});

router.get("/locator/agents/:id", async (req, res) => {
  try {
    const detail = await getAgentLocatorDetail(req.params.id);
    if (!detail) return res.status(404).json({ error: "AGENT_NOT_FOUND" });
    return res.json(detail);
  } catch (err) {
    return res.status(500).json({ error: "LOCATOR_AGENT_DETAIL_FAILED", message: err.message });
  }
});

router.get("/locator/retailers", async (req, res) => {
  try {
    const agentId = String(req.query.agent_id || "").trim();
    if (!agentId) return res.status(400).json({ error: "agent_id query parameter is required" });
    const retailers = await listRetailersByAgent(agentId);
    return res.json({ retailers });
  } catch (err) {
    return res.status(500).json({ error: "LOCATOR_RETAILER_LIST_FAILED", message: err.message });
  }
});

export default router;
