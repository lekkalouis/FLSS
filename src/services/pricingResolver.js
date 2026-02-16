import { fetchVariantPriceTiers, fetchVariantRetailPrices } from "./shopify.js";

const SUPPORTED_TIERS = ["agent", "retail", "export", "private", "fkb"];
const TIER_LABELS = {
  agent: "Agent Discount",
  retail: "Retailer Discount",
  export: "Export Discount",
  private: "Private Discount",
  fkb: "FKB Discount"
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const variantTierCache = new Map();

function readCache(map, key) {
  const entry = map.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    map.delete(key);
    return null;
  }
  return entry.value;
}

function writeCache(map, key, value) {
  map.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

function safeMoney(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.round(numeric * 100) / 100;
}

function resolveTierPriceFromObject(tiers, tier) {
  if (!tiers || typeof tiers !== "object" || !tier) return null;
  const value = tiers[tier];
  return safeMoney(value);
}

async function getVariantTierData(variantId) {
  const cacheKey = String(variantId);
  const cached = readCache(variantTierCache, cacheKey);
  if (cached !== null) return cached;
  const tierData = await fetchVariantPriceTiers(cacheKey);
  return writeCache(variantTierCache, cacheKey, tierData?.value || null);
}

/**
 * Resolve Shopify draft order line items so retail variant pricing is preserved and net tier pricing
 * is achieved via applied discounts.
 *
 * @param {Object} options
 * @param {Array<Object>} options.lineItems Incoming line items from FLSS
 * @param {string|null} options.customerTier Tier from customer metafield custom.tier
 * @returns {Promise<{lineItems: Array<Object>, fallbackUsed: boolean}>}
 */
export async function resolveDraftLinePricing({ lineItems, customerTier }) {
  const normalizedTier = String(customerTier || "").trim().toLowerCase() || null;
  const tier = SUPPORTED_TIERS.includes(normalizedTier) ? normalizedTier : null;

  const variantIds = Array.from(
    new Set(
      (Array.isArray(lineItems) ? lineItems : [])
        .map((line) => String(line?.variantId || "").trim())
        .filter(Boolean)
    )
  );

  const retailPrices = await fetchVariantRetailPrices(variantIds);
  let fallbackUsed = false;

  const resolvedLines = await Promise.all(
    (lineItems || []).map(async (line) => {
      const quantity = Math.max(1, Math.floor(Number(line?.quantity || 1)));
      const variantId = line?.variantId ? String(line.variantId) : null;

      const entry = {
        quantity,
        sku: line?.sku || undefined
      };

      if (!variantId) {
        entry.title = line?.title || line?.sku || "Custom item";
        const customPrice = safeMoney(line?.price);
        if (customPrice != null) entry.price = String(customPrice.toFixed(2));
        return entry;
      }

      entry.variant_id = variantId;

      const retailPrice = safeMoney(retailPrices.get(variantId));
      const localTierPrice = safeMoney(line?.price);
      const metafieldTiers = await getVariantTierData(variantId);
      const metafieldTierPrice = resolveTierPriceFromObject(metafieldTiers, tier);

      const resolvedTierPrice = localTierPrice ?? metafieldTierPrice;
      if (retailPrice == null || !tier || resolvedTierPrice == null || retailPrice <= resolvedTierPrice) {
        if (retailPrice == null || (tier && resolvedTierPrice == null)) {
          fallbackUsed = true;
          console.warn("pricing_resolver_fallback", {
            variantId,
            tier,
            reason: retailPrice == null ? "retail_price_missing" : "tier_price_missing"
          });
        }
        return entry;
      }

      const perUnitDiscount = safeMoney(retailPrice - resolvedTierPrice);
      const lineDiscount = safeMoney(perUnitDiscount * quantity);
      if (lineDiscount == null || lineDiscount <= 0) return entry;

      const label = TIER_LABELS[tier] || "Tier Discount";
      entry.applied_discount = {
        description: label,
        value_type: "fixed_amount",
        value: String(lineDiscount.toFixed(2))
      };

      console.info("pricing_resolver_decision", {
        variantId,
        tier,
        quantity,
        retailPrice,
        tierPrice: resolvedTierPrice,
        lineDiscount
      });

      return entry;
    })
  );

  return {
    lineItems: resolvedLines,
    fallbackUsed
  };
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
