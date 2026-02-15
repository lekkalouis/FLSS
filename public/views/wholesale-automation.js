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
    const res = await fetch(`/api/v1/wholesale/templates/${activeTemplateId}/print`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(demoPayload)
    });
    if (!res.ok) {
      const data = await res.json();
      setText(templateStatus, `Print failed: ${data.error || res.status}`);
      return;
    }
    setText(templateStatus, "Print job sent to PrintNode.");
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
}
