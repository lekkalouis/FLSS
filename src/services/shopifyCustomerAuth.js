import crypto from "crypto";
import { webcrypto } from "crypto";

import fetch from "node-fetch";
import { createRemoteJWKSet, jwtVerify } from "jose";

import { config } from "../config.js";

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

const AUTH_COOKIE_NAME = "flss_customer_session";
const PROVIDER_NAME = "Shopify Customer Account";
const LOGIN_STATE_TTL_MS = 10 * 60 * 1000;
const DISCOVERY_TTL_MS = 5 * 60 * 1000;
const customerSessions = new Map();
const pendingStates = new Map();
const discoveryCache = new Map();
const jwksCache = new Map();

function trimString(value) {
  return String(value || "").trim();
}

function getCustomerAccountBaseUrl() {
  const raw = trimString(config.SHOPIFY_CUSTOMER_ACCOUNT_DOMAIN);
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) {
    return raw.replace(/\/+$/, "");
  }
  return `https://${raw.replace(/\/+$/, "")}`;
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

function sanitizeReturnTo(value, fallback = "/portal") {
  const candidate = trimString(value);
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) return fallback;
  if (candidate.startsWith("/api/v1/auth/")) return fallback;
  return candidate;
}

function pruneExpiredEntries(store) {
  const now = Date.now();
  for (const [key, value] of store.entries()) {
    if (Number(value?.expiresAt) <= now) {
      store.delete(key);
    }
  }
}

function normalizeUserProfile(source) {
  const profile = source && typeof source === "object" ? source : {};
  const email = trimString(profile.email);
  const username = trimString(profile.preferred_username || profile.username || email || profile.sub);
  const firstName = trimString(profile.given_name || profile.first_name);
  const lastName = trimString(profile.family_name || profile.last_name);
  const displayName =
    trimString(profile.name) ||
    [firstName, lastName].filter(Boolean).join(" ") ||
    username ||
    email ||
    "Authenticated customer";

  return {
    subject: trimString(profile.sub || ""),
    email,
    username,
    displayName,
    firstName,
    lastName
  };
}

function isSecureCookieEnabled() {
  const configured = trimString(config.SHOPIFY_CUSTOMER_ACCOUNT_COOKIE_SECURE).toLowerCase();
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

function buildLoginPath(returnTo = "/portal") {
  const safeReturnTo = sanitizeReturnTo(returnTo, "/portal");
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

function getPortalSessionFromRequest(req) {
  if (!isShopifyCustomerAuthEnabled()) return null;
  pruneExpiredEntries(customerSessions);
  const cookies = parseCookies(req);
  const sessionId = trimString(cookies[AUTH_COOKIE_NAME]);
  if (!sessionId) return null;
  const session = customerSessions.get(sessionId);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    customerSessions.delete(sessionId);
    return null;
  }
  return session;
}

async function fetchDiscoveryDocument() {
  const baseUrl = getCustomerAccountBaseUrl();
  if (!baseUrl) {
    throw new Error("Shopify customer account domain is not configured.");
  }

  const cached = discoveryCache.get(baseUrl);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.document;
  }

  const discoveryUrl = new URL("/.well-known/openid-configuration", `${baseUrl}/`).toString();
  const response = await fetch(discoveryUrl, {
    method: "GET",
    headers: { Accept: "application/json" }
  });
  const text = await response.text();

  let document = {};
  try {
    document = text ? JSON.parse(text) : {};
  } catch {
    document = {};
  }

  if (!response.ok) {
    throw new Error(`Customer account discovery failed with status ${response.status}.`);
  }

  if (
    !trimString(document.authorization_endpoint) ||
    !trimString(document.token_endpoint) ||
    !trimString(document.jwks_uri) ||
    !trimString(document.issuer)
  ) {
    throw new Error("Customer account discovery response is missing required endpoints.");
  }

  discoveryCache.set(baseUrl, {
    document,
    expiresAt: Date.now() + DISCOVERY_TTL_MS
  });

  return document;
}

function getJwks(discoveryDocument) {
  const jwksUri = trimString(discoveryDocument?.jwks_uri);
  if (!jwksUri) {
    throw new Error("Customer account discovery response is missing jwks_uri.");
  }

  let jwks = jwksCache.get(jwksUri);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(jwksUri));
    jwksCache.set(jwksUri, jwks);
  }
  return jwks;
}

async function exchangeAuthorizationCode(discoveryDocument, code) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: trimString(config.SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID),
    client_secret: trimString(config.SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_SECRET),
    redirect_uri: trimString(config.SHOPIFY_CUSTOMER_ACCOUNT_REDIRECT_URI),
    code: trimString(code)
  });

  const response = await fetch(trimString(discoveryDocument.token_endpoint), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: body.toString()
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

  if (!trimString(payload.id_token) || !trimString(payload.access_token)) {
    throw new Error("Token response did not include required customer account tokens.");
  }

  return payload;
}

async function verifyIdToken(discoveryDocument, idToken, expectedNonce) {
  const jwks = getJwks(discoveryDocument);
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: trimString(discoveryDocument.issuer),
    audience: trimString(config.SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID)
  });

  if (trimString(payload.nonce) !== trimString(expectedNonce)) {
    throw new Error("Customer account nonce validation failed.");
  }

  return payload;
}

function getSessionExpiryMs(tokenResponse, claims) {
  const now = Date.now();
  const configuredTtlMs = Number(config.SHOPIFY_CUSTOMER_ACCOUNT_SESSION_TTL_MS || 0);
  const configuredExpiryMs = now + Math.max(60_000, configuredTtlMs || 8 * 60 * 60 * 1000);
  const tokenExpiryMs =
    Number.isFinite(Number(claims?.exp)) && Number(claims.exp) > 0 ? Number(claims.exp) * 1000 : Infinity;
  const accessTokenExpiryMs =
    Number.isFinite(Number(tokenResponse?.expires_in)) && Number(tokenResponse.expires_in) > 0
      ? now + Number(tokenResponse.expires_in) * 1000
      : Infinity;

  return Math.min(configuredExpiryMs, tokenExpiryMs, accessTokenExpiryMs);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderMessagePage({ title, message, actionHref = "", actionLabel = "" }) {
  const actionMarkup =
    actionHref && actionLabel
      ? `<a href="${escapeHtml(actionHref)}">${escapeHtml(actionLabel)}</a>`
      : "";
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
      background: linear-gradient(180deg, #11243d 0%, #07111f 100%);
      color: #e7edf4;
      font-family: "Segoe UI", Arial, sans-serif;
      padding: 1.5rem;
    }
    .card {
      width: min(560px, 100%);
      background: rgba(7, 17, 31, 0.9);
      border: 1px solid rgba(148, 163, 184, 0.25);
      border-radius: 18px;
      padding: 1.4rem;
      box-shadow: 0 24px 48px rgba(2, 6, 23, 0.42);
    }
    h1 {
      margin: 0 0 0.75rem;
      font-size: 1.3rem;
    }
    p {
      margin: 0;
      line-height: 1.55;
      color: #c5d1dc;
    }
    a {
      display: inline-flex;
      margin-top: 1rem;
      color: #08111d;
      background: #f4c95d;
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
    ${actionMarkup}
  </main>
</body>
</html>`;
}

function publicAuthState(req) {
  const session = req.shopifyCustomerAuth?.session || null;
  return {
    enabled: isShopifyCustomerAuthEnabled(),
    providerName: PROVIDER_NAME,
    authenticated: Boolean(session),
    loginPath: "/api/v1/auth/login",
    logoutPath: "/api/v1/auth/logout",
    user: session
      ? {
          displayName: session.user.displayName,
          email: session.user.email,
          username: session.user.username,
          firstName: session.user.firstName,
          lastName: session.user.lastName,
          providerName: PROVIDER_NAME
        }
      : null
  };
}

export function isShopifyCustomerAuthEnabled() {
  return Boolean(
    getCustomerAccountBaseUrl() &&
      trimString(config.SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID) &&
      trimString(config.SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_SECRET) &&
      trimString(config.SHOPIFY_CUSTOMER_ACCOUNT_REDIRECT_URI)
  );
}

export function attachShopifyCustomerSession(req, _res, next) {
  req.shopifyCustomerAuth = {
    enabled: isShopifyCustomerAuthEnabled(),
    session: getPortalSessionFromRequest(req)
  };
  next();
}

export function hasShopifyCustomerSession(req) {
  return Boolean(req.shopifyCustomerAuth?.session);
}

export function getShopifyCustomerAuthState(req) {
  return publicAuthState(req);
}

export function buildShopifyCustomerLoginPath(returnTo = "/portal") {
  return buildLoginPath(returnTo);
}

export function renderPortalUnavailablePage() {
  return renderMessagePage({
    title: "Portal unavailable",
    message:
      "Shopify customer account login is not configured. Set the SHOPIFY_CUSTOMER_ACCOUNT_* environment variables before using /portal."
  });
}

export async function beginShopifyCustomerLogin(req, res) {
  if (!isShopifyCustomerAuthEnabled()) {
    return res.status(503).type("html").send(renderPortalUnavailablePage());
  }

  const discoveryDocument = await fetchDiscoveryDocument();
  pruneExpiredEntries(pendingStates);

  const state = crypto.randomBytes(24).toString("base64url");
  const nonce = crypto.randomBytes(24).toString("base64url");
  const returnTo = sanitizeReturnTo(req.query?.returnTo, "/portal");

  pendingStates.set(state, {
    nonce,
    returnTo,
    expiresAt: Date.now() + LOGIN_STATE_TTL_MS
  });

  const authorizeUrl = new URL(trimString(discoveryDocument.authorization_endpoint));
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", trimString(config.SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID));
  authorizeUrl.searchParams.set("redirect_uri", trimString(config.SHOPIFY_CUSTOMER_ACCOUNT_REDIRECT_URI));
  authorizeUrl.searchParams.set(
    "scope",
    trimString(config.SHOPIFY_CUSTOMER_ACCOUNT_SCOPES || "openid email customer-account-api:full")
  );
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("nonce", nonce);

  return res.redirect(302, authorizeUrl.toString());
}

export async function completeShopifyCustomerLogin(req, res) {
  if (!isShopifyCustomerAuthEnabled()) {
    return res.status(503).type("html").send(renderPortalUnavailablePage());
  }

  pruneExpiredEntries(pendingStates);

  const state = trimString(req.query?.state);
  const code = trimString(req.query?.code);
  const oauthError = trimString(req.query?.error);
  const errorDescription = trimString(req.query?.error_description);
  const pendingState = pendingStates.get(state);
  const fallbackReturnTo = pendingState?.returnTo || "/portal";

  if (oauthError) {
    if (pendingState) pendingStates.delete(state);
    return res
      .status(400)
      .type("html")
      .send(
        renderMessagePage({
          title: "Sign-in failed",
          message: errorDescription || oauthError,
          actionHref: buildLoginPath(fallbackReturnTo),
          actionLabel: "Try sign-in again"
        })
      );
  }

  if (!state || !pendingState) {
    return res
      .status(400)
      .type("html")
      .send(
        renderMessagePage({
          title: "Session expired",
          message: "The sign-in request is no longer valid. Start the login flow again.",
          actionHref: buildLoginPath("/portal"),
          actionLabel: "Restart sign-in"
        })
      );
  }

  pendingStates.delete(state);

  if (!code) {
    return res
      .status(400)
      .type("html")
      .send(
        renderMessagePage({
          title: "Missing code",
          message: "Shopify did not return an authorization code.",
          actionHref: buildLoginPath(pendingState.returnTo),
          actionLabel: "Try sign-in again"
        })
      );
  }

  try {
    const discoveryDocument = await fetchDiscoveryDocument();
    const tokenResponse = await exchangeAuthorizationCode(discoveryDocument, code);
    const claims = await verifyIdToken(discoveryDocument, tokenResponse.id_token, pendingState.nonce);
    const sessionId = crypto.randomBytes(32).toString("base64url");
    const expiresAt = getSessionExpiryMs(tokenResponse, claims);

    pruneExpiredEntries(customerSessions);
    customerSessions.set(sessionId, {
      idToken: tokenResponse.id_token,
      accessToken: tokenResponse.access_token,
      refreshToken: trimString(tokenResponse.refresh_token) || null,
      tokenType: trimString(tokenResponse.token_type || "Bearer"),
      scope: trimString(tokenResponse.scope || config.SHOPIFY_CUSTOMER_ACCOUNT_SCOPES),
      createdAt: Date.now(),
      expiresAt,
      claims,
      user: normalizeUserProfile(claims)
    });

    setSessionCookie(res, sessionId, expiresAt);
    return res.redirect(302, pendingState.returnTo || "/portal");
  } catch (error) {
    return res
      .status(502)
      .type("html")
      .send(
        renderMessagePage({
          title: "Unable to complete sign-in",
          message: error.message || "Customer account callback handling failed.",
          actionHref: buildLoginPath(pendingState.returnTo),
          actionLabel: "Try sign-in again"
        })
      );
  }
}

export async function logoutShopifyCustomerSession(req, res) {
  const cookies = parseCookies(req);
  const sessionId = trimString(cookies[AUTH_COOKIE_NAME]);
  const session = sessionId ? customerSessions.get(sessionId) : null;
  const returnTo = sanitizeReturnTo(req.query?.returnTo || req.body?.returnTo, "/portal");

  if (sessionId) customerSessions.delete(sessionId);
  clearSessionCookie(res);

  let redirectTo = returnTo;
  if (isShopifyCustomerAuthEnabled()) {
    try {
      const discoveryDocument = await fetchDiscoveryDocument();
      const endSessionEndpoint = trimString(discoveryDocument.end_session_endpoint);
      if (endSessionEndpoint) {
        const logoutUrl = new URL(endSessionEndpoint);
        if (trimString(session?.idToken)) {
          logoutUrl.searchParams.set("id_token_hint", session.idToken);
        }
        const postLogoutRedirectUri =
          trimString(config.SHOPIFY_CUSTOMER_ACCOUNT_POST_LOGOUT_REDIRECT_URI) || "";
        if (postLogoutRedirectUri) {
          logoutUrl.searchParams.set("post_logout_redirect_uri", postLogoutRedirectUri);
        }
        redirectTo = logoutUrl.toString();
      }
    } catch {
      redirectTo = returnTo;
    }
  }

  return res.redirect(302, redirectTo);
}
