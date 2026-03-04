import agentCommissionsRouter from "./agent-commissions.js";
import alertsRouter from "./alerts.js";
import configRouter from "./config.js";
import controllerRouter from "./controller.js";
import customerAccountsRouter from "./customer-accounts.js";
import dispatchControllerRouter from "./dispatch.controller.js";
import docsRouter from "./docs.js";
import environmentRouter from "./environment.js";
import liquidTemplatesRouter from "./liquidTemplates.js";
import manufacturingRouter from "./manufacturing.js";
import notificationTemplatesRouter from "./notificationTemplates.js";
import orderPaymentsRouter from "./order-payments.js";
import parcelPerfectRouter from "./parcelperfect.js";
import printnodeRouter from "./printnode.js";
import shopifyRouter from "./shopify.js";
import statusRouter from "./status.js";
import traceabilityRouter from "./traceability.js";

export const apiRouters = [
  { name: "status", router: statusRouter },
  { name: "agentCommissions", router: agentCommissionsRouter },
  { name: "config", router: configRouter },
  { name: "controller", router: controllerRouter },
  { name: "customerAccounts", router: customerAccountsRouter },
  { name: "dispatchController", router: dispatchControllerRouter },
  { name: "environment", router: environmentRouter },
  { name: "docs", router: docsRouter },
  { name: "liquidTemplates", router: liquidTemplatesRouter },
  { name: "manufacturing", router: manufacturingRouter },
  { name: "notificationTemplates", router: notificationTemplatesRouter },
  { name: "orderPayments", router: orderPaymentsRouter },
  { name: "parcelPerfect", router: parcelPerfectRouter },
  { name: "shopify", router: shopifyRouter },
  { name: "printnode", router: printnodeRouter },
  { name: "alerts", router: alertsRouter },
  { name: "traceability", router: traceabilityRouter }
];
