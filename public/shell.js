(function () {
  const navToggle = document.querySelector("[data-nav-toggle]");
  const navLinks = Array.from(document.querySelectorAll("[data-nav-link]"));
  const NAV_COLLAPSE_KEY = "fl_nav_collapsed";
  const currentPath = window.location.pathname.replace(/\/$/, "") || "/";
  const currentSearch = new URLSearchParams(window.location.search);
  const currentView = currentSearch.get("view") || "dashboard";

  function setNavCollapsed(collapsed) {
    document.body.classList.toggle("flNavCollapsed", collapsed);
    navToggle?.setAttribute("aria-expanded", collapsed ? "false" : "true");
  }

  navLinks.forEach((link) => {
    if (!(link instanceof HTMLAnchorElement)) return;
    const linkUrl = new URL(link.href);
    const linkPath = linkUrl.pathname.replace(/\/$/, "") || "/";
    const linkView = linkUrl.searchParams.get("view");
    const matchesPath = linkPath === currentPath;
    const matchesView = linkView ? linkView === currentView : true;

    if (matchesPath && matchesView) {
      link.classList.add("flNavBtn--active");
      link.setAttribute("aria-current", "page");
    }
  });

  if (navToggle) {
    const stored = localStorage.getItem(NAV_COLLAPSE_KEY);
    if (stored === "true") {
      setNavCollapsed(true);
    }
    navToggle.addEventListener("click", () => {
      const next = !document.body.classList.contains("flNavCollapsed");
      setNavCollapsed(next);
      localStorage.setItem(NAV_COLLAPSE_KEY, String(next));
    });
  }
})();
