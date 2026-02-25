export function badRequest(res, message, detail) {
  return res.status(400).json({ error: "BAD_REQUEST", message, detail });
}

export function buildServiceStatus(ok, detail) {
  return { ok: Boolean(ok), detail };
}

export class UpstreamTimeoutError extends Error {
  constructor({ upstream, timeoutMs, route, target }) {
    super(`Upstream timeout (${upstream}) after ${timeoutMs}ms`);
    this.name = "UpstreamTimeoutError";
    this.code = "UPSTREAM_TIMEOUT";
    this.upstream = upstream;
    this.timeoutMs = timeoutMs;
    this.route = route;
    this.target = target;
  }
}

export function isUpstreamTimeoutError(error) {
  return error?.code === "UPSTREAM_TIMEOUT" || error instanceof UpstreamTimeoutError;
}

export async function fetchWithTimeout(url, options = {}, timeoutMs = 10_000, metadata = {}) {
  const { upstream = "unknown", route = "unknown", target = String(url) } = metadata;
  const controller = new AbortController();
  const callerSignal = options?.signal;
  const requestStartedAtMs = Date.now();
  let timedOut = false;

  const onCallerAbort = () => {
    if (!controller.signal.aborted) controller.abort(callerSignal.reason);
  };

  if (callerSignal) {
    if (callerSignal.aborted) {
      onCallerAbort();
    } else {
      callerSignal.addEventListener("abort", onCallerAbort, { once: true });
    }
  }

  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } catch (error) {
    if (timedOut && error?.name === "AbortError") {
      const durationMs = Math.max(0, Date.now() - requestStartedAtMs);
      console.warn(
        `[upstream-timeout] route=${route} upstream=${upstream} target=${target} timeoutMs=${durationMs}`
      );
      throw new UpstreamTimeoutError({ upstream, timeoutMs: durationMs, route, target });
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    callerSignal?.removeEventListener?.("abort", onCallerAbort);
  }
}

export function sendTimeoutResponse(res, error) {
  return res.status(504).json({
    error: "UPSTREAM_TIMEOUT",
    upstream: error?.upstream || "unknown",
    route: error?.route || "unknown",
    target: error?.target || "unknown",
    timeoutMs: Number(error?.timeoutMs) || 0,
    message: `Upstream ${error?.upstream || "unknown"} timed out after ${Number(error?.timeoutMs) || 0}ms`
  });
}
