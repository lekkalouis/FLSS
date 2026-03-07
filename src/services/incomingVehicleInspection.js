function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeInspectionAnswer(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (["yes", "y", "pass", "passed", "true", "1"].includes(normalized)) return "yes";
  if (["no", "n", "fail", "failed", "false", "0"].includes(normalized)) return "no";
  return "";
}

export const DEFAULT_INCOMING_VEHICLE_INSPECTION_CHECKS = Object.freeze([
  { key: "vehicleClean", question: "Vehicle clean and suitable for food-grade materials?" },
  { key: "packagingUndamaged", question: "Packaging undamaged and sealed on arrival?" },
  { key: "temperatureAcceptable", question: "Temperature/condition acceptable on receipt?" },
  { key: "contaminationFree", question: "No visible contamination, pests, or foreign matter?" }
]);

export function buildIncomingVehicleInspectionSheet(source = {}) {
  return {
    supplierName: normalizeText(source.supplierName || source.supplier_name),
    purchaseOrderNumber: normalizeText(source.purchaseOrderNumber || source.purchase_order_number),
    date: normalizeText(source.date),
    receiptDate: normalizeText(source.receiptDate || source.receipt_date),
    vehicleRegistrationNumber: normalizeText(source.vehicleRegistrationNumber || source.vehicle_registration_number),
    driverName: normalizeText(source.driverName || source.driver_name),
    deliveryReference: normalizeText(source.deliveryReference || source.delivery_reference),
    coaReference: normalizeText(source.coaReference || source.coa_reference),
    checkedBy: normalizeText(source.checkedBy || source.checked_by),
    notes: normalizeText(source.notes),
    checks: DEFAULT_INCOMING_VEHICLE_INSPECTION_CHECKS.map((check) => ({
      ...check,
      answer: normalizeInspectionAnswer(check.answer)
    }))
  };
}

export function normalizeIncomingVehicleInspection(input = {}, context = {}) {
  const base = buildIncomingVehicleInspectionSheet(context);
  const source = input && typeof input === "object" ? input : {};
  const answersFromList = new Map(
    (Array.isArray(source.checks) ? source.checks : [])
      .map((entry) => ({
        key: normalizeText(entry?.key),
        answer: normalizeInspectionAnswer(entry?.answer)
      }))
      .filter((entry) => entry.key)
      .map((entry) => [entry.key, entry.answer])
  );

  return {
    ...base,
    receiptDate: normalizeText(source.receiptDate || source.receipt_date || base.receiptDate),
    vehicleRegistrationNumber: normalizeText(
      source.vehicleRegistrationNumber || source.vehicle_registration_number || base.vehicleRegistrationNumber
    ),
    driverName: normalizeText(source.driverName || source.driver_name || base.driverName),
    deliveryReference: normalizeText(source.deliveryReference || source.delivery_reference || base.deliveryReference),
    coaReference: normalizeText(source.coaReference || source.coa_reference || base.coaReference),
    checkedBy: normalizeText(source.checkedBy || source.checked_by || base.checkedBy),
    notes: normalizeText(source.notes || base.notes),
    checks: base.checks.map((check) => ({
      ...check,
      answer: answersFromList.get(check.key) || normalizeInspectionAnswer(source?.[check.key]) || ""
    }))
  };
}
