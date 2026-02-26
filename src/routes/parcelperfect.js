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


function getParcelPerfectRuntimeConfig() {
  const usingTestAccount = config.TEST_MODE && Boolean(config.TEST_PP_BASE_URL);
  return {
    usingTestAccount,
    baseUrl: usingTestAccount ? config.TEST_PP_BASE_URL : config.PP_BASE_URL,
    token: usingTestAccount ? config.TEST_PP_TOKEN : config.PP_TOKEN,
    requireToken: String(usingTestAccount ? config.TEST_PP_REQUIRE_TOKEN : config.PP_REQUIRE_TOKEN).toLowerCase() === "true"
  };
}

function shouldSimulateParcelPerfect() {
  if (!config.TEST_MODE) return false;
  if (!config.TEST_PP_BASE_URL) return true;
  const runtime = getParcelPerfectRuntimeConfig();
  return !runtime.baseUrl || !runtime.baseUrl.startsWith("http");
}


function buildTestModeParcelPerfectResponse({ method, className, params }) {
  const normalizedMethod = String(method || "").toLowerCase();

  if (normalizedMethod === "requestquote") {
    return {
      success: true,
      response: {
        quoteno: `TEST-QUOTE-${Date.now()}`,
        rates: [
          { service: "Road Freight", total: 99.99, subtotal: 99.99 },
          { service: "Express", total: 149.99, subtotal: 149.99 }
        ]
      },
      mode: "test"
    };
  }

  if (normalizedMethod === "getplacesbyname" || normalizedMethod === "getplacesbypostcode") {
    return {
      success: true,
      response: {
        places: [
          { place: 4663, town: "Cape Town", postcode: "7530" },
          { place: 1404, town: "Johannesburg", postcode: "2000" }
        ]
      },
      mode: "test"
    };
  }

  return {
    success: true,
    method,
    class: className,
    params,
    mode: "test"
  };
}


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

async function requestQuote({ details, weightKg, signal, runtime }) {
  const form = new URLSearchParams();
  form.set("method", "requestQuote");
  form.set("class", "Quote");
  if (runtime.token) form.set("token_id", runtime.token);
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
    runtime.baseUrl,
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
      target: runtime.baseUrl
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

router.post("/pp", async (req, res) => {
  try {
    const { method, classVal, class: classNameRaw, params } = req.body || {};
    const className = normalizeParcelPerfectClass(classVal || classNameRaw);

    if (!method || !className || typeof params !== "object" || params === null) {
      return badRequest(res, "Expected { method, classVal|class, params } in body");
    }

    const runtime = getParcelPerfectRuntimeConfig();

    if (shouldSimulateParcelPerfect()) {
      return res.json(buildTestModeParcelPerfectResponse({ method, className, params }));
    }

    if (!runtime.baseUrl || !runtime.baseUrl.startsWith("http")) {
      return res.status(500).json({
        error: "CONFIG_ERROR",
        message: "PP_BASE_URL is not a valid URL"
      });
    }

    const form = new URLSearchParams();
    form.set("method", String(method));
    form.set("class", String(className));
    form.set("params", JSON.stringify(params));

    const tokenToUse = runtime.requireToken ? runtime.token : "";
    if (tokenToUse) form.set("token_id", tokenToUse);

    const upstream = await fetchWithTimeout(
      runtime.baseUrl,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString()
      },
      config.PP_TIMEOUT_MS,
      {
        upstream: "parcelperfect",
        route: "POST /pp",
        target: runtime.baseUrl
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

    const runtime = getParcelPerfectRuntimeConfig();

    if (shouldSimulateParcelPerfect()) {
      return res.json(
        buildTestModeParcelPerfectResponse({
          method: "getPlacesByName",
          className: "Quote",
          params: { query }
        })
      );
    }

    if (!runtime.baseUrl || !runtime.baseUrl.startsWith("http")) {
      return res.status(500).json({
        error: "CONFIG_ERROR",
        message: "PP_BASE_URL is not a valid URL"
      });
    }

    if (runtime.requireToken && !runtime.token) {
      return res.status(500).json({
        error: "CONFIG_ERROR",
        message: "PP token is required for place lookups"
      });
    }

    const isPostcode = /^[0-9]{3,10}$/.test(query);
    const method = isPostcode ? "getPlacesByPostcode" : "getPlacesByName";
    const paramsObj = isPostcode ? { postcode: query } : { name: query };

    const form = new URLSearchParams();
    form.set("method", method);
    form.set("class", "Quote");
    if (runtime.token) form.set("token_id", runtime.token);
    form.set("params", JSON.stringify(paramsObj));

    const upstream = await fetchWithTimeout(
      runtime.baseUrl,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString()
      },
      config.PP_TIMEOUT_MS,
      {
        upstream: "parcelperfect",
        route: "GET /pp/place",
        target: runtime.baseUrl
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
    const runtime = getParcelPerfectRuntimeConfig();

    if (shouldSimulateParcelPerfect()) {
      const weights = normalizeWeights(req.body?.weightsKg || req.body?.weights || DEFAULT_MATRIX_WEIGHTS_KG);
      const destinations = selectMatrixDestinations(req.body || {});
      const rows = [];
      for (const destination of destinations) {
        for (const weight of weights) {
          rows.push({
            place: destination.place,
            town: destination.town,
            type: destination.type,
            province: destination.province,
            weightKg: weight,
            service: "Road Freight",
            amount: Number((75 + Number(weight) * 4.5).toFixed(2)),
            quoteno: `TEST-MATRIX-${destination.place}-${weight}`
          });
        }
      }
      return res.json({ ok: true, mode: "test", rows });
    }

    if (!runtime.baseUrl || !runtime.baseUrl.startsWith("http")) {
      return res.status(500).json({
        error: "CONFIG_ERROR",
        message: "PP_BASE_URL is not a valid URL"
      });
    }
    if (runtime.requireToken && !runtime.token) {
      return res.status(500).json({
        error: "CONFIG_ERROR",
        message: "PP token is required when token enforcement is enabled"
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
          const quote = await requestQuote({ details, weightKg, runtime });
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
