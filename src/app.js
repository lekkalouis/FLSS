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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Allow local/LAN origins during development so handheld scanners and shop-floor stations can connect without manually whitelisting each device.
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

// Build and configure the Express application used by both `npm run dev` and production startup.
export function createApp() {
  const app = express();
  // Group API routes under a versioned prefix to keep the browser SPA and service endpoints isolated.
  const apiRouter = express.Router();

  app.disable("x-powered-by");
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(express.json({ limit: "1mb" }));

  const frontendOrigin = getFrontendOrigin();
  const allowedOrigins = new Set(
    String(frontendOrigin || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
  const allowAllOrigins = allowedOrigins.has("*");

  // CORS is strict in production but development allows private network origins to simplify local testing.
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
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      credentials: false,
      maxAge: 86400
    })
  );
  app.options("*", (_req, res) => res.sendStatus(204));

  // Coarse global API limit to reduce accidental floods from scanner loops or browser retries.
  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      max: 120,
      standardHeaders: true,
      legacyHeaders: false
    })
  );

  app.use(morgan(config.NODE_ENV === "production" ? "combined" : "dev"));

  // Route registration order is intentionally explicit for maintainability.
  apiRouter.use(statusRouter);
  apiRouter.use(configRouter);
  apiRouter.use(parcelPerfectRouter);
  apiRouter.use(shopifyRouter);
  apiRouter.use(pricingRouter);
  apiRouter.use(printnodeRouter);
  apiRouter.use(alertsRouter);
  apiRouter.use(traceabilityRouter);
  app.use("/api/v1", apiRouter);
  app.use("/api/v1", (_req, res) => res.status(404).json({ error: "Not found" }));

  // Serve the frontend SPA bundle and let client-side routing handle all non-API paths.
  const publicDir = path.join(__dirname, "..", "public");
  app.use(express.static(publicDir));

  app.get("*", (req, res) => res.sendFile(path.join(publicDir, "index.html")));

  return { app, allowAllOrigins, allowedOrigins };
}
