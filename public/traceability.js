const form = document.getElementById("traceabilityForm");
const batchInput = document.getElementById("batchNumber");
const flavorInput = document.getElementById("flavor");
const purchaseFileInput = document.getElementById("purchaseFile");
const coaFileInput = document.getElementById("coaFile");
const statusEl = document.getElementById("status");
const salesMetaEl = document.getElementById("salesMeta");
const salesBody = document.getElementById("salesBody");
const purchaseBody = document.getElementById("purchaseBody");

async function toBase64(file) {
  if (!file) return null;
  const buffer = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function renderSales(report) {
  salesBody.innerHTML = "";
  const sales = Array.isArray(report.sales) ? report.sales : [];
  salesMetaEl.textContent = `Week ${report.batch.week} (${report.batch.weekStart} to ${report.batch.weekEnd}) • ${sales.length} sales lines.`;

  if (!sales.length) {
    salesBody.innerHTML = `<tr><td colspan="5">No Shopify sales found for this week/flavor.</td></tr>`;
    return;
  }

  sales.forEach((sale) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${(sale.createdAt || "").slice(0, 10)}</td>
      <td>${sale.flavor || ""}</td>
      <td>${sale.quantity ?? ""}</td>
      <td>${sale.customer || ""}</td>
      <td>${sale.invoiceNumber || sale.orderNumber || ""}</td>
    `;
    salesBody.appendChild(tr);
  });
}

function renderPurchases(report) {
  purchaseBody.innerHTML = "";
  const purchases = Array.isArray(report.purchases) ? report.purchases : [];

  if (!purchases.length) {
    purchaseBody.innerHTML = `<tr><td colspan="8">No purchase rows found for this batch/flavor in the uploaded or sample workbook.</td></tr>`;
    return;
  }

  purchases.forEach((po) => {
    const inspectionChecks = (po.incomingVehicleInspection?.checks || [])
      .map((item) => `<li>${item.question} <strong>[Yes / No]</strong></li>`)
      .join("");

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${po.supplierName || ""}</td>
      <td>${po.purchaseOrderNumber || ""}</td>
      <td>${po.invoiceNumber || ""}</td>
      <td>${po.productCode || ""}</td>
      <td>${po.materialName || ""}</td>
      <td>${po.quantity || ""}</td>
      <td>
        <div><strong>${po.coa?.coaType || po.coaType || "COA/COC"}</strong></div>
        <div>${po.coa?.coaReference || po.coaReference || ""}</div>
        <div>${po.coa?.coaDocument || po.coaDocument || "No file mapped"}</div>
      </td>
      <td>
        <div class="inspection">
          <div><strong>Supplier:</strong> ${po.incomingVehicleInspection?.supplierName || po.supplierName || ""}</div>
          <div><strong>PO #:</strong> ${po.incomingVehicleInspection?.purchaseOrderNumber || po.purchaseOrderNumber || ""}</div>
          <div><strong>Date:</strong> ${po.incomingVehicleInspection?.date || po.date || ""}</div>
          <div><strong>Vehicle reg:</strong> ____________________</div>
          <ul>${inspectionChecks}</ul>
        </div>
      </td>
    `;
    purchaseBody.appendChild(tr);
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  statusEl.textContent = "Generating traceability report…";

  try {
    const [purchasesFileBase64, coaFileBase64] = await Promise.all([
      toBase64(purchaseFileInput.files?.[0]),
      toBase64(coaFileInput.files?.[0])
    ]);

    const response = await fetch("/api/v1/traceability/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        batchNumber: batchInput.value,
        flavor: flavorInput.value,
        purchasesFileBase64,
        coaFileBase64
      })
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.message || payload?.error || "Report request failed");
    }

    renderSales(payload.report);
    renderPurchases(payload.report);
    statusEl.textContent = "Traceability report ready.";
  } catch (error) {
    statusEl.textContent = `Failed: ${error.message}`;
  }
});
