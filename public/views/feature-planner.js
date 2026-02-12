let plannerInitialized = false;

const STORAGE_KEYS = {
  "feature-map": "fl_feature_map_entries_v1",
  ideas: "fl_ideas_entries_v1"
};

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function readEntries(scope) {
  const key = STORAGE_KEYS[scope];
  if (!key) return [];
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function writeEntries(scope, entries) {
  const key = STORAGE_KEYS[scope];
  if (!key) return;
  localStorage.setItem(key, JSON.stringify(entries));
}

function renderScope(scope) {
  const list = document.querySelector(`[data-planner-list="${scope}"]`);
  if (!list) return;
  const entries = readEntries(scope);
  if (!entries.length) {
    list.innerHTML = '<div class="plannerEmpty">No entries yet.</div>';
    return;
  }

  list.innerHTML = entries
    .map(
      (entry) => `
      <article class="plannerCard">
        <div class="plannerCardHead">
          <h3>${escapeHtml(entry.title)}</h3>
          <span class="plannerTag">${escapeHtml(entry.priority || "medium")}</span>
        </div>
        <p>${escapeHtml(entry.notes || "")}</p>
        ${entry.imageData ? `<img class="plannerImage" src="${entry.imageData}" alt="${escapeHtml(entry.title)} reference" />` : ""}
      </article>
    `
    )
    .join("");
}

function setStatus(scope, message, isError = false) {
  const status = document.querySelector(`[data-planner-status="${scope}"]`);
  if (!status) return;
  status.textContent = message;
  status.style.color = isError ? "#b91c1c" : "#475569";
}

function bindScope(scope) {
  const form = document.querySelector(`[data-planner-form="${scope}"]`);
  if (!form || form.dataset.bound === "true") return;
  form.dataset.bound = "true";

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const title = String(formData.get("title") || "").trim();
    const priority = String(formData.get("priority") || "medium").trim();
    const notes = String(formData.get("notes") || "").trim();
    const imageFile = formData.get("image");

    if (!title || !(imageFile instanceof File) || !imageFile.size) {
      setStatus(scope, "Title and image are required.", true);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const entries = readEntries(scope);
      entries.unshift({
        title,
        priority,
        notes,
        imageData: String(reader.result || ""),
        createdAt: new Date().toISOString()
      });
      writeEntries(scope, entries);
      renderScope(scope);
      form.reset();
      setStatus(scope, "Entry saved.");
    };
    reader.onerror = () => {
      setStatus(scope, "Could not read selected image.", true);
    };
    reader.readAsDataURL(imageFile);
  });
}

export function initFeaturePlannerView() {
  if (plannerInitialized) return;
  plannerInitialized = true;

  ["feature-map", "ideas"].forEach((scope) => {
    bindScope(scope);
    renderScope(scope);
  });
}
