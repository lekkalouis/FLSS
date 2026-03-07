import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

async function startOAuthProvider() {
  const seen = {
    tokenBodies: [],
    userInfoTokens: []
  };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");

    if (req.method === "GET" && url.pathname === "/authorize") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("authorize");
      return;
    }

    if (req.method === "POST" && url.pathname === "/token") {
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => {
        seen.tokenBodies.push(Buffer.concat(chunks).toString("utf8"));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            access_token: "provider-access-token",
            expires_in: 3600,
            id_token:
              "eyJhbGciOiJub25lIn0.eyJuYW1lIjoiRGlzcGF0Y2ggT3BzIiwiZW1haWwiOiJvcHNAZmxpcHBlbmxla2thLmNvLnphIiwicHJlZmVycmVkX3VzZXJuYW1lIjoib3BzIn0.",
            scope: "openid profile email",
            token_type: "Bearer"
          })
        );
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/userinfo") {
      seen.userInfoTokens.push(String(req.headers.authorization || ""));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          email: "ops@flippenlekka.co.za",
          name: "Dispatch Ops",
          preferred_username: "ops"
        })
      );
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
    baseUrl: `http://127.0.0.1:${address.port}`
  };
}

async function startOAuthApp(overrides) {
  const restoreEnv = withEnv(overrides);
  const mod = await import(`../src/app.js?oauth=${Date.now()}-${Math.random()}`);
  const { app } = mod.createApp();
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    restoreEnv,
    server
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

test("oauth protects the app, completes the code flow, and preserves bearer-token telemetry access", async () => {
  const provider = await startOAuthProvider();
  const rotaryToken = "oauth-rotary-token";
  const appServer = await startOAuthApp({
    FRONTEND_ORIGIN: "",
    LOCAL_DB_PATH: path.join(__dirname, "..", "data", "test-oauth.sqlite"),
    OAUTH_AUTHORIZATION_URL: `${provider.baseUrl}/authorize`,
    OAUTH_CLIENT_ID: "flss-test-client",
    OAUTH_CLIENT_SECRET: "flss-test-secret",
    OAUTH_COOKIE_SECURE: "false",
    OAUTH_PROVIDER_NAME: "Test SSO",
    OAUTH_REDIRECT_URI: "",
    OAUTH_SCOPE: "openid profile email",
    OAUTH_TOKEN_URL: `${provider.baseUrl}/token`,
    OAUTH_USERINFO_URL: `${provider.baseUrl}/userinfo`,
    ROTARY_TOKEN: rotaryToken
  });

  try {
    const pageResponse = await fetch(`${appServer.baseUrl}/`, { redirect: "manual" });
    assert.equal(pageResponse.status, 302);
    const localLoginUrl = new URL(pageResponse.headers.get("location") || "", appServer.baseUrl);
    pageResponse.body?.cancel();
    assert.equal(localLoginUrl.pathname, "/api/v1/auth/login");

    const providerRedirectResponse = await fetch(localLoginUrl, { redirect: "manual" });
    assert.equal(providerRedirectResponse.status, 302);
    const providerUrl = new URL(providerRedirectResponse.headers.get("location") || "");
    providerRedirectResponse.body?.cancel();
    assert.equal(providerUrl.origin, provider.baseUrl);
    assert.equal(providerUrl.pathname, "/authorize");
    assert.equal(providerUrl.searchParams.get("client_id"), "flss-test-client");
    assert.equal(providerUrl.searchParams.get("scope"), "openid profile email");
    assert.equal(providerUrl.searchParams.get("code_challenge_method"), "S256");

    const protectedApiResponse = await fetch(`${appServer.baseUrl}/api/v1/controller/status`);
    assert.equal(protectedApiResponse.status, 401);
    const protectedApiBody = await protectedApiResponse.json();
    assert.equal(protectedApiBody.error, "AUTH_REQUIRED");
    assert.match(String(protectedApiBody.loginUrl || ""), /^\/api\/v1\/auth\/login\?/);

    const publicDeliverResponse = await fetch(`${appServer.baseUrl}/deliver`, { redirect: "manual" });
    assert.equal(publicDeliverResponse.status, 200);
    publicDeliverResponse.body?.cancel();

    const loginResponse = await fetch(`${appServer.baseUrl}/api/v1/auth/login?returnTo=/stock`, {
      redirect: "manual"
    });
    assert.equal(loginResponse.status, 302);
    const authorizeUrl = new URL(loginResponse.headers.get("location") || "");
    loginResponse.body?.cancel();
    const state = String(authorizeUrl.searchParams.get("state") || "");
    assert.ok(state);

    const callbackResponse = await fetch(
      `${appServer.baseUrl}/api/v1/auth/callback?code=test-auth-code&state=${encodeURIComponent(state)}`,
      { redirect: "manual" }
    );
    assert.equal(callbackResponse.status, 302);
    assert.equal(callbackResponse.headers.get("location"), "/stock");

    const sessionCookie = extractSessionCookie(callbackResponse);
    assert.match(sessionCookie, /^flss_oauth_session=/);
    callbackResponse.body?.cancel();

    assert.equal(provider.seen.userInfoTokens.at(-1), "Bearer provider-access-token");
    assert.ok(provider.seen.tokenBodies.length >= 1);
    const latestTokenBody = provider.seen.tokenBodies.at(-1) || "";
    assert.match(latestTokenBody, /grant_type=authorization_code/);
    assert.match(latestTokenBody, /code=test-auth-code/);
    assert.match(latestTokenBody, /code_verifier=/);

    const authedStatusResponse = await fetch(`${appServer.baseUrl}/api/v1/controller/status`, {
      headers: { Cookie: sessionCookie }
    });
    assert.equal(authedStatusResponse.status, 200);

    const configResponse = await fetch(`${appServer.baseUrl}/api/v1/config`, {
      headers: { Cookie: sessionCookie }
    });
    assert.equal(configResponse.status, 200);
    const configBody = await configResponse.json();
    assert.equal(configBody.AUTH.enabled, true);
    assert.equal(configBody.AUTH.authenticated, true);
    assert.equal(configBody.AUTH.user.displayName, "Dispatch Ops");

    const telemetryDeniedResponse = await fetch(`${appServer.baseUrl}/api/v1/environment/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ temperatureC: 23.4, humidityPct: 51.1, stationId: "oauth-station" })
    });
    assert.equal(telemetryDeniedResponse.status, 401);
    await telemetryDeniedResponse.text();

    const telemetryResponse = await fetch(`${appServer.baseUrl}/api/v1/environment/ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${rotaryToken}`
      },
      body: JSON.stringify({ temperatureC: 23.4, humidityPct: 51.1, stationId: "oauth-station" })
    });
    assert.equal(telemetryResponse.status, 200);
    await telemetryResponse.text();
  } finally {
    appServer.restoreEnv();
    await closeServer(appServer.server);
    await closeServer(provider.server);
  }
});
