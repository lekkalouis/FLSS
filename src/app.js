import path from "path";
import { fileURLToPath } from "url";

import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";

import { config, getFrontendOrigin } from "./config.js";
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
import customerDocsRouter from "./routes/customer-docs.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

  app.disable("x-powered-by");

  if (config.NODE_ENV === "production") {
    app.set("trust proxy", 1);
    app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
    app.use(
      rateLimit({
        windowMs: 60 * 1000,
        max: 120,
        standardHeaders: true,
        legacyHeaders: false
      })
    );
    app.use(morgan("combined"));
  } else {
    app.use(morgan("dev"));
  }

  app.use(express.json({ limit: "1mb" }));

  const frontendOrigin = getFrontendOrigin();
  const allowedOrigins = new Set(
    String(frontendOrigin || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
  const allowAllOrigins = config.NODE_ENV !== "production" && allowedOrigins.has("*");

  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin || allowAllOrigins || allowedOrigins.has(origin)) return cb(null, true);
        if (config.NODE_ENV !== "production") {
          try {
            const { hostname } = new URL(origin);
            if (isPrivateHostname(hostname)) return cb(null, true);
          } catch {
            // ignore parsing errors
          }
        }
        return cb(new Error("CORS: origin not allowed"));
      },
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      credentials: false,
      maxAge: 86400
    })
  );
  app.options("*", (_req, res) => res.sendStatus(204));

  app.use("/flocs", requireAdminToken);
  app.use("/simulate", requireAdminToken);
  app.use("/api/v1/shopify", requireAdminToken);
  app.use("/api/admin", requireAdminToken);
  app.use("/api/v1/admin", requireAdminToken);

  app.use(statusRouter);

  apiRouter.use(statusRouter);
  apiRouter.use(configRouter);
  apiRouter.use(parcelPerfectRouter);
  apiRouter.use(shopifyRouter);
  apiRouter.use(pricingRouter);
  apiRouter.use(printnodeRouter);
  apiRouter.use(alertsRouter);
  apiRouter.use(traceabilityRouter);
  apiRouter.use(stockistPublicRouter);
  apiRouter.use(stockistAdminRouter);
  apiRouter.use(wholesaleRouter);
  apiRouter.use(customerDocsRouter);
  app.use("/api/v1", apiRouter);
  app.use("/api", stockistPublicRouter);
  app.use("/api", stockistAdminRouter);
  app.use("/api/v1", (_req, res) => res.status(404).json({ error: "Not found" }));

  const repoRootDir = path.join(__dirname, "..");
  const publicDir = path.join(repoRootDir, "public");
  const docsDir = path.join(repoRootDir, "docs");

  app.use("/docs", express.static(docsDir));
  app.get("/README.md", (_req, res) => res.sendFile(path.join(repoRootDir, "README.md")));
  app.use(express.static(publicDir));
  app.get("*", (req, res) => res.sendFile(path.join(publicDir, "index.html")));

  return { app, allowAllOrigins, allowedOrigins };
}
