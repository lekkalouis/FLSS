const MODULES = [
  {
    id: "scan",
    title: "Dispatch",
    description: "Scan parcels and auto-book shipments with live booking progress.",
    type: "route",
    target: "/scan",
    meta: "Internal module",
    tag: "Core"
  },
  {
    id: "dispatch",
    title: "Dispatch Board",
    description: "Review open orders, track packing, and prioritize dispatch.",
    type: "route",
    target: "/ops",
    meta: "Internal module",
    tag: "Core"
  },
  {
    id: "docs",
    title: "Documentation",
    description: "Operator guide, quick start, and endpoint reference.",
    type: "route",
    target: "/docs",
    meta: "Internal module",
    tag: "Guide"
  },
  {
    id: "flowcharts",
    title: "Flowcharts",
    description: "Decision maps for packing and dispatch logic, including hard and soft rules.",
    type: "route",
    target: "/flowcharts",
    meta: "Logic reference",
    tag: "Guide"
  },
  {
    id: "flocs",
    title: "Order Capture",
    description: "Create and manage incoming orders for Shopify.",
    type: "route",
    target: "/flocs",
    meta: "Capture module",
    tag: "Module"
  },
  {
    id: "stock",
    title: "Stock Take",
    description: "Run inventory counts and stock adjustments.",
    type: "route",
    target: "/stock",
    meta: "Inventory module",
    tag: "Module"
  },
  {
    id: "price-manager",
    title: "Price Manager",
    description: "Update tier pricing and sync to Shopify metafields.",
    type: "route",
    target: "/price-manager",
    meta: "Pricing module",
    tag: "Module"
  },
  {
    id: "commissions",
    title: "Commissions",
    description: "List FLSL commissions by month and mark monthly payouts as paid.",
    type: "route",
    target: "/commissions",
    meta: "Finance module",
    tag: "Module"
  }
];

export function initModuleDashboard({ moduleGrid, navigateTo, routeForView }) {
  if (!moduleGrid) return;

  const openModuleById = (moduleId) => {
    const module = MODULES.find((entry) => entry.id === moduleId);
    if (!module) return;

    if (module.type === "view") {
      navigateTo(routeForView(module.target));
      return;
    }

    if (module.type === "route" && module.target) {
      navigateTo(module.target);
      return;
    }

    if (module.type === "link" && module.target) {
      window.location.href = module.target;
    }
  };

  moduleGrid.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest("[data-module-id]");
    if (!button) return;
    const moduleId = button.dataset.moduleId;
    if (!moduleId) return;
    openModuleById(moduleId);
  });

  moduleGrid.innerHTML = "";
  MODULES.forEach((module) => {
    const card = document.createElement("article");
    card.className = "moduleCard";
    card.dataset.moduleId = module.id;

    const header = document.createElement("div");
    header.className = "moduleCardHeader";

    const title = document.createElement("h3");
    title.className = "moduleCardTitle";
    title.textContent = module.title;

    const tag = document.createElement("span");
    tag.className = "moduleCardTag";
    tag.textContent = module.tag || "Module";

    header.appendChild(title);
    header.appendChild(tag);

    const desc = document.createElement("p");
    desc.className = "moduleCardDesc";
    desc.textContent = module.description || "";

    const actions = document.createElement("div");
    actions.className = "moduleCardActions";

    const meta = document.createElement("span");
    meta.className = "moduleMeta";
    meta.textContent = module.meta || module.target || "Module";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "moduleOpenBtn";
    button.textContent = "Open module";
    button.dataset.moduleId = module.id;

    actions.appendChild(meta);
    actions.appendChild(button);

    card.appendChild(header);
    card.appendChild(desc);
    card.appendChild(actions);

    moduleGrid.appendChild(card);
  });
}
