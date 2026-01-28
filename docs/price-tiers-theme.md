# Price tiers without an extra app (theme-only)

This project already stores per-variant price tiers in the Shopify variant metafield `custom.price_tiers`. That metafield is saved as JSON and contains keys like `default`, `agent`, `retailer`, `export`, `private`, `fkb`, etc. The FLOCS tool reads this to show tiered pricing, but if you want to **apply pricing logic without an extra app**, you can render pricing directly in your theme using customer tags + the metafield.

> ⚠️ **Important limitation**
> Theme-only logic changes **displayed prices**. Shopify’s actual checkout price still comes from the variant `price` unless you also use Shopify’s native B2B price lists, Shopify Functions, or update the variant price itself.

---

## 1) Add the pricing snippet

Create a snippet in your theme (e.g., `snippets/price-tier.liquid`) and paste the following:

```liquid
{%- comment -%}
  Price tier resolver
  - Reads JSON from variant metafield: custom.price_tiers
  - Resolves tier based on customer tags
{%- endcomment -%}

{%- assign variant = product.selected_or_first_available_variant -%}
{%- assign tiers = variant.metafields.custom.price_tiers.value -%}
{%- assign resolved_price = nil -%}

{%- if customer and tiers -%}
  {%- assign tags = customer.tags | downcase -%}
  {%- if tags contains 'agent' and tiers.agent -%}
    {%- assign resolved_price = tiers.agent -%}
  {%- elsif tags contains 'retailer' and tiers.retailer -%}
    {%- assign resolved_price = tiers.retailer -%}
  {%- elsif tags contains 'export' and tiers.export -%}
    {%- assign resolved_price = tiers.export -%}
  {%- elsif tags contains 'private' and tiers.private -%}
    {%- assign resolved_price = tiers.private -%}
  {%- elsif tags contains 'fkb' and tiers.fkb -%}
    {%- assign resolved_price = tiers.fkb -%}
  {%- elsif tags contains 'd2c' and tiers.d2c -%}
    {%- assign resolved_price = tiers.d2c -%}
  {%- elsif tags contains 'b2b' and tiers.b2b -%}
    {%- assign resolved_price = tiers.b2b -%}
  {%- elsif tiers.default -%}
    {%- assign resolved_price = tiers.default -%}
  {%- endif -%}
{%- elsif tiers and tiers.default -%}
  {%- assign resolved_price = tiers.default -%}
{%- endif -%}

{%- if resolved_price -%}
  {{ resolved_price | money }}
{%- else -%}
  {{ variant.price | money }}
{%- endif -%}
```

---

## 2) Use the snippet in product price templates

Wherever the product price is shown, replace the normal price output with:

```liquid
{% render 'price-tier', product: product %}
```

---

## 3) Optional: show a note for the active tier

```liquid
{%- if customer -%}
  <p class="price-tier-note">
    Pricing tier: {{ customer.tags }}
  </p>
{%- endif -%}
```

---

## 4) Keep your tiers in sync

Continue using the existing **Price Manager** in this repo to edit and save tier prices into the variant metafield `custom.price_tiers`. This theme snippet reads that same data.

If you decide to *also* update Shopify’s public price (variant `price`), you can use the “Sync public price” checkbox in the price manager — but that will change the price for **all** customers, not just tagged ones.
