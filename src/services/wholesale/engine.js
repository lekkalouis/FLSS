function toTokenMap(payload = {}) {
  const order = payload.order || {};
  const customer = order.customer || {};
  const shipping = order.shipping_address || {};
  const billing = order.billing_address || {};
  const lineItems = Array.isArray(order.line_items) ? order.line_items : [];

  return {
    order_number: order.name || order.order_number || "",
    order_id: order.id || "",
    customer_name: [customer.first_name, customer.last_name].filter(Boolean).join(" ").trim(),
    customer_email: customer.email || order.email || "",
    customer_tags: customer.tags || "",
    shipping_name: [shipping.first_name, shipping.last_name].filter(Boolean).join(" ").trim(),
    shipping_company: shipping.company || "",
    shipping_address1: shipping.address1 || "",
    shipping_address2: shipping.address2 || "",
    shipping_city: shipping.city || "",
    shipping_province: shipping.province || "",
    shipping_zip: shipping.zip || "",
    shipping_country: shipping.country || "",
    billing_name: [billing.first_name, billing.last_name].filter(Boolean).join(" ").trim(),
    total_price: order.total_price || "",
    subtotal_price: order.subtotal_price || "",
    total_discounts: order.total_discounts || "",
    currency: order.currency || "",
    financial_status: order.financial_status || "",
    fulfillment_status: order.fulfillment_status || "",
    line_items: lineItems
      .map((item) => `${item.quantity || 0} x ${item.title || item.name || item.sku || "Item"}`)
      .join("\n")
  };
}

export function renderTemplate(content = "", payload = {}) {
  const tokenMap = toTokenMap(payload);
  return String(content || "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key) => {
    const value = tokenMap[key];
    return value == null ? "" : String(value);
  });
}

function includesAnyTag(sourceTags = [], matchTags = []) {
  if (!matchTags.length) return true;
  const normalized = new Set(sourceTags.map((tag) => String(tag).toLowerCase().trim()));
  return matchTags.some((tag) => normalized.has(String(tag).toLowerCase().trim()));
}

function skuMatches(profile = {}, sku = "") {
  if (!Array.isArray(profile.skuMatchers) || !profile.skuMatchers.length) return true;
  const needle = String(sku || "").toLowerCase().trim();
  return profile.skuMatchers.some((matcher) => needle.includes(String(matcher || "").toLowerCase().trim()));
}

export function resolveTieredDiscount({ customerTags = [], quantity = 1, basePrice = 0, sku = "" } = {}, profiles = []) {
  const qty = Math.max(1, Number(quantity || 1));
  const listPrice = Number(basePrice || 0);

  const activeProfiles = (Array.isArray(profiles) ? profiles : [])
    .filter((profile) => profile?.active !== false)
    .filter((profile) => includesAnyTag(customerTags, Array.isArray(profile.tags) ? profile.tags : []))
    .filter((profile) => skuMatches(profile, sku))
    .sort((a, b) => Number(a.priority || 100) - Number(b.priority || 100));

  const matchedProfile = activeProfiles[0] || null;
  if (!matchedProfile) {
    return {
      applied: false,
      reason: "NO_MATCHING_PROFILE",
      discountPercent: 0,
      finalUnitPrice: listPrice,
      matchedProfile: null,
      matchedTier: null
    };
  }

  const tiers = Array.isArray(matchedProfile.tiers) ? matchedProfile.tiers : [];
  const matchedTier = tiers
    .filter((tier) => Number.isFinite(Number(tier.minQty)) && qty >= Number(tier.minQty))
    .sort((a, b) => Number(b.minQty) - Number(a.minQty))[0] || null;

  const discountPercent = Math.max(0, Number(matchedTier?.discountPercent || 0));
  const finalUnitPrice = Number((listPrice * (1 - discountPercent / 100)).toFixed(2));

  return {
    applied: Boolean(matchedTier),
    reason: matchedTier ? "MATCHED" : "PROFILE_WITHOUT_ELIGIBLE_TIER",
    discountPercent,
    finalUnitPrice,
    matchedProfile,
    matchedTier
  };
}
