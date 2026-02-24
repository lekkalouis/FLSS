import { Router } from "express";

import { config } from "../config.js";
import { storefrontFetch } from "../services/shopifyCustomerAuth.js";

const router = Router();

const CUSTOMER_AUTH_COOKIE = "flss_customer_token";

function requireCustomerAuthConfigured(res) {
  if (!config.SHOPIFY_STORE || !config.SHOPIFY_STOREFRONT_ACCESS_TOKEN) {
    res.status(501).json({
      error: "SHOPIFY_CUSTOMER_AUTH_NOT_CONFIGURED",
      message:
        "Set SHOPIFY_STORE and SHOPIFY_STOREFRONT_ACCESS_TOKEN in .env to enable customer login."
    });
    return false;
  }
  return true;
}

function parseCookies(req) {
  const header = String(req.headers.cookie || "");
  return header
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, pair) => {
      const idx = pair.indexOf("=");
      if (idx <= 0) return acc;
      const key = decodeURIComponent(pair.slice(0, idx));
      const value = decodeURIComponent(pair.slice(idx + 1));
      acc[key] = value;
      return acc;
    }, {});
}

function getCustomerToken(req) {
  const authHeader = String(req.headers.authorization || "").trim();
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }
  const cookies = parseCookies(req);
  return String(cookies[CUSTOMER_AUTH_COOKIE] || "").trim();
}

function setCustomerCookie(res, token, expiresAt) {
  const expiresMs = Date.parse(expiresAt);
  const maxAgeSec = Number.isFinite(expiresMs)
    ? Math.max(0, Math.floor((expiresMs - Date.now()) / 1000))
    : 60 * 60 * 24 * 7;
  const cookieParts = [
    `${CUSTOMER_AUTH_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSec}`
  ];
  if (config.NODE_ENV === "production") cookieParts.push("Secure");
  res.setHeader("Set-Cookie", cookieParts.join("; "));
}

function clearCustomerCookie(res) {
  const cookieParts = [
    `${CUSTOMER_AUTH_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0"
  ];
  if (config.NODE_ENV === "production") cookieParts.push("Secure");
  res.setHeader("Set-Cookie", cookieParts.join("; "));
}

async function fetchCustomerProfile(customerAccessToken) {
  const query = `#graphql
    query GetCustomer($customerAccessToken: String!) {
      customer(customerAccessToken: $customerAccessToken) {
        id
        firstName
        lastName
        email
        phone
        tags
      }
    }
  `;

  const upstream = await storefrontFetch({ query, variables: { customerAccessToken } });
  const body = await upstream.json().catch(() => ({}));

  if (!upstream.ok) {
    return {
      ok: false,
      status: upstream.status,
      payload: {
        error: "SHOPIFY_STOREFRONT_FAILED",
        details: body
      }
    };
  }

  if (Array.isArray(body?.errors) && body.errors.length) {
    return {
      ok: false,
      status: 502,
      payload: {
        error: "SHOPIFY_STOREFRONT_GRAPHQL_ERROR",
        details: body.errors
      }
    };
  }

  if (!body?.data?.customer) {
    return {
      ok: false,
      status: 401,
      payload: {
        error: "CUSTOMER_NOT_AUTHENTICATED"
      }
    };
  }

  return { ok: true, customer: body.data.customer };
}

router.post("/customer-auth/login", async (req, res) => {
  if (!requireCustomerAuthConfigured(res)) return;

  const email = String(req.body?.email || "").trim();
  const password = String(req.body?.password || "");
  if (!email || !password) {
    res.status(400).json({ error: "MISSING_EMAIL_OR_PASSWORD" });
    return;
  }

  const mutation = `#graphql
    mutation CustomerAccessTokenCreate($input: CustomerAccessTokenCreateInput!) {
      customerAccessTokenCreate(input: $input) {
        customerAccessToken {
          accessToken
          expiresAt
        }
        customerUserErrors {
          code
          field
          message
        }
      }
    }
  `;

  try {
    const upstream = await storefrontFetch({
      query: mutation,
      variables: { input: { email, password } }
    });
    const body = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      res.status(upstream.status).json({
        error: "SHOPIFY_STOREFRONT_FAILED",
        details: body
      });
      return;
    }

    if (Array.isArray(body?.errors) && body.errors.length) {
      res.status(502).json({
        error: "SHOPIFY_STOREFRONT_GRAPHQL_ERROR",
        details: body.errors
      });
      return;
    }

    const authResult = body?.data?.customerAccessTokenCreate;
    const userErrors = Array.isArray(authResult?.customerUserErrors)
      ? authResult.customerUserErrors
      : [];

    if (userErrors.length > 0 || !authResult?.customerAccessToken?.accessToken) {
      res.status(401).json({
        error: "CUSTOMER_LOGIN_FAILED",
        details: userErrors
      });
      return;
    }

    const { accessToken, expiresAt } = authResult.customerAccessToken;
    setCustomerCookie(res, accessToken, expiresAt);

    const profileResult = await fetchCustomerProfile(accessToken);
    if (!profileResult.ok) {
      res.status(profileResult.status).json(profileResult.payload);
      return;
    }

    res.json({ ok: true, customer: profileResult.customer, expiresAt });
  } catch (error) {
    res.status(500).json({ error: "CUSTOMER_AUTH_ERROR", message: error.message });
  }
});

router.get("/customer-auth/me", async (req, res) => {
  if (!requireCustomerAuthConfigured(res)) return;

  const customerAccessToken = getCustomerToken(req);
  if (!customerAccessToken) {
    res.status(401).json({ error: "MISSING_CUSTOMER_TOKEN" });
    return;
  }

  try {
    const profileResult = await fetchCustomerProfile(customerAccessToken);
    if (!profileResult.ok) {
      if (profileResult.status === 401) clearCustomerCookie(res);
      res.status(profileResult.status).json(profileResult.payload);
      return;
    }
    res.json({ ok: true, customer: profileResult.customer });
  } catch (error) {
    res.status(500).json({ error: "CUSTOMER_AUTH_ERROR", message: error.message });
  }
});

router.post("/customer-auth/logout", async (req, res) => {
  if (!requireCustomerAuthConfigured(res)) return;

  const customerAccessToken = getCustomerToken(req);
  clearCustomerCookie(res);

  if (!customerAccessToken) {
    res.json({ ok: true });
    return;
  }

  const mutation = `#graphql
    mutation CustomerAccessTokenDelete($customerAccessToken: String!) {
      customerAccessTokenDelete(customerAccessToken: $customerAccessToken) {
        deletedAccessToken
        deletedCustomerAccessTokenId
        userErrors {
          code
          field
          message
        }
      }
    }
  `;

  try {
    await storefrontFetch({ query: mutation, variables: { customerAccessToken } });
  } catch {
    // best-effort revoke
  }

  res.json({ ok: true });
});

export default router;
