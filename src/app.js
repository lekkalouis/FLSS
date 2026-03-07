import path from "path";
import { fileURLToPath } from "url";

import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";

import { config, getFrontendOrigin } from "./config.js";
import { apiRouters } from "./routes/index.js";

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

function buildCorsConfig() {
  const allowedOrigins = new Set(
    String(getFrontendOrigin() || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
  const allowAllOrigins = allowedOrigins.has("*");

  return {
    allowAllOrigins,
    allowedOrigins,
    middleware: cors({
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
  };
}

function mountApiRouters(app, basePath = "/api/v1") {
  const apiRouter = express.Router();
  apiRouters.forEach(({ router }) => apiRouter.use(router));
  app.use(basePath, apiRouter);
  app.use(basePath, (_req, res) => res.status(404).json({ error: "Not found" }));
}

export function createApp() {
  const app = express();
  const googleMapsCspSources = [
    "https://*.googleapis.com",
    "https://*.gstatic.com",
    "https://maps.googleapis.com",
    "https://maps.gstatic.com"
  ];

  app.disable("x-powered-by");
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          scriptSrc: ["'self'", ...googleMapsCspSources],
          connectSrc: ["'self'", ...googleMapsCspSources],
          imgSrc: ["'self'", "data:", ...googleMapsCspSources],
          fontSrc: ["'self'", "https:", "data:", ...googleMapsCspSources]
        }
      }
    })
  );
  app.use(express.json({
    limit: "1mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    }
  }));

  const corsConfig = buildCorsConfig();
  app.use(corsConfig.middleware);
  app.options("*", (_req, res) => res.sendStatus(204));

  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      max: 120,
      skip: (req) => req.method === "GET" && /^\/api\/v1\/docs(?:\/|$)/.test(req.path || ""),
      standardHeaders: true,
      legacyHeaders: false
    })
  );

  app.use(morgan(config.NODE_ENV === "production" ? "combined" : "dev", { stream: process.stderr }));

  mountApiRouters(app);

  const legacyRedirects = new Map([
    ["/admin", "/stock"],
    ["/purchase-orders.html", "/buy"],
    ["/manufacturing.html", "/make"],
    ["/product-management.html", "/stock?section=inventory&tab=raw-materials"],
    ["/price-manager.html", "/price-manager"],
    ["/agent-commissions.html", "/agent-commissions"],
    ["/dispatch-settings", "/stock?notice=tool-retired"],
    ["/logs", "/stock?notice=tool-retired"],
    ["/station-controller.html", "/stock?notice=tool-retired"],
    ["/pos.html", "/stock?notice=tool-retired"],
    ["/shipping-matrix.html", "/stock?notice=tool-retired"],
    ["/order-capture-custom.html", "/stock?notice=tool-retired"],
    ["/customer-accounts.html", "/stock?notice=tool-retired"],
    ["/liquid-templates.html", "/stock?notice=tool-retired"],
    ["/notification-templates.html", "/stock?notice=tool-retired"],
    ["/traceability.html", "/stock?section=batches"]
  ]);
  legacyRedirects.forEach((target, source) => {
    app.get(source, (_req, res) => res.redirect(302, target));
  });

  const publicDir = path.join(__dirname, "..", "public");
  const oneUiAssetsDir = path.join(__dirname, "..", "ONEUI", "OneUI by pixelcave", "OneUI 5.12", "01 OneUI Source (HTML)", "src", "assets");
  app.use("/vendor/oneui", express.static(oneUiAssetsDir));
  app.use(express.static(publicDir));
  app.get("*", (_req, res) => res.sendFile(path.join(publicDir, "index.html")));

  return {
    app,
    allowAllOrigins: corsConfig.allowAllOrigins,
    allowedOrigins: corsConfig.allowedOrigins
  };
}
