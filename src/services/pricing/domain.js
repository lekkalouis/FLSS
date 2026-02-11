const CONDITION_TYPES = {
  CUSTOMER_TAG: "customerTag",
  CUSTOMER_GROUP: "customerGroup",
  SKU: "sku",
  COLLECTION: "collection",
  MIN_QUANTITY: "minQuantity",
  CURRENCY: "currency",
  SALES_CHANNEL: "salesChannel",
  EFFECTIVE_DATE: "effectiveDate"
};

const ACTION_TYPES = {
  FIXED_UNIT_PRICE: "fixedUnitPrice",
  PERCENT_DISCOUNT: "percentDiscount"
};

const DEFAULT_PRIORITY = 100;

function normalizeArray(value) {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (value == null) return [];
  return [String(value).trim()].filter(Boolean);
}

function ensureIsoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function createPriceRule(input = {}) {
  return {
    id: String(input.id || `rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
    priceListId: String(input.priceListId || "default"),
    name: String(input.name || "Untitled rule"),
    priority: Number.isFinite(Number(input.priority)) ? Number(input.priority) : DEFAULT_PRIORITY,
    conditions: Array.isArray(input.conditions) ? input.conditions : [],
    action: input.action || { type: ACTION_TYPES.FIXED_UNIT_PRICE, value: null },
    effectiveFrom: ensureIsoDate(input.effectiveFrom),
    effectiveTo: ensureIsoDate(input.effectiveTo),
    timezone: String(input.timezone || "UTC"),
    active: input.active !== false
  };
}

export function createPriceList(input = {}) {
  const rules = Array.isArray(input.rules) ? input.rules.map((rule) => createPriceRule(rule)) : [];
  return {
    id: String(input.id || `list_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
    name: String(input.name || "Default Price List"),
    currency: String(input.currency || "ZAR"),
    channel: input.channel ? String(input.channel) : null,
    isDefault: Boolean(input.isDefault),
    rules,
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function withinEffectiveWindow(rule, asOf) {
  const current = asOf ? new Date(asOf) : new Date();
  if (Number.isNaN(current.getTime())) return false;
  if (rule.effectiveFrom && current < new Date(rule.effectiveFrom)) return false;
  if (rule.effectiveTo && current > new Date(rule.effectiveTo)) return false;
  return true;
}

function matchesCondition(condition = {}, context = {}) {
  const type = String(condition.type || "");
  switch (type) {
    case CONDITION_TYPES.CUSTOMER_TAG: {
      const tags = normalizeArray(context.customerTags).map((v) => v.toLowerCase());
      const expected = normalizeArray(condition.value).map((v) => v.toLowerCase());
      return expected.some((tag) => tags.includes(tag));
    }
    case CONDITION_TYPES.CUSTOMER_GROUP:
      return String(context.customerGroup || "").toLowerCase() ===
        String(condition.value || "").toLowerCase();
    case CONDITION_TYPES.SKU:
      return normalizeArray(condition.value).includes(String(context.sku || ""));
    case CONDITION_TYPES.COLLECTION:
      return normalizeArray(context.collections).some((item) =>
        normalizeArray(condition.value).includes(item)
      );
    case CONDITION_TYPES.MIN_QUANTITY:
      return Number(context.quantity || 0) >= Number(condition.value || 0);
    case CONDITION_TYPES.CURRENCY:
      return String(context.currency || "").toUpperCase() ===
        String(condition.value || "").toUpperCase();
    case CONDITION_TYPES.SALES_CHANNEL:
      return String(context.salesChannel || "").toLowerCase() ===
        String(condition.value || "").toLowerCase();
    case CONDITION_TYPES.EFFECTIVE_DATE:
      return withinEffectiveWindow(
        { effectiveFrom: condition.from, effectiveTo: condition.to },
        context.asOf
      );
    default:
      return true;
  }
}

function applyAction(action = {}, context = {}) {
  const type = String(action.type || "");
  const basePrice = Number(context.basePrice);
  if (type === ACTION_TYPES.FIXED_UNIT_PRICE) {
    const value = Number(action.value);
    return Number.isFinite(value) ? value : null;
  }
  if (type === ACTION_TYPES.PERCENT_DISCOUNT) {
    const pct = Number(action.value);
    if (!Number.isFinite(basePrice) || !Number.isFinite(pct)) return null;
    return Math.max(0, basePrice * (1 - pct / 100));
  }
  return null;
}

export function resolveWholesalePrice(context = {}, rules = []) {
  const sorted = [...rules]
    .filter((rule) => rule && rule.active !== false)
    .filter((rule) => withinEffectiveWindow(rule, context.asOf))
    .sort((a, b) => Number(a.priority || DEFAULT_PRIORITY) - Number(b.priority || DEFAULT_PRIORITY));

  for (const rule of sorted) {
    const conditions = Array.isArray(rule.conditions) ? rule.conditions : [];
    const allMatch = conditions.every((condition) => matchesCondition(condition, context));
    if (!allMatch) continue;

    const unitPrice = applyAction(rule.action, context);
    if (Number.isFinite(unitPrice)) {
      return {
        unitPrice,
        matchedRuleId: rule.id,
        fallbackReason: null
      };
    }
  }

  if (Number.isFinite(Number(context.basePrice))) {
    return {
      unitPrice: Number(context.basePrice),
      matchedRuleId: null,
      fallbackReason: "NO_MATCHING_RULE"
    };
  }

  return {
    unitPrice: null,
    matchedRuleId: null,
    fallbackReason: "NO_BASE_PRICE"
  };
}

export { ACTION_TYPES, CONDITION_TYPES };
