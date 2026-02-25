import crypto from "crypto";

const SUPPORTED_TIERS = ["public", "agent", "retail", "retailer", "export", "private", "fkb"];
const DEFAULT_TIER_PRIORITY = ["agent", "retailer", "export", "private", "fkb", "public", "retail"];
const DEFAULT_CURRENCY_PRECISION = 2;

function safePrice(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return numeric;
}

export function normalizePriceTiers(product) {
  try {
    const raw = product?.price_tiers || product?.metafields?.custom?.price_tiers;
    if (!raw) return null;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (err) {
    console.error("Tier parse failed:", err);
    return null;
  }
}

function normalizeDecimal(value, precision = DEFAULT_CURRENCY_PRECISION) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const factor = 10 ** precision;
  return Math.round((numeric + Number.EPSILON) * factor) / factor;
}

function parseTierTag(tag) {
  const raw = String(tag || "").trim().toLowerCase();
  if (!raw.startsWith("tier:")) return null;
  return normalizeCustomerTier(raw.slice(5));
}

export function resolveCustomerTier({
  customerTier,
  customerTags,
  defaultTier = "public",
  priority = DEFAULT_TIER_PRIORITY,
  strictSingleTier = false
} = {}) {
  const metafieldTier = normalizeCustomerTier(customerTier);
  if (metafieldTier) {
    return { tier: metafieldTier, source: "metafield", conflict: false, candidates: [metafieldTier] };
  }

  const tierTags = (Array.isArray(customerTags) ? customerTags : [])
    .map(parseTierTag)
    .filter(Boolean);
  const uniqueTags = Array.from(new Set(tierTags));
  if (!uniqueTags.length) {
    const fallbackTier = normalizeCustomerTier(defaultTier) || "public";
    return { tier: fallbackTier, source: "default", conflict: false, candidates: [] };
  }

  if (uniqueTags.length === 1) {
    return { tier: uniqueTags[0], source: "tag", conflict: false, candidates: uniqueTags };
  }

  if (strictSingleTier) {
    const fallbackTier = normalizeCustomerTier(defaultTier) || "public";
    return { tier: fallbackTier, source: "default", conflict: true, candidates: uniqueTags };
  }

  const priorityMap = new Map(priority.map((tier, index) => [normalizeCustomerTier(tier) || tier, index]));
  const resolved = [...uniqueTags].sort((a, b) => {
    const rankA = priorityMap.has(a) ? priorityMap.get(a) : Number.MAX_SAFE_INTEGER;
    const rankB = priorityMap.has(b) ? priorityMap.get(b) : Number.MAX_SAFE_INTEGER;
    return rankA - rankB;
  })[0];

  return { tier: resolved || (normalizeCustomerTier(defaultTier) || "public"), source: "tag", conflict: true, candidates: uniqueTags };
}

export function resolveLinePrice({ lineItem, tier, tierDiscounts = {}, precision = DEFAULT_CURRENCY_PRECISION }) {
  const retailCandidate = normalizeDecimal(lineItem?.retailPrice ?? lineItem?.price);
  const parsedTiers = normalizePriceTiers(lineItem?.product || lineItem);
  const resolvedTierKey = normalizeCustomerTier(tier) || "public";

  const overrideCandidate = normalizeDecimal(lineItem?.overridePrice);
  if (overrideCandidate != null) {
    return {
      unitPrice: overrideCandidate,
      source: "override",
      retailPrice: retailCandidate,
      tierPrice: overrideCandidate,
      discountFallbackUsed: false
    };
  }

  const fixedTierCandidate = normalizeDecimal(parsedTiers?.[resolvedTierKey]);
  if (fixedTierCandidate != null) {
    return {
      unitPrice: fixedTierCandidate,
      source: "fixed_tier",
      retailPrice: retailCandidate,
      tierPrice: fixedTierCandidate,
      discountFallbackUsed: false
    };
  }

  const retailPrice = retailCandidate ?? normalizeDecimal(retailPriceForProduct(lineItem?.product || lineItem));
  const discountPct = Number(tierDiscounts?.[resolvedTierKey]);
  if (retailPrice != null && Number.isFinite(discountPct) && discountPct > 0) {
    const discounted = normalizeDecimal(retailPrice * (1 - discountPct / 100), precision);
    if (discounted != null) {
      return {
        unitPrice: discounted,
        source: "discount_fallback",
        retailPrice,
        tierPrice: discounted,
        discountFallbackUsed: true,
        discountPercentage: discountPct
      };
    }
  }

  const fallbackRetail = retailPrice ?? 0;
  return {
    unitPrice: fallbackRetail,
    source: "retail",
    retailPrice: fallbackRetail,
    tierPrice: fallbackRetail,
    discountFallbackUsed: false
  };
}

export function buildPricingHash({ tier, currency = "ZAR", signatures = [] }) {
  const canonical = {
    tier: normalizeCustomerTier(tier) || "public",
    currency: String(currency || "ZAR").toUpperCase(),
    lines: signatures
      .map((sig) => ({
        variant_id: String(sig.variant_id || ""),
        quantity: Number(sig.quantity || 0),
        resolved_unit_price: normalizeDecimal(sig.resolved_unit_price) ?? 0,
        source: String(sig.source || "retail")
      }))
      .sort((a, b) => (a.variant_id > b.variant_id ? 1 : -1))
  };
  return crypto.createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export function resolvePricingForLines({
  lineItems,
  tier,
  currency = "ZAR",
  tierDiscounts = {},
  precision = DEFAULT_CURRENCY_PRECISION
}) {
  const resolvedTier = normalizeCustomerTier(tier) || "public";
  const lines = (Array.isArray(lineItems) ? lineItems : []).map((lineItem) => {
    const resolved = resolveLinePrice({ lineItem, tier: resolvedTier, tierDiscounts, precision });
    const quantity = Math.max(1, Math.floor(Number(lineItem?.quantity || 1)));
    const variantId = String(lineItem?.variant_id || lineItem?.variantId || "");
    return {
      variant_id: variantId,
      quantity,
      resolved_unit_price: resolved.unitPrice,
      source: resolved.source,
      retail_price: resolved.retailPrice,
      tier_price: resolved.tierPrice,
      discount_fallback_used: resolved.discountFallbackUsed,
      discount_percentage: resolved.discountPercentage ?? null
    };
  });

  const hash = buildPricingHash({
    tier: resolvedTier,
    currency,
    signatures: lines
  });

  return {
    tier: resolvedTier,
    currency: String(currency || "ZAR").toUpperCase(),
    lines,
    hash,
    fallbackUsed: lines.some((line) => line.discount_fallback_used)
  };
}

export function retailPriceForProduct(product) {
  if (!product) return null;
  const directRetail = safePrice(product.retailPrice || product.retail_price);
  if (directRetail != null) return directRetail;

  const directPrice = safePrice(product.price);
  if (directPrice != null) return directPrice;

  const tiers = normalizePriceTiers(product);
  if (!tiers || typeof tiers !== "object") return null;

  const fallbackRetail =
    safePrice(tiers.retail) ?? safePrice(tiers.default) ?? safePrice(tiers.standard);
  return fallbackRetail;
}

export function resolveUnitPrices(product, state) {
  if (!product) return { retail: 0, tier: 0 };

  const tier = state?.priceTier || "retail";
  const tiers = normalizePriceTiers(product);

  const retail = Number(
    product.retailPrice ||
      product.price ||
      retailPriceForProduct(product) ||
      0
  );

  if (!tiers) {
    return { retail, tier: retail };
  }

  const tierValue = tiers[tier] ?? tiers.default ?? tiers.standard;

  const tierPrice = Number(tierValue);
  if (Number.isFinite(tierPrice) && tierPrice > 0) {
    return { retail, tier: tierPrice };
  }

  return { retail, tier: retail };
}

/**
 * Resolve Shopify draft order line items so retail variant pricing is preserved and net tier pricing
 * is achieved via per-unit applied discounts.
 *
 * @param {Object} options
 * @param {Array<Object>} options.cartItems Incoming line items from FLSS
 * @param {Object} options.state Draft order state (must include priceTier)
 * @returns {{lineItems: Array<Object>, fallbackUsed: boolean}}
 */
export function resolveDraftLinePricing({ cartItems, state }) {
  const normalizedTier = normalizeCustomerTier(state?.priceTier) || "retail";
  let fallbackUsed = false;

  const lineItems = (Array.isArray(cartItems) ? cartItems : []).map((item) => {
    const lineState = {
      ...state,
      priceTier: normalizeCustomerTier(item?.priceTier) || normalizedTier
    };

    const productForResolution = item?.product || {
      retailPrice: item?.retailPrice,
      price: item?.retailPrice,
      price_tiers: item?.price_tiers,
      metafields: item?.metafields
    };

    const lineResolution = resolveLinePrice({
      lineItem: {
        ...item,
        product: productForResolution,
        retailPrice: item?.retailPrice,
        price: item?.retailPrice,
        overridePrice: item?.overridePrice
      },
      tier: lineState.priceTier,
      tierDiscounts: state?.tierDiscounts
    });

    const { retail_price: retail, resolved_unit_price: tier, source } = {
      retail_price: lineResolution.retailPrice,
      resolved_unit_price: lineResolution.unitPrice,
      source: lineResolution.source
    };

    const retailUnitRaw = Number(retail);
    const fallbackRetail = Number(item?.retailPrice);
    const retailUnit = Number.isFinite(retailUnitRaw) && retailUnitRaw > 0
      ? retailUnitRaw
      : Number.isFinite(fallbackRetail) && fallbackRetail > 0
        ? fallbackRetail
        : 0;

    const explicitTier = Number(item?.price);
    const resolvedTierRaw = Number(tier);
    const tierUnit = Number.isFinite(explicitTier) && explicitTier > 0
      ? explicitTier
      : Number.isFinite(resolvedTierRaw) && resolvedTierRaw > 0
        ? resolvedTierRaw
        : retailUnit;

    if (tierUnit >= retailUnit || !Number.isFinite(tierUnit) || !Number.isFinite(retailUnit)) {
      fallbackUsed = fallbackUsed || !Number.isFinite(retailUnit) || !Number.isFinite(tierUnit);
    }

    const discountPerUnit = source === "discount_fallback" ? Math.max(retailUnit - tierUnit, 0) : 0;

    console.log("FLSS Pricing Debug:", {
      tier: lineState.priceTier,
      variantId: item?.variantId,
      retailUnit,
      tierUnit,
      discountPerUnit
    });

    if (!item?.variantId) {
      fallbackUsed = true;
      return {
        title: item?.title || item?.sku || "Custom item",
        quantity: Math.max(1, Math.floor(Number(item?.quantity || 1))),
        price: retailUnit.toFixed(2)
      };
    }

    const line = {
      variant_id: item.variantId,
      quantity: Math.max(1, Math.floor(Number(item?.quantity || 1))),
      price: tierUnit.toFixed(2)
    };

    if (discountPerUnit > 0 && source === "discount_fallback") {
      line.applied_discount = {
        value_type: "fixed_amount",
        value: discountPerUnit.toFixed(2),
        title: `Wholesale (${lineState.priceTier || "tier"})`
      };
    }

    return line;
  });

  return { lineItems, fallbackUsed };
}

export function normalizeCustomerTier(tier) {
  const normalized = String(tier || "").trim().toLowerCase();
  if (normalized === "retailer") return "retailer";
  if (normalized === "retail") return "retail";
  return SUPPORTED_TIERS.includes(normalized) ? normalized : null;
}

export function mapDeliveryType(rawValue) {
  const normalized = String(rawValue || "").trim().toLowerCase();
  if (!normalized) return null;
  if (["delivery", "deliver"].includes(normalized)) return "Delivery";
  if (["pickup", "collect", "collection"].includes(normalized)) return "Pickup";
  if (["courier", "shipping", "ship"].includes(normalized)) return "Courier";
  return null;
}
