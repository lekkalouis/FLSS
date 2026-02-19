export const API_BASE = "/api/v1";

export const DEFAULT_CONFIG = {
  PROGRESS_STEP_DELAY_MS: 450,
  DISPATCH_POLL_INTERVAL_MS: 60000,
  SERVER_STATUS_POLL_INTERVAL_MS: 45000
};

export const MAX_ORDER_AGE_HOURS = 180;

export const MODULES = [
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
    id: "shipping-matrix",
    title: "Shipping Matrix",
    description: "Simulate South African shipping costs by centre and weight.",
    type: "link",
    target: "/shipping-matrix.html",
    meta: "ParcelPerfect quote matrix",
    tag: "Module"
  },
  {
    id: "custom-order-capture",
    title: "Custom Order Capture",
    description: "Password-protected local custom normal order entry.",
    type: "link",
    target: "/order-capture-custom.html",
    meta: "Secure custom entry",
    tag: "Module"
  }
];

export const DISPATCH_STEPS = ["Start", "Quote", "Service", "Book", "Print", "Booked", "Notify"];

export const LINE_ITEM_ABBREVIATIONS = {
  "original multi-purpose spice": "",
  "original multi-purpose spice - tub": "",
  "hot & spicy multi-purpose spice": "H",
  "worcester sauce spice": "WS",
  "worcester sauce spice - tub": "WS",
  "red wine & garlic sprinkle": "RG",
  "chutney sprinkle": "CS",
  "savoury herb mix": "SH",
  "salt & vinegar seasoning": "SV",
  "butter popcorn sprinkle": "BUT",
  "sour cream & chives popcorn sprinkle": "SCC",
  "chutney popcorn sprinkle": "CHUT",
  "parmesan popcorn sprinkle": "PAR",
  "cheese & onion popcorn sprinkle": "CHO",
  "salt & vinegar popcorn sprinkle": "SV",
  "flippen lekka curry mix": "Curry",
  "original multi purpose basting sauce": "Basting"
};

export const OPP_DOCUMENTS = [
  { type: "picklist", label: "OPP pick list" },
  { type: "packing-slip", label: "OPP packing slip" }
];
