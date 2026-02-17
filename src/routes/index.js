import alertsRouter from "./alerts.js";
import configRouter from "./config.js";
import parcelPerfectRouter from "./parcelperfect.js";
import printnodeRouter from "./printnode.js";
import shopifyRouter from "./shopify.js";
import statusRouter from "./status.js";

export const apiRouters = [
  { name: "status", router: statusRouter },
  { name: "config", router: configRouter },
  { name: "parcelPerfect", router: parcelPerfectRouter },
  { name: "shopify", router: shopifyRouter },
  { name: "printnode", router: printnodeRouter },
  { name: "alerts", router: alertsRouter }
];
