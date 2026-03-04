import { getDb } from "../../db/sqlite.js";

const round2 = (v) => Math.round((Number(v || 0) + Number.EPSILON) * 100) / 100;

function getApplicableRecipe(productId, asOfDate) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM bom_recipes
    WHERE product_id = ? AND effective_from <= ?
    ORDER BY effective_from DESC, id DESC LIMIT 1
  `).get(productId, asOfDate);
}

function getApplicablePackagingProfile(productId, asOfDate) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM packaging_profiles
    WHERE product_id = ? AND effective_from <= ?
    ORDER BY effective_from DESC, id DESC LIMIT 1
  `).get(productId, asOfDate);
}

function getApplicableIngredientPrice(ingredientId, asOfDate) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM ingredient_prices
    WHERE ingredient_id = ? AND effective_from <= ?
    ORDER BY effective_from DESC, id DESC LIMIT 1
  `).get(ingredientId, asOfDate);
}

function getApplicableProductPrice(productId, tierId, asOfDate) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM product_prices
    WHERE product_id = ? AND tier_id = ? AND effective_from <= ?
    ORDER BY effective_from DESC, id DESC LIMIT 1
  `).get(productId, tierId, asOfDate);
}

export function computeTrueCost(productId, asOfDate, tierId) {
  const db = getDb();
  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(productId);
  if (!product) return { error: "Product not found" };

  const normalizedAsOf = String(asOfDate || new Date().toISOString().slice(0, 10));
  const period = normalizedAsOf.slice(0, 7);
  const periodInputs = db.prepare("SELECT * FROM cost_inputs_period WHERE period = ?").get(period);
  if (!periodInputs) return { error: `Missing cost inputs for ${period}` };

  const recipe = getApplicableRecipe(productId, asOfDate);
  const packagingProfile = getApplicablePackagingProfile(productId, asOfDate);

  const recipeLines = recipe
    ? db.prepare(`SELECT bl.*, i.name ingredient_name FROM bom_lines bl JOIN ingredients i ON i.id = bl.ingredient_id WHERE recipe_id = ?`).all(recipe.id)
    : [];

  const ingredientBreakdown = recipeLines.map((line) => {
    const price = getApplicableIngredientPrice(line.ingredient_id, asOfDate);
    const pricePerKg = Number(price?.price_per_kg || 0);
    const lineCost = (Number(line.grams_used || 0) / 1000) * pricePerKg;
    return {
      ingredient_id: line.ingredient_id,
      ingredient_name: line.ingredient_name,
      grams_used: Number(line.grams_used || 0),
      price_per_kg: round2(pricePerKg),
      cost: round2(lineCost),
      price_effective_from: price?.effective_from || null
    };
  });

  const packagingLines = packagingProfile
    ? db.prepare(`SELECT pl.*, pi.name packaging_name, pi.unit_cost, pi.uom FROM packaging_lines pl JOIN packaging_items pi ON pi.id = pl.packaging_item_id WHERE profile_id = ?`).all(packagingProfile.id)
    : [];

  const packagingBreakdown = packagingLines.map((line) => ({
    packaging_item_id: line.packaging_item_id,
    packaging_name: line.packaging_name,
    qty: Number(line.qty || 0),
    unit_cost: round2(line.unit_cost),
    uom: line.uom,
    cost: round2(Number(line.qty || 0) * Number(line.unit_cost || 0))
  }));

  const ingredientCost = round2(ingredientBreakdown.reduce((s, l) => s + l.cost, 0));
  const packagingCost = round2(packagingBreakdown.reduce((s, l) => s + l.cost, 0));
  const directCost = round2(ingredientCost + packagingCost);

  const labourPerUnit = periodInputs.units_produced ? round2(periodInputs.labour_total / periodInputs.units_produced) : 0;
  const overheadPerUnit = periodInputs.units_produced ? round2(periodInputs.overhead_total / periodInputs.units_produced) : 0;
  const dispatchPerUnit = periodInputs.units_shipped ? round2(periodInputs.dispatch_total / periodInputs.units_shipped) : 0;
  const shippingPerUnit = periodInputs.units_shipped ? round2(periodInputs.shipping_total / periodInputs.units_shipped) : 0;

  const tier = db.prepare("SELECT * FROM price_tiers WHERE id = ?").get(tierId);
  const productPrice = tier ? getApplicableProductPrice(productId, tier.id, asOfDate) : null;
  const sellingPrice = Number(productPrice?.price || 0);

  const gatewayFee = round2(sellingPrice * (Number(tier?.gateway_fee_pct || 0) / 100));
  const commissionFee = round2(sellingPrice * (Number(tier?.commission_pct || 0) / 100));
  const fees = round2(gatewayFee + commissionFee);

  const trueCost = round2(directCost + labourPerUnit + overheadPerUnit + dispatchPerUnit + shippingPerUnit + fees);
  const profitPerUnit = round2(sellingPrice - trueCost);
  const marginPct = sellingPrice > 0 ? round2((profitPerUnit / sellingPrice) * 100) : 0;

  return {
    product: { id: product.id, sku: product.sku, title: product.title },
    as_of_date: normalizedAsOf,
    period,
    tier: tier ? { id: tier.id, name: tier.name, gateway_fee_pct: tier.gateway_fee_pct, commission_pct: tier.commission_pct } : null,
    selling_price: round2(sellingPrice),
    breakdown: {
      ingredient_breakdown: ingredientBreakdown,
      packaging_breakdown: packagingBreakdown,
      ingredient_cost: ingredientCost,
      packaging_cost: packagingCost,
      direct_cost: directCost,
      labour_per_unit: labourPerUnit,
      overhead_per_unit: overheadPerUnit,
      dispatch_per_unit: dispatchPerUnit,
      shipping_per_unit: shippingPerUnit,
      gateway_fee: gatewayFee,
      commission_fee: commissionFee,
      fees,
      true_cost: trueCost,
      profit_per_unit: profitPerUnit,
      margin_pct: marginPct
    },
    context: {
      recipe_id: recipe?.id || null,
      recipe_version: recipe?.version || null,
      recipe_effective_from: recipe?.effective_from || null,
      packaging_profile_id: packagingProfile?.id || null,
      packaging_profile_name: packagingProfile?.name || null,
      packaging_effective_from: packagingProfile?.effective_from || null
    }
  };
}
