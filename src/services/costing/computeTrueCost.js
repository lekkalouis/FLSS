import { getProductDb } from "../productDb.js";

const toNum = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round2 = (v) => Math.round((toNum(v) + Number.EPSILON) * 100) / 100;

function resolveRecipe(db, productId, asOfDate) {
  return db.prepare(`
    SELECT * FROM bom_recipes
    WHERE product_id = ? AND date(effective_from) <= date(?)
    ORDER BY date(effective_from) DESC, version DESC
    LIMIT 1
  `).get(productId, asOfDate);
}

function resolvePackagingProfile(db, productId, asOfDate) {
  return db.prepare(`
    SELECT * FROM packaging_profiles
    WHERE product_id = ? AND date(effective_from) <= date(?)
    ORDER BY date(effective_from) DESC, id DESC
    LIMIT 1
  `).get(productId, asOfDate);
}

function resolveTier(db, tierCode) {
  const code = String(tierCode || "public").trim() || "public";
  const tier = db.prepare("SELECT * FROM price_tiers WHERE code = ?").get(code);
  return tier || db.prepare("SELECT * FROM price_tiers WHERE code = 'public'").get();
}

export function computeTrueCost(productId, asOfDate = new Date().toISOString().slice(0, 10), tierCode = "public") {
  const db = getProductDb();
  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(productId);
  if (!product) return { error: "Product not found" };

  const recipe = resolveRecipe(db, productId, asOfDate);
  const recipeLines = recipe
    ? db.prepare(`SELECT bl.*, i.name ingredient_name FROM bom_lines bl JOIN ingredients i ON i.id = bl.ingredient_id WHERE bl.recipe_id = ?`).all(recipe.id)
    : [];

  const ingredientBreakdown = recipeLines.map((line) => {
    const price = db.prepare(`
      SELECT * FROM ingredient_prices
      WHERE ingredient_id = ? AND date(effective_from) <= date(?)
      ORDER BY date(effective_from) DESC, id DESC
      LIMIT 1
    `).get(line.ingredient_id, asOfDate);
    const pricePerKg = toNum(price?.price_per_kg);
    const baseCost = (toNum(line.grams_used) / 1000) * pricePerKg;
    return {
      ingredient_id: line.ingredient_id,
      ingredient_name: line.ingredient_name,
      grams_used: toNum(line.grams_used),
      price_per_kg: round2(pricePerKg),
      line_cost: round2(baseCost)
    };
  });

  const rawIngredientCost = ingredientBreakdown.reduce((s, i) => s + i.line_cost, 0);
  const yieldPct = toNum(recipe?.yield_pct || 100);
  const wastePct = toNum(recipe?.waste_pct || 0);
  const ingredientCost = round2(rawIngredientCost * (100 / Math.max(yieldPct, 1)) * (1 + (wastePct / 100)));

  const packagingProfile = resolvePackagingProfile(db, productId, asOfDate);
  const packagingLines = packagingProfile
    ? db.prepare(`
      SELECT pl.qty, pi.id packaging_item_id, pi.name, pi.unit_cost, pi.uom
      FROM packaging_lines pl
      JOIN packaging_items pi ON pi.id = pl.packaging_item_id
      WHERE pl.profile_id = ?
    `).all(packagingProfile.id)
    : [];
  const packagingBreakdown = packagingLines.map((line) => ({
    packaging_item_id: line.packaging_item_id,
    name: line.name,
    uom: line.uom,
    qty: toNum(line.qty),
    unit_cost: round2(line.unit_cost),
    line_cost: round2(toNum(line.qty) * toNum(line.unit_cost))
  }));
  const packagingCost = round2(packagingBreakdown.reduce((s, i) => s + i.line_cost, 0));

  const period = asOfDate.slice(0, 7);
  const inputs = db.prepare("SELECT * FROM cost_inputs_period WHERE period = ?").get(period);
  const labourPerUnit = inputs && toNum(inputs.units_produced) > 0 ? round2(inputs.labour_total / inputs.units_produced) : 0;
  const overheadPerUnit = inputs && toNum(inputs.units_produced) > 0 ? round2(inputs.overhead_total / inputs.units_produced) : 0;
  const dispatchPerUnit = inputs && toNum(inputs.units_shipped) > 0 ? round2(inputs.dispatch_materials_total / inputs.units_shipped) : 0;
  const shippingPerUnit = inputs && toNum(inputs.units_shipped) > 0 ? round2(inputs.shipping_total / inputs.units_shipped) : 0;

  const tier = resolveTier(db, tierCode);
  const priceRow = tier
    ? db.prepare(`
      SELECT * FROM product_prices
      WHERE product_id = ? AND tier_id = ? AND date(effective_from) <= date(?)
      ORDER BY date(effective_from) DESC, id DESC
      LIMIT 1
    `).get(productId, tier.id, asOfDate)
    : null;
  const sellingPrice = round2(priceRow?.price || 0);

  const feesCfg = db.prepare("SELECT commission_pct, gateway_pct FROM products WHERE id = ?").get(productId) || {};
  const commission = round2((toNum(feesCfg.commission_pct) / 100) * sellingPrice);
  const gateway = round2((toNum(feesCfg.gateway_pct) / 100) * sellingPrice);
  const fees = round2(commission + gateway);

  const directCost = round2(ingredientCost + packagingCost);
  const trueCost = round2(directCost + labourPerUnit + overheadPerUnit + dispatchPerUnit + shippingPerUnit + fees);
  const profitPerUnit = round2(sellingPrice - trueCost);
  const marginPct = sellingPrice > 0 ? round2((profitPerUnit / sellingPrice) * 100) : 0;

  return {
    product,
    as_of_date: asOfDate,
    tier: tier?.code || tierCode,
    recipe: recipe ? { id: recipe.id, version: recipe.version, effective_from: recipe.effective_from, yield_pct: recipe.yield_pct, waste_pct: recipe.waste_pct } : null,
    packaging_profile: packagingProfile ? { id: packagingProfile.id, name: packagingProfile.name, effective_from: packagingProfile.effective_from } : null,
    ingredient_breakdown: ingredientBreakdown,
    packaging_breakdown: packagingBreakdown,
    cost_layers: {
      ingredient_cost: ingredientCost,
      packaging_cost: packagingCost,
      direct_cost: directCost,
      labour_per_unit: labourPerUnit,
      overhead_per_unit: overheadPerUnit,
      dispatch_per_unit: dispatchPerUnit,
      shipping_per_unit: shippingPerUnit,
      fees,
      true_cost: trueCost
    },
    pricing: {
      selling_price: sellingPrice,
      profit_per_unit: profitPerUnit,
      margin_pct: marginPct
    }
  };
}
