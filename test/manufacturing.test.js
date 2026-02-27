import test from "node:test";
import assert from "node:assert/strict";

import { createManufacturingService } from "../src/services/manufacturing.js";

function makeJsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    }
  };
}

test("resolveBoms expands BOM lines from flss_bom metaobject", async () => {
  let callCount = 0;
  const service = createManufacturingService({
    shopifyFetchFn: async (_path, options) => {
      callCount += 1;
      const body = JSON.parse(options.body);
      const ids = body.variables.ids;

      if (ids[0]?.includes("ProductVariant")) {
        return makeJsonResponse({
          data: {
            nodes: [
              {
                id: "gid://shopify/ProductVariant/101",
                metafields: {
                  edges: [
                    { node: { namespace: "flss", key: "manufacturing_mode", value: "make" } },
                    { node: { namespace: "flss", key: "bom_current", value: "gid://shopify/Metaobject/900" } }
                  ]
                }
              }
            ]
          }
        });
      }

      return makeJsonResponse({
        data: {
          nodes: [
            {
              id: "gid://shopify/Metaobject/900",
              type: "flss_bom",
              fields: [
                {
                  key: "lines",
                  references: {
                    nodes: [
                      {
                        id: "gid://shopify/Metaobject/901",
                        type: "flss_bom_line",
                        fields: [
                          {
                            key: "component_variant",
                            reference: { id: "gid://shopify/ProductVariant/555" }
                          },
                          { key: "qty", value: "2" },
                          { key: "uom", value: "g" },
                          { key: "loss_pct", value: "5" }
                        ]
                      }
                    ]
                  }
                }
              ]
            }
          ]
        }
      });
    }
  });

  const boms = await service.resolveBoms([101]);
  assert.equal(callCount, 2);
  assert.equal(boms["101"].manufacturingMode, "make");
  assert.equal(boms["101"].bomLines.length, 1);
  assert.deepEqual(boms["101"].bomLines[0], {
    componentVariantId: "555",
    qtyPerUnit: 2,
    uom: "g",
    lossPct: 5
  });
});

test("checkOrder aggregates demand and shortage state", async () => {
  const service = createManufacturingService({
    shopifyFetchFn: async (path, options) => {
      if (path.includes("/orders/")) {
        return makeJsonResponse({
          order: {
            id: 44,
            name: "#44",
            line_items: [{ variant_id: 101, quantity: 3 }]
          }
        });
      }

      const body = JSON.parse(options.body);
      const ids = body.variables.ids;
      if (ids[0]?.includes("ProductVariant")) {
        return makeJsonResponse({
          data: {
            nodes: [
              {
                id: "gid://shopify/ProductVariant/101",
                metafields: {
                  edges: [
                    { node: { namespace: "flss", key: "manufacturing_mode", value: "make" } },
                    { node: { namespace: "flss", key: "bom_current", value: "gid://shopify/Metaobject/900" } }
                  ]
                }
              }
            ]
          }
        });
      }

      return makeJsonResponse({
        data: {
          nodes: [
            {
              id: "gid://shopify/Metaobject/900",
              type: "flss_bom",
              fields: [
                {
                  key: "lines",
                  references: {
                    nodes: [
                      {
                        id: "gid://shopify/Metaobject/901",
                        type: "flss_bom_line",
                        fields: [
                          { key: "component_variant", reference: { id: "gid://shopify/ProductVariant/555" } },
                          { key: "qty", value: "2" },
                          { key: "uom", value: "unit" }
                        ]
                      }
                    ]
                  }
                }
              ]
            }
          ]
        }
      });
    },
    fetchInventoryItemIdsForVariantsFn: async () => new Map([[555, 777]]),
    fetchInventoryLevelsForItemsFn: async () => new Map([[777, 4]]),
    fetchPrimaryLocationIdFn: async () => 1
  });

  const result = await service.checkOrder({ orderId: 44 });
  assert.equal(result.status, "short");
  assert.equal(result.components[0].required, 6);
  assert.equal(result.components[0].shortage, 2);
});


test("ensurePhase1Definitions reports missing definitions in dry-run mode", async () => {
  const service = createManufacturingService({
    shopifyFetchFn: async (_path, options) => {
      const body = JSON.parse(options.body);
      if (body.query.includes("query Phase1Definitions")) {
        return makeJsonResponse({
          data: {
            metafieldDefinitions: { nodes: [{ key: "manufacturing_mode" }] },
            metaobjectDefinitions: { nodes: [{ type: "flss_bom" }] }
          }
        });
      }
      throw new Error("unexpected GraphQL operation");
    }
  });

  const result = await service.ensurePhase1Definitions({ apply: false });
  assert.equal(result.apply, false);
  assert.deepEqual(
    result.missingVariantMetafields.map((item) => item.key),
    ["bom_current", "bom_alternates", "batch_policy"]
  );
  assert.deepEqual(result.missingMetaobjectDefinitions.map((item) => item.type), ["flss_bom_line"]);
});
