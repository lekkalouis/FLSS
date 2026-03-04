import { config } from "../config.js";
import { shopifyFetch } from "./shopify.js";
import { getProductDb } from "./productDb.js";

let running = false;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function markState(field) {
  const db = getProductDb();
  db.prepare(`UPDATE sync_state SET ${field} = datetime('now'), updated_at=datetime('now') WHERE id=1`).run();
}

async function pushQueueBatch(limit = 25) {
  const db = getProductDb();
  const rows = db.prepare("SELECT * FROM change_log WHERE sync_status IN ('pending','failed') ORDER BY id ASC LIMIT ?").all(limit);
  if (!rows.length) return { attempted: 0, succeeded: 0, failed: [] };

  let succeeded = 0;
  const failed = [];
  for (const row of rows) {
    try {
      const payload = JSON.parse(row.payload_json || "{}");
      if (row.entity_type === "compliance_profiles") {
        const product = db.prepare("SELECT * FROM products WHERE id = ?").get(row.entity_id);
        if (!product?.shopify_variant_id) throw new Error("Missing shopify_variant_id mapping");
        const variantGid = String(product.shopify_variant_id).startsWith("gid://") ? product.shopify_variant_id : `gid://shopify/ProductVariant/${product.shopify_variant_id}`;

        if (payload.ingredients_text !== undefined) {
          await shopifyFetch("graphql.json", {
            method: "POST",
            body: JSON.stringify({ query: `mutation M($metafields:[MetafieldsSetInput!]!){metafieldsSet(metafields:$metafields){userErrors{field message}}}`, variables: { metafields: [{ ownerId: variantGid, namespace: "flss", key: "ingredients_text", type: "single_line_text_field", value: String(payload.ingredients_text || "") }] } })
          });
        }
        if (payload.allergens !== undefined) {
          await shopifyFetch("graphql.json", {
            method: "POST",
            body: JSON.stringify({ query: `mutation M($metafields:[MetafieldsSetInput!]!){metafieldsSet(metafields:$metafields){userErrors{field message}}}`, variables: { metafields: [{ ownerId: variantGid, namespace: "flss", key: "allergens", type: "json", value: JSON.stringify(payload.allergens || []) }] } })
          });
        }
      }
      db.prepare("UPDATE change_log SET sync_status='synced', last_error=NULL, updated_at=datetime('now') WHERE id=?").run(row.id);
      succeeded += 1;
    } catch (error) {
      db.prepare("UPDATE change_log SET sync_status='failed', retries=retries+1, last_error=?, updated_at=datetime('now') WHERE id=?").run(error.message, row.id);
      failed.push({ id: row.id, error: error.message });
      await sleep(150);
    }
  }
  markState("last_push_at");
  return { attempted: rows.length, succeeded, failed };
}

async function pullProductBasics() {
  const db = getProductDb();
  const result = await shopifyFetch("graphql.json", {
    method: "POST",
    body: JSON.stringify({
      query: `query Products($first:Int!){products(first:$first){edges{node{id title status variants(first:20){edges{node{id sku barcode}}}}}}}`,
      variables: { first: 50 }
    })
  });
  const body = await result.json();
  const edges = body?.data?.products?.edges || [];
  for (const edge of edges) {
    const product = edge?.node;
    const variants = product?.variants?.edges || [];
    for (const variantEdge of variants) {
      const v = variantEdge?.node;
      const sku = String(v?.sku || "").trim();
      if (!sku) continue;
      const existing = db.prepare("SELECT * FROM products WHERE sku = ?").get(sku);
      if (!existing) {
        db.prepare("INSERT INTO products(sku, barcode, title, status, shopify_product_id, shopify_variant_id) VALUES (?, ?, ?, ?, ?, ?)")
          .run(sku, v?.barcode || null, product?.title || sku, String(product?.status || "active").toLowerCase(), String(product?.id || ""), String(v?.id || ""));
      } else {
        db.prepare("UPDATE products SET barcode=?, title=?, status=?, shopify_product_id=?, shopify_variant_id=?, updated_at=datetime('now') WHERE id=?")
          .run(v?.barcode || null, product?.title || existing.title, String(product?.status || existing.status).toLowerCase(), String(product?.id || existing.shopify_product_id || ""), String(v?.id || existing.shopify_variant_id || ""), existing.id);
      }
    }
  }
  markState("last_pull_at");
  return { pulled: edges.length };
}

export async function runSyncNow() {
  if (String(config.SYNC_ENABLED).toLowerCase() !== "true") return { ok: false, error: "SYNC_DISABLED" };
  if (running) return { ok: false, error: "SYNC_ALREADY_RUNNING" };
  running = true;
  try {
    const pull = await pullProductBasics();
    const push = await pushQueueBatch();
    return { ok: true, pull, push };
  } catch (error) {
    return { ok: false, error: error.message };
  } finally {
    running = false;
  }
}

let interval;
export function startSyncWorker() {
  if (interval) return;
  if (process.env.NODE_ENV === "test") return;
  if (String(config.SYNC_ENABLED).toLowerCase() !== "true") return;
  interval = setInterval(() => {
    runSyncNow().catch(() => {});
  }, 60_000);
  if (typeof interval.unref === "function") interval.unref();
}
