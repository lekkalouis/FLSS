const SUPPORTED_TIERS = ["agent", "retail", "export", "private", "fkb"];

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

    const { retail, tier } = resolveUnitPrices(productForResolution, lineState);

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

    const discountPerUnit = Math.max(retailUnit - tierUnit, 0);

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
      price: retailUnit.toFixed(2)
    };

    if (discountPerUnit > 0) {
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
