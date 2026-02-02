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
import shopifyRouter from "./routes/shopify.js";
import statusRouter from "./routes/status.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

function isPrivateIpv4(hostname) {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return false;
  const [a, b] = hostname.split(".").map((octet) => Number(octet));
  if ([a, b].some((octet) => Number.isNaN(octet))) return false;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

function isPrivateIpv6(hostname) {
  const normalized = hostname.toLowerCase();
  return (
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80")
  );
}

function isLanOrigin(origin) {
  try {
    const { hostname } = new URL(origin);
    if (LOCAL_HOSTNAMES.has(hostname)) return true;
    if (hostname.endsWith(".local")) return true;
    if (isPrivateIpv4(hostname)) return true;
    if (hostname.includes(":") && isPrivateIpv6(hostname.replace(/^\[|\]$/g, ""))) return true;
    return false;
  } catch {
    return false;
  }
}

export function createApp() {
  const app = express();

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
  const allowLanOrigins = String(config.ALLOW_LAN_ORIGINS || "").toLowerCase() === "true";

  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin || allowAllOrigins || allowedOrigins.has(origin)) return cb(null, true);
        if (allowLanOrigins && isLanOrigin(origin)) return cb(null, true);
        return cb(new Error("CORS: origin not allowed"));
      },
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      credentials: false,
      maxAge: 86400
    })
  );
  app.options("*", (_req, res) => res.sendStatus(204));

  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      max: 120,
      standardHeaders: true,
      legacyHeaders: false
    })
  );

  app.use(morgan(config.NODE_ENV === "production" ? "combined" : "dev"));

  app.use(statusRouter);
  app.use(parcelPerfectRouter);
  app.use(shopifyRouter);
  app.use(printnodeRouter);
  app.use(alertsRouter);

  const publicDir = path.join(__dirname, "..", "public");
  app.use(express.static(publicDir));
  app.get("/flocs", (req, res) => res.sendFile(path.join(publicDir, "flocs.html")));
  app.get("/simulate", (req, res) => res.sendFile(path.join(publicDir, "simulate.html")));

  app.get("*", (req, res) => res.sendFile(path.join(publicDir, "index.html")));

  return { app, allowAllOrigins, allowedOrigins };
}
