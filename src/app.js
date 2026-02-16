import path from "path";
import { fileURLToPath } from "url";

import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";

import { config, getFrontendOrigins } from "./config.js";
import alertsRouter from "./routes/alerts.js";
import parcelPerfectRouter from "./routes/parcelperfect.js";
import printnodeRouter from "./routes/printnode.js";
import pricingRouter from "./routes/pricing.js";
import shopifyRouter from "./routes/shopify.js";
import statusRouter from "./routes/status.js";
import configRouter from "./routes/config.js";
import traceabilityRouter from "./routes/traceability.js";
import stockistAdminRouter from "./routes/stockists/admin.js";
import stockistPublicRouter from "./routes/stockists/public.js";
import wholesaleRouter from "./routes/wholesale.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SHOPIFY_CLIENT_ROUTE_RULES = [
  { method: "GET", path: "/shopify/products/search" },
  { method: "GET", path: "/shopify/products/collection" },
  { method: "POST", path: "/shopify/variants/price-tiers/fetch" }
];

function isAllowedClientShopifyRoute(method, routePath) {
  return SHOPIFY_CLIENT_ROUTE_RULES.some(
    (rule) => rule.method === method && (routePath === rule.path || routePath.startsWith(`${rule.path}/`))
  );
}

function createClientShopifyRouter() {
  const router = express.Router();
  router.use((req, res, next) => {
    if (isAllowedClientShopifyRoute(req.method, req.path)) return next();
    return res.status(403).json({
      error: "FORBIDDEN",
      message: "This Shopify endpoint requires admin authorization."
    });
  });
  router.use(shopifyRouter);
  return router;
}

function isPrivateHostname(hostname) {
  if (!hostname) return false;
  if (hostname === "localhost" || hostname === "127.0.0.1") return true;
  const parts = hostname.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((num) => Number.isNaN(num))) return false;
  if (parts[0] === 10) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  return false;
}

function requireAdminToken(req, res, next) {
  if (!config.ADMIN_TOKEN) return next();
  const authHeader = req.get("authorization") || "";
  const expected = `Bearer ${config.ADMIN_TOKEN}`;
  if (authHeader === expected) return next();
  return res.status(401).json({ error: "Unauthorized" });
}

export function createApp() {
  const app = express();
  const apiRouter = express.Router();
  const clientShopifyRouter = createClientShopifyRouter();

  app.disable("x-powered-by");

  if (config.NODE_ENV === "production") {
    app.set("trust proxy", 1);
    app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
    app.use(morgan("combined"));
  } else {
    app.use(morgan("dev"));
  }

  app.use(express.json({ limit: "1mb" }));

  const apiRateLimiter =
    config.NODE_ENV === "production"
      ? rateLimit({
          windowMs: Number(config.RATE_LIMIT_WINDOW_MS) || 60 * 1000,
          max: Number(config.RATE_LIMIT_MAX_REQUESTS) || 600,
          standardHeaders: true,
          legacyHeaders: false,
          message: { error: "Too many API requests. Please retry shortly." }
        })
      : null;

  const frontendOrigins = getFrontendOrigins();
  const allowedOrigins = new Set(frontendOrigins);
  const wildcardAllowed = allowedOrigins.has("*");
  const allowAllOrigins = wildcardAllowed && config.NODE_ENV !== "production";

  app.use((req, res, next) => {
    cors({
      origin: (origin, cb) => {
        if (!origin || allowAllOrigins || wildcardAllowed || allowedOrigins.has(origin)) {
          return cb(null, true);
        }

        if (config.NODE_ENV !== "production") {
          try {
            const { hostname } = new URL(origin);
            if (isPrivateHostname(hostname)) return cb(null, true);
          } catch {
            // ignore parsing errors
          }
        }

        console.warn("[cors] Rejected request origin", {
          origin,
          method: req.method,
          path: req.originalUrl,
          ip: req.ip,
          nodeEnv: config.NODE_ENV,
          allowAllOrigins,
          wildcardAllowed,
          configuredOrigins: frontendOrigins
        });

        return cb(new Error("CORS: origin not allowed"));
      },
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      credentials: false,
      maxAge: 86400
    })(req, res, next);
  });
  app.options("*", (_req, res) => res.sendStatus(204));

  if (apiRateLimiter) {
    app.use("/flocs", apiRateLimiter);
    app.use("/simulate", apiRateLimiter);
    app.use("/api", apiRateLimiter);
  }

  app.use("/flocs", requireAdminToken);
  app.use("/simulate", requireAdminToken);
  app.use("/api/v1/shopify", requireAdminToken);
  app.use("/api/admin", requireAdminToken);
  app.use("/api/v1/admin", requireAdminToken);

  app.use(statusRouter);

  apiRouter.use(statusRouter);
  apiRouter.use(configRouter);
  apiRouter.use(parcelPerfectRouter);
  apiRouter.use("/client", clientShopifyRouter);
  apiRouter.use(shopifyRouter);
  apiRouter.use(pricingRouter);
  apiRouter.use(printnodeRouter);
  apiRouter.use(alertsRouter);
  apiRouter.use(traceabilityRouter);
  apiRouter.use(stockistPublicRouter);
  apiRouter.use(stockistAdminRouter);
  apiRouter.use(wholesaleRouter);
  app.use("/api/v1", apiRouter);
  app.use("/api", stockistPublicRouter);
  app.use("/api", stockistAdminRouter);
  app.use("/api/v1", (_req, res) => res.status(404).json({ error: "Not found" }));

  const publicDir = path.join(__dirname, "..", "public");
  const newUiAssetsDir = path.join(__dirname, "..", "NEWUI", "Codebase_app", "src", "assets");
  app.use("/newui-assets", express.static(newUiAssetsDir));
  app.use(express.static(publicDir));
  app.get("*", (req, res) => res.sendFile(path.join(publicDir, "index.html")));

  return { app, allowAllOrigins, allowedOrigins };
}
