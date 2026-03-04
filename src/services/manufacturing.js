import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve("data");
const DATA_FILE = path.join(DATA_DIR, "manufacturing.json");

const DEFAULT_DB = {
  products: [],
  ingredients: [],
  recipes: [],
  costInputs: []
};

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify(DEFAULT_DB, null, 2));
}

function readDb() {
  ensureDataFile();
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return {
      products: Array.isArray(parsed.products) ? parsed.products : [],
      ingredients: Array.isArray(parsed.ingredients) ? parsed.ingredients : [],
      recipes: Array.isArray(parsed.recipes) ? parsed.recipes : [],
      costInputs: Array.isArray(parsed.costInputs) ? parsed.costInputs : []
    };
  } catch {
    return { ...DEFAULT_DB };
  }
}

function writeDb(db) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

const toNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const round2 = (value) => Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;

export function getManufacturingData() {
  return readDb();
}

export function upsertProduct(payload) {
  const db = readDb();
  const productId = String(payload?.product_id || payload?.id || "").trim();
  const sku = String(payload?.sku || "").trim();
  const name = String(payload?.name || "").trim();
  if (!productId || !sku || !name) return { error: "product_id, sku and name are required" };

  const product = {
    product_id: productId,
    sku,
    name,
    bottle_cost: toNumber(payload?.bottle_cost),
    cap_cost: toNumber(payload?.cap_cost),
    label_cost: toNumber(payload?.label_cost),
    seal_cost: toNumber(payload?.seal_cost),
    weight_grams: toNumber(payload?.weight_grams),
    selling_price: toNumber(payload?.selling_price),
    commission_pct: toNumber(payload?.commission_pct),
    gateway_pct: toNumber(payload?.gateway_pct),
    updated_at: new Date().toISOString()
  };

  const idx = db.products.findIndex((item) => item.product_id === productId);
  if (idx >= 0) db.products[idx] = product;
  else db.products.push(product);
  writeDb(db);
  return { product };
}

export function upsertIngredient(payload) {
  const db = readDb();
  const ingredientId = String(payload?.ingredient_id || payload?.id || "").trim();
  const name = String(payload?.name || "").trim();
  if (!ingredientId || !name) return { error: "ingredient_id and name are required" };

  const ingredient = {
    ingredient_id: ingredientId,
    name,
    price_per_kg: toNumber(payload?.price_per_kg),
    supplier: String(payload?.supplier || "").trim(),
    updated_at: new Date().toISOString()
  };

  const idx = db.ingredients.findIndex((item) => item.ingredient_id === ingredientId);
  if (idx >= 0) db.ingredients[idx] = ingredient;
  else db.ingredients.push(ingredient);
  writeDb(db);
  return { ingredient };
}

export function upsertRecipe(payload) {
  const db = readDb();
  const productId = String(payload?.product_id || "").trim();
  const ingredientId = String(payload?.ingredient_id || "").trim();
  if (!productId || !ingredientId) return { error: "product_id and ingredient_id are required" };
  const gramsUsed = toNumber(payload?.grams_used);

  const recipe = { product_id: productId, ingredient_id: ingredientId, grams_used: gramsUsed, updated_at: new Date().toISOString() };
  const idx = db.recipes.findIndex((item) => item.product_id === productId && item.ingredient_id === ingredientId);
  if (idx >= 0) db.recipes[idx] = recipe;
  else db.recipes.push(recipe);
  writeDb(db);
  return { recipe };
}

export function upsertCostInputs(payload) {
  const db = readDb();
  const month = String(payload?.month || "").trim();
  if (!month) return { error: "month is required" };

  const costInput = {
    month,
    labour_total: toNumber(payload?.labour_total),
    overhead_total: toNumber(payload?.overhead_total),
    shipping_total: toNumber(payload?.shipping_total),
    units_produced: toNumber(payload?.units_produced),
    units_shipped: toNumber(payload?.units_shipped),
    dispatch_materials_per_order: toNumber(payload?.dispatch_materials_per_order),
    units_per_box: toNumber(payload?.units_per_box, 1),
    updated_at: new Date().toISOString()
  };

  const idx = db.costInputs.findIndex((item) => item.month === month);
  if (idx >= 0) db.costInputs[idx] = costInput;
  else db.costInputs.push(costInput);
  writeDb(db);
  return { costInput };
}

export function calculateSkuTrueCost({ productId, month }) {
  const db = readDb();
  const product = db.products.find((item) => item.product_id === productId);
  if (!product) return { error: "Product not found" };

  const costInput = db.costInputs.find((item) => item.month === month) || null;
  if (!costInput) return { error: "Cost inputs for month not found" };

  const ingredientMap = new Map(db.ingredients.map((item) => [item.ingredient_id, item]));
  const recipeRows = db.recipes.filter((item) => item.product_id === productId);

  const ingredientBreakdown = recipeRows.map((row) => {
    const ingredient = ingredientMap.get(row.ingredient_id);
    const pricePerKg = toNumber(ingredient?.price_per_kg);
    const cost = (toNumber(row.grams_used) / 1000) * pricePerKg;
    return {
      ingredient_id: row.ingredient_id,
      ingredient_name: ingredient?.name || row.ingredient_id,
      grams_used: toNumber(row.grams_used),
      price_per_kg: pricePerKg,
      cost: round2(cost)
    };
  });

  const ingredientCost = round2(ingredientBreakdown.reduce((sum, item) => sum + item.cost, 0));
  const packagingCost = round2(toNumber(product.bottle_cost) + toNumber(product.cap_cost) + toNumber(product.label_cost) + toNumber(product.seal_cost));

  const labourPerUnit = costInput.units_produced > 0 ? round2(costInput.labour_total / costInput.units_produced) : 0;
  const overheadPerUnit = costInput.units_produced > 0 ? round2(costInput.overhead_total / costInput.units_produced) : 0;
  const shippingPerUnit = costInput.units_shipped > 0 ? round2(costInput.shipping_total / costInput.units_shipped) : 0;
  const dispatchMaterialsPerUnit = costInput.units_per_box > 0
    ? round2(costInput.dispatch_materials_per_order / costInput.units_per_box)
    : 0;

  const sellingPrice = toNumber(product.selling_price);
  const commission = round2((toNumber(product.commission_pct) / 100) * sellingPrice);
  const gatewayFee = round2((toNumber(product.gateway_pct) / 100) * sellingPrice);
  const salesFees = round2(commission + gatewayFee);

  const trueCost = round2(
    ingredientCost +
    packagingCost +
    labourPerUnit +
    overheadPerUnit +
    dispatchMaterialsPerUnit +
    shippingPerUnit +
    salesFees
  );

  const profitPerUnit = round2(sellingPrice - trueCost);
  const marginPct = sellingPrice > 0 ? round2((profitPerUnit / sellingPrice) * 100) : 0;

  return {
    product,
    month,
    ingredient_breakdown: ingredientBreakdown,
    cost_layers: {
      bom: round2(ingredientCost + packagingCost),
      ingredient_cost: ingredientCost,
      packaging_cost: packagingCost,
      labour_per_unit: labourPerUnit,
      overhead_per_unit: overheadPerUnit,
      dispatch_materials_per_unit: dispatchMaterialsPerUnit,
      courier_per_unit: shippingPerUnit,
      sales_fees: salesFees,
      true_cost: trueCost
    },
    profitability: {
      selling_price: round2(sellingPrice),
      profit_per_unit: profitPerUnit,
      margin_pct: marginPct
    }
  };
}

export function getManufacturingDashboard(month) {
  const db = readDb();
  const costInput = db.costInputs.find((item) => item.month === month);
  if (!costInput) return { error: "Cost inputs for month not found" };

  const perSku = db.products.map((product) => {
    const result = calculateSkuTrueCost({ productId: product.product_id, month });
    if (result.error) return null;
    return {
      product_id: product.product_id,
      sku: product.sku,
      name: product.name,
      bom_cost: result.cost_layers.bom,
      true_cost: result.cost_layers.true_cost,
      selling_price: result.profitability.selling_price,
      profit_per_unit: result.profitability.profit_per_unit,
      margin_pct: result.profitability.margin_pct
    };
  }).filter(Boolean);

  return {
    month,
    per_sku: perSku,
    factory_metrics: {
      cost_per_unit_overall: round2(perSku.reduce((sum, item) => sum + item.true_cost, 0) / (perSku.length || 1)),
      labour_per_unit: costInput.units_produced > 0 ? round2(costInput.labour_total / costInput.units_produced) : 0,
      overhead_per_unit: costInput.units_produced > 0 ? round2(costInput.overhead_total / costInput.units_produced) : 0,
      shipping_per_unit: costInput.units_shipped > 0 ? round2(costInput.shipping_total / costInput.units_shipped) : 0
    }
  };
}
