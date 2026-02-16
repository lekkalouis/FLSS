import { Router } from "express";

import { badRequest } from "../utils/http.js";
import { fetchVariantPriceTiers } from "../services/shopify.js";
import { resolveWholesalePrice } from "../services/pricing/domain.js";
import {
  deletePriceList,
  deleteRule,
  legacyPriceTiersToRules,
  listPriceLists,
  upsertPriceList,
  upsertRule
} from "../services/pricing/store.js";

const router = Router();

function pickRulesForContext(priceLists = [], context = {}) {
  const candidates = priceLists
    .filter((list) => {
      if (list.channel && context.salesChannel) {
        return String(list.channel).toLowerCase() === String(context.salesChannel).toLowerCase();
      }
      return true;
    })
    .flatMap((list) => (Array.isArray(list.rules) ? list.rules : []));

  return candidates;
}

router.get("/pricing/lists", async (_req, res) => {
  const lists = await listPriceLists();
  return res.json({ priceLists: lists });
});

router.post("/pricing/lists", async (req, res) => {
  const body = req.body || {};
  if (!body.name) return badRequest(res, "Missing price list name");
  const list = await upsertPriceList(body);
  return res.status(201).json({ priceList: list });
});

router.put("/pricing/lists/:priceListId", async (req, res) => {
  const priceListId = String(req.params.priceListId || "");
  if (!priceListId) return badRequest(res, "Missing priceListId");
  const list = await upsertPriceList({ ...req.body, id: priceListId });
  return res.json({ priceList: list });
});

router.delete("/pricing/lists/:priceListId", async (req, res) => {
  const ok = await deletePriceList(String(req.params.priceListId || ""));
  if (!ok) return res.status(404).json({ error: "NOT_FOUND" });
  return res.status(204).end();
});

router.post("/pricing/lists/:priceListId/rules", async (req, res) => {
  const priceListId = String(req.params.priceListId || "");
  if (!priceListId) return badRequest(res, "Missing priceListId");
  const rule = await upsertRule(priceListId, req.body || {});
  if (!rule) return res.status(404).json({ error: "PRICE_LIST_NOT_FOUND" });
  return res.status(201).json({ rule });
});

router.put("/pricing/lists/:priceListId/rules/:ruleId", async (req, res) => {
  const priceListId = String(req.params.priceListId || "");
  const ruleId = String(req.params.ruleId || "");
  if (!priceListId || !ruleId) return badRequest(res, "Missing ids");

  const rule = await upsertRule(priceListId, { ...req.body, id: ruleId });
  if (!rule) return res.status(404).json({ error: "PRICE_LIST_NOT_FOUND" });
  return res.json({ rule });
});

router.delete("/pricing/lists/:priceListId/rules/:ruleId", async (req, res) => {
  const ok = await deleteRule(String(req.params.priceListId || ""), String(req.params.ruleId || ""));
  if (!ok) return res.status(404).json({ error: "NOT_FOUND" });
  return res.status(204).end();
});

router.post("/pricing/resolve", async (req, res) => {
  const body = req.body || {};
  const contexts = Array.isArray(body.contexts) ? body.contexts : body.context ? [body.context] : [];
  if (!contexts.length) return badRequest(res, "Provide context or contexts");

  const priceLists = await listPriceLists();

  const results = await Promise.all(
    contexts.map(async (context) => {
      const normalizedContext = {
        ...context,
        quantity: Number(context.quantity || 1),
        basePrice: context.basePrice != null ? Number(context.basePrice) : null,
        customerTags: Array.isArray(context.customerTags) ? context.customerTags : []
      };

      let rules = pickRulesForContext(priceLists, normalizedContext);

      if (normalizedContext.variantId && (!rules || !rules.length)) {
        const legacy = await fetchVariantPriceTiers(normalizedContext.variantId);
        const legacyRules = legacyPriceTiersToRules({
          variantId: normalizedContext.variantId,
          sku: normalizedContext.sku,
          priceTiers: legacy?.value
        });
        rules = [...(rules || []), ...legacyRules];
      }

      const resolution = resolveWholesalePrice(normalizedContext, rules || []);
      return {
        context: {
          variantId: normalizedContext.variantId || null,
          sku: normalizedContext.sku || null
        },
        ...resolution
      };
    })
  );

  return res.json({ results });
});

export default router;
