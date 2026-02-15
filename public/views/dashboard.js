const MODULES = [
  {
    id: "scan",
    title: "Dispatch Console",
    description: "Scan parcels, validate labels, and trigger shipment booking with live progress.",
    type: "route",
    target: "/scan",
    meta: "Operations execution",
    tag: "Core"
  },
  {
    id: "dispatch",
    title: "Order Operations Board",
    description: "Prioritize open orders, monitor packing stages, and handle shipping exceptions.",
    type: "route",
    target: "/ops",
    meta: "Operations control",
    tag: "Core"
  },
  {
    id: "docs",
    title: "Knowledge Hub",
    description: "Persona-based runbooks for operators, administrators, and developers.",
    type: "route",
    target: "/docs",
    meta: "Governance and training",
    tag: "Guide"
  },
  {
    id: "flowcharts",
    title: "Process Blueprints",
    description: "Decision maps for packing, booking, and escalation policies.",
    type: "route",
    target: "/flowcharts",
    meta: "Process intelligence",
    tag: "Guide"
  },
  {
    id: "flocs",
    title: "Sales Order Workbench",
    description: "Capture customers, assemble quotes, and create Shopify draft or confirmed orders.",
    type: "route",
    target: "/flocs",
    meta: "Commercial operations",
    tag: "Business"
  },
  {
    id: "stock",
    title: "Inventory Control",
    description: "Review stock positions and run controlled quantity adjustments.",
    type: "route",
    target: "/stock",
    meta: "Supply management",
    tag: "Business"
  },
  {
    id: "stockists",
    title: "Distribution Network",
    description: "Maintain the agent network, retailer directory, and assigned product ranges.",
    type: "route",
    target: "/stockists",
    meta: "Channel management",
    tag: "Business"
  },
  {
    id: "price-manager",
    title: "Pricing Control Center",
    description: "Administer tier pricing and synchronize pricing data to Shopify.",
    type: "route",
    target: "/price-manager",
    meta: "Revenue governance",
    tag: "Business"
  },
  {
    id: "print-station",
    title: "Print Station",
    description: "Run templates, view global print history, adjust print settings, and reprint quickly.",
    type: "route",
    target: "/print-station",
    meta: "Printing operations",
    tag: "Core"
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
