# Traceability Workflow Guide

The traceability tool (`/traceability.html`) is used to produce a batch-level report combining sales activity and supplier/COA context.

## 1) Inputs

Required:

- **Batch number** in format similar to `DDMMYY/WW`
- **Flavor**

Optional uploads:

- Purchase orders workbook (`.xlsx`/`.xls`)
- COA/COC workbook (`.xlsx`/`.xls`)

If optional files are omitted, the service falls back to available sample/default workbook logic.

## 2) API endpoints involved

- `GET /api/v1/traceability/template.xlsx` — downloadable sample template
- `POST /api/v1/traceability/report` — report generation endpoint

## 3) Report outputs

The response includes:

- Batch context (week and week date boundaries)
- Matched sales lines for the period/flavor
- Purchase rows augmented with COA/COC fields
- Incoming vehicle inspection checklist projection per row

## 4) Operator flow

1. Open `/traceability.html`.
2. Enter batch number and flavor.
3. Optionally upload PO and COA files.
4. Click **Run traceability**.
5. Review sales table and purchase/inspection table.
6. Download sample workbook when format alignment is needed.

## 5) Troubleshooting

- **`batchNumber is required`**: required input missing.
- **No sales lines**: no matching Shopify sales in computed week/flavor.
- **No purchase rows**: uploaded workbook has no matching rows or mapping mismatch.
- **Request failed**: inspect server logs for `TRACEABILITY_REPORT_FAILED` details.
