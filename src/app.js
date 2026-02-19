import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";

import { config } from "./config.js";
import { buildCorsConfig } from "./bootstrap/cors.js";
import { mountApiRouters } from "./bootstrap/api.js";
import { mountStaticApp } from "./bootstrap/static.js";
import { RATE_LIMIT } from "./constants/http.js";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(express.json({ limit: "1mb" }));

  const corsConfig = buildCorsConfig();
  app.use(corsConfig.middleware);
  app.options("*", (_req, res) => res.sendStatus(204));

  app.use(
    rateLimit({
      windowMs: RATE_LIMIT.WINDOW_MS,
      max: RATE_LIMIT.MAX_REQUESTS_PER_WINDOW,
      standardHeaders: true,
      legacyHeaders: false
    })
  );

  app.use(morgan(config.NODE_ENV === "production" ? "combined" : "dev"));

  mountApiRouters(app);
  mountStaticApp(app);

  return {
    app,
    allowAllOrigins: corsConfig.allowAllOrigins,
    allowedOrigins: corsConfig.allowedOrigins
  };
}
