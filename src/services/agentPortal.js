const DEFAULT_PROMO_LIBRARY = [
  {
    id: "agent-playbook",
    title: "Agent Sales Playbook",
    type: "pdf",
    audience: "All customers",
    description: "Overview deck for introducing FLSS products to retailers and foodservice buyers.",
    url: "https://cdn.shopify.com/s/files/flss-agent-playbook.pdf"
  },
  {
    id: "social-pack",
    title: "Social Media Pack",
    type: "zip",
    audience: "Retail",
    description: "Ready-to-post social images, captions, and campaign hashtags.",
    url: "https://cdn.shopify.com/s/files/flss-social-pack.zip"
  },
  {
    id: "menu-blurbs",
    title: "Menu Blurb Templates",
    type: "doc",
    audience: "Foodservice",
    description: "Short product descriptions and callouts for menus and flyers.",
    url: "https://cdn.shopify.com/s/files/flss-menu-blurbs.docx"
  },
  {
    id: "seasonal-calendar",
    title: "Seasonal Campaign Calendar",
    type: "xlsx",
    audience: "All customers",
    description: "Monthly promo prompts and key dates to plan store campaigns.",
    url: "https://cdn.shopify.com/s/files/flss-seasonal-calendar.xlsx"
  }
];

function cleanText(value, fallback = "") {
  return String(value || fallback).trim();
}

function cleanList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => cleanText(item)).filter(Boolean);
  }
  return cleanText(value)
    .split(",")
    .map((item) => cleanText(item))
    .filter(Boolean);
}

export function listPromoMaterials() {
  return DEFAULT_PROMO_LIBRARY;
}

export function buildMarketingMaterial(payload = {}) {
  const campaignGoal = cleanText(payload.campaignGoal, "Drive repeat orders with a focused monthly promo");
  const audience = cleanText(payload.audience, "Existing retail customers");
  const channel = cleanText(payload.channel, "WhatsApp + email");
  const productFocus = cleanList(payload.productFocus);
  const cta = cleanText(payload.callToAction, "Reply to this message to place your order");
  const offer = cleanText(payload.offer, "Bundle and save on featured lines");

  const primaryProducts = productFocus.length ? productFocus.join(", ") : "Featured FLSS products";

  const headline = `${campaignGoal}: ${offer}`;

  const message = [
    `Hi {{customer_name}},`,
    "",
    `${headline}.`,
    `This campaign is built for ${audience} and highlights ${primaryProducts}.`,
    `Channel plan: ${channel}.`,
    "",
    `Suggested CTA: ${cta}.`,
    "",
    "Need custom art? Use the Social Media Pack + Menu Blurb Templates in your Agent Portal library.",
    "",
    "— FLSS Agent Portal"
  ].join("\n");

  return {
    campaignGoal,
    audience,
    channel,
    offer,
    callToAction: cta,
    productFocus,
    headline,
    message
  };
}
