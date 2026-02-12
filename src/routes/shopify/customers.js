import { Router } from "express";

import { config } from "../../config.js";
import { shopifyFetch } from "../../services/shopify.js";
import { badRequest } from "../../utils/http.js";
import { requireShopifyConfigured } from "./shared.js";

const router = Router();

function normalizeCustomer(customer, metafields = {}) {
  if (!customer) return null;
  const first = (customer.first_name || "").trim();
  const last = (customer.last_name || "").trim();
  const fullName =
    customer.name ||
    `${first} ${last}`.trim() ||
    customer.email ||
    customer.phone ||
    "Unnamed customer";

  return {
    id: customer.id,
    name: fullName,
    email: customer.email || "",
    phone: customer.phone || "",
    tags: customer.tags || "",
    addresses: Array.isArray(customer.addresses) ? customer.addresses : [],
    default_address: customer.default_address || null,
    delivery_method: metafields.delivery_method || null,
    deliveryInstructions: metafields.delivery_instructions || null,
    companyName: metafields.company_name || null,
    vatNumber: metafields.vat_number || null
  };
}
router.get("/shopify/customers/search", async (req, res) => {
  try {
    if (!requireShopifyConfigured(res)) return;

    const q = String(req.query.q || "").trim();
    if (!q) return badRequest(res, "Missing search query (?q=...)");

    const limit = Math.min(Math.max(Number(req.query.limit || 10), 1), 50);
    const base = `/admin/api/${config.SHOPIFY_API_VERSION}`;
    const url =
      `${base}/customers/search.json?limit=${limit}` +
      `&query=${encodeURIComponent(q)}` +
      `&order=orders_count desc` +
      `&fields=id,first_name,last_name,email,phone,addresses,default_address,tags,orders_count`;

    const resp = await shopifyFetch(url, { method: "GET" });
    if (!resp.ok) {
      const body = await resp.text();
      return res.status(resp.status).json({
        error: "SHOPIFY_UPSTREAM",
        status: resp.status,
        statusText: resp.statusText,
        body
      });
    }

    const data = await resp.json();
    const customers = Array.isArray(data.customers) ? data.customers : [];
    customers.sort(
      (a, b) => Number(b.orders_count || 0) - Number(a.orders_count || 0)
    );

    const metafieldsByCustomer = await Promise.all(
      customers.map(async (cust) => {
        try {
          const metaUrl = `${base}/customers/${cust.id}/metafields.json`;
          const metaResp = await shopifyFetch(metaUrl, { method: "GET" });
          if (!metaResp.ok) return null;
          const metaData = await metaResp.json();
          const metafields = Array.isArray(metaData.metafields) ? metaData.metafields : [];
          const getValue = (key) =>
            metafields.find((mf) => mf.namespace === "custom" && mf.key === key)?.value || null;
          return {
            delivery_method: getValue("delivery_method"),
            delivery_instructions: getValue("delivery_instructions"),
            company_name: getValue("company_name"),
            vat_number: getValue("vat_number")
          };
        } catch {
          return null;
        }
      })
    );

    const normalized = customers
      .map((cust, idx) => normalizeCustomer(cust, metafieldsByCustomer[idx] || {}))
      .filter(Boolean);

    return res.json({ customers: normalized });
  } catch (err) {
    console.error("Shopify customer search error:", err);
    return res
      .status(502)
      .json({ error: "UPSTREAM_ERROR", message: String(err?.message || err) });
  }
});

router.post("/shopify/customers", async (req, res) => {
  try {
    if (!requireShopifyConfigured(res)) return;

    const {
      firstName,
      lastName,
      email,
      phone,
      company,
      vatNumber,
      deliveryInstructions,
      deliveryMethod,
      customerTier,
      address
    } =
      req.body || {};

    if (!firstName && !lastName && !email && !phone) {
      return badRequest(res, "Provide at least a name, email, or phone number");
    }

    const tier = String(customerTier || "").trim();
    if (!tier) {
      return badRequest(res, "Customer tier is required");
    }

    const base = `/admin/api/${config.SHOPIFY_API_VERSION}`;
    const metafields = [];
    if (deliveryMethod) {
      metafields.push({
        namespace: "custom",
        key: "delivery_method",
        type: "single_line_text_field",
        value: deliveryMethod
      });
    }
    if (deliveryInstructions) {
      metafields.push({
        namespace: "custom",
        key: "delivery_instructions",
        type: "multi_line_text_field",
        value: deliveryInstructions
      });
    }
    if (company) {
      metafields.push({
        namespace: "custom",
        key: "company_name",
        type: "single_line_text_field",
        value: company
      });
    }
    if (vatNumber) {
      metafields.push({
        namespace: "custom",
        key: "vat_number",
        type: "single_line_text_field",
        value: vatNumber
      });
    }

    const payload = {
      customer: {
        first_name: firstName || "",
        last_name: lastName || "",
        email: email || "",
        phone: phone || "",
        addresses: address
          ? [
              {
                address1: address.address1 || "",
                address2: address.address2 || "",
                city: address.city || "",
                province: address.province || "",
                zip: address.zip || "",
                country: address.country || "",
                company: company || "",
                first_name: firstName || "",
                last_name: lastName || "",
                phone: phone || ""
              }
            ]
          : [],
        note: vatNumber ? `VAT ID: ${vatNumber}` : undefined,
        tags: tier,
        metafields: [
          ...metafields,
          {
            namespace: "custom",
            key: "tier",
            type: "single_line_text_field",
            value: tier
          }
        ]
      }
    };

    const resp = await shopifyFetch(`${base}/customers.json`, {
      method: "POST",
      body: JSON.stringify(payload)
    });

    const text = await resp.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    if (!resp.ok) {
      return res.status(resp.status).json({
        error: "SHOPIFY_UPSTREAM",
        status: resp.status,
        statusText: resp.statusText,
        body: data
      });
    }

    const customer = normalizeCustomer(data.customer, {
      delivery_method: deliveryMethod || null,
      delivery_instructions: deliveryInstructions || null,
      company_name: company || null,
      vat_number: vatNumber || null
    });
    return res.json({ ok: true, customer });
  } catch (err) {
    console.error("Shopify customer create error:", err);
    return res
      .status(502)
      .json({ error: "UPSTREAM_ERROR", message: String(err?.message || err) });
  }
});


export default router;
