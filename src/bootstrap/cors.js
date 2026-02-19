import cors from "cors";

import { config, getFrontendOrigin } from "../config.js";
import { CORS } from "../constants/http.js";

function isPrivateHostname(hostname) {
  if (!hostname) return false;
  if (hostname === "localhost" || hostname === "127.0.0.1") return true;

  const ipv4Parts = hostname.split(".").map((part) => Number(part));
  if (ipv4Parts.length !== 4 || ipv4Parts.some((part) => Number.isNaN(part))) {
    return false;
  }

  if (ipv4Parts[0] === 10) return true;
  if (ipv4Parts[0] === 192 && ipv4Parts[1] === 168) return true;
  if (ipv4Parts[0] === 172 && ipv4Parts[1] >= 16 && ipv4Parts[1] <= 31) return true;
  return false;
}

function parseAllowedOrigins(frontendOriginValue = "") {
  return new Set(
    String(frontendOriginValue)
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  );
}

function resolveOrigin(origin, allowAllOrigins, allowedOrigins) {
  if (!origin || allowAllOrigins || allowedOrigins.has(origin)) return true;

  if (config.NODE_ENV === "production") return false;

  try {
    const { hostname } = new URL(origin);
    return isPrivateHostname(hostname);
  } catch {
    return false;
  }
}

export function buildCorsConfig() {
  const allowedOrigins = parseAllowedOrigins(getFrontendOrigin());
  const allowAllOrigins = allowedOrigins.has("*");

  return {
    allowAllOrigins,
    allowedOrigins,
    middleware: cors({
      origin: (origin, cb) => {
        if (resolveOrigin(origin, allowAllOrigins, allowedOrigins)) {
          return cb(null, true);
        }
        return cb(new Error("CORS: origin not allowed"));
      },
      methods: CORS.METHODS,
      allowedHeaders: CORS.ALLOWED_HEADERS,
      credentials: false,
      maxAge: CORS.MAX_AGE_SECONDS
    })
  };
}
