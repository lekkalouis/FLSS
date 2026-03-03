const API_BASE = "/api/v1";
const rowsEl = document.getElementById("controllersRows");
const logEl = document.getElementById("eventLog");

function fmtDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function renderStatus(controllers = []) {
  if (!controllers.length) {
    rowsEl.innerHTML = `<tr><td colspan="5">No controllers connected yet.</td></tr>`;
    return;
  }

  rowsEl.innerHTML = controllers
    .map((controller) => {
      const statusClass = controller.stale || !controller.connected ? "stale" : "ok";
      const statusLabel = controller.stale || !controller.connected ? "stale" : "connected";
      return `<tr>
        <td>${controller.source}</td>
        <td><span class="pill ${statusClass}">${statusLabel}</span></td>
        <td>${fmtDate(controller.lastSeenAt)}</td>
        <td>${controller.sensor?.tempC ?? "—"}</td>
        <td>${controller.sensor?.humidity ?? "—"}</td>
      </tr>`;
    })
    .join("");
}

function appendLog(eventName, payload) {
  const line = `[${new Date().toLocaleTimeString()}] ${eventName} ${JSON.stringify(payload)}`;
  const current = logEl.textContent.split("\n").slice(-11);
  current.push(line);
  logEl.textContent = current.join("\n");
}

async function bootstrap() {
  const res = await fetch(`${API_BASE}/controller/status`);
  const payload = await res.json();
  renderStatus(payload.controllers || []);

  const source = new EventSource(`${API_BASE}/controller/events`);
  source.addEventListener("ready", (event) => {
    const data = JSON.parse(event.data || "{}");
    renderStatus(data.controllers || []);
    appendLog("ready", { controllers: (data.controllers || []).length });
  });
  source.addEventListener("controller-status", (event) => {
    const data = JSON.parse(event.data || "{}");
    fetch(`${API_BASE}/controller/status`).then((r) => r.json()).then((full) => renderStatus(full.controllers || []));
    appendLog("status", data);
  });
  source.addEventListener("controller-event", (event) => {
    const data = JSON.parse(event.data || "{}");
    appendLog("event", data);
  });
}

bootstrap().catch((error) => {
  appendLog("error", { message: String(error) });
});
