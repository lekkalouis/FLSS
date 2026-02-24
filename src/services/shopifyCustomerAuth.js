import { config } from "../config.js";
import { fetchWithTimeout } from "../utils/http.js";

export async function storefrontFetch({ query, variables = {} }) {
  const url = `https://${config.SHOPIFY_STORE}.myshopify.com/api/${config.SHOPIFY_API_VERSION}/graphql.json`;

  return fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Shopify-Storefront-Access-Token": config.SHOPIFY_STOREFRONT_ACCESS_TOKEN
      },
      body: JSON.stringify({ query, variables })
    },
    config.SHOPIFY_TIMEOUT_MS,
    {
      upstream: "shopify-storefront",
      route: "storefrontFetch",
      target: url
    }
  );
}
