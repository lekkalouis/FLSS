const FLAVOUR_COLOR_MAP = Object.freeze({
  "hot spicy": "#DA291C",
  original: "#8BAF84",
  "worcester sauce": "#FF8200",
  "red wine garlic": "#722F37",
  "savoury herb": "#A1C935",
  "salt vinegar": "#40B2FF",
  curry: "#FFC72C",
  butter: "#FFE66D",
  "sour cream chives": "#7BC96F",
  "parmesan cheese": "#7E22CE",
  "cheese onion": "#C4E36A",
  chutney: "#7E22CE"
});

const FLAVOUR_ALIASES = Object.freeze({
  hs: "hot spicy",
  "hot spicy": "hot spicy",
  "hot and spicy": "hot spicy",
  "worcestershire sauce": "worcester sauce",
  "red wine and garlic": "red wine garlic",
  "savoury herbs": "savoury herb",
  "salt and vinegar": "salt vinegar",
  parmesan: "parmesan cheese",
  cheese: "parmesan cheese",
  "sour cream and chives": "sour cream chives",
  "cheese and onion": "cheese onion"
});

export function normalizeFlavourKey(flavour) {
  const compact = String(flavour || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!compact) return "";
  return FLAVOUR_ALIASES[compact] || compact;
}

export function resolveFlavourColor(flavour, options = {}) {
  const key = normalizeFlavourKey(flavour);
  if (key === "chutney" && options.productType === "popcorn") return "#DA291C";
  return FLAVOUR_COLOR_MAP[key] || "#22d3ee";
}
