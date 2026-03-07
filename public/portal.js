(() => {
  "use strict";

  const statusEl = document.getElementById("portalStatus");
  const displayNameEl = document.getElementById("portalDisplayName");
  const emailEl = document.getElementById("portalEmail");
  const usernameEl = document.getElementById("portalUsername");
  const providerEl = document.getElementById("portalProvider");
  const signOutBtn = document.getElementById("portalSignOut");

  function setStatus(message) {
    if (statusEl) statusEl.textContent = String(message || "");
  }

  async function loadSession() {
    const response = await fetch("/api/v1/auth/session", {
      headers: { Accept: "application/json" }
    });
    if (!response.ok) {
      throw new Error(`Session lookup failed: ${response.status}`);
    }

    const body = await response.json();
    const auth = body?.auth || {};
    if (!auth.authenticated || !auth.user) {
      throw new Error("No authenticated portal session.");
    }

    displayNameEl.textContent = auth.user.displayName || "Authenticated customer";
    emailEl.textContent = auth.user.email || "-";
    usernameEl.textContent = auth.user.username || "-";
    providerEl.textContent = auth.providerName || "Shopify Customer Account";
    setStatus("Session verified.");
  }

  signOutBtn?.addEventListener("click", () => {
    setStatus("Signing out...");
    window.location.assign("/api/v1/auth/logout");
  });

  loadSession().catch((error) => {
    console.error(error);
    setStatus("Unable to load the customer session.");
  });
})();
