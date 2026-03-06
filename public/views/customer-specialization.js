const HENNIES_MATCH_PATTERN = /\bhenn(?:ie|ies)\b/i;
const HENNIES_ORDER_SKU_SET = new Set(["RRBB", "RRBB1KG"]);

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeSku(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

export function normalizeTagList(tags) {
  if (!tags) return [];
  if (Array.isArray(tags)) {
    return tags
      .map((tag) => normalizeText(tag))
      .filter(Boolean);
  }
  if (typeof tags === "string") {
    return tags
      .split(",")
      .map((tag) => normalizeText(tag))
      .filter(Boolean);
  }
  return [];
}

export function isHenniesTextMatch(value) {
  return HENNIES_MATCH_PATTERN.test(normalizeText(value));
}

export function isHenniesOrderSku(value) {
  return HENNIES_ORDER_SKU_SET.has(normalizeSku(value));
}

export function isHenniesOrderProduct(product = {}) {
  if (isHenniesOrderSku(product?.sku)) return true;
  const normalizedSize = normalizeText(product?.size);
  if (normalizedSize !== "200ml" && normalizedSize !== "1kg") return false;
  return isHenniesTextMatch(product?.title);
}

export function isHenniesCustomerContext(context = {}) {
  const tags = normalizeTagList(context.tags);
  const tagsContainHennies = tags.some((tag) => isHenniesTextMatch(tag));
  if (tagsContainHennies) return true;

  const searchable = [
    context.customerName,
    context.companyName,
    context.shippingCompany,
    context.shippingName,
    context.billingCompany
  ];

  return searchable.some((value) => isHenniesTextMatch(value));
}

export function isHenniesOrderContext(order) {
  const shipping = order?.shipping_address || {};
  const billing = order?.billing_address || {};
  const customer = order?.customer || {};
  return isHenniesCustomerContext({
    tags: order?.tags,
    customerName: order?.customer_name || customer?.name || order?.name,
    companyName: customer?.company || order?.company_name || order?.company,
    shippingCompany: order?.shipping_company || shipping?.company,
    shippingName: order?.shipping_name || shipping?.name,
    billingCompany: order?.billing_company || billing?.company
  });
}
