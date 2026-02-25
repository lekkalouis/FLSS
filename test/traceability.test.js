import test from "node:test";
import assert from "node:assert/strict";

import XLSX from "xlsx";

import {
  buildTraceabilityTemplateBuffer,
  loadTraceabilityWorkbook,
  parseBatchCode
} from "../src/services/traceability.js";

test("parseBatchCode parses DDMMYY/WW", () => {
  assert.deepEqual(parseBatchCode("260225/08"), {
    day: 26,
    month: 2,
    shortYear: 25,
    year: 2025,
    week: 8,
    normalized: "260225/08"
  });
});

test("parseBatchCode rejects malformed values", () => {
  assert.equal(parseBatchCode("2025-02-26"), null);
  assert.equal(parseBatchCode("991325/99"), null);
});

test("template workbook buffer contains expected sheets", () => {
  const workbook = XLSX.read(buildTraceabilityTemplateBuffer(), { type: "buffer" });
  assert.ok(workbook.Sheets.PurchaseOrders);
  assert.ok(workbook.Sheets.COA);
});

test("loadTraceabilityWorkbook uses in-memory sample workbook when no files are uploaded", () => {
  const result = loadTraceabilityWorkbook();
  assert.ok(result.purchases.length > 0);
  assert.ok(result.coa.length > 0);
});
