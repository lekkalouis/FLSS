import { Router } from "express";

import { config } from "../config.js";

const router = Router();

router.get("/config", (_req, res) => {
  res.json({
    COST_ALERT_THRESHOLD: config.UI_COST_ALERT_THRESHOLD,
    BOOKING_IDLE_MS: config.UI_BOOKING_IDLE_MS,
    TRUCK_ALERT_THRESHOLD: config.UI_TRUCK_ALERT_THRESHOLD,
    BOX_DIM: {
      dim1: config.UI_BOX_DIM1,
      dim2: config.UI_BOX_DIM2,
      dim3: config.UI_BOX_DIM3,
      massKg: config.UI_BOX_MASS_KG
    },
    ORIGIN: {
      origpers: config.UI_ORIG_PERS,
      origperadd1: config.UI_ORIG_PER_ADD1,
      origperadd2: config.UI_ORIG_PER_ADD2,
      origperadd3: config.UI_ORIG_PER_ADD3,
      origperadd4: config.UI_ORIG_PER_ADD4,
      origperpcode: config.UI_ORIG_PER_PCODE,
      origtown: config.UI_ORIG_TOWN,
      origplace: config.UI_ORIG_PLACE,
      origpercontact: config.UI_ORIG_PER_CONTACT,
      origperphone: config.UI_ORIG_PER_PHONE,
      origpercell: config.UI_ORIG_PER_CELL,
      notifyorigpers: config.UI_ORIG_NOTIFY_PERS,
      origperemail: config.UI_ORIG_PER_EMAIL,
      notes: config.UI_ORIG_NOTES
    },
    PP_ENDPOINT: config.UI_PP_ENDPOINT,
    SHOPIFY: {
      PROXY_BASE: config.UI_SHOPIFY_PROXY_BASE
    },
    FLOW_TRIGGER_TAG: config.SHOPIFY_FLOW_TAG,
    FEATURES: {
      flowTrigger: String(config.UI_FEATURE_FLOW_TRIGGER).toLowerCase() !== "false"
    }
  });
});

export default router;
