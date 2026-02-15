let wholesaleInit = false;

export function initWholesaleAutomationView() {
  if (wholesaleInit) return;
  wholesaleInit = true;

  const templateList = document.getElementById("waTemplateList");
  const templateName = document.getElementById("waTemplateName");
  const templateDesc = document.getElementById("waTemplateDesc");
  const templateContent = document.getElementById("waTemplateContent");
  const templateType = document.getElementById("waTemplateType");
  const templateStatus = document.getElementById("waTemplateStatus");
  const templatePreview = document.getElementById("waTemplatePreview");
  const printHistory = document.getElementById("waPrintHistory");
  const printTitlePrefix = document.getElementById("waPrintTitlePrefix");
  const printCopies = document.getElementById("waPrintCopies");
  const printSettingsStatus = document.getElementById("waPrintSettingsStatus");
  const dropZone = document.getElementById("waDropZone");
  const dropStatus = document.getElementById("waDropStatus");
  const reprintJobId = document.getElementById("waReprintJobId");
  const reprintStatus = document.getElementById("waReprintStatus");

  const profileList = document.getElementById("waProfileList");
  const profileName = document.getElementById("waProfileName");
  const profileTags = document.getElementById("waProfileTags");
  const profileSkus = document.getElementById("waProfileSkus");
  const profileTiers = document.getElementById("waProfileTiers");
  const profileStatus = document.getElementById("waProfileStatus");

  const testTags = document.getElementById("waTestTags");
  const testQty = document.getElementById("waTestQty");
  const testPrice = document.getElementById("waTestPrice");
  const testSku = document.getElementById("waTestSku");
  const testResult = document.getElementById("waTestResult");

  let templates = [];
  let profiles = [];
  let history = [];
  let settings = { titlePrefix: "", copies: 1 };
  let activeTemplateId = null;
  let activeProfileId = null;

  const demoPayload = {
    order: {
      name: "#1001",
      total_price: "350.00",
      currency: "ZAR",
      customer: { first_name: "Wholesale", last_name: "Buyer", email: "buyer@example.com", tags: "wholesale,tier-2" },
      shipping_address: { first_name: "Warehouse", last_name: "Team", address1: "1 Dispatch Rd", city: "Cape Town", province: "Western Cape" },
      line_items: [{ quantity: 2, title: "Original Spice 200g" }, { quantity: 4, title: "Hot & Spicy Spice 200g" }]
    }
  };

  function setText(el, text) {
    if (el) el.textContent = text;
  }

  function parseCsv(value) {
    return String(value || "").split(",").map((part) => part.trim()).filter(Boolean);
  }

  function humanTime(value) {
    const d = new Date(value || Date.now());
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
  }

  function parseTiers(value) {
    return String(value || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [minQty, discountPercent] = line.split(":");
        return { minQty: Number(minQty), discountPercent: Number(discountPercent) };
      })
      .filter((tier) => Number.isFinite(tier.minQty) && Number.isFinite(tier.discountPercent));
  }

  async function loadTemplates() {
    const res = await fetch("/api/v1/wholesale/templates");
    const data = await res.json();
    templates = Array.isArray(data.templates) ? data.templates : [];
    renderTemplates();
  }

  async function loadProfiles() {
    const res = await fetch("/api/v1/wholesale/discount-profiles");
    const data = await res.json();
    profiles = Array.isArray(data.profiles) ? data.profiles : [];
    renderProfiles();
  }

  async function loadPrintSettings() {
    const res = await fetch("/api/v1/wholesale/print-settings");
    const data = await res.json();
    settings = data.settings || settings;
    if (printTitlePrefix) printTitlePrefix.value = settings.titlePrefix || "";
    if (printCopies) printCopies.value = String(settings.copies || 1);
  }

  async function loadPrintHistory() {
    const res = await fetch("/api/v1/wholesale/print-history");
    const data = await res.json();
    history = Array.isArray(data.history) ? data.history : [];
    renderPrintHistory();
  }

  function renderTemplates() {
    if (!templateList) return;
    templateList.innerHTML = templates.length
      ? templates.map((tpl) => `<div class="wa-item"><button type="button" data-template-id="${tpl.id}">${tpl.name}</button><button type="button" data-template-del="${tpl.id}">🗑️</button></div>`).join("")
      : '<div class="wa-status">No templates yet.</div>';
  }

  function renderProfiles() {
    if (!profileList) return;
    profileList.innerHTML = profiles.length
      ? profiles.map((profile) => `<div class="wa-item"><button type="button" data-profile-id="${profile.id}">${profile.name}</button><button type="button" data-profile-del="${profile.id}">🗑️</button></div>`).join("")
      : '<div class="wa-status">No discount profiles yet.</div>';
  }

  function renderPrintHistory() {
    if (!printHistory) return;
    printHistory.innerHTML = history.length
      ? history
        .map((entry) => `<div class="wa-item"><button type="button" data-print-id="${entry.id}">${entry.title} · ${entry.mode} · ${humanTime(entry.createdAt)}</button><span>${entry.copies}x</span></div>`)
        .join("")
      : '<div class="wa-status">No print history yet.</div>';
  }

  async function saveTemplate() {
    const payload = {
      name: templateName.value,
      description: templateDesc.value,
      content: templateContent.value,
      contentType: templateType.value
    };
    const url = activeTemplateId ? `/api/v1/wholesale/templates/${activeTemplateId}` : "/api/v1/wholesale/templates";
    const method = activeTemplateId ? "PUT" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!res.ok) throw new Error("Template save failed");
    const data = await res.json();
    activeTemplateId = data.template?.id || null;
    setText(templateStatus, "Template saved.");
    await loadTemplates();
  }

  async function saveProfile() {
    const payload = {
      name: profileName.value,
      tags: parseCsv(profileTags.value),
      skuMatchers: parseCsv(profileSkus.value),
      tiers: parseTiers(profileTiers.value)
    };
    const url = activeProfileId ? `/api/v1/wholesale/discount-profiles/${activeProfileId}` : "/api/v1/wholesale/discount-profiles";
    const method = activeProfileId ? "PUT" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!res.ok) throw new Error("Profile save failed");
    const data = await res.json();
    activeProfileId = data.profile?.id || null;
    setText(profileStatus, "Discount profile saved.");
    await loadProfiles();
  }

  async function previewTemplate() {
    if (!activeTemplateId) return;
    const res = await fetch(`/api/v1/wholesale/templates/${activeTemplateId}/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(demoPayload)
    });
    const data = await res.json();
    setText(templatePreview, data.rendered || "");
  }

  async function printTemplate() {
    if (!activeTemplateId) return;
    const titlePrefix = String(printTitlePrefix?.value || "").trim();
    const copiesValue = Math.max(1, Number(printCopies?.value || settings.copies || 1));
    const res = await fetch(`/api/v1/wholesale/templates/${activeTemplateId}/print`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...demoPayload,
        title: titlePrefix ? `${titlePrefix} Template Print` : undefined,
        copies: copiesValue
      })
    });
    if (!res.ok) {
      const data = await res.json();
      setText(templateStatus, `Print failed: ${data.error || res.status}`);
      return;
    }
    setText(templateStatus, "Print job sent to PrintNode.");
    await loadPrintHistory();
  }

  async function savePrintSettings() {
    const payload = {
      titlePrefix: String(printTitlePrefix?.value || "").trim(),
      copies: Math.max(1, Number(printCopies?.value || 1))
    };
    const res = await fetch("/api/v1/wholesale/print-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error("Could not save print settings");
    const data = await res.json();
    settings = data.settings || payload;
    setText(printSettingsStatus, "Printing settings saved.");
  }

  async function reprintSelected() {
    const printId = String(reprintJobId?.value || "").trim();
    if (!printId) throw new Error("Enter a print history id");
    const res = await fetch("/api/v1/wholesale/print-history/reprint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ printId })
    });
    if (!res.ok) throw new Error("Reprint failed");
    setText(reprintStatus, "Reprint sent to PrintNode.");
    await loadPrintHistory();
  }

  async function printDroppedFile(file) {
    if (!file || file.type !== "application/pdf") {
      setText(dropStatus, "Only PDF files are supported.");
      return;
    }
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read file"));
      reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
      reader.readAsDataURL(file);
    });
    const res = await fetch("/api/v1/wholesale/print-drop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pdfBase64: base64,
        title: file.name,
        copies: Math.max(1, Number(printCopies?.value || settings.copies || 1))
      })
    });
    if (!res.ok) throw new Error("Drop print failed");
    setText(dropStatus, `Printed ${file.name}.`);
    await loadPrintHistory();
  }

  async function testDiscount() {
    const payload = {
      customerTags: parseCsv(testTags.value),
      quantity: Number(testQty.value || 1),
      basePrice: Number(testPrice.value || 0),
      sku: testSku.value
    };
    const res = await fetch("/api/v1/wholesale/discounts/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    setText(testResult, JSON.stringify(data.resolution || {}, null, 2));
  }

  document.getElementById("waTemplateSave")?.addEventListener("click", () => saveTemplate().catch((err) => setText(templateStatus, String(err.message || err))));
  document.getElementById("waTemplatePreviewBtn")?.addEventListener("click", () => previewTemplate().catch((err) => setText(templateStatus, String(err.message || err))));
  document.getElementById("waTemplatePrint")?.addEventListener("click", () => printTemplate().catch((err) => setText(templateStatus, String(err.message || err))));
  document.getElementById("waProfileSave")?.addEventListener("click", () => saveProfile().catch((err) => setText(profileStatus, String(err.message || err))));
  document.getElementById("waDiscountTest")?.addEventListener("click", () => testDiscount().catch((err) => setText(testResult, String(err.message || err))));
  document.getElementById("waPrintSettingsSave")?.addEventListener("click", () => savePrintSettings().catch((err) => setText(printSettingsStatus, String(err.message || err))));
  document.getElementById("waReprintBtn")?.addEventListener("click", () => reprintSelected().catch((err) => setText(reprintStatus, String(err.message || err))));

  templateList?.addEventListener("click", async (event) => {
    const btn = event.target.closest("button");
    if (!btn) return;
    const pickId = btn.dataset.templateId;
    const delId = btn.dataset.templateDel;
    if (pickId) {
      const template = templates.find((item) => item.id === pickId);
      if (!template) return;
      activeTemplateId = template.id;
      templateName.value = template.name || "";
      templateDesc.value = template.description || "";
      templateContent.value = template.content || "";
      templateType.value = template.contentType || "raw_base64";
      return;
    }
    if (delId) {
      await fetch(`/api/v1/wholesale/templates/${delId}`, { method: "DELETE" });
      if (activeTemplateId === delId) activeTemplateId = null;
      await loadTemplates();
    }
  });

  printHistory?.addEventListener("click", (event) => {
    const btn = event.target.closest("button");
    if (!btn) return;
    const printId = btn.dataset.printId;
    if (!printId) return;
    if (reprintJobId) reprintJobId.value = printId;
    setText(reprintStatus, `Selected ${printId} for reprint.`);
  });

  dropZone?.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropZone.classList.add("is-dragging");
  });
  dropZone?.addEventListener("dragleave", () => {
    dropZone.classList.remove("is-dragging");
  });
  dropZone?.addEventListener("drop", (event) => {
    event.preventDefault();
    dropZone.classList.remove("is-dragging");
    const file = event.dataTransfer?.files?.[0];
    printDroppedFile(file).catch((err) => setText(dropStatus, String(err.message || err)));
  });

  profileList?.addEventListener("click", async (event) => {
    const btn = event.target.closest("button");
    if (!btn) return;
    const pickId = btn.dataset.profileId;
    const delId = btn.dataset.profileDel;
    if (pickId) {
      const profile = profiles.find((item) => item.id === pickId);
      if (!profile) return;
      activeProfileId = profile.id;
      profileName.value = profile.name || "";
      profileTags.value = (profile.tags || []).join(", ");
      profileSkus.value = (profile.skuMatchers || []).join(", ");
      profileTiers.value = (profile.tiers || []).map((tier) => `${tier.minQty}:${tier.discountPercent}`).join("\n");
      return;
    }
    if (delId) {
      await fetch(`/api/v1/wholesale/discount-profiles/${delId}`, { method: "DELETE" });
      if (activeProfileId === delId) activeProfileId = null;
      await loadProfiles();
    }
  });

  if (templateContent && !templateContent.value.trim()) {
    templateContent.value = [
      "ORDER {{order_number}}",
      "Customer: {{customer_name}}",
      "Tags: {{customer_tags}}",
      "Ship To: {{shipping_name}} {{shipping_address1}} {{shipping_city}}",
      "Items:",
      "{{line_items}}",
      "Total: {{currency}} {{total_price}}"
    ].join("\n");
  }

  loadTemplates().catch(() => setText(templateStatus, "Could not load templates."));
  loadProfiles().catch(() => setText(profileStatus, "Could not load discount profiles."));
  loadPrintSettings().catch(() => setText(printSettingsStatus, "Could not load print settings."));
  loadPrintHistory().catch(() => setText(reprintStatus, "Could not load print history."));
}
