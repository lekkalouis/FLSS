# Traceability Workflow Guide

FLSS still exposes the traceability API, but the supported operator entrypoint is now the Stock batches workflow rather than the old standalone page.

> Compatibility / legacy: `/traceability.html` now redirects to `/stock?section=batches`. Keep old bookmarks only for compatibility.

## 1. Supported operator path

Primary workflow:

1. Open `/stock`
2. Switch to the batches view
3. Use batch history and traceability records to identify the target batch
4. Use the traceability API or compatibility tooling when a workbook-driven report is still required

## 2. Inputs

Required:

- `batchNumber`
- `flavour`

Optional uploads:

- purchase orders workbook (`.xlsx` or `.xls`)
- COA or COC workbook (`.xlsx` or `.xls`)

If optional files are omitted, the service falls back to the generated sample template and built-in defaults where possible.

## 3. API endpoints

- `GET /api/v1/traceability/template.xlsx`
- `POST /api/v1/traceability/report`

## 4. Report output

The report payload combines:

- batch and week metadata
- matched Shopify sales lines
- normalized purchase rows
- COA or COC enrichment
- incoming-vehicle inspection checklist projections

## 5. Compatibility flow

If you still use the old workbook-driven process:

1. download the template workbook from `GET /api/v1/traceability/template.xlsx`
2. prepare the optional PO and COA/COC files
3. submit them to `POST /api/v1/traceability/report`
4. review the returned sales and purchase sections

## 6. Troubleshooting

- `batchNumber is required` - the request payload is missing the batch number.
- No sales lines - Shopify returned no matching sales in the computed batch window.
- No purchase rows - the uploaded workbook did not match the expected format or values.
- Request failed - inspect the server logs for traceability errors and confirm the workbook inputs.
