const ADMIN_TOKEN_KEYS = ["flss_admin_token", "admin_token", "stockists_admin_token"];

function readFromStorage(storage) {
  if (!storage) return "";
  for (const key of ADMIN_TOKEN_KEYS) {
    const value = storage.getItem(key);
    if (value && String(value).trim()) return String(value).trim();
  }
  return "";
}

export function getAdminToken() {
  if (typeof window === "undefined") return "";
  const fromWindow = String(window.__FLSS_ADMIN_TOKEN__ || "").trim();
  if (fromWindow) return fromWindow;

  const fromMeta = document
    ?.querySelector('meta[name="flss-admin-token"]')
    ?.getAttribute("content");
  if (fromMeta && String(fromMeta).trim()) return String(fromMeta).trim();

  const localToken = readFromStorage(window.localStorage);
  if (localToken) return localToken;
  const sessionToken = readFromStorage(window.sessionStorage);
  return sessionToken || "";
}

export function getAdminHeaders(headers = {}) {
  const token = getAdminToken();
  return {
    ...headers,
    Authorization: `Bearer ${token}`
  };
}

export function adminFetch(url, options = {}) {
  return fetch(url, {
    ...options,
    headers: getAdminHeaders(options.headers || {})
  });
}
