import fs from "fs/promises";
import path from "path";

import { createPriceList, createPriceRule } from "./domain.js";

const DATA_PATH = path.join(process.cwd(), "data", "pricing-model.json");

const defaultState = {
  priceLists: []
};

async function ensureStoreFile() {
  try {
    await fs.access(DATA_PATH);
  } catch {
    await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
    await fs.writeFile(DATA_PATH, JSON.stringify(defaultState, null, 2), "utf8");
  }
}

export async function readPricingStore() {
  await ensureStoreFile();
  const raw = await fs.readFile(DATA_PATH, "utf8");
  const parsed = JSON.parse(raw || "{}");
  return {
    ...defaultState,
    ...parsed,
    priceLists: Array.isArray(parsed?.priceLists) ? parsed.priceLists : []
  };
}

export async function writePricingStore(state) {
  await ensureStoreFile();
  await fs.writeFile(DATA_PATH, JSON.stringify(state, null, 2), "utf8");
}

export async function listPriceLists() {
  const state = await readPricingStore();
  return state.priceLists;
}

export async function upsertPriceList(input = {}) {
  const state = await readPricingStore();
  const index = state.priceLists.findIndex((item) => item.id === input.id);
  const record = createPriceList(input);

  if (index >= 0) {
    state.priceLists[index] = {
      ...state.priceLists[index],
      ...record,
      id: state.priceLists[index].id,
      updatedAt: new Date().toISOString()
    };
  } else {
    state.priceLists.push(record);
  }

  await writePricingStore(state);
  return index >= 0 ? state.priceLists[index] : record;
}

export async function deletePriceList(priceListId) {
  const state = await readPricingStore();
  const initial = state.priceLists.length;
  state.priceLists = state.priceLists.filter((item) => item.id !== priceListId);
  await writePricingStore(state);
  return state.priceLists.length !== initial;
}

export async function upsertRule(priceListId, input = {}) {
  const state = await readPricingStore();
  const list = state.priceLists.find((item) => item.id === priceListId);
  if (!list) return null;

  const rule = createPriceRule({ ...input, priceListId });
  const idx = (list.rules || []).findIndex((item) => item.id === rule.id);
  list.rules = Array.isArray(list.rules) ? list.rules : [];

  if (idx >= 0) {
    list.rules[idx] = {
      ...list.rules[idx],
      ...rule,
      id: list.rules[idx].id,
      updatedAt: new Date().toISOString()
    };
  } else {
    list.rules.push(rule);
  }

  list.updatedAt = new Date().toISOString();
  await writePricingStore(state);
  return idx >= 0 ? list.rules[idx] : rule;
}

export async function deleteRule(priceListId, ruleId) {
  const state = await readPricingStore();
  const list = state.priceLists.find((item) => item.id === priceListId);
  if (!list) return false;

  const before = Array.isArray(list.rules) ? list.rules.length : 0;
  list.rules = (list.rules || []).filter((rule) => rule.id !== ruleId);
  list.updatedAt = new Date().toISOString();
  await writePricingStore(state);
  return list.rules.length !== before;
}

export function legacyPriceTiersToRules({ variantId, sku, priceTiers } = {}) {
  if (!priceTiers || typeof priceTiers !== "object") return [];

  return Object.entries(priceTiers)
    .filter(([tier, value]) => tier !== "default" && Number.isFinite(Number(value)))
    .map(([tier, value], index) =>
      createPriceRule({
        id: `legacy_${variantId || sku || "variant"}_${tier}`,
        name: `Legacy tier: ${tier}`,
        priority: 200 + index,
        conditions: [
          { type: "customerTag", value: [tier] },
          ...(sku ? [{ type: "sku", value: [sku] }] : [])
        ],
        action: { type: "fixedUnitPrice", value: Number(value) },
        priceListId: "legacy-adapter",
        active: true
      })
    );
}
