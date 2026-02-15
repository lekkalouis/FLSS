import { Router } from "express";

import { config } from "../../config.js";
import {
  fetchVariantPriceTiers,
  shopifyFetch,
  updateVariantPrice,
  upsertVariantPriceTiers
} from "../../services/shopify.js";
import { linkMetaobjectToResource, upsertSkuMaster } from "../../services/flssMeta.js";
import { badRequest } from "../../utils/http.js";
import {
  parsePageInfo,
  requireShopifyConfigured,
  toKg
} from "./shared.js";

const router = Router();
router.get("/shopify/products/search", async (req, res) => {
  try {
    if (!requireShopifyConfigured(res)) return;

    const q = String(req.query.q || "").trim();
    if (!q) return badRequest(res, "Missing search query (?q=...)");
    const includePriceTiers =
      String(req.query.includePriceTiers || "").toLowerCase() === "true" ||
      String(req.query.includePriceTiers || "") === "1";
    const productCode = String(req.query.productCode || "").trim();
    const productPageInfo = String(req.query.productPageInfo || "").trim();
    const variantPageInfo = String(req.query.variantPageInfo || "").trim();

    const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 50);
    const base = `/admin/api/${config.SHOPIFY_API_VERSION}`;

    const productParams = new URLSearchParams({
      limit: String(limit),
      fields: "id,title,variants"
    });
    if (productPageInfo) {
      productParams.set("page_info", productPageInfo);
    } else {
      productParams.set("title", q);
    }
    const productUrl = `${base}/products.json?${productParams.toString()}`;

    const variantParams = new URLSearchParams({
      limit: String(limit),
      fields: "id,product_id,title,sku,price,weight,weight_unit"
    });
    if (variantPageInfo) {
      variantParams.set("page_info", variantPageInfo);
    } else {
      variantParams.set("sku", q);
    }
    const variantUrl = `${base}/variants.json?${variantParams.toString()}`;

    const [prodResp, varResp] = await Promise.all([
      shopifyFetch(productUrl, { method: "GET" }),
      shopifyFetch(variantUrl, { method: "GET" })
    ]);

    if (!prodResp.ok || !varResp.ok) {
      const prodText = await prodResp.text();
      const varText = await varResp.text();
      return res.status(502).json({
        error: "SHOPIFY_UPSTREAM",
        statusText: `${prodResp.statusText} / ${varResp.statusText}`,
        body: { products: prodText, variants: varText }
      });
    }

    const prodData = await prodResp.json();
    const varData = await varResp.json();
    const products = Array.isArray(prodData.products) ? prodData.products : [];
    const variants = Array.isArray(varData.variants) ? varData.variants : [];

    const productPaging = parsePageInfo(prodResp.headers.get("link"));
    const variantPaging = parsePageInfo(varResp.headers.get("link"));

    const productTitleById = new Map(products.map((p) => [p.id, p.title]));

    const missingProductIds = [
      ...new Set(
        variants
          .map((v) => v.product_id)
          .filter((id) => id && !productTitleById.has(id))
      )
    ];

    if (missingProductIds.length) {
      const idsParam = missingProductIds.slice(0, 250).join(",");
      const idUrl = `${base}/products.json?ids=${idsParam}&fields=id,title`;
      const idResp = await shopifyFetch(idUrl, { method: "GET" });
      if (idResp.ok) {
        const idData = await idResp.json();
        const idProducts = Array.isArray(idData.products) ? idData.products : [];
        idProducts.forEach((p) => {
          productTitleById.set(p.id, p.title);
        });
      }
    }

    const normalized = [];
    const seen = new Set();

    products.forEach((p) => {
      const variantsList = Array.isArray(p.variants) ? p.variants : [];
      variantsList.forEach((v) => {
        const title =
          v.title && v.title !== "Default Title" ? `${p.title} – ${v.title}` : p.title;
        const entry = {
          variantId: v.id,
          sku: v.sku || "",
          title,
          price: v.price != null ? Number(v.price) : null,
          weightKg: toKg(v.weight, v.weight_unit)
        };
        const key = String(entry.variantId);
        if (!seen.has(key)) {
          seen.add(key);
          normalized.push(entry);
        }
      });
    });

    variants.forEach((v) => {
      const baseTitle = productTitleById.get(v.product_id) || "Variant";
      const title =
        v.title && v.title !== "Default Title" ? `${baseTitle} – ${v.title}` : baseTitle;
      const entry = {
        variantId: v.id,
        sku: v.sku || "",
        title,
        price: v.price != null ? Number(v.price) : null,
        weightKg: toKg(v.weight, v.weight_unit)
      };
      const key = String(entry.variantId);
      if (!seen.has(key)) {
        seen.add(key);
        normalized.push(entry);
      }
    });

    let filtered = normalized;
    if (productCode) {
      const code = productCode.toLowerCase();
      filtered = normalized.filter((item) => {
        if (String(item.variantId) === productCode) return true;
        const sku = String(item.sku || "").toLowerCase();
        return sku === code;
      });
    }

    if (includePriceTiers && filtered.length) {
      const tiersMap = new Map();
      await Promise.all(
        filtered.map(async (item) => {
          const tierData = await fetchVariantPriceTiers(item.variantId);
          if (tierData?.value) {
            tiersMap.set(String(item.variantId), tierData.value);
          }
        })
      );
      filtered.forEach((item) => {
        const tiers = tiersMap.get(String(item.variantId));
        if (tiers) item.priceTiers = tiers;
      });
    }

    return res.json({
      products: filtered,
      pageInfo: { products: productPaging, variants: variantPaging }
    });
  } catch (err) {
    console.error("Shopify product search error:", err);
    return res
      .status(502)
      .json({ error: "UPSTREAM_ERROR", message: String(err?.message || err) });
  }
});

router.get("/shopify/products/collection", async (req, res) => {
  try {
    if (!requireShopifyConfigured(res)) return;

    const handle = String(req.query.handle || "").trim();
    if (!handle) {
      return badRequest(res, "Missing collection handle (?handle=...)");
    }
    const includePriceTiers =
      String(req.query.includePriceTiers || "").toLowerCase() === "true" ||
      String(req.query.includePriceTiers || "") === "1";

    const base = `/admin/api/${config.SHOPIFY_API_VERSION}`;
    const customUrl = `${base}/custom_collections.json?handle=${encodeURIComponent(
      handle
    )}&fields=id,title`;
    const smartUrl = `${base}/smart_collections.json?handle=${encodeURIComponent(
      handle
    )}&fields=id,title`;

    const [customResp, smartResp] = await Promise.all([
      shopifyFetch(customUrl, { method: "GET" }),
      shopifyFetch(smartUrl, { method: "GET" })
    ]);

    let collectionId = null;
    if (customResp.ok) {
      const data = await customResp.json();
      const list = Array.isArray(data.custom_collections) ? data.custom_collections : [];
      if (list.length) collectionId = list[0].id;
    }
    if (!collectionId && smartResp.ok) {
      const data = await smartResp.json();
      const list = Array.isArray(data.smart_collections) ? data.smart_collections : [];
      if (list.length) collectionId = list[0].id;
    }

    if (!collectionId) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Collection not found" });
    }

    const limit = Math.min(Math.max(Number(req.query.limit || 250), 1), 250);
    const products = [];
    let nextPageInfo = "";
    let page = 0;
    const maxPages = 20;

    do {
      const params = new URLSearchParams({
        limit: String(limit),
        fields: "id,title,variants"
      });
      if (nextPageInfo) params.set("page_info", nextPageInfo);
      const productUrl = `${base}/collections/${collectionId}/products.json?${params.toString()}`;
      const prodResp = await shopifyFetch(productUrl, { method: "GET" });
      if (!prodResp.ok) {
        const body = await prodResp.text();
        return res.status(502).json({
          error: "SHOPIFY_UPSTREAM",
          status: prodResp.status,
          statusText: prodResp.statusText,
          body
        });
      }

      const prodData = await prodResp.json();
      const pageProducts = Array.isArray(prodData.products) ? prodData.products : [];
      products.push(...pageProducts);
      const paging = parsePageInfo(prodResp.headers.get("link"));
      nextPageInfo = paging?.next || "";
      page += 1;
    } while (nextPageInfo && page < maxPages);

    const normalized = [];
    const seen = new Set();

    products.forEach((p) => {
      const variantsList = Array.isArray(p.variants) ? p.variants : [];
      variantsList.forEach((v) => {
        const title =
          v.title && v.title !== "Default Title" ? `${p.title} – ${v.title}` : p.title;
        const entry = {
          variantId: v.id,
          sku: v.sku || "",
          title,
          price: v.price != null ? Number(v.price) : null,
          weightKg: toKg(v.weight, v.weight_unit)
        };
        const key = String(entry.variantId);
        if (!seen.has(key)) {
          seen.add(key);
          normalized.push(entry);
        }
      });
    });

    if (includePriceTiers && normalized.length) {
      const tiersMap = new Map();
      await Promise.all(
        normalized.map(async (item) => {
          const tierData = await fetchVariantPriceTiers(item.variantId);
          if (tierData?.value) {
            tiersMap.set(String(item.variantId), tierData.value);
          }
        })
      );
      normalized.forEach((item) => {
        const tiers = tiersMap.get(String(item.variantId));
        if (tiers) item.priceTiers = tiers;
      });
    }

    return res.json({ products: normalized });
  } catch (err) {
    console.error("Shopify collection products error:", err);
    return res
      .status(502)
      .json({ error: "UPSTREAM_ERROR", message: String(err?.message || err) });
  }
});

router.post("/shopify/variants/price-tiers", async (req, res) => {
  try {
    if (!requireShopifyConfigured(res)) return;

    const body = req.body || {};
    const updates = Array.isArray(body.updates) ? body.updates : body.variantId ? [body] : [];

    if (!updates.length) {
      return badRequest(res, "Provide updates array or variantId payload");
    }

    const results = await Promise.all(
      updates.map(async (update) => {
        const variantId = update?.variantId;
        if (!variantId) {
          return {
            ok: false,
            error: "MISSING_VARIANT_ID"
          };
        }

        const rawTiers =
          update?.priceTiers && typeof update.priceTiers === "object"
            ? update.priceTiers
            : null;
        if (!rawTiers) {
          return {
            ok: false,
            variantId,
            error: "MISSING_PRICE_TIERS"
          };
        }

        const cleaned = {};
        Object.entries(rawTiers).forEach(([key, value]) => {
          if (value == null || value === "") return;
          const num = Number(value);
          if (Number.isFinite(num)) cleaned[key] = num;
        });

        const metaResp = await upsertVariantPriceTiers(variantId, cleaned);
        const metaOk = metaResp.ok;

        try {
          const skuObj = await upsertSkuMaster({
            id: variantId,
            sku: update?.sku || `variant-${variantId}`,
            weight_grams: update?.weightGrams,
            volume_cm3: update?.volumeCm3,
            packaging_type: update?.packagingType
          });
          if (skuObj?.id) {
            await linkMetaobjectToResource("variant", variantId, "sku_master_ref", skuObj.id);
          }
        } catch (skuErr) {
          console.warn("SKU master metaobject warning:", skuErr);
        }

        let publicPriceUpdated = false;
        if (update?.updatePublicPrice) {
          const publicPrice =
            update?.publicPrice != null ? Number(update.publicPrice) : cleaned.default;
          if (Number.isFinite(publicPrice)) {
            const priceResp = await updateVariantPrice(variantId, publicPrice);
            publicPriceUpdated = priceResp.ok;
          }
        }

        return {
          ok: metaOk,
          variantId,
          metafieldUpdated: metaOk,
          publicPriceUpdated
        };
      })
    );

    const anyFailed = results.some((r) => !r.ok);
    return res.status(anyFailed ? 207 : 200).json({ results });
  } catch (err) {
    console.error("Shopify price tier update error:", err);
    return res
      .status(502)
      .json({ error: "UPSTREAM_ERROR", message: String(err?.message || err) });
  }
});

router.post("/shopify/variants/price-tiers/fetch", async (req, res) => {
  try {
    if (!requireShopifyConfigured(res)) return;

    const body = req.body || {};
    const variantIds = Array.isArray(body.variantIds) ? body.variantIds : [];
    if (!variantIds.length) {
      return badRequest(res, "Missing variantIds");
    }

    const uniqueIds = Array.from(
      new Set(
        variantIds
          .map((id) => String(id || "").trim())
          .filter(Boolean)
      )
    ).slice(0, 250);

    const tiersByVariantId = {};
    await Promise.all(
      uniqueIds.map(async (variantId) => {
        const tierData = await fetchVariantPriceTiers(variantId);
        if (tierData?.value && typeof tierData.value === "object") {
          tiersByVariantId[String(variantId)] = tierData.value;
        }
      })
    );

    return res.json({ priceTiersByVariantId: tiersByVariantId });
  } catch (err) {
    console.error("Shopify price tier fetch error:", err);
    return res
      .status(502)
      .json({ error: "UPSTREAM_ERROR", message: String(err?.message || err) });
  }
});


export default router;
