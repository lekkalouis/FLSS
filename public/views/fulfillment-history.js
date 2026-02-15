const PAGE_SIZE = 20;

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
    fulfillmentHistoryPickup,
    fulfillmentHistoryCollected,
    fulfillmentHistoryShippedPager,
    fulfillmentHistoryDeliveredPager,
    fulfillmentHistoryPickupPager,
    fulfillmentHistoryCollectedPager
  } = elements;

  let fulfillmentSearchTimer = null;
  const pageState = {
    shipped: 1,
    delivered: 1,
    pickup: 1,
    collected: 1
  };

  function paginate(items, page) {
    const total = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
    const safePage = Math.min(Math.max(page, 1), total);
    const start = (safePage - 1) * PAGE_SIZE;
    return { page: safePage, total, rows: items.slice(start, start + PAGE_SIZE) };
  }

  function renderPager(target, currentPage, totalPages, onPage) {
    if (!target) return;
    target.innerHTML = "";

    const prev = document.createElement("button");
    prev.type = "button";
    prev.textContent = "Prev";
    prev.disabled = currentPage <= 1;
    prev.addEventListener("click", () => onPage(currentPage - 1));

    const next = document.createElement("button");
    next.type = "button";
    next.textContent = "Next";
    next.disabled = currentPage >= totalPages;
    next.addEventListener("click", () => onPage(currentPage + 1));

    const label = document.createElement("span");
    label.textContent = `Page ${currentPage} of ${totalPages}`;

    target.append(prev, label, next);
  }

  function isPickupOrder(order) {
    const lane = String(order?.assigned_lane || "").toLowerCase();
    const tags = String(order?.tags || "").toLowerCase();
    const shippingLines = (order?.shipping_lines || [])
      .map((line) => String(line?.title || "").toLowerCase())
      .join(" ");
    return lane === "pickup" || /(warehouse|collect|collection|click\s*&\s*collect)/.test(`${tags} ${shippingLines}`);
  }

  function mapPickupOrder(order) {
    return {
      order_name: order?.name || `#${order?.id || ""}`,
      customer_name: order?.customer_name || order?.name || "Unknown",
      tracking_number: "—",
      shipment_status: "Awaiting collection",
      shipped_at: order?.created_at || null,
      stream: "pickup"
    };
  }

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

    const renderColumn = (streamKey, container, pager, shipments, emptyMessage) => {
      if (!container) return;
      const paged = paginate(shipments, pageState[streamKey] || 1);
      pageState[streamKey] = paged.page;

      if (!paged.rows.length) {
        container.innerHTML = `<div class="dispatchBoardEmptyCol">${emptyMessage}</div>`;
      } else {
        container.innerHTML = renderShipmentList(paged.rows, emptyMessage);
      }

      renderPager(pager, paged.page, paged.total, (nextPage) => {
        pageState[streamKey] = nextPage;
        renderFulfillmentHistory();
      });
    };

    renderColumn("shipped", fulfillmentHistoryShipped, fulfillmentHistoryShippedPager, state.streams?.shipped || [], "No shipped records.");
    renderColumn("delivered", fulfillmentHistoryDelivered, fulfillmentHistoryDeliveredPager, state.streams?.delivered || [], "No delivered records.");
    renderColumn("pickup", fulfillmentHistoryPickup, fulfillmentHistoryPickupPager, state.streams?.pickup || [], "No pickup orders.");
    renderColumn("collected", fulfillmentHistoryCollected, fulfillmentHistoryCollectedPager, state.streams?.collected || [], "No collected pickup records.");

    if (fulfillmentHistoryList) {
      fulfillmentHistoryList.innerHTML = renderShipmentList(
        visibleShipments,
        "No fulfillment history found for the selected filters."
      );
    }

    if (fulfillmentHistoryMeta) {
      const q = state.query ? ` for “${state.query}”` : "";
      fulfillmentHistoryMeta.textContent = `Showing ${visibleShipments.length} records${q}.`;
    }
  }

  function resetPages() {
    pageState.shipped = 1;
    pageState.delivered = 1;
    pageState.pickup = 1;
    pageState.collected = 1;
  }

  async function refreshFulfillmentHistory() {
    const params = new URLSearchParams();
    if (state.query) params.set("q", state.query);
    const querySuffix = params.toString() ? `?${params.toString()}` : "";

    if (fulfillmentHistoryMeta) fulfillmentHistoryMeta.textContent = "Loading history…";

    const [bundleRes, openOrdersRes] = await Promise.all([
      fetchImpl(`${getProxyBase()}/fulfillment-history-bundle${querySuffix}`),
      fetchImpl(`${getProxyBase()}/orders/open`)
    ]);

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

      const openData = openOrdersRes.ok ? await openOrdersRes.json() : { orders: [] };
      const openOrders = Array.isArray(openData?.orders) ? openData.orders : [];
      state.streams.pickup = openOrders.filter(isPickupOrder).map(mapPickupOrder);

      resetPages();
      renderFulfillmentHistory();
      updateDashboardKpis();
      return true;
    }

    if (bundleRes.status === 429) {
      if (fulfillmentHistoryMeta) fulfillmentHistoryMeta.textContent = "History rate-limited. Retrying shortly…";
      return false;
    }

    const legacySuffix = params.toString() ? `&${params.toString()}` : "";
    const [shippedRes, deliveredRes, collectedRes, pickupRes] = await Promise.all([
      fetchImpl(`${getProxyBase()}/fulfillment-history?stream=shipped${legacySuffix}`),
      fetchImpl(`${getProxyBase()}/fulfillment-history?stream=delivered${legacySuffix}`),
      fetchImpl(`${getProxyBase()}/fulfillment-history?stream=collected${legacySuffix}`),
      fetchImpl(`${getProxyBase()}/orders/open`)
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
    const pickupData = pickupRes.ok ? await pickupRes.json() : { orders: [] };

    state.streams.shipped = shippedData.shipments || [];
    state.streams.delivered = deliveredData.shipments || [];
    state.streams.collected = collectedData.shipments || [];
    state.streams.pickup = (pickupData.orders || []).filter(isPickupOrder).map(mapPickupOrder);

    resetPages();
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
