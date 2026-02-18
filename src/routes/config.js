import { Router } from "express";

import { config } from "../config.js";
import { numberOrDefault } from "../utils/number.js";

const router = Router();
const API_BASE = "/api/v1";

router.get("/config", (_req, res) => {
  const uiConfig = {
    COST_ALERT_THRESHOLD: numberOrDefault(config.UI_COST_ALERT_THRESHOLD, 250),
    BOOKING_IDLE_MS: numberOrDefault(config.UI_BOOKING_IDLE_MS, 6000),
    TRUCK_ALERT_THRESHOLD: numberOrDefault(config.UI_TRUCK_ALERT_THRESHOLD, 25),
    BOX_DIM: {
      dim1: numberOrDefault(config.UI_BOX_DIM_1, 40),
      dim2: numberOrDefault(config.UI_BOX_DIM_2, 40),
      dim3: numberOrDefault(config.UI_BOX_DIM_3, 30),
      massKg: numberOrDefault(config.UI_BOX_MASS_KG, 5)
    },
    ORIGIN: {
      origpers: config.UI_ORIGIN_PERSON || "Flippen Lekka Holdings (Pty) Ltd",
      origperadd1: config.UI_ORIGIN_ADDR1 || "7 Papawer Street",
      origperadd2: config.UI_ORIGIN_ADDR2 || "Blomtuin, Bellville",
      origperadd3: config.UI_ORIGIN_ADDR3 || "Cape Town, Western Cape",
      origperadd4: config.UI_ORIGIN_ADDR4 || "ZA",
      origperpcode: config.UI_ORIGIN_POSTCODE || "7530",
      origtown: config.UI_ORIGIN_TOWN || "Cape Town",
      origplace: numberOrDefault(config.UI_ORIGIN_PLACE_ID, 4663),
      origpercontact: config.UI_ORIGIN_CONTACT || "Louis",
      origperphone: config.UI_ORIGIN_PHONE || "0730451885",
      origpercell: config.UI_ORIGIN_CELL || "0730451885",
      notifyorigpers: numberOrDefault(config.UI_ORIGIN_NOTIFY, 1),
      origperemail: config.UI_ORIGIN_EMAIL || "admin@flippenlekkaspices.co.za",
      notes: config.UI_ORIGIN_NOTES || "Louis 0730451885 / Michael 0783556277"
    },
    PP_ENDPOINT: `${API_BASE}/pp`,
    SHOPIFY: { PROXY_BASE: `${API_BASE}/shopify` },
    FLOW_TRIGGER_TAG: config.SHOPIFY_FLOW_TAG || "dispatch_flow",
    FEATURE_FLAGS: {
      MULTI_SHIP: config.UI_FEATURE_MULTI_SHIP
        ? String(config.UI_FEATURE_MULTI_SHIP).toLowerCase() !== "false"
        : true
    }
  };

  res.json(uiConfig);
});

export default router;
