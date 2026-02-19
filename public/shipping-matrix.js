const API_BASE = `${location.origin}/api/v1`;

const weightsInput = document.getElementById('weights');
const centreTypeInput = document.getElementById('centreType');
const runBtn = document.getElementById('runBtn');
const statusEl = document.getElementById('status');
const metaEl = document.getElementById('meta');
const tableEl = document.getElementById('matrixTable');

function parseWeights(input) {
  return String(input || '')
    .split(',')
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isFinite(v) && v > 0);
}

function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `R${n.toFixed(2)}`;
}

function setStatus(text, bad = false) {
  statusEl.textContent = text;
  statusEl.className = bad ? 'err' : 'muted';
}

function renderMeta(payload) {
  metaEl.innerHTML = '';
  const entries = [
    `Generated: ${payload.generatedAt || '—'}`,
    `Centre type: ${payload.centreType || 'all'}`,
    `Destinations: ${payload.destinationCount ?? payload.matrix?.length ?? 0}`,
    `Quote attempts: ${payload.quoteAttempts ?? 0}`,
    `Successful: ${payload.successCount ?? 0}`
  ];
  entries.forEach((text) => {
    const span = document.createElement('span');
    span.textContent = text;
    metaEl.appendChild(span);
  });
}

function renderTable(payload) {
  const weights = payload.weights || [];
  const rows = payload.matrix || [];
  const thead = `
    <thead>
      <tr>
        <th>Centre</th>
        <th>Type</th>
        ${weights.map((w) => `<th>${w} kg</th>`).join('')}
      </tr>
    </thead>`;

  const body = rows
    .map((row) => {
      const cells = (row.quotes || []).map((q) => {
        if (!q.ok) {
          return `<td><span class="err">Fail</span><br><small>${q.error || `HTTP ${q.status || '?'}`}</small></td>`;
        }
        return `<td><span class="ok">${money(q.amount)}</span><br><small>${q.service || 'Service'} · ${q.quoteno || ''}</small></td>`;
      });
      return `<tr><td>${row.destination?.town || row.destination?.name || 'Unknown'}</td><td>${row.destination?.type || '—'}</td>${cells.join('')}</tr>`;
    })
    .join('');

  tableEl.innerHTML = `${thead}<tbody>${body}</tbody>`;
}

async function runMatrix() {
  const weights = parseWeights(weightsInput.value);
  if (!weights.length) {
    setStatus('Enter at least one valid weight.', true);
    return;
  }

  runBtn.disabled = true;
  setStatus('Generating shipping matrix...');

  try {
    const res = await fetch(`${API_BASE}/pp/matrix`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        weights,
        centreType: centreTypeInput.value
      })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.message || `Request failed (HTTP ${res.status})`);
    }

    renderMeta(data);
    renderTable(data);
    setStatus('Matrix generated.');
  } catch (error) {
    setStatus(`Failed: ${String(error?.message || error)}`, true);
  } finally {
    runBtn.disabled = false;
  }
}

runBtn.addEventListener('click', runMatrix);
