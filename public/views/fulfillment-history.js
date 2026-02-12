export function initFulfillmentHistoryView({
  state,
  elements,
  getProxyBase,
  fetchImpl = fetch,
  renderShipmentList,
  updateDashboardKpis,
  appendDebug = () => {}
}) {
  const {
    fulfillmentHistorySearch,
    fulfillmentHistoryMeta,
    fulfillmentHistoryStatusFilter,
    fulfillmentHistoryList,
    fulfillmentHistoryShipped,
    fulfillmentHistoryDelivered,
    fulfillmentHistoryCollected
  } = elements;

  let fulfillmentSearchTimer = null;

  function renderFulfillmentHistory() {
    const streamEntries = Object.entries(state.streams || {});
    const allShipments = streamEntries
      .flatMap(([stream, shipments]) =>
        (Array.isArray(shipments) ? shipments : []).map((shipment) => ({
          ...shipment,
          stream
        }))
      )
      .sort((a, b) => new Date(b.shipped_at || 0).getTime() - new Date(a.shipped_at || 0).getTime());

    const visibleShipments =
      state.statusFilter === "all" ? allShipments : allShipments.filter((shipment) => shipment.stream === state.statusFilter);

    const renderColumn = (container, shipments, emptyMessage) => {
      if (!container) return;
      if (!shipments.length) {
        container.innerHTML = `<div class="dispatchBoardEmptyCol">${emptyMessage}</div>`;
        return;
      }
      container.innerHTML = renderShipmentList(shipments, emptyMessage);
    };

    renderColumn(fulfillmentHistoryShipped, state.streams?.shipped || [], "No shipped records.");
    renderColumn(fulfillmentHistoryDelivered, state.streams?.delivered || [], "No delivered records.");
    renderColumn(fulfillmentHistoryCollected, state.streams?.collected || [], "No collected pickup records.");

    if (fulfillmentHistoryList) {
      fulfillmentHistoryList.innerHTML = renderShipmentList(
        visibleShipments,
        "No fulfillment history found for the selected filters."
      );
    }

    if (fulfillmentHistoryMeta) {
      const q = state.query ? ` for “${state.query}”` : "";
      fulfillmentHistoryMeta.textContent = `Showing ${visibleShipments.length} shipments${q}.`;
    }
  }

  async function refreshFulfillmentHistory() {
    const params = new URLSearchParams();
    if (state.query) params.set("q", state.query);
    const querySuffix = params.toString() ? `?${params.toString()}` : "";

    if (fulfillmentHistoryMeta) fulfillmentHistoryMeta.textContent = "Loading history…";

    const bundleRes = await fetchImpl(`${getProxyBase()}/fulfillment-history-bundle${querySuffix}`);
    if (bundleRes.ok) {
      const bundleData = await bundleRes.json();
      const bundleStreams = bundleData?.streams || bundleData || {};
      state.streams.shipped = Array.isArray(bundleStreams?.shipped)
        ? bundleStreams.shipped
        : Array.isArray(bundleStreams?.shipped?.shipments)
          ? bundleStreams.shipped.shipments
          : [];
      state.streams.delivered = Array.isArray(bundleStreams?.delivered)
        ? bundleStreams.delivered
        : Array.isArray(bundleStreams?.delivered?.shipments)
          ? bundleStreams.delivered.shipments
          : [];
      state.streams.collected = Array.isArray(bundleStreams?.collected)
        ? bundleStreams.collected
        : Array.isArray(bundleStreams?.collected?.shipments)
          ? bundleStreams.collected.shipments
          : [];
      renderFulfillmentHistory();
      updateDashboardKpis();
      return true;
    }

    if (bundleRes.status === 429) {
      if (fulfillmentHistoryMeta) fulfillmentHistoryMeta.textContent = "History rate-limited. Retrying shortly…";
      return false;
    }

    const legacySuffix = params.toString() ? `&${params.toString()}` : "";
    const [shippedRes, deliveredRes, collectedRes] = await Promise.all([
      fetchImpl(`${getProxyBase()}/fulfillment-history?stream=shipped${legacySuffix}`),
      fetchImpl(`${getProxyBase()}/fulfillment-history?stream=delivered${legacySuffix}`),
      fetchImpl(`${getProxyBase()}/fulfillment-history?stream=collected${legacySuffix}`)
    ]);

    if ([shippedRes, deliveredRes, collectedRes].some((res) => res.status === 429)) {
      if (fulfillmentHistoryMeta) fulfillmentHistoryMeta.textContent = "History rate-limited. Retrying shortly…";
      return false;
    }

    if (![shippedRes, deliveredRes, collectedRes].some((res) => res.ok)) {
      throw new Error("All fulfillment history endpoints failed");
    }

    const shippedData = shippedRes.ok ? await shippedRes.json() : { shipments: [] };
    const deliveredData = deliveredRes.ok ? await deliveredRes.json() : { shipments: [] };
    const collectedData = collectedRes.ok ? await collectedRes.json() : { shipments: [] };

    state.streams.shipped = shippedData.shipments || [];
    state.streams.delivered = deliveredData.shipments || [];
    state.streams.collected = collectedData.shipments || [];

    renderFulfillmentHistory();
    updateDashboardKpis();
    return true;
  }

  function bindEvents() {
    fulfillmentHistorySearch?.addEventListener("input", () => {
      if (fulfillmentSearchTimer) clearTimeout(fulfillmentSearchTimer);
      fulfillmentSearchTimer = setTimeout(() => {
        state.query = fulfillmentHistorySearch.value.trim();
        refreshFulfillmentHistory().catch((err) => {
          appendDebug("Fulfillment history refresh failed: " + String(err));
          if (fulfillmentHistoryMeta) fulfillmentHistoryMeta.textContent = "History unavailable.";
        });
      }, 250);
    });

    fulfillmentHistoryStatusFilter?.addEventListener("change", () => {
      state.statusFilter = fulfillmentHistoryStatusFilter.value || "all";
      renderFulfillmentHistory();
    });
  }

  bindEvents();

  return {
    renderFulfillmentHistory,
    refreshFulfillmentHistory
  };
}
