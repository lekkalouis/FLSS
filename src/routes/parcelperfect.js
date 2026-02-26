import { Router } from "express";

import { config } from "../config.js";
import {
  extractQuoteFromV28,
  normalizeParcelPerfectClass,
  normalizeWeights,
  parseParcelPerfectPayload,
  pickQuoteRate,
  resolvePlaceId,
  selectMatrixDestinations
} from "../services/parcelperfect.js";
import {
  badRequest,
  fetchWithTimeout,
  isUpstreamTimeoutError,
  sendTimeoutResponse
} from "../utils/http.js";

const router = Router();

const DEFAULT_MATRIX_WEIGHTS_KG = [1, 2, 5, 10, 15, 20, 25];

function getDefaultMatrixDetails({ place, town, type }) {
  return {
    origpers: config.UI_ORIGIN_PERSON || "Flippen Lekka Holdings (Pty) Ltd",
    origperadd1: config.UI_ORIGIN_ADDR1 || "7 Papawer Street",
    origperadd2: config.UI_ORIGIN_ADDR2 || "Blomtuin, Bellville",
    origperadd3: config.UI_ORIGIN_ADDR3 || "Cape Town, Western Cape",
    origperadd4: config.UI_ORIGIN_ADDR4 || "ZA",
    origperpcode: config.UI_ORIGIN_POSTCODE || "7530",
    origtown: config.UI_ORIGIN_TOWN || "Cape Town",
    origplace: resolvePlaceId(config.UI_ORIGIN_PLACE_ID, config.PP_PLACE_ID, 4663),
    origpercontact: config.UI_ORIGIN_CONTACT || "Operations",
    origperphone: config.UI_ORIGIN_PHONE || "",
    origpercell: config.UI_ORIGIN_CELL || "",
    notifyorigpers: Number(config.UI_ORIGIN_NOTIFY || 1),
    origperemail: config.UI_ORIGIN_EMAIL || "admin@flippenlekkaspices.co.za",
    notes: `Shipping matrix simulation (${type})`,
    destpers: town,
    destperadd1: town,
    destperadd2: type,
    destperadd3: town,
    destperadd4: "ZA",
    destperpcode: "0001",
    desttown: town,
    destplace: place,
    destpercontact: town,
    destperphone: "",
    destpercell: "",
    destperemail: "",
    notifydestpers: 0
  };
}

async function requestQuote({ details, weightKg, signal }) {
  const form = new URLSearchParams();
  form.set("method", "requestQuote");
  form.set("class", "Quote");
  if (config.PP_TOKEN) form.set("token_id", config.PP_TOKEN);
  form.set(
    "params",
    JSON.stringify({
      details,
      contents: [
        {
          item: 1,
          pieces: 1,
          dim1: Number(config.UI_BOX_DIM_1 || 0.4),
          dim2: Number(config.UI_BOX_DIM_2 || 0.3),
          dim3: Number(config.UI_BOX_DIM_3 || 0.3),
          actmass: weightKg
        }
      ]
    })
  );

  const upstream = await fetchWithTimeout(
    config.PP_BASE_URL,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      signal
    },
    config.PP_TIMEOUT_MS,
    {
      upstream: "parcelperfect",
      route: "POST /pp/matrix",
      target: config.PP_BASE_URL
    }
  );

  const text = await upstream.text();
  const { parsed: data, error: parseError } = parseParcelPerfectPayload(text);
  if (!data) {
    return {
      ok: false,
      status: upstream.status,
      quoteno: null,
      service: null,
      amount: null,
      error: parseError,
      raw: text
    };
  }

  const { quoteno, rates } = extractQuoteFromV28(data);
  const picked = pickQuoteRate(rates);
  const amount = Number(picked?.total ?? picked?.subtotal ?? picked?.charge ?? NaN);
  return {
    ok: upstream.ok && Boolean(quoteno) && Number.isFinite(amount),
    status: upstream.status,
    quoteno,
    service: picked?.service || null,
    amount: Number.isFinite(amount) ? amount : null,
    error: upstream.ok ? null : data?.error || data?.message || null,
    raw: data
  };
}

async function requestSweQuote({ address, customer, weightKg }) {
  const details = {
    origpers: config.UI_ORIGIN_PERSON || "Flippen Lekka Holdings (Pty) Ltd",
    origperadd1: config.UI_ORIGIN_ADDR1 || "7 Papawer Street",
    origperadd2: config.UI_ORIGIN_ADDR2 || "Blomtuin, Bellville",
    origperadd3: config.UI_ORIGIN_ADDR3 || "Cape Town, Western Cape",
    origperadd4: config.UI_ORIGIN_ADDR4 || "ZA",
    origperpcode: config.UI_ORIGIN_POSTCODE || "7530",
    origtown: config.UI_ORIGIN_TOWN || "Cape Town",
    origplace: resolvePlaceId(config.UI_ORIGIN_PLACE_ID, config.PP_PLACE_ID, 4663),
    origpercontact: config.UI_ORIGIN_CONTACT || "Operations",
    origperphone: config.UI_ORIGIN_PHONE || "",
    origpercell: config.UI_ORIGIN_CELL || "",
    notifyorigpers: Number(config.UI_ORIGIN_NOTIFY || 1),
    origperemail: config.UI_ORIGIN_EMAIL || "admin@flippenlekkaspices.co.za",
    notes: "Shipping quote",
    destpers: address?.name || customer?.name || "Customer",
    destperadd1: address?.address1 || "",
    destperadd2: address?.address2 || "",
    destperadd3: address?.city || "",
    destperadd4: address?.province || "",
    destperpcode: address?.zip || "",
    desttown: address?.city || "",
    destplace: resolvePlaceId(config.UI_ORIGIN_PLACE_ID, config.PP_PLACE_ID, 4663),
    destpercontact: address?.name || customer?.name || "",
    destperphone: address?.phone || "",
    destpercell: address?.phone || "",
    destperemail: customer?.email || "",
    notifydestpers: 1
  };
  const quote = await requestQuote({ details, weightKg });
  return {
    carrier: "SWE",
    total: quote.amount,
    service: quote.service || "SWE",
    quoteno: quote.quoteno || null,
    ok: quote.ok
  };
}

async function requestTcgQuote({ address, customer, weightKg }) {
  if (!config.TCG_API_URL || !config.TCG_API_KEY) {
    return { carrier: "TCG", total: null, service: null, ok: false, error: "TCG not configured" };
  }
  const payload = {
    destination: {
      name: address?.name || customer?.name || "Customer",
      address1: address?.address1 || "",
      address2: address?.address2 || "",
      city: address?.city || "",
      province: address?.province || "",
      postal_code: address?.zip || "",
      phone: address?.phone || "",
      email: customer?.email || ""
    },
    parcels: [{ weight_kg: Number(weightKg || 1) }]
  };
  const upstream = await fetchWithTimeout(
    config.TCG_API_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.TCG_API_KEY}`,
        "X-API-Key": config.TCG_API_KEY
      },
      body: JSON.stringify(payload)
    },
    config.TCG_TIMEOUT_MS,
    { upstream: "tcg", route: "POST /shipping/quotes", target: config.TCG_API_URL }
  );
  const text = await upstream.text();
  let data;
  try { data = JSON.parse(text); } catch { data = {}; }
  const total = Number(data?.total ?? data?.amount ?? data?.quote?.total ?? data?.data?.total ?? NaN);
  const service = data?.service || data?.service_name || data?.quote?.service || "TCG";
  return {
    carrier: "TCG",
    total: Number.isFinite(total) ? total : null,
    service,
    quoteno: data?.quote_no || data?.id || null,
    ok: upstream.ok && Number.isFinite(total)
  };
}

router.post("/shipping/quotes", async (req, res) => {
  try {
    const { address, customer, weightKg } = req.body || {};
    if (!address?.address1 || !address?.city || !address?.zip) {
      return badRequest(res, "Missing destination address fields");
    }
    const mass = Math.max(0.5, Number(weightKg || 1));
    const [swe, tcg] = await Promise.allSettled([
      requestSweQuote({ address, customer, weightKg: mass }),
      requestTcgQuote({ address, customer, weightKg: mass })
    ]);
    const sweVal = swe.status === "fulfilled" ? swe.value : { carrier: "SWE", total: null, service: null, ok: false };
    const tcgVal = tcg.status === "fulfilled" ? tcg.value : { carrier: "TCG", total: null, service: null, ok: false };
    return res.json({
      ok: Boolean(sweVal.ok || tcgVal.ok),
      quotes: { SWE: sweVal, TCG: tcgVal }
    });
  } catch (err) {
    if (isUpstreamTimeoutError(err)) return sendTimeoutResponse(res, err);
    return res.status(502).json({ error: "UPSTREAM_ERROR", message: String(err?.message || err) });
  }
});

router.post("/pp", async (req, res) => {
  try {
    const { method, classVal, class: classNameRaw, params } = req.body || {};
    const className = normalizeParcelPerfectClass(classVal || classNameRaw);

    if (!method || !className || typeof params !== "object" || params === null) {
      return badRequest(res, "Expected { method, classVal|class, params } in body");
    }

    if (!config.PP_BASE_URL || !config.PP_BASE_URL.startsWith("http")) {
      return res.status(500).json({
        error: "CONFIG_ERROR",
        message: "PP_BASE_URL is not a valid URL"
      });
    }

    const form = new URLSearchParams();
    form.set("method", String(method));
    form.set("class", String(className));
    form.set("params", JSON.stringify(params));

    const mustUseToken = String(config.PP_REQUIRE_TOKEN) === "true";
    const tokenToUse = mustUseToken ? config.PP_TOKEN : "";
    if (tokenToUse) form.set("token_id", tokenToUse);

    const upstream = await fetchWithTimeout(
      config.PP_BASE_URL,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString()
      },
      config.PP_TIMEOUT_MS,
      {
        upstream: "parcelperfect",
        route: "POST /pp",
        target: config.PP_BASE_URL
      }
    );

    const text = await upstream.text();
    const contentType =
      upstream.headers.get("content-type") || "application/json; charset=utf-8";
    res.set("content-type", contentType);

    try {
      const json = JSON.parse(text);
      return res.status(upstream.status).json(json);
    } catch {
      return res.status(upstream.status).send(text);
    }
  } catch (err) {
    if (isUpstreamTimeoutError(err)) {
      return sendTimeoutResponse(res, err);
    }
    console.error("PP proxy error:", err);
    return res.status(502).json({
      error: "UPSTREAM_ERROR",
      message: String(err?.message || err)
    });
  }
});

router.get("/pp/place", async (req, res) => {
  try {
    const query = (req.query.q || req.query.query || "").trim();
    if (!query) return badRequest(res, "Missing ?q= query string for place search");

    if (!config.PP_BASE_URL || !config.PP_BASE_URL.startsWith("http")) {
      return res.status(500).json({
        error: "CONFIG_ERROR",
        message: "PP_BASE_URL is not a valid URL"
      });
    }

    if (!config.PP_TOKEN) {
      return res.status(500).json({
        error: "CONFIG_ERROR",
        message: "PP_TOKEN is required for place lookups"
      });
    }

    const isPostcode = /^[0-9]{3,10}$/.test(query);
    const method = isPostcode ? "getPlacesByPostcode" : "getPlacesByName";
    const paramsObj = isPostcode ? { postcode: query } : { name: query };

    const form = new URLSearchParams();
    form.set("method", method);
    form.set("class", "Quote");
    form.set("token_id", config.PP_TOKEN);
    form.set("params", JSON.stringify(paramsObj));

    const upstream = await fetchWithTimeout(
      config.PP_BASE_URL,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString()
      },
      config.PP_TIMEOUT_MS,
      {
        upstream: "parcelperfect",
        route: "GET /pp/place",
        target: config.PP_BASE_URL
      }
    );

    const text = await upstream.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      return res.status(upstream.status).send(text);
    }

    return res.status(upstream.status).json(json);
  } catch (err) {
    if (isUpstreamTimeoutError(err)) {
      return sendTimeoutResponse(res, err);
    }
    console.error("PP place lookup error:", err);
    return res.status(502).json({
      error: "UPSTREAM_ERROR",
      message: String(err?.message || err)
    });
  }
});

router.post("/pp/matrix", async (req, res) => {
  try {
    if (!config.PP_BASE_URL || !config.PP_BASE_URL.startsWith("http")) {
      return res.status(500).json({
        error: "CONFIG_ERROR",
        message: "PP_BASE_URL is not a valid URL"
      });
    }
    const mustUseToken = String(config.PP_REQUIRE_TOKEN) === "true";
    if (mustUseToken && !config.PP_TOKEN) {
      return res.status(500).json({
        error: "CONFIG_ERROR",
        message: "PP_TOKEN is required when PP_REQUIRE_TOKEN=true"
      });
    }

    const weights = normalizeWeights(req.body?.weights || DEFAULT_MATRIX_WEIGHTS_KG);
    const centreType = String(req.body?.centreType || req.body?.centerType || "all").toLowerCase();
    const destinations = selectMatrixDestinations(req.body?.destinations || [], centreType);
    if (!weights.length) {
      return badRequest(res, "Provide at least one positive weight in body.weights");
    }
    if (!destinations.length) {
      return badRequest(
        res,
        "No destinations available. Provide valid body.destinations or use a valid centreType filter."
      );
    }

    const matrix = [];
    let successCount = 0;
    for (const destination of destinations) {
      const row = {
        destination,
        quotes: []
      };
      for (const weightKg of weights) {
        try {
          const details = getDefaultMatrixDetails(destination);
          const quote = await requestQuote({ details, weightKg });
          if (quote.ok) successCount += 1;
          row.quotes.push({ weightKg, ...quote });
        } catch (error) {
          row.quotes.push({
            weightKg,
            ok: false,
            status: 502,
            quoteno: null,
            service: null,
            amount: null,
            error: String(error?.message || error),
            raw: null
          });
        }
      }
      matrix.push(row);
    }

    return res.json({
      generatedAt: new Date().toISOString(),
      originPlace: resolvePlaceId(config.UI_ORIGIN_PLACE_ID, config.PP_PLACE_ID, 4663),
      centreType,
      destinationCount: destinations.length,
      quoteAttempts: destinations.length * weights.length,
      successCount,
      weights,
      matrix
    });
  } catch (err) {
    if (isUpstreamTimeoutError(err)) {
      return sendTimeoutResponse(res, err);
    }
    console.error("PP matrix error:", err);
    return res.status(502).json({
      error: "UPSTREAM_ERROR",
      message: String(err?.message || err)
    });
  }
});

export default router;
