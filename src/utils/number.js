export function numberOrDefault(value, fallback, { min = Number.NEGATIVE_INFINITY } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed < min ? fallback : parsed;
}
