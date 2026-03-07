import crypto from "crypto";
import path from "path";

import fetch from "node-fetch";

import { config } from "../config.js";

const AUTH_COOKIE_NAME = "flss_oauth_session";
const LOGIN_STATE_TTL_MS = 10 * 60 * 1000;
const oauthSessions = new Map();
const pendingOAuthStates = new Map();

function trimString(value) {
  return String(value || "").trim();
}

function firstConfiguredOrigin() {
  return trimString(config.FRONTEND_ORIGIN)
    .split(",")
    .map((entry) => entry.trim())
    .find((entry) => entry && entry !== "*") || "";
}

function parseCookies(req) {
  return trimString(req.get("cookie"))
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce((acc, entry) => {
      const separatorIndex = entry.indexOf("=");
      if (separatorIndex === -1) return acc;
      const key = entry.slice(0, separatorIndex).trim();
      const value = entry.slice(separatorIndex + 1).trim();
      if (key) acc[key] = decodeURIComponent(value);
      return acc;
    }, {});
}

function sanitizeReturnTo(value, fallback = "/") {
  const candidate = trimString(value);
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) return fallback;
  if (candidate.startsWith("/api/v1/auth/")) return fallback;
  return candidate;
}

function getOAuthRequestOrigin(req) {
  const forwardedProto = trimString(req.get("x-forwarded-proto")).split(",")[0];
  const forwardedHost = trimString(req.get("x-forwarded-host")).split(",")[0];
  const host = forwardedHost || trimString(req.get("host"));
  const protocol = forwardedProto || req.protocol || "http";
  return host ? `${protocol}://${host}` : firstConfiguredOrigin() || "http://localhost";
}

function getCallbackUrl(req) {
  const configuredRedirectUri = trimString(config.OAUTH_REDIRECT_URI);
  if (configuredRedirectUri) return configuredRedirectUri;
  const configuredOrigin = firstConfiguredOrigin();
  if (configuredOrigin) {
    return new URL("/api/v1/auth/callback", configuredOrigin).toString();
  }
  return new URL("/api/v1/auth/callback", getOAuthRequestOrigin(req)).toString();
}

function makeCodeChallenge(codeVerifier) {
  return crypto.createHash("sha256").update(codeVerifier).digest("base64url");
}

function pruneExpiredEntries(store) {
  const now = Date.now();
  for (const [key, value] of store.entries()) {
    if (Number(value?.expiresAt) <= now) {
      store.delete(key);
    }
  }
}

function getSessionFromRequest(req) {
  if (!isOAuthEnabled()) return null;
  pruneExpiredEntries(oauthSessions);
  const cookies = parseCookies(req);
  const sessionId = trimString(cookies[AUTH_COOKIE_NAME]);
  if (!sessionId) return null;
  const session = oauthSessions.get(sessionId);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    oauthSessions.delete(sessionId);
    return null;
  }
  return session;
}

function decodeJwtPayload(token) {
  const parts = trimString(token).split(".");
  if (parts.length < 2) return null;
  const payload = parts[1]
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(parts[1].length / 4) * 4, "=");

  try {
    return JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function normalizeUserProfile(source) {
  const profile = source && typeof source === "object" ? source : {};
  const email = trimString(profile.email);
  const username = trimString(profile.preferred_username || profile.username || email);
  const displayName =
    trimString(profile.name || profile.display_name || profile.given_name) ||
    username ||
    email ||
    "Authenticated user";

  return {
    subject: trimString(profile.sub || profile.id || ""),
    email,
    username,
    displayName
  };
}

function getSessionUser(tokenResponse, userInfo) {
  if (userInfo) return normalizeUserProfile(userInfo);
  const idTokenPayload = decodeJwtPayload(tokenResponse?.id_token);
  return normalizeUserProfile(idTokenPayload || {});
}

function isSecureCookieEnabled() {
  const configured = trimString(config.OAUTH_COOKIE_SECURE).toLowerCase();
  if (configured) return configured !== "false" && configured !== "0" && configured !== "no";
  return config.NODE_ENV === "production";
}

function setSessionCookie(res, sessionId, expiresAt) {
  res.cookie(AUTH_COOKIE_NAME, sessionId, {
    expires: new Date(expiresAt),
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: isSecureCookieEnabled()
  });
}

function clearSessionCookie(res) {
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: isSecureCookieEnabled()
  });
}

function buildLoginPath(returnTo = "/") {
  const safeReturnTo = sanitizeReturnTo(returnTo, "/");
  const params = new URLSearchParams({ returnTo: safeReturnTo });
  return `/api/v1/auth/login?${params.toString()}`;
}

function extractErrorMessage(payload, fallbackMessage) {
  if (payload && typeof payload === "object") {
    const direct = trimString(payload.error_description || payload.error || payload.message);
    if (direct) return direct;
  }
  return fallbackMessage;
}

async function exchangeAuthorizationCode({ code, codeVerifier, redirectUri }) {
  const form = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: trimString(config.OAUTH_CLIENT_ID),
    code: trimString(code),
    redirect_uri: redirectUri,
    code_verifier: codeVerifier
  });

  const clientSecret = trimString(config.OAUTH_CLIENT_SECRET);
  if (clientSecret) {
    form.set("client_secret", clientSecret);
  }

  const response = await fetch(trimString(config.OAUTH_TOKEN_URL), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: form.toString()
  });

  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = text ? { raw: text } : {};
  }

  if (!response.ok) {
    throw new Error(
      extractErrorMessage(payload, `Token exchange failed with status ${response.status}.`)
    );
  }

  if (!trimString(payload.access_token)) {
    throw new Error("Token response did not include access_token.");
  }

  return payload;
}

async function fetchUserInfo(accessToken) {
  const userInfoUrl = trimString(config.OAUTH_USERINFO_URL);
  if (!userInfoUrl) return null;

  const response = await fetch(userInfoUrl, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`
    }
  });

  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = text ? { raw: text } : {};
  }

  if (!response.ok) {
    throw new Error(
      extractErrorMessage(payload, `User profile request failed with status ${response.status}.`)
    );
  }

  return payload;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderAuthErrorPage({ title, message, returnTo = "/" }) {
  const retryPath = buildLoginPath(returnTo);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: linear-gradient(180deg, #0f172a 0%, #1e293b 100%);
      color: #e2e8f0;
      font-family: "Segoe UI", Arial, sans-serif;
      padding: 1.5rem;
    }
    .card {
      width: min(520px, 100%);
      background: rgba(15, 23, 42, 0.92);
      border: 1px solid rgba(148, 163, 184, 0.25);
      border-radius: 18px;
      padding: 1.35rem;
      box-shadow: 0 24px 48px rgba(2, 6, 23, 0.42);
    }
    h1 {
      margin: 0 0 0.75rem;
      font-size: 1.25rem;
    }
    p {
      margin: 0;
      line-height: 1.55;
      color: #cbd5e1;
    }
    a {
      display: inline-flex;
      margin-top: 1rem;
      color: #f8fafc;
      background: #f59e0b;
      border-radius: 999px;
      padding: 0.72rem 1rem;
      text-decoration: none;
      font-weight: 700;
    }
  </style>
</head>
<body>
  <main class="card">
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
    <a href="${escapeHtml(retryPath)}">Try sign-in again</a>
  </main>
</body>
</html>`;
}

function publicAuthState(req) {
  const session = req.oauth?.session || null;
  return {
    enabled: isOAuthEnabled(),
    providerName: trimString(config.OAUTH_PROVIDER_NAME) || "SSO",
    authenticated: Boolean(session),
    loginPath: "/api/v1/auth/login",
    logoutPath: "/api/v1/auth/logout",
    user: session
      ? {
          displayName: session.user.displayName,
          email: session.user.email,
          username: session.user.username,
          providerName: trimString(config.OAUTH_PROVIDER_NAME) || "SSO"
        }
      : null
  };
}

function isPublicApiPath(pathname) {
  return [
    "/healthz",
    "/statusz",
    "/config",
    "/environment/ingest"
  ].includes(pathname) ||
    pathname === "/docs" ||
    pathname.startsWith("/docs/") ||
    pathname === "/customer-accounts" ||
    pathname.startsWith("/customer-accounts/") ||
    pathname === "/auth" ||
    pathname.startsWith("/auth/") ||
    pathname === "/shopify/collection/fulfill-from-code" ||
    pathname === "/shopify/delivery/complete-from-code";
}

function isRouteManagedApiPath(pathname) {
  return pathname === "/dispatch" || pathname.startsWith("/dispatch/");
}

function isProtectedPageRequest(req) {
  if (!["GET", "HEAD"].includes(String(req.method || "").toUpperCase())) return false;
  const pathname = trimString(req.path || "/");
  if (!pathname || pathname.startsWith("/api/") || pathname.startsWith("/ws/") || pathname === "/__git_update") {
    return false;
  }
  if (pathname === "/deliver") return false;
  const ext = path.extname(pathname).toLowerCase();
  if (ext && ext !== ".html" && ext !== ".htm") return false;
  return true;
}

export function isOAuthEnabled() {
  return Boolean(
    trimString(config.OAUTH_AUTHORIZATION_URL) &&
      trimString(config.OAUTH_TOKEN_URL) &&
      trimString(config.OAUTH_CLIENT_ID)
  );
}

export function attachOAuthSession(req, _res, next) {
  req.oauth = {
    enabled: isOAuthEnabled(),
    session: getSessionFromRequest(req)
  };
  next();
}

export function hasOAuthSession(req) {
  return Boolean(req.oauth?.session);
}

export function getClientOAuthState(req) {
  return publicAuthState(req);
}

export function sendOAuthApiUnauthorized(req, res) {
  return res.status(401).json({
    ok: false,
    error: "AUTH_REQUIRED",
    loginUrl: buildLoginPath(req.originalUrl || req.path || "/"),
    providerName: trimString(config.OAUTH_PROVIDER_NAME) || "SSO"
  });
}

export function requireOAuthApiSession(req, res, next) {
  if (!isOAuthEnabled()) return next();
  const pathname = trimString(req.path || "/");
  if (isPublicApiPath(pathname) || isRouteManagedApiPath(pathname)) return next();
  if (hasOAuthSession(req)) return next();
  return sendOAuthApiUnauthorized(req, res);
}

export function requireOAuthPageSession(req, res, next) {
  if (!isOAuthEnabled()) return next();
  if (!isProtectedPageRequest(req)) return next();
  if (hasOAuthSession(req)) return next();
  return res.redirect(302, buildLoginPath(req.originalUrl || req.path || "/"));
}

export function beginOAuthLogin(req, res) {
  if (!isOAuthEnabled()) {
    return res.status(404).type("text/plain").send("OAuth is not configured.");
  }

  pruneExpiredEntries(pendingOAuthStates);

  const state = crypto.randomBytes(24).toString("base64url");
  const codeVerifier = crypto.randomBytes(48).toString("base64url");
  const codeChallenge = makeCodeChallenge(codeVerifier);
  const redirectUri = getCallbackUrl(req);
  const returnTo = sanitizeReturnTo(req.query?.returnTo, "/");

  pendingOAuthStates.set(state, {
    codeVerifier,
    expiresAt: Date.now() + LOGIN_STATE_TTL_MS,
    redirectUri,
    returnTo
  });

  const authorizeUrl = new URL(trimString(config.OAUTH_AUTHORIZATION_URL));
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", trimString(config.OAUTH_CLIENT_ID));
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("scope", trimString(config.OAUTH_SCOPE));
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge", codeChallenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");

  return res.redirect(302, authorizeUrl.toString());
}

export async function completeOAuthLogin(req, res) {
  if (!isOAuthEnabled()) {
    return res.status(404).type("text/plain").send("OAuth is not configured.");
  }

  pruneExpiredEntries(pendingOAuthStates);

  const state = trimString(req.query?.state);
  const code = trimString(req.query?.code);
  const oauthError = trimString(req.query?.error);
  const errorDescription = trimString(req.query?.error_description);
  const pendingState = pendingOAuthStates.get(state);
  const fallbackReturnTo = pendingState?.returnTo || "/";

  if (oauthError) {
    if (pendingState) pendingOAuthStates.delete(state);
    return res
      .status(400)
      .type("html")
      .send(
        renderAuthErrorPage({
          title: "Sign-in failed",
          message: errorDescription || oauthError,
          returnTo: fallbackReturnTo
        })
      );
  }

  if (!state || !pendingState) {
    return res
      .status(400)
      .type("html")
      .send(
        renderAuthErrorPage({
          title: "Session expired",
          message: "The sign-in request is no longer valid. Start the login flow again.",
          returnTo: "/"
        })
      );
  }

  pendingOAuthStates.delete(state);

  if (!code) {
    return res
      .status(400)
      .type("html")
      .send(
        renderAuthErrorPage({
          title: "Missing code",
          message: "The identity provider did not return an authorization code.",
          returnTo: pendingState.returnTo
        })
      );
  }

  try {
    const tokenResponse = await exchangeAuthorizationCode({
      code,
      codeVerifier: pendingState.codeVerifier,
      redirectUri: pendingState.redirectUri
    });

    let userInfo = null;
    try {
      userInfo = await fetchUserInfo(tokenResponse.access_token);
    } catch (error) {
      if (config.NODE_ENV !== "production") {
        console.warn("OAuth user profile lookup failed:", error.message);
      }
    }

    pruneExpiredEntries(oauthSessions);

    const sessionId = crypto.randomBytes(32).toString("base64url");
    const expiresAt = Date.now() + Number(config.OAUTH_SESSION_TTL_MS || 0);
    oauthSessions.set(sessionId, {
      accessToken: tokenResponse.access_token,
      createdAt: Date.now(),
      expiresAt,
      scope: trimString(tokenResponse.scope || config.OAUTH_SCOPE),
      tokenType: trimString(tokenResponse.token_type || "Bearer"),
      user: getSessionUser(tokenResponse, userInfo)
    });

    setSessionCookie(res, sessionId, expiresAt);
    return res.redirect(302, pendingState.returnTo || "/");
  } catch (error) {
    return res
      .status(502)
      .type("html")
      .send(
        renderAuthErrorPage({
          title: "Unable to complete sign-in",
          message: error.message || "OAuth callback handling failed.",
          returnTo: pendingState.returnTo
        })
      );
  }
}

export function logoutOAuthSession(req, res) {
  const sessionId = trimString(parseCookies(req)[AUTH_COOKIE_NAME]);
  if (sessionId) oauthSessions.delete(sessionId);
  clearSessionCookie(res);

  const returnTo = sanitizeReturnTo(req.query?.returnTo || req.body?.returnTo, "/");
  if (String(req.method || "").toUpperCase() === "POST") {
    return res.json({ ok: true, returnTo });
  }
  return res.redirect(302, returnTo);
}
