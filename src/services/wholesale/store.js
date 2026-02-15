import fs from "fs/promises";
import path from "path";

const DATA_PATH = path.join(process.cwd(), "data", "wholesale-automation.json");

const defaultState = {
  templates: [],
  discountProfiles: []
};

async function ensureStoreFile() {
  try {
    await fs.access(DATA_PATH);
  } catch {
    await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
    await fs.writeFile(DATA_PATH, JSON.stringify(defaultState, null, 2), "utf8");
  }
}

function buildId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function readWholesaleStore() {
  await ensureStoreFile();
  const raw = await fs.readFile(DATA_PATH, "utf8");
  const parsed = JSON.parse(raw || "{}");
  return {
    ...defaultState,
    ...parsed,
    templates: Array.isArray(parsed?.templates) ? parsed.templates : [],
    discountProfiles: Array.isArray(parsed?.discountProfiles) ? parsed.discountProfiles : []
  };
}

export async function writeWholesaleStore(state) {
  await ensureStoreFile();
  await fs.writeFile(DATA_PATH, JSON.stringify(state, null, 2), "utf8");
}

export async function listTemplates() {
  const state = await readWholesaleStore();
  return state.templates;
}

export async function upsertTemplate(input = {}) {
  const state = await readWholesaleStore();
  const now = new Date().toISOString();
  const record = {
    id: input.id || buildId("tpl"),
    name: String(input.name || "Untitled template").trim(),
    description: String(input.description || "").trim(),
    content: String(input.content || "").trim(),
    contentType: input.contentType === "pdf_uri" ? "pdf_uri" : "raw_base64",
    printerId: input.printerId != null && Number.isFinite(Number(input.printerId))
      ? Number(input.printerId)
      : null,
    copies: Math.max(1, Number(input.copies || 1)),
    active: input.active !== false,
    updatedAt: now,
    createdAt: input.createdAt || now
  };

  const index = state.templates.findIndex((item) => item.id === record.id);
  if (index >= 0) {
    state.templates[index] = {
      ...state.templates[index],
      ...record,
      createdAt: state.templates[index].createdAt || record.createdAt
    };
  } else {
    state.templates.push(record);
  }

  await writeWholesaleStore(state);
  return index >= 0 ? state.templates[index] : record;
}

export async function deleteTemplate(templateId) {
  const state = await readWholesaleStore();
  const initial = state.templates.length;
  state.templates = state.templates.filter((item) => item.id !== templateId);
  await writeWholesaleStore(state);
  return initial !== state.templates.length;
}

export async function listDiscountProfiles() {
  const state = await readWholesaleStore();
  return state.discountProfiles;
}

function normalizeBreaks(input = []) {
  return (Array.isArray(input) ? input : [])
    .map((tier) => ({
      minQty: Number(tier.minQty || 1),
      discountPercent: Number(tier.discountPercent || 0)
    }))
    .filter((tier) => Number.isFinite(tier.minQty) && Number.isFinite(tier.discountPercent))
    .sort((a, b) => a.minQty - b.minQty);
}

export async function upsertDiscountProfile(input = {}) {
  const state = await readWholesaleStore();
  const now = new Date().toISOString();
  const profile = {
    id: input.id || buildId("discount"),
    name: String(input.name || "Wholesale profile").trim(),
    tags: (Array.isArray(input.tags) ? input.tags : [])
      .map((tag) => String(tag || "").trim())
      .filter(Boolean),
    skuMatchers: (Array.isArray(input.skuMatchers) ? input.skuMatchers : [])
      .map((sku) => String(sku || "").trim())
      .filter(Boolean),
    tiers: normalizeBreaks(input.tiers),
    priority: Number.isFinite(Number(input.priority)) ? Number(input.priority) : 100,
    active: input.active !== false,
    updatedAt: now,
    createdAt: input.createdAt || now
  };

  const index = state.discountProfiles.findIndex((item) => item.id === profile.id);
  if (index >= 0) {
    state.discountProfiles[index] = {
      ...state.discountProfiles[index],
      ...profile,
      createdAt: state.discountProfiles[index].createdAt || profile.createdAt
    };
  } else {
    state.discountProfiles.push(profile);
  }

  await writeWholesaleStore(state);
  return index >= 0 ? state.discountProfiles[index] : profile;
}

export async function deleteDiscountProfile(profileId) {
  const state = await readWholesaleStore();
  const initial = state.discountProfiles.length;
  state.discountProfiles = state.discountProfiles.filter((item) => item.id !== profileId);
  await writeWholesaleStore(state);
  return initial !== state.discountProfiles.length;
}
