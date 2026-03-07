import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { webcrypto } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SignJWT, exportJWK, generateKeyPair } from "jose";

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function withEnv(overrides) {
  const previous = new Map();
  Object.entries(overrides).forEach(([key, value]) => {
    previous.set(key, process.env[key]);
    if (value == null) {
      delete process.env[key];
    } else {
      process.env[key] = String(value);
    }
  });

  return () => {
    previous.forEach((value, key) => {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
  };
}

async function closeServer(server) {
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
}

function extractSessionCookie(response) {
  const rawCookie = response.headers.get("set-cookie") || "";
  return rawCookie.split(";")[0];
}

async function startCustomerAccountProvider({ clientId }) {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const publicJwk = await exportJWK(publicKey);
  publicJwk.alg = "RS256";
  publicJwk.use = "sig";
  publicJwk.kid = "shopify-customer-test";

  const seen = {
    tokenBodies: [],
    logoutQueries: []
  };

  const state = {
    expectedNonce: ""
  };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");

    if (req.method === "GET" && url.pathname === "/.well-known/openid-configuration") {
      const origin = `http://127.0.0.1:${server.address().port}`;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          issuer: origin,
          authorization_endpoint: `${origin}/authorize`,
          token_endpoint: `${origin}/token`,
          jwks_uri: `${origin}/jwks`,
          end_session_endpoint: `${origin}/logout`
        })
      );
      return;
    }

    if (req.method === "GET" && url.pathname === "/authorize") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("authorize");
      return;
    }

    if (req.method === "GET" && url.pathname === "/jwks") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ keys: [publicJwk] }));
      return;
    }

    if (req.method === "GET" && url.pathname === "/logout") {
      seen.logoutQueries.push(url.searchParams.toString());
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("logged out");
      return;
    }

    if (req.method === "POST" && url.pathname === "/token") {
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", async () => {
        seen.tokenBodies.push(Buffer.concat(chunks).toString("utf8"));
        const origin = `http://127.0.0.1:${server.address().port}`;
        const idToken = await new SignJWT({
          email: "customer@example.com",
          name: "Casey Customer",
          given_name: "Casey",
          family_name: "Customer",
          nonce: state.expectedNonce
        })
          .setProtectedHeader({ alg: "RS256", kid: publicJwk.kid })
          .setIssuer(origin)
          .setAudience(clientId)
          .setSubject("gid://shopify/Customer/123")
          .setIssuedAt()
          .setExpirationTime("1h")
          .sign(privateKey);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            access_token: "customer-access-token",
            refresh_token: "customer-refresh-token",
            expires_in: 3600,
            token_type: "Bearer",
            scope: "openid email customer-account-api:full",
            id_token: idToken
          })
        );
      });
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();

  return {
    seen,
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
    setExpectedNonce(nonce) {
      state.expectedNonce = String(nonce || "");
    }
  };
}

async function startApp(overrides) {
  const restoreEnv = withEnv(overrides);
  const mod = await import(`../src/app.js?shopify-customer-auth=${Date.now()}-${Math.random()}`);
  const { app } = mod.createApp();
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();

  return {
    server,
    restoreEnv,
    baseUrl: `http://127.0.0.1:${address.port}`
  };
}

test("shopify customer auth protects /portal, completes login, and clears the session on logout", async () => {
  const clientId = "shopify-customer-client";
  const provider = await startCustomerAccountProvider({ clientId });
  const appServer = await startApp({
    FRONTEND_ORIGIN: "",
    LOCAL_DB_PATH: path.join(__dirname, "..", "data", "test-shopify-customer-auth.sqlite"),
    SHOPIFY_CUSTOMER_ACCOUNT_DOMAIN: provider.baseUrl,
    SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID: clientId,
    SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_SECRET: "shopify-customer-secret",
    SHOPIFY_CUSTOMER_ACCOUNT_REDIRECT_URI: "http://127.0.0.1/callback",
    SHOPIFY_CUSTOMER_ACCOUNT_POST_LOGOUT_REDIRECT_URI: "http://127.0.0.1/post-logout",
    SHOPIFY_CUSTOMER_ACCOUNT_COOKIE_SECURE: "false"
  });

  try {
    const unavailableCustomerAccountsResponse = await fetch(`${appServer.baseUrl}/api/v1/customer-accounts/login`, {
      redirect: "manual"
    });
    assert.equal(unavailableCustomerAccountsResponse.status, 404);
    unavailableCustomerAccountsResponse.body?.cancel();

    const unauthPortalResponse = await fetch(`${appServer.baseUrl}/portal`, { redirect: "manual" });
    assert.equal(unauthPortalResponse.status, 302);
    const loginPath = new URL(unauthPortalResponse.headers.get("location") || "", appServer.baseUrl);
    assert.equal(loginPath.pathname, "/api/v1/auth/login");
    assert.equal(loginPath.searchParams.get("returnTo"), "/portal");
    unauthPortalResponse.body?.cancel();

    const authStateBeforeLogin = await fetch(`${appServer.baseUrl}/api/v1/auth/session`);
    assert.equal(authStateBeforeLogin.status, 200);
    const authStateBeforeLoginBody = await authStateBeforeLogin.json();
    assert.equal(authStateBeforeLoginBody.auth.enabled, true);
    assert.equal(authStateBeforeLoginBody.auth.authenticated, false);

    const loginResponse = await fetch(`${appServer.baseUrl}/api/v1/auth/login?returnTo=/portal`, {
      redirect: "manual"
    });
    assert.equal(loginResponse.status, 302);
    const authorizeUrl = new URL(loginResponse.headers.get("location") || "");
    assert.equal(authorizeUrl.origin, provider.baseUrl);
    assert.equal(authorizeUrl.pathname, "/authorize");
    assert.equal(authorizeUrl.searchParams.get("client_id"), clientId);
    assert.equal(authorizeUrl.searchParams.get("redirect_uri"), "http://127.0.0.1/callback");
    assert.equal(
      authorizeUrl.searchParams.get("scope"),
      "openid email customer-account-api:full"
    );
    assert.ok(authorizeUrl.searchParams.get("state"));
    assert.ok(authorizeUrl.searchParams.get("nonce"));
    provider.setExpectedNonce(authorizeUrl.searchParams.get("nonce"));
    loginResponse.body?.cancel();

    const callbackResponse = await fetch(
      `${appServer.baseUrl}/api/v1/auth/callback?code=test-code&state=${encodeURIComponent(authorizeUrl.searchParams.get("state") || "")}`,
      { redirect: "manual" }
    );
    assert.equal(callbackResponse.status, 302);
    assert.equal(callbackResponse.headers.get("location"), "/portal");
    const sessionCookie = extractSessionCookie(callbackResponse);
    assert.match(sessionCookie, /^flss_customer_session=/);
    callbackResponse.body?.cancel();

    assert.ok(provider.seen.tokenBodies.length >= 1);
    const latestTokenBody = provider.seen.tokenBodies.at(-1) || "";
    assert.match(latestTokenBody, /grant_type=authorization_code/);
    assert.match(latestTokenBody, /client_id=shopify-customer-client/);
    assert.match(latestTokenBody, /client_secret=shopify-customer-secret/);
    assert.match(latestTokenBody, /code=test-code/);

    const portalResponse = await fetch(`${appServer.baseUrl}/portal`, {
      headers: { Cookie: sessionCookie }
    });
    assert.equal(portalResponse.status, 200);
    const portalHtml = await portalResponse.text();
    assert.match(portalHtml, /FLSS Customer Portal/);

    const authStateAfterLogin = await fetch(`${appServer.baseUrl}/api/v1/auth/session`, {
      headers: { Cookie: sessionCookie }
    });
    assert.equal(authStateAfterLogin.status, 200);
    const authStateAfterLoginBody = await authStateAfterLogin.json();
    assert.equal(authStateAfterLoginBody.auth.authenticated, true);
    assert.equal(authStateAfterLoginBody.auth.providerName, "Shopify Customer Account");
    assert.equal(authStateAfterLoginBody.auth.user.displayName, "Casey Customer");
    assert.equal(authStateAfterLoginBody.auth.user.email, "customer@example.com");

    const logoutResponse = await fetch(`${appServer.baseUrl}/api/v1/auth/logout`, {
      headers: { Cookie: sessionCookie },
      redirect: "manual"
    });
    assert.equal(logoutResponse.status, 302);
    const logoutUrl = new URL(logoutResponse.headers.get("location") || "");
    assert.equal(logoutUrl.origin, provider.baseUrl);
    assert.equal(logoutUrl.pathname, "/logout");
    assert.equal(logoutUrl.searchParams.get("post_logout_redirect_uri"), "http://127.0.0.1/post-logout");
    assert.ok(logoutUrl.searchParams.get("id_token_hint"));
    assert.match(String(logoutResponse.headers.get("set-cookie") || ""), /^flss_customer_session=/);
    logoutResponse.body?.cancel();

    const authStateAfterLogout = await fetch(`${appServer.baseUrl}/api/v1/auth/session`, {
      headers: { Cookie: sessionCookie }
    });
    assert.equal(authStateAfterLogout.status, 200);
    const authStateAfterLogoutBody = await authStateAfterLogout.json();
    assert.equal(authStateAfterLogoutBody.auth.authenticated, false);
  } finally {
    appServer.restoreEnv();
    await closeServer(appServer.server);
    await closeServer(provider.server);
  }
});
