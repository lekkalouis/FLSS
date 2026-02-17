import { Router } from "express";

import { config } from "../config.js";
import { normalizeParcelPerfectClass } from "../services/parcelperfect.js";
import {
  badRequest,
  fetchWithTimeout,
  isUpstreamTimeoutError,
  sendTimeoutResponse
} from "../utils/http.js";

const router = Router();

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

export default router;
