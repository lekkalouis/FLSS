# FLSS Full System Mind Map and Process Flow

This document provides two architecture views for the full Flippen Lekka Scan Station (FLSS) system:

1. A **mind map** for static structure (capabilities, modules, integrations, and data boundaries).
2. A **process flow chart** for runtime behavior (from operator action to external side effects).

---

## 1) Full System Mind Map

```mermaid
mindmap
  root((FLSS Full System))
    Users & Actors
      Warehouse Operator
      Dispatch Coordinator
      Sales / Order Capture User
      Support / Admin User
    Frontend (SPA in public/)
      Scan Station (/)
        Scan barcode
        Parse order and parcel sequence
        Book shipment
        Print labels
        Fulfill order
      Dispatch Board (/ops)
        Open order monitoring
        Manual Book Now actions
        Delivery note printing
        Truck booking threshold alerts
      Documentation (/docs)
        Operator guidance
        API reference pages
      FLOCS / Order Capture (/flocs)
        Customer search/create
        Product + collection search
        Shipping quote integration
        Draft or direct order creation
      Stock Take (/stock)
        Inventory-level reads
        Stock take set mode
        Stock received transfer mode
        Activity log in localStorage
      Price Manager (/price-manager)
        Read custom.price_tiers metafield
        Update price tiers
        Optional sync to variant price
      Additional Admin Views
        Notification templates
        Liquid templates
        Customer accounts
        Traceability
    Backend (Node + Express)
      API Namespace (/api/v1)
        Status routes
          healthz
          statusz
        Config route
        Shopify routes
        ParcelPerfect routes
        PrintNode route
        Alerts route
        Customer Accounts route
        Notification Templates route
        Liquid Templates route
        Docs route
        Traceability route
      Cross-cutting middleware
        Helmet
        CORS
        JSON parser with raw body capture
        Rate limiting
        Request logging
      Static hosting
        Serve public/
        SPA fallback to index.html
    Service Layer
      Shopify service
        OAuth token acquisition
        Token cache
        Retry/error handling
      ParcelPerfect service
        Booking and quote request formatting
      Email service
        SMTP transport
        Book truck alerts
        Collection notifications
      Customer Accounts service
      Traceability service
      Pricing resolver service
      Customer orders service
    External Integrations
      Shopify Admin API
        Customers
        Products & collections
        Draft orders
        Orders
        Fulfillment events
        Inventory levels
        Variant metafields
      ParcelPerfect API
        Quotes
        Place lookup
        Bookings
        Matrix calculations
      PrintNode API
        Label and delivery-note print jobs
      SMTP Provider
        Operational alert emails
        Customer notification emails
    Data & Persistence
      FLSS Server
        Stateless API layer
        No app database
      Browser localStorage
        UI settings
        Stock activity history
        Order-capture local auth state
      System-of-record platforms
        Shopify
        ParcelPerfect
        PrintNode
        SMTP logs
    Operational Concerns
      Security
        CORS allow-list
        Helmet hardening
        Rate limiting
      Reliability
        Health checks
        Integration status checks
        Fail-fast on missing config
      Deployment
        Node runtime
        Environment variable configuration
        Optional Cloudflare Tunnel exposure
```

---

## 2) Full System Process Flow Chart

```mermaid
flowchart TD
  A[User opens FLSS SPA] --> B[Frontend route selected\nScan / Ops / FLOCS / Stock / Price / Admin]
  B --> C[User action captured in browser UI]
  C --> D[Frontend validates + normalizes payload]
  D --> E[HTTP request to /api/v1/*]

  E --> F[Express middleware pipeline]
  F --> F1[Helmet + CORS checks]
  F1 --> F2[JSON parse + raw body capture]
  F2 --> F3[Rate limit + request logging]
  F3 --> G[Route handler dispatch]

  G --> H{Requested capability}

  H -->|Shopify domain| I[Shopify route/service]
  I --> I1[Get/refresh OAuth access token]
  I1 --> I2[Call Shopify Admin API]
  I2 --> I3[Normalize Shopify response]

  H -->|Parcel shipping domain| J[ParcelPerfect route/service]
  J --> J1[Build form-encoded request]
  J1 --> J2[Call ParcelPerfect API]
  J2 --> J3[Normalize quote/booking response]

  H -->|Printing domain| K[PrintNode route]
  K --> K1[Build print job payload]
  K1 --> K2[Call PrintNode API]
  K2 --> K3[Return print job status]

  H -->|Alert/notification domain| L[Alerts or notify-collection route]
  L --> L1[Compose email payload]
  L1 --> L2[Send via SMTP transport]
  L2 --> L3[Return delivery/send result]

  H -->|Config/status/docs/templates/accounts/traceability| M[Internal route logic]
  M --> M1[Read env/config or service output]
  M1 --> M2[Return normalized response]

  I3 --> N[JSON response to frontend]
  J3 --> N
  K3 --> N
  L3 --> N
  M2 --> N

  N --> O[Frontend updates UI state]
  O --> P{Needs local persistence?}
  P -->|Yes| Q[Write selected state/logs to localStorage]
  P -->|No| R[Transient UI state only]

  Q --> S[Operator continues workflow]
  R --> S
  S --> T[Optional chained actions\nbook -> print -> fulfill -> notify]
  T --> E
```

---

## Notes for use

- These diagrams are designed for onboarding, operations handover, and architecture reviews.
- The mind map is ideal for discussing ownership and boundaries.
- The process flow chart is ideal for debugging cross-system workflows and identifying where errors are introduced.
