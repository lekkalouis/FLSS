import { config } from "../config.js";
import {
  fetchInventoryItemIdsForVariants,
  fetchInventoryLevelsForItems,
  fetchPrimaryLocationId,
  shopifyFetch
} from "./shopify.js";

const MF_NAMESPACE = "flss";
const MF_MANUFACTURING_MODE = "manufacturing_mode";
const MF_BOM_CURRENT = "bom_current";
const VARIANT_CHUNK_SIZE = 50;
const METAOBJECT_CHUNK_SIZE = 50;

const PHASE1_VARIANT_METAFIELDS = [
  {
    key: "manufacturing_mode",
    name: "Manufacturing Mode",
    type: "single_line_text_field",
    description: "Manufacturing mode for variant: make|buy|kit"
  },
  {
    key: "bom_current",
    name: "Current BOM",
    type: "metaobject_reference",
    description: "Current BOM reference",
    validations: [{ name: "metaobject_definition_id", value: "flss_bom" }]
  },
  {
    key: "bom_alternates",
    name: "Alternate BOMs",
    type: "list.metaobject_reference",
    description: "Optional alternate BOM references",
    validations: [{ name: "metaobject_definition_id", value: "flss_bom" }]
  },
  {
    key: "batch_policy",
    name: "Batch Policy",
    type: "json",
    description: "Optional JSON batch policy"
  }
];

const PHASE1_METAOBJECT_DEFINITIONS = [
  {
    type: "flss_bom",
    name: "FLSS BOM",
    fieldDefinitions: [
      { key: "code", name: "Code", type: "single_line_text_field", required: true },
      { key: "name", name: "Name", type: "single_line_text_field", required: true },
      { key: "yield_qty", name: "Yield Qty", type: "number_decimal", required: true },
      { key: "yield_uom", name: "Yield UOM", type: "single_line_text_field", required: true },
      {
        key: "lines",
        name: "Lines",
        type: "list.metaobject_reference",
        validations: [{ name: "metaobject_definition_id", value: "flss_bom_line" }]
      }
    ]
  },
  {
    type: "flss_bom_line",
    name: "FLSS BOM Line",
    fieldDefinitions: [
      { key: "component_variant", name: "Component Variant", type: "variant_reference", required: true },
      { key: "qty", name: "Quantity", type: "number_decimal", required: true },
      { key: "uom", name: "UOM", type: "single_line_text_field", required: true },
      { key: "loss_pct", name: "Loss %", type: "number_decimal" },
      { key: "is_packaging", name: "Packaging", type: "boolean" }
    ]
  }
];

function nowMs() {
  return Date.now();
}

function createTtlCache(ttlMs) {
  const store = new Map();
  return {
    get(key) {
      const hit = store.get(key);
      if (!hit) return undefined;
      if (hit.expiresAtMs <= nowMs()) {
        store.delete(key);
        return undefined;
      }
      return hit.value;
    },
    set(key, value) {
      store.set(key, { value, expiresAtMs: nowMs() + ttlMs });
    }
  };
}

function chunkArray(items, chunkSize) {
  const chunks = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

function normalizeId(rawId) {
  if (rawId == null) return null;
  const str = String(rawId).trim();
  if (!str) return null;
  const gidMatch = str.match(/\/(\d+)$/);
  if (gidMatch) return gidMatch[1];
  const numeric = Number(str);
  if (Number.isFinite(numeric)) return String(Math.trunc(numeric));
  return str;
}

function parseMode(rawMode) {
  const mode = String(rawMode || "").trim().toLowerCase();
  if (mode === "make" || mode === "buy" || mode === "kit") return mode;
  return null;
}

function getMetaFieldByKey(node, key) {
  const edges = node?.metafields?.edges;
  if (!Array.isArray(edges)) return null;
  for (const edge of edges) {
    const mf = edge?.node;
    if (!mf) continue;
    if (mf.namespace === MF_NAMESPACE && mf.key === key) return mf;
  }
  return null;
}

function parseMetaobjectReference(rawValue) {
  if (!rawValue) return null;
  try {
    const parsed = JSON.parse(rawValue);
    return parsed?.id || null;
  } catch {
    return String(rawValue).trim() || null;
  }
}

function buildVariantNodeQuery() {
  return `#graphql
    query ResolveVariantManufacturing($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on ProductVariant {
          id
          metafields(first: 10, namespace: "${MF_NAMESPACE}") {
            edges {
              node {
                namespace
                key
                value
              }
            }
          }
        }
      }
    }
  `;
}

function buildBomNodeQuery() {
  return `#graphql
    query ResolveBomNodes($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on Metaobject {
          id
          type
          fields {
            key
            value
            references(first: 250) {
              nodes {
                ... on Metaobject {
                  id
                  type
                  fields {
                    key
                    value
                    reference {
                      ... on ProductVariant {
                        id
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;
}

function parseBomMetaobject(metaobject) {
  if (!metaobject || metaobject.type !== "flss_bom") return [];
  const linesField = (metaobject.fields || []).find((field) => field.key === "lines");
  const refs = linesField?.references?.nodes;
  if (!Array.isArray(refs)) return [];

  return refs
    .filter((ref) => ref?.type === "flss_bom_line")
    .map((lineRef) => {
      const fields = Array.isArray(lineRef.fields) ? lineRef.fields : [];
      const componentField = fields.find((f) => f.key === "component_variant");
      const qtyField = fields.find((f) => f.key === "qty");
      const uomField = fields.find((f) => f.key === "uom");
      const lossField = fields.find((f) => f.key === "loss_pct");

      const componentVariantId = normalizeId(componentField?.reference?.id || componentField?.value);
      const qtyPerUnit = Number(qtyField?.value);
      if (!componentVariantId || !Number.isFinite(qtyPerUnit) || qtyPerUnit <= 0) return null;

      const lossPct = Number(lossField?.value);
      return {
        componentVariantId,
        qtyPerUnit,
        uom: String(uomField?.value || "unit").trim() || "unit",
        lossPct: Number.isFinite(lossPct) && lossPct > 0 ? lossPct : 0
      };
    })
    .filter(Boolean);
}

export function createManufacturingService({
  shopifyFetchFn = shopifyFetch,
  fetchInventoryItemIdsForVariantsFn = fetchInventoryItemIdsForVariants,
  fetchInventoryLevelsForItemsFn = fetchInventoryLevelsForItems,
  fetchPrimaryLocationIdFn = fetchPrimaryLocationId,
  variantBomCacheTtlMs = 5 * 60 * 1000,
  bomExpandedCacheTtlMs = 10 * 60 * 1000
} = {}) {
  const base = `/admin/api/${config.SHOPIFY_API_VERSION}`;
  const variantBomCache = createTtlCache(variantBomCacheTtlMs);
  const bomExpandedCache = createTtlCache(bomExpandedCacheTtlMs);

  async function runGraphql(query, variables) {
    const resp = await shopifyFetchFn(`${base}/graphql.json`, {
      method: "POST",
      body: JSON.stringify({ query, variables })
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(`Shopify GraphQL request failed (${resp.status})`);
    }
    if (Array.isArray(data.errors) && data.errors.length) {
      throw new Error(`Shopify GraphQL errors: ${data.errors.map((e) => e.message).join("; ")}`);
    }
    return data?.data || {};
  }

  async function resolveBoms(variantIds = []) {
    const normalized = Array.from(new Set(variantIds.map(normalizeId).filter(Boolean)));
    if (!normalized.length) return {};

    const result = {};
    const variantsToFetch = [];
    normalized.forEach((variantId) => {
      const cached = variantBomCache.get(variantId);
      if (cached !== undefined) {
        result[variantId] = cached;
      } else {
        variantsToFetch.push(variantId);
      }
    });

    if (variantsToFetch.length) {
      const query = buildVariantNodeQuery();
      const chunks = chunkArray(
        variantsToFetch.map((id) => `gid://shopify/ProductVariant/${id}`),
        VARIANT_CHUNK_SIZE
      );

      for (const idsChunk of chunks) {
        const data = await runGraphql(query, { ids: idsChunk });
        const nodes = Array.isArray(data.nodes) ? data.nodes : [];
        for (const node of nodes) {
          const variantId = normalizeId(node?.id);
          if (!variantId) continue;
          const modeField = getMetaFieldByKey(node, MF_MANUFACTURING_MODE);
          const bomField = getMetaFieldByKey(node, MF_BOM_CURRENT);
          const mode = parseMode(modeField?.value);
          const bomId = parseMetaobjectReference(bomField?.value);
          const cachedValue = {
            variantId,
            manufacturingMode: mode,
            bomId: bomId ? String(bomId) : null,
            bomLines: [],
            warnings: []
          };
          if (!mode) cachedValue.warnings.push("Missing or invalid flss.manufacturing_mode");
          if (mode === "make" && !bomId) cachedValue.warnings.push("Missing flss.bom_current");
          result[variantId] = cachedValue;
          variantBomCache.set(variantId, cachedValue);
        }
      }

      variantsToFetch.forEach((variantId) => {
        if (!result[variantId]) {
          const unresolved = {
            variantId,
            manufacturingMode: null,
            bomId: null,
            bomLines: [],
            warnings: ["Variant not found"]
          };
          result[variantId] = unresolved;
          variantBomCache.set(variantId, unresolved);
        }
      });
    }

    const bomIdsToFetch = Array.from(
      new Set(
        Object.values(result)
          .map((entry) => entry?.bomId)
          .filter(Boolean)
      )
    ).filter((bomId) => bomExpandedCache.get(bomId) === undefined);

    if (bomIdsToFetch.length) {
      const query = buildBomNodeQuery();
      const chunks = chunkArray(bomIdsToFetch, METAOBJECT_CHUNK_SIZE);
      for (const idsChunk of chunks) {
        const data = await runGraphql(query, { ids: idsChunk });
        const nodes = Array.isArray(data.nodes) ? data.nodes : [];
        nodes.forEach((node) => {
          const bomId = String(node?.id || "").trim();
          if (!bomId) return;
          bomExpandedCache.set(bomId, parseBomMetaobject(node));
        });
      }
      bomIdsToFetch.forEach((bomId) => {
        if (bomExpandedCache.get(bomId) === undefined) bomExpandedCache.set(bomId, []);
      });
    }

    Object.values(result).forEach((entry) => {
      if (!entry?.bomId) return;
      entry.bomLines = bomExpandedCache.get(entry.bomId) || [];
      if (entry.manufacturingMode === "make" && !entry.bomLines.length) {
        entry.warnings.push("BOM has no lines");
      }
    });

    return result;
  }

  async function ensurePhase1Definitions({ apply = false } = {}) {
    const query = `#graphql
      query Phase1Definitions {
        metafieldDefinitions(first: 100, ownerType: PRODUCTVARIANT, namespace: "${MF_NAMESPACE}") {
          nodes { key }
        }
        metaobjectDefinitions(first: 100) {
          nodes { type }
        }
      }
    `;
    const data = await runGraphql(query, {});
    const existingVariantKeys = new Set(
      (data?.metafieldDefinitions?.nodes || []).map((node) => String(node?.key || "")).filter(Boolean)
    );
    const existingMetaobjectTypes = new Set(
      (data?.metaobjectDefinitions?.nodes || []).map((node) => String(node?.type || "")).filter(Boolean)
    );

    const missingVariantMetafields = PHASE1_VARIANT_METAFIELDS.filter(
      (field) => !existingVariantKeys.has(field.key)
    );
    const missingMetaobjectDefinitions = PHASE1_METAOBJECT_DEFINITIONS.filter(
      (definition) => !existingMetaobjectTypes.has(definition.type)
    );

    if (!apply) {
      return {
        apply,
        missingVariantMetafields,
        missingMetaobjectDefinitions
      };
    }

    const createdVariantMetafields = [];
    for (const field of missingVariantMetafields) {
      const mutation = `#graphql
        mutation CreateVariantMetafieldDefinition($definition: MetafieldDefinitionInput!) {
          metafieldDefinitionCreate(definition: $definition) {
            createdDefinition { id key namespace }
            userErrors { field message }
          }
        }
      `;
      const resp = await runGraphql(mutation, {
        definition: {
          name: field.name,
          namespace: MF_NAMESPACE,
          key: field.key,
          ownerType: "PRODUCTVARIANT",
          type: field.type,
          description: field.description,
          validations: field.validations || []
        }
      });
      const payload = resp?.metafieldDefinitionCreate || {};
      if (Array.isArray(payload.userErrors) && payload.userErrors.length) {
        throw new Error(`Failed to create metafield ${field.key}: ${payload.userErrors[0].message}`);
      }
      createdVariantMetafields.push(payload.createdDefinition);
    }

    const createdMetaobjectDefinitions = [];
    for (const definition of missingMetaobjectDefinitions) {
      const mutation = `#graphql
        mutation CreateMetaobjectDefinition($definition: MetaobjectDefinitionCreateInput!) {
          metaobjectDefinitionCreate(definition: $definition) {
            metaobjectDefinition { id type name }
            userErrors { field message }
          }
        }
      `;
      const resp = await runGraphql(mutation, {
        definition: {
          type: definition.type,
          name: definition.name,
          fieldDefinitions: definition.fieldDefinitions
        }
      });
      const payload = resp?.metaobjectDefinitionCreate || {};
      if (Array.isArray(payload.userErrors) && payload.userErrors.length) {
        throw new Error(`Failed to create metaobject ${definition.type}: ${payload.userErrors[0].message}`);
      }
      createdMetaobjectDefinitions.push(payload.metaobjectDefinition);
    }

    return {
      apply,
      missingVariantMetafields,
      missingMetaobjectDefinitions,
      createdVariantMetafields,
      createdMetaobjectDefinitions
    };
  }

  async function checkOrder({ orderId, locationId } = {}) {
    const normalizedOrderId = normalizeId(orderId);
    if (!normalizedOrderId) throw new Error("orderId is required");

    const orderResp = await shopifyFetchFn(`${base}/orders/${normalizedOrderId}.json?fields=id,line_items,name`, {
      method: "GET"
    });
    if (!orderResp.ok) throw new Error(`Order fetch failed (${orderResp.status})`);
    const orderData = await orderResp.json();
    const order = orderData?.order || {};
    const lineItems = Array.isArray(order.line_items) ? order.line_items : [];
    const variantDemand = new Map();

    lineItems.forEach((item) => {
      const variantId = normalizeId(item?.variant_id);
      const quantity = Number(item?.quantity || 0);
      if (!variantId || !Number.isFinite(quantity) || quantity <= 0) return;
      variantDemand.set(variantId, (variantDemand.get(variantId) || 0) + quantity);
    });

    const bomMap = await resolveBoms(Array.from(variantDemand.keys()));
    const componentDemand = new Map();

    for (const [variantId, qtyOrdered] of variantDemand.entries()) {
      const bomEntry = bomMap[variantId];
      const bomLines = Array.isArray(bomEntry?.bomLines) ? bomEntry.bomLines : [];
      bomLines.forEach((line) => {
        const qtyPerUnit = Number(line.qtyPerUnit || 0);
        const lossFactor = 1 + Math.max(0, Number(line.lossPct || 0)) / 100;
        const requiredQty = qtyOrdered * qtyPerUnit * lossFactor;
        const componentKey = normalizeId(line.componentVariantId);
        if (!componentKey) return;
        const prev = componentDemand.get(componentKey) || {
          componentVariantId: componentKey,
          required: 0,
          uom: line.uom || "unit",
          contributingVariants: []
        };
        prev.required += requiredQty;
        prev.contributingVariants.push({ variantId, qtyOrdered, qtyPerUnit, lossPct: line.lossPct || 0 });
        componentDemand.set(componentKey, prev);
      });
    }

    const componentVariantIds = Array.from(componentDemand.keys()).map((id) => Number(id));
    const inventoryItemIdsByVariant = await fetchInventoryItemIdsForVariantsFn(componentVariantIds);
    const resolvedLocationId = locationId ? Number(locationId) : await fetchPrimaryLocationIdFn();
    const inventoryItemIds = Array.from(inventoryItemIdsByVariant.values());
    const availableByInventoryItem = await fetchInventoryLevelsForItemsFn(inventoryItemIds, resolvedLocationId);

    const components = Array.from(componentDemand.values()).map((entry) => {
      const inventoryItemId = inventoryItemIdsByVariant.get(Number(entry.componentVariantId));
      const available = inventoryItemId != null ? availableByInventoryItem.get(inventoryItemId) : null;
      const required = Number(entry.required.toFixed(4));
      const shortage = available == null ? null : Number(Math.max(0, required - available).toFixed(4));
      return {
        ...entry,
        required,
        inventoryItemId: inventoryItemId == null ? null : inventoryItemId,
        available: available == null ? null : Number(available),
        shortage,
        status: available == null ? "unknown" : shortage > 0 ? "short" : "ready"
      };
    });

    const hasUnknown = components.some((c) => c.status === "unknown");
    const hasShortage = components.some((c) => c.status === "short");

    return {
      orderId: normalizedOrderId,
      orderName: order.name || null,
      locationId: resolvedLocationId,
      bomByVariant: bomMap,
      components,
      status: hasUnknown ? "unknown" : hasShortage ? "short" : "ready"
    };
  }

  return {
    resolveBoms,
    checkOrder,
    ensurePhase1Definitions
  };
}

export const manufacturingService = createManufacturingService();
