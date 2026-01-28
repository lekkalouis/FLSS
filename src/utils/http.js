export function badRequest(res, message, detail) {
  return res.status(400).json({ error: "BAD_REQUEST", message, detail });
}

export function buildServiceStatus(ok, detail) {
  return { ok: Boolean(ok), detail };
}
