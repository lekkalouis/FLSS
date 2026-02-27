# Shopify Theme Price Tier Rendering (No Extra App)

FLSS stores variant tier pricing in Shopify metafield `custom.price_tiers`.

You can render customer-specific display pricing directly in the Shopify theme using this data.

> Theme logic affects **displayed** prices only. Checkout pricing still follows Shopify checkout rules unless you also implement B2B price lists, Shopify Functions, or direct variant price updates.

## 1) Expected metafield shape

`custom.price_tiers` is JSON containing tier keys such as:

- `default`
- `agent`
- `retailer`
- `export`
- `private`
- `fkb`
- `d2c`
- `b2b`

## 2) Add resolver snippet

Create `snippets/price-tier.liquid`:

```liquid
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

## 3) Render snippet in theme price blocks

```liquid
{% render 'price-tier', product: product %}
```

## 4) Keep metafields current

Use FLSS Price Manager to maintain tier data. Optionally syncing public variant price affects all customers globally.
