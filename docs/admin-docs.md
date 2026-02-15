# FLSS Admin Documentation

## Purpose
This guide is for system administrators and business owners responsible for governance, access, and data quality.

## Administrative modules
- **Pricing Control Center (`/price-manager`)**
  - Maintain tier pricing and publish controlled syncs to Shopify.
- **Inventory Control (`/stock`)**
  - Audit inventory visibility and enforce adjustment practices.
- **Distribution Network (`/stockists`)**
  - Manage agents, retailers, and SKU assignment policies.
- **Traceability (`/traceability`)**
  - Maintain production lineage, document captures, and inspections.
- **Sales Order Workbench (`/flocs`)**
  - Govern privileged commercial order creation workflows.

## Governance responsibilities
- Maintain environment variables and third-party credentials.
- Protect privileged routes with `ADMIN_TOKEN` where required.
- Review Shopify/ParcelPerfect/PrintNode integration reliability.
- Ensure pricing and stockist updates follow approval policy.
- Track traceability record completeness for audit readiness.

## Reference documents
- `docs/stockists-module.md`
- `docs/price-tiers-theme.md`
- `docs/database-and-remote-access.md`
