const PROTECTED_PREFIXES = ["/api/v1/shopify/", "/api/v1/admin/", "/api/admin/"];
const ADMIN_TOKEN_KEYS = ["flss_admin_token", "ADMIN_TOKEN"];

function readStoredToken() {
  for (const key of ADMIN_TOKEN_KEYS) {
    const localValue = globalThis.localStorage?.getItem?.(key);
    if (localValue) return String(localValue).trim();
    const sessionValue = globalThis.sessionStorage?.getItem?.(key);
    if (sessionValue) return String(sessionValue).trim();
  }
  const metaToken =
    globalThis.document
      ?.querySelector?.('meta[name="flss-admin-token"]')
      ?.getAttribute("content") || "";
  if (metaToken) return String(metaToken).trim();
  if (globalThis.FLSS_ADMIN_TOKEN) return String(globalThis.FLSS_ADMIN_TOKEN).trim();
  return "";
}

function isProtectedRoute(urlLike) {
  try {
    const url = new URL(String(urlLike), globalThis.location?.origin || "http://localhost");
    return PROTECTED_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
  } catch {
    return false;
  }
}

function withAuthHeader(input, init = {}) {
  if (!isProtectedRoute(typeof input === "string" ? input : input?.url)) return init;

  const token = readStoredToken();
  const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return { ...init, headers };
}

export function installApiClient() {
  const nativeFetch = globalThis.fetch?.bind(globalThis);
  if (!nativeFetch || globalThis.__flssFetchWrapped) return;

  globalThis.fetch = async (input, init) => {
    const response = await nativeFetch(input, withAuthHeader(input, init));
    const inputUrl = typeof input === "string" ? input : input?.url;
    if (response.status === 401 && isProtectedRoute(inputUrl)) {
      const message = "Missing/invalid ADMIN_TOKEN";
      globalThis.dispatchEvent(
        new CustomEvent("flss:auth-error", {
          detail: { message, url: inputUrl }
        })
      );
    }
    return response;
  };

  globalThis.__flssFetchWrapped = true;
}

export function setAdminToken(token, { persist = true } = {}) {
  const value = String(token || "").trim();
  if (!value) return;
  if (persist) {
    globalThis.localStorage?.setItem?.("flss_admin_token", value);
  } else {
    globalThis.sessionStorage?.setItem?.("flss_admin_token", value);
  }
}
