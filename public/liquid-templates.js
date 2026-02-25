const variableSnippets = [
  "{{ shop.name }}",
  "{{ order.name }}",
  "{{ order.created_at | date: \"%Y-%m-%d\" }}",
  "{{ order.customer.first_name }}",
  "{{ order.customer.last_name }}",
  "{{ order.shipping_address.address1 }}",
  "{{ order.shipping_address.city }}",
  "{{ order.shipping_address.zip }}",
  "{% for line_item in order.line_items %}\n  {{ line_item.title }} x {{ line_item.quantity }}\n{% endfor %}",
  "{{ order.subtotal_price | money }}",
  "{{ order.total_tax | money }}",
  "{{ order.total_price | money }}"
];

const sampleContext = {
  shop: { name: "Flippen Lekka Spices" },
  order: {
    name: "#1042",
    created_at: "2026-02-23",
    customer: { first_name: "Louis", last_name: "van der Merwe" },
    shipping_address: { address1: "7 Papawer Street", city: "Cape Town", zip: "7530" },
    line_items: [
      { title: "Chilli Spice", quantity: 2 },
      { title: "Garlic Salt", quantity: 1 }
    ],
    subtotal_price: "R249.00",
    total_tax: "R37.35",
    total_price: "R286.35"
  }
};

const refs = {
  templateList: document.querySelector("#templateList"),
  templateName: document.querySelector("#templateName"),
  templateContent: document.querySelector("#templateContent"),
  variableButtons: document.querySelector("#variableButtons"),
  saveTemplateBtn: document.querySelector("#saveTemplateBtn"),
  deleteTemplateBtn: document.querySelector("#deleteTemplateBtn"),
  newTemplateBtn: document.querySelector("#newTemplateBtn"),
  refreshPreviewBtn: document.querySelector("#refreshPreviewBtn"),
  templatePreview: document.querySelector("#templatePreview"),
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

function renderPreview() {
  const source = refs.templateContent.value;
  if (!source.trim()) {
    refs.templatePreview.textContent = "Type Liquid content to preview with sample data.";
    return;
  }

  let output = source;
  output = output.replace(
    /\{%\s*for\s+(\w+)\s+in\s+([\w.]+)\s*%\}([\s\S]*?)\{%\s*endfor\s*%\}/g,
    (_match, itemName, arrayPath, block) => {
      const values = getPathValue(arrayPath, sampleContext);
      if (!Array.isArray(values)) return "";
      return values
        .map((item) => block.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_inner, tokenPath) => {
          if (tokenPath.startsWith(`${itemName}.`)) {
            return String(getPathValue(tokenPath.slice(itemName.length + 1), item) ?? "");
          }
          return String(getPathValue(tokenPath, sampleContext) ?? "");
        }))
        .join("");
    }
  );

  output = output.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_match, token) => {
    const tokenBase = String(token).split("|")[0].trim();
    const value = getPathValue(tokenBase, sampleContext);
    return String(value ?? "");
  });

  refs.templatePreview.textContent = output;
}

function renderVariableButtons() {
  refs.variableButtons.innerHTML = "";
  variableSnippets.forEach((snippet) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = snippet.length > 40 ? `${snippet.slice(0, 37)}...` : snippet;
    btn.title = snippet;
    btn.addEventListener("click", () => insertSnippet(snippet));
    refs.variableButtons.appendChild(btn);
  });
}

function insertSnippet(snippet) {
  const field = refs.templateContent;
  const start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? field.value.length;
  field.value = `${field.value.slice(0, start)}${snippet}${field.value.slice(end)}`;
  const cursor = start + snippet.length;
  field.focus();
  field.setSelectionRange(cursor, cursor);
  renderPreview();
}

function clearEditor() {
  selectedTemplateId = null;
  refs.templateName.value = "";
  refs.templateContent.value = "";
  refs.deleteTemplateBtn.disabled = true;
  renderTemplateList();
  renderPreview();
}

function loadTemplate(templateId) {
  const template = templates.find((item) => item.id === templateId);
  if (!template) return;
  selectedTemplateId = template.id;
  refs.templateName.value = template.name;
  refs.templateContent.value = template.content;
  refs.deleteTemplateBtn.disabled = false;
  renderTemplateList();
  renderPreview();
}

function renderTemplateList() {
  refs.templateList.innerHTML = "";
  if (!templates.length) {
    const empty = document.createElement("li");
    empty.textContent = "No templates yet.";
    refs.templateList.appendChild(empty);
    return;
  }

  templates.forEach((template) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = template.name;
    if (template.id === selectedTemplateId) {
      btn.classList.add("active");
    }
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
  if (!response.ok) {
    throw new Error(payload.error || "Request failed");
  }

  return payload;
}

async function fetchTemplates() {
  const payload = await request("/api/v1/liquid-templates");
  templates = Array.isArray(payload.templates) ? payload.templates : [];
  renderTemplateList();
}

async function saveTemplate() {
  const name = refs.templateName.value.trim();
  const content = refs.templateContent.value;
  if (!name) {
    setStatus("Template name is required.");
    refs.templateName.focus();
    return;
  }

  const payload = await request("/api/v1/liquid-templates", {
    method: "POST",
    body: JSON.stringify({ id: selectedTemplateId, name, content })
  });

  const template = payload.template;
  const index = templates.findIndex((item) => item.id === template.id);
  if (index >= 0) templates[index] = template;
  else templates.unshift(template);

  selectedTemplateId = template.id;
  renderTemplateList();
  refs.deleteTemplateBtn.disabled = false;
  setStatus("Template saved.");
}

async function deleteTemplate() {
  if (!selectedTemplateId) return;
  await request(`/api/v1/liquid-templates/${encodeURIComponent(selectedTemplateId)}`, {
    method: "DELETE"
  });

  templates = templates.filter((item) => item.id !== selectedTemplateId);
  clearEditor();
  setStatus("Template deleted.");
}

refs.saveTemplateBtn.addEventListener("click", () => {
  saveTemplate().catch((error) => setStatus(error.message));
});

refs.deleteTemplateBtn.addEventListener("click", () => {
  deleteTemplate().catch((error) => setStatus(error.message));
});

refs.newTemplateBtn.addEventListener("click", () => {
  clearEditor();
  setStatus("New template draft.");
});

refs.templateContent.addEventListener("input", renderPreview);
refs.refreshPreviewBtn.addEventListener("click", renderPreview);

renderVariableButtons();
renderPreview();
fetchTemplates().catch((error) => setStatus(error.message));
