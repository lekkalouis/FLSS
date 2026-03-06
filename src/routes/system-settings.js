import { Router } from "express";

import {
  DEFAULT_SYSTEM_SETTINGS,
  getSystemSettings,
  patchSystemSettings
} from "../services/systemSettings.js";

const router = Router();

router.get("/system/settings", (_req, res) => {
  try {
    const settings = getSystemSettings();
    return res.json({
      ok: true,
      settings
    });
  } catch (error) {
    return res.status(500).json({
      error: "SETTINGS_READ_FAILED",
      message: String(error?.message || error),
      defaults: DEFAULT_SYSTEM_SETTINGS
    });
  }
});

router.put("/system/settings", (req, res) => {
  try {
    const incoming = req.body && typeof req.body === "object" ? req.body : {};
    const settings = patchSystemSettings(incoming);
    return res.json({ ok: true, settings });
  } catch (error) {
    return res.status(500).json({
      error: "SETTINGS_WRITE_FAILED",
      message: String(error?.message || error)
    });
  }
});

router.post("/system/printers/:printerId/reboot", (req, res) => {
  const printerId = Number(req.params.printerId);
  if (!Number.isInteger(printerId) || printerId <= 0) {
    return res.status(400).json({ error: "BAD_REQUEST", message: "Invalid printerId" });
  }
  return res.status(501).json({
    error: "REBOOT_NOT_CONFIGURED",
    message: "Printer relay reboot is not configured yet. Map relayTarget/relayChannel in system settings first."
  });
});

export default router;

