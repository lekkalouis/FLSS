(() => {
  "use strict";

  const navButtons = Array.from(document.querySelectorAll(".nav button"));
  const cardButtons = Array.from(document.querySelectorAll(".card button"));
  const views = Array.from(document.querySelectorAll(".view"));

  const normalizeView = (value) => (value || "home").trim().toLowerCase();

  const setActiveView = (viewName) => {
    const target = normalizeView(viewName);
    views.forEach((view) => {
      view.classList.toggle("is-active", view.id === `view-${target}`);
    });

    navButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.view === target);
    });

    const nextHash = `#${target}`;
    if (window.location.hash !== nextHash) {
      window.history.replaceState(null, "", nextHash);
    }
  };

  const handleNavClick = (event) => {
    const { view } = event.currentTarget.dataset;
    setActiveView(view);
  };

  const handleCardClick = (event) => {
    const { view } = event.currentTarget.dataset;
    if (view) {
      setActiveView(view);
    }
  };

  navButtons.forEach((button) => {
    button.addEventListener("click", handleNavClick);
  });

  cardButtons.forEach((button) => {
    button.addEventListener("click", handleCardClick);
  });

  window.addEventListener("hashchange", () => {
    const view = window.location.hash.replace("#", "");
    if (view) {
      setActiveView(view);
    }
  });

  const initialView = window.location.hash.replace("#", "") || "home";
  setActiveView(initialView);
})();
