const variableSnippets = [
  "{{ shop.name }}",
  "{{ customer.first_name }}",
  "{{ customer.last_name }}",
  "{{ order.name }}",
  "{{ order.total_price }}",
  "{{ fulfillment.tracking_number }}",
  "{{ metrics.minutes_waiting }}",
  "{{ metrics.parcel_count }}"
];

const sampleContext = {
  shop: { name: "Flippen Lekka Spices" },
  customer: { first_name: "Louis", last_name: "van der Merwe" },
  order: { name: "#1042", total_price: "R286.35" },
  fulfillment: { tracking_number: "SWE-TRK-88991" },
  metrics: { minutes_waiting: 57, parcel_count: 32 }
};

const refs = {
  templateList: document.querySelector("#templateList"),
  templateName: document.querySelector("#templateName"),
  eventKey: document.querySelector("#eventKey"),
  source: document.querySelector("#source"),
  channel: document.querySelector("#channel"),
  enabled: document.querySelector("#enabled"),
  subject: document.querySelector("#subject"),
  body: document.querySelector("#body"),
  variableButtons: document.querySelector("#variableButtons"),
  refreshPreviewBtn: document.querySelector("#refreshPreviewBtn"),
  preview: document.querySelector("#preview"),
  saveTemplateBtn: document.querySelector("#saveTemplateBtn"),
  deleteTemplateBtn: document.querySelector("#deleteTemplateBtn"),
  newTemplateBtn: document.querySelector("#newTemplateBtn"),
  status: document.querySelector("#status")
};

let templates = [];
let selectedTemplateId = null;

function setStatus(text) {
  refs.status.textContent = text;
}

function getPathValue(path, context) {
  return path.split(".").reduce((acc, segment) => {
    if (acc == null || !(segment in acc)) return "";
    return acc[segment];
  }, context);
}

function renderWithSample(text) {
  return String(text || "").replace(/\{\{\s*([^}]+)\s*\}\}/g, (_match, token) => {
    const tokenBase = String(token).split("|")[0].trim();
    return String(getPathValue(tokenBase, sampleContext) ?? "");
  });
}

function renderPreview() {
  const subject = renderWithSample(refs.subject.value);
  const body = renderWithSample(refs.body.value);
  refs.preview.textContent = `Subject: ${subject || "(empty)"}\n\n${body || "(empty body)"}`;
}

function insertSnippet(snippet) {
  const field = refs.body;
  const start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? field.value.length;
  field.value = `${field.value.slice(0, start)}${snippet}${field.value.slice(end)}`;
  const cursor = start + snippet.length;
  field.focus();
  field.setSelectionRange(cursor, cursor);
  renderPreview();
}

function renderVariableButtons() {
  refs.variableButtons.innerHTML = "";
  variableSnippets.forEach((snippet) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = snippet;
    btn.addEventListener("click", () => insertSnippet(snippet));
    refs.variableButtons.appendChild(btn);
  });
}

function clearForm() {
  selectedTemplateId = null;
  refs.templateName.value = "";
  refs.eventKey.value = "";
  refs.source.value = "shopify";
  refs.channel.value = "email";
  refs.enabled.checked = true;
  refs.subject.value = "";
  refs.body.value = "";
  refs.deleteTemplateBtn.disabled = true;
  renderTemplateList();
  renderPreview();
}

function loadTemplate(templateId) {
  const template = templates.find((item) => item.id === templateId);
  if (!template) return;

  selectedTemplateId = template.id;
  refs.templateName.value = template.name || "";
  refs.eventKey.value = template.eventKey || "";
  refs.source.value = template.source || "shopify";
  refs.channel.value = template.channel || "email";
  refs.enabled.checked = Boolean(template.enabled);
  refs.subject.value = template.subject || "";
  refs.body.value = template.body || "";
  refs.deleteTemplateBtn.disabled = false;
  renderTemplateList();
  renderPreview();
}

function renderTemplateList() {
  refs.templateList.innerHTML = "";
  if (!templates.length) {
    const empty = document.createElement("li");
    empty.textContent = "No templates saved.";
    refs.templateList.appendChild(empty);
    return;
  }

  templates.forEach((template) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = `[${String(template.source || "").toUpperCase()}] ${template.name}`;
    if (template.id === selectedTemplateId) btn.classList.add("active");
    btn.addEventListener("click", () => loadTemplate(template.id));
    li.appendChild(btn);
    refs.templateList.appendChild(li);
  });
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Request failed");
  return payload;
}

async function fetchTemplates() {
  const payload = await request("/api/v1/notification-templates");
  templates = Array.isArray(payload.templates) ? payload.templates : [];
  renderTemplateList();
}

async function saveTemplate() {
  const name = refs.templateName.value.trim();
  const eventKey = refs.eventKey.value.trim();
  if (!name) {
    setStatus("Template name is required.");
    refs.templateName.focus();
    return;
  }
  if (!eventKey) {
    setStatus("Event key is required.");
    refs.eventKey.focus();
    return;
  }

  const payload = await request("/api/v1/notification-templates", {
    method: "POST",
    body: JSON.stringify({
      id: selectedTemplateId,
      name,
      eventKey,
      source: refs.source.value,
      channel: refs.channel.value,
      enabled: refs.enabled.checked,
      subject: refs.subject.value,
      body: refs.body.value
    })
  });

  const template = payload.template;
  const index = templates.findIndex((item) => item.id === template.id);
  if (index >= 0) templates[index] = template;
  else templates.unshift(template);

  selectedTemplateId = template.id;
  refs.deleteTemplateBtn.disabled = false;
  renderTemplateList();
  setStatus("Notification template saved.");
}

async function deleteTemplate() {
  if (!selectedTemplateId) return;
  await request(`/api/v1/notification-templates/${encodeURIComponent(selectedTemplateId)}`, {
    method: "DELETE"
  });
  templates = templates.filter((item) => item.id !== selectedTemplateId);
  clearForm();
  setStatus("Notification template deleted.");
}

refs.newTemplateBtn.addEventListener("click", () => {
  clearForm();
  setStatus("New template draft.");
});
refs.saveTemplateBtn.addEventListener("click", () => saveTemplate().catch((error) => setStatus(error.message)));
refs.deleteTemplateBtn.addEventListener("click", () => deleteTemplate().catch((error) => setStatus(error.message)));
refs.refreshPreviewBtn.addEventListener("click", renderPreview);
refs.subject.addEventListener("input", renderPreview);
refs.body.addEventListener("input", renderPreview);

renderVariableButtons();
renderPreview();
fetchTemplates().catch((error) => setStatus(error.message));
