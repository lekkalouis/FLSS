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

  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin || allowAllOrigins || allowedOrigins.has(origin)) return cb(null, true);
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
  app.get("/catalogue", (req, res) => res.sendFile(path.join(publicDir, "catalogue.html")));
  app.get("/simulate", (req, res) => res.sendFile(path.join(publicDir, "simulate.html")));

  app.get("*", (req, res) => res.sendFile(path.join(publicDir, "index.html")));

  return { app, allowAllOrigins, allowedOrigins };
}
