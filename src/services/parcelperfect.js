export function normalizeParcelPerfectClass(value) {
  if (!value) return value;
  const raw = String(value).trim();
  const lower = raw.toLowerCase();
  if (lower === "quote") return "Quote";
  if (lower === "collection") return "Collection";
  if (lower === "waybill") return "Waybill";
  if (lower === "auth") return "Auth";
  return raw;
}

export const SOUTH_AFRICA_MATRIX_CENTRES = [
  { place: 1404, town: "Johannesburg", type: "major", province: "Gauteng" },
  { place: 1573, town: "Pretoria", type: "major", province: "Gauteng" },
  { place: 4663, town: "Cape Town", type: "major", province: "Western Cape" },
  { place: 5884, town: "Durban", type: "major", province: "KwaZulu-Natal" },
  { place: 7739, town: "Port Elizabeth", type: "major", province: "Eastern Cape" },
  { place: 1105, town: "Bloemfontein", type: "major", province: "Free State" },
  { place: 1546, town: "Nelspruit", type: "regional", province: "Mpumalanga" },
  { place: 2558, town: "Polokwane", type: "regional", province: "Limpopo" },
  { place: 4287, town: "Kimberley", type: "regional", province: "Northern Cape" },
  { place: 6182, town: "Pietermaritzburg", type: "regional", province: "KwaZulu-Natal" },
  { place: 6956, town: "East London", type: "regional", province: "Eastern Cape" },
  { place: 2278, town: "George", type: "regional", province: "Western Cape" },
  { place: 2627, town: "Rustenburg", type: "regional", province: "North West" },
  { place: 1794, town: "Mthatha", type: "regional", province: "Eastern Cape" }
];

export function parseWeightKg(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Number(numeric.toFixed(3));
}

export function normalizeWeights(weights = []) {
  if (!Array.isArray(weights)) return [];
  return [...new Set(weights.map(parseWeightKg).filter((value) => value !== null))].sort((a, b) => a - b);
}

export function normalizeMatrixDestinations(destinations = []) {
  if (!Array.isArray(destinations)) return [];
  return destinations
    .map((destination) => {
      if (!destination || typeof destination !== "object") return null;
      const place = Number(destination.place);
      if (!Number.isFinite(place) || place <= 0) return null;
      const town = String(destination.town || destination.name || "").trim();
      const type = String(destination.type || "major").trim().toLowerCase();
      return {
        place,
        town,
        name: String(destination.name || town || `Place ${place}`).trim(),
        type: type === "regional" ? "regional" : "major",
        postcode: String(destination.postcode || "").trim() || null,
        province: String(destination.province || "").trim() || null
      };
    })
    .filter((value) => value !== null);
}

export function selectMatrixDestinations(destinations = [], centreType = "all") {
  const normalized = normalizeMatrixDestinations(destinations);
  const fallback = normalizeMatrixDestinations(SOUTH_AFRICA_MATRIX_CENTRES);
  const source = normalized.length ? normalized : fallback;
  const type = String(centreType || "all").trim().toLowerCase();
  if (type === "major" || type === "regional") {
    return source.filter((item) => item.type === type);
  }
  return source;
}

export function extractQuoteFromV28(shape) {
  const obj = shape && typeof shape === "object" ? shape : {};
  if (obj.quoteno) return { quoteno: obj.quoteno, rates: obj.rates || [] };
  const res = obj.result && typeof obj.result === "object" ? obj.result : {};
  const quoteno = res.quoteno || null;
  const rates = Array.isArray(res.rates) ? res.rates : [];
  return { quoteno, rates };
}

export function pickQuoteRate(rates, preferredService = "") {
  if (!Array.isArray(rates) || !rates.length) return null;
  const preferred = String(preferredService || "").trim().toLowerCase();
  if (!preferred) return rates[0];
  return rates.find((rate) => String(rate?.service || "").trim().toLowerCase() === preferred) || rates[0];
}
