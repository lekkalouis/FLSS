export const API_BASE_PATH = "/api/v1";

export const RATE_LIMIT = {
  WINDOW_MS: 60 * 1000,
  MAX_REQUESTS_PER_WINDOW: 120
};

export const CORS = {
  METHODS: ["GET", "POST", "OPTIONS"],
  ALLOWED_HEADERS: ["Content-Type", "Authorization"],
  MAX_AGE_SECONDS: 86400
};
