let traceabilityInitialized = false;

export function initTraceabilityView() {
  if (traceabilityInitialized) return;
  traceabilityInitialized = true;

  const API_BASE = "/api/v1/traceability";

  const poForm = document.getElementById("trace-poForm");
  const invoiceForm = document.getElementById("trace-invoiceForm");
  const coaForm = document.getElementById("trace-coaForm");
  const inspectionForm = document.getElementById("trace-inspectionForm");
  const finishedBatchForm = document.getElementById("trace-finishedBatchForm");
  const lookupForm = document.getElementById("trace-lookupForm");

  const poSelect = document.getElementById("trace-invoicePoNumber");
  const inspectionSelect = document.getElementById("trace-inspectionSelect");
  const status = document.getElementById("trace-status");

  const invoicesList = document.getElementById("trace-invoices");
  const coaList = document.getElementById("trace-coas");
  const inspectionsList = document.getElementById("trace-inspections");
  const lookupOutput = document.getElementById("trace-lookupOutput");

  async function apiFetch(url, options = {}) {
    const response = await fetch(url, {
      method: options.method || "GET",
      headers: { "Content-Type": "application/json" },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `Request failed (${response.status})`);
    }
    return payload;
  }

  function setStatus(message, tone = "info") {
    if (!status) return;
    status.textContent = message;
    status.dataset.tone = tone;
  }

  function parseLines(value, parser) {
    return String(value || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map(parser)
      .filter(Boolean);
  }

  function renderCollection(container, rows, formatRow) {
    if (!container) return;
    if (!rows.length) {
      container.innerHTML = '<div class="trace-empty">No records yet.</div>';
      return;
    }
    container.innerHTML = rows.map(formatRow).join("");
  }

  async function refresh() {
    try {
      const [openPoData, invoiceData, coaData, inspectionData] = await Promise.all([
        apiFetch(`${API_BASE}/open-pos`),
        apiFetch(`${API_BASE}/invoices`),
        apiFetch(`${API_BASE}/coas`),
        apiFetch(`${API_BASE}/inspections`)
      ]);

      const openPos = openPoData.openPurchaseOrders || [];
      const invoices = invoiceData.invoices || [];
      const coas = coaData.coas || [];
      const inspections = inspectionData.inspections || [];

      if (poSelect) {
        poSelect.innerHTML = openPos
          .map((po) => `<option value="${po.poNumber}">${po.poNumber} — ${po.supplier || "Unknown supplier"}</option>`)
          .join("");
      }

      if (inspectionSelect) {
        inspectionSelect.innerHTML = inspections
          .map(
            (inspection) =>
              `<option value="${inspection.inspectionId}">${inspection.inspectionId} — ${inspection.invoiceNumber} (${inspection.status})</option>`
          )
          .join("");
      }

      renderCollection(
        invoicesList,
        invoices,
        (invoice) => `
          <div class="trace-row">
            <div><strong>${invoice.invoiceNumber}</strong> · PO ${invoice.poNumber}</div>
            <div class="trace-meta">Batch: ${invoice.receivedBatchNumber || "--"} · Items: ${(invoice.items || []).length}</div>
          </div>
        `
      );

      renderCollection(
        coaList,
        coas,
        (coa) => `
          <div class="trace-row">
            <div><strong>${coa.coaNumber}</strong> · ${coa.productName || "Product"}</div>
            <div class="trace-meta">Batch: ${coa.batchNumber} ${coa.pdfUrl ? `· <a href="${coa.pdfUrl}" target="_blank" rel="noopener">PDF</a>` : ""}</div>
          </div>
        `
      );

      renderCollection(
        inspectionsList,
        inspections,
        (inspection) => `
          <div class="trace-row">
            <div><strong>${inspection.inspectionId}</strong> · ${inspection.invoiceNumber}</div>
            <div class="trace-meta">Vehicle: ${inspection.vehicleReg || "--"} · Signature: ${inspection.signature ? "captured" : "pending"}</div>
          </div>
        `
      );
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  poForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(poForm);
    try {
      await apiFetch(`${API_BASE}/open-pos`, {
        method: "POST",
        body: {
          poNumber: formData.get("poNumber"),
          supplier: formData.get("supplier"),
          flavor: formData.get("flavor"),
          expectedDate: formData.get("expectedDate")
        }
      });
      poForm.reset();
      setStatus("Purchase order added.", "ok");
      await refresh();
    } catch (error) {
      setStatus(error.message, "error");
    }
  });

  invoiceForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(invoiceForm);
    const items = parseLines(formData.get("items"), (line) => {
      const [itemName = "", lotBatchNumber = "", qty = "", unit = "units"] = line.split("|").map((part) => part.trim());
      if (!itemName) return null;
      return { itemName, lotBatchNumber, qty: Number(qty) || 0, unit };
    });

    try {
      await apiFetch(`${API_BASE}/invoices`, {
        method: "POST",
        body: {
          invoiceNumber: formData.get("invoiceNumber"),
          poNumber: formData.get("poNumber"),
          supplier: formData.get("supplier"),
          flavor: formData.get("flavor"),
          receivedBatchNumber: formData.get("receivedBatchNumber"),
          pdfUrl: formData.get("pdfUrl"),
          receivedQty: formData.get("receivedQty"),
          items
        }
      });
      invoiceForm.reset();
      setStatus("Invoice saved and inspection record auto-generated.", "ok");
      await refresh();
    } catch (error) {
      setStatus(error.message, "error");
    }
  });

  coaForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(coaForm);
    try {
      await apiFetch(`${API_BASE}/coas`, {
        method: "POST",
        body: {
          coaNumber: formData.get("coaNumber"),
          productName: formData.get("productName"),
          batchNumber: formData.get("batchNumber"),
          supplier: formData.get("supplier"),
          pdfUrl: formData.get("pdfUrl")
        }
      });
      coaForm.reset();
      setStatus("COA uploaded.", "ok");
      await refresh();
    } catch (error) {
      setStatus(error.message, "error");
    }
  });

  inspectionForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(inspectionForm);
    const inspectionId = formData.get("inspectionId");
    try {
      await apiFetch(`${API_BASE}/inspections/${encodeURIComponent(inspectionId)}/submit`, {
        method: "POST",
        body: {
          vehicleReg: formData.get("vehicleReg"),
          driverName: formData.get("driverName"),
          receivedQty: formData.get("receivedQty"),
          comments: formData.get("comments"),
          signature: formData.get("signature"),
          checks: {
            quantityConfirmed: formData.get("quantityConfirmed") === "yes",
            packagingIntact: formData.get("packagingIntact") === "yes",
            sealIntact: formData.get("sealIntact") === "yes",
            coaAttached: formData.get("coaAttached") === "yes"
          }
        }
      });
      setStatus("Incoming inspection submitted.", "ok");
      await refresh();
    } catch (error) {
      setStatus(error.message, "error");
    }
  });

  finishedBatchForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(finishedBatchForm);
    const components = parseLines(formData.get("components"), (line) => {
      const [itemName = "", sourceBatchNumber = "", invoiceNumber = ""] = line.split("|").map((part) => part.trim());
      if (!itemName && !sourceBatchNumber && !invoiceNumber) return null;
      return { itemName, sourceBatchNumber, invoiceNumber };
    });

    try {
      await apiFetch(`${API_BASE}/finished-batches`, {
        method: "POST",
        body: {
          finishedBatchNumber: formData.get("finishedBatchNumber"),
          flavor: formData.get("flavor"),
          productionDate: formData.get("productionDate"),
          notes: formData.get("notes"),
          components
        }
      });
      finishedBatchForm.reset();
      setStatus("Finished batch linked.", "ok");
    } catch (error) {
      setStatus(error.message, "error");
    }
  });

  lookupForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(lookupForm);
    const batchNumber = formData.get("batchNumber");
    const flavor = formData.get("flavor");
    try {
      const payload = await apiFetch(
        `${API_BASE}/lookup?batchNumber=${encodeURIComponent(batchNumber)}&flavor=${encodeURIComponent(flavor)}`
      );

      lookupOutput.innerHTML = `
        <h4>Finished batch: ${payload.finishedBatch.finishedBatchNumber} (${payload.finishedBatch.flavor})</h4>
        <p>Production date: ${payload.finishedBatch.productionDate || "--"}</p>
        <p>Invoices: ${payload.invoices.map((invoice) => invoice.invoiceNumber).join(", ") || "None"}</p>
        <p>COAs: ${payload.coas.map((coa) => `${coa.coaNumber} (${coa.batchNumber})`).join(", ") || "None"}</p>
        <p>Inspections: ${payload.inspections.map((inspection) => inspection.inspectionId).join(", ") || "None"}</p>
      `;
      setStatus("Traceability lookup complete.", "ok");
    } catch (error) {
      lookupOutput.innerHTML = `<div class="trace-empty">${error.message}</div>`;
      setStatus(error.message, "error");
    }
  });

  refresh();
}
