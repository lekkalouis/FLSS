# Shopify Theme Price Tier Rendering

FLSS stores variant tier pricing in Shopify metafield `custom.price_tiers`.

Use this guide when storefront display pricing should reflect the same tier data maintained in Admin -> Price Manager.

> Compatibility note: this affects storefront display only. Checkout pricing still follows Shopify checkout logic unless you also apply Shopify-native pricing rules.

## 1. Expected metafield shape

`custom.price_tiers` is JSON keyed by tier name, for example:

- `default`
- `agent`
- `retailer`
- `export`
- `private`
- `fkb`
- `d2c`
- `b2b`

## 2. Add a resolver snippet

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

## 3. Render the snippet

```liquid
{% render 'price-tier', product: product %}
```

## 4. Keep metafields current

The supported maintenance flow is:

1. open `/admin/price-manager`
2. update tier values
3. save or sync to Shopify

If you write the metafield from somewhere else, keep the same JSON keys expected by your theme snippet.
