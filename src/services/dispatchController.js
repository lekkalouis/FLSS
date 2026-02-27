const dispatchState = {
  queueOrderIds: [],
  selectedOrderId: null,
  mode: "dispatch",
  lastConfirmedAt: null,
  lastConfirmedOrderId: null
};

function normalizeOrderIds(orderIds = []) {
  if (!Array.isArray(orderIds)) return [];
  const seen = new Set();
  return orderIds
    .map((id) => String(id || "").trim())
    .filter((id) => {
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
}

function getSelectedIndex() {
  if (!dispatchState.selectedOrderId) return -1;
  return dispatchState.queueOrderIds.indexOf(dispatchState.selectedOrderId);
}

function selectIndex(index) {
  if (!dispatchState.queueOrderIds.length) {
    dispatchState.selectedOrderId = null;
    return null;
  }
  const normalizedIndex = ((index % dispatchState.queueOrderIds.length) + dispatchState.queueOrderIds.length) % dispatchState.queueOrderIds.length;
  dispatchState.selectedOrderId = dispatchState.queueOrderIds[normalizedIndex];
  return dispatchState.selectedOrderId;
}

function ensureSelection() {
  if (!dispatchState.queueOrderIds.length) {
    dispatchState.selectedOrderId = null;
    return;
  }
  const currentIndex = getSelectedIndex();
  if (currentIndex === -1) {
    dispatchState.selectedOrderId = dispatchState.queueOrderIds[0];
  }
}

export function getState() {
  return {
    selectedOrderId: dispatchState.selectedOrderId,
    queueOrderIds: [...dispatchState.queueOrderIds],
    mode: dispatchState.mode,
    lastConfirmedAt: dispatchState.lastConfirmedAt,
    lastConfirmedOrderId: dispatchState.lastConfirmedOrderId
  };
}

export function syncState({ queueOrderIds, mode } = {}) {
  if (queueOrderIds !== undefined) {
    dispatchState.queueOrderIds = normalizeOrderIds(queueOrderIds);
    ensureSelection();
  }
  if (typeof mode === "string" && mode.trim()) {
    dispatchState.mode = mode.trim();
  }
  return getState();
}

export function next() {
  if (!dispatchState.queueOrderIds.length) return getState();
  const index = getSelectedIndex();
  selectIndex(index === -1 ? 0 : index + 1);
  return getState();
}

export function prev() {
  if (!dispatchState.queueOrderIds.length) return getState();
  const index = getSelectedIndex();
  selectIndex(index === -1 ? 0 : index - 1);
  return getState();
}

export function confirm() {
  ensureSelection();
  if (!dispatchState.selectedOrderId) {
    const err = new Error("No selected order to confirm.");
    err.code = "NO_SELECTED_ORDER";
    throw err;
  }

  dispatchState.lastConfirmedOrderId = dispatchState.selectedOrderId;
  dispatchState.lastConfirmedAt = new Date().toISOString();
  return getState();
}
