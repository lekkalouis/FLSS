(() => {
  "use strict";

  const steps = [
    { id: "order", label: "Order arrives in Shopify", detail: "Order event detected", visual: "Order received" },
    { id: "invoice", label: "Send invoice", detail: "Invoice emailed automatically", visual: "Invoice printed" },
    { id: "notify", label: "Notify customer", detail: "Order confirmation sent", visual: "Customer notified" },
    { id: "stickers", label: "Print parcel stickers", detail: "Parcel stickers queued", visual: "Parcel stickers" },
    { id: "packing", label: "Print packing slip", detail: "Packing slip printed", visual: "Packing slip" },
    { id: "scan", label: "Scan parcels", detail: "Scanner updates parcel count", visual: "Parcels scanned" },
    { id: "ship", label: "Create shipment", detail: "Courier shipment created", visual: "Shipment created" },
    { id: "shopify", label: "Write back to Shopify", detail: "Tracking synced", visual: "Shopify synced" },
    { id: "labels", label: "Print courier labels", detail: "Labels printed", visual: "Labels printed" },
    { id: "notifyShip", label: "Notify customer", detail: "Shipment update sent", visual: "Customer updated" }
  ];

  const manualSteps = [
    { id: "manual-order", label: "Review incoming order", detail: "Operator checks order details" },
    { id: "manual-invoice", label: "Manually create invoice", detail: "Generate invoice and email" },
    { id: "manual-notify", label: "Customer confirmation", detail: "Send order confirmation" },
    { id: "manual-stickers", label: "Prepare parcel stickers", detail: "Print & attach stickers" },
    { id: "manual-packing", label: "Prepare packing slip", detail: "Print & insert packing slip" },
    { id: "manual-scan", label: "Scan parcels", detail: "Hand-scan each parcel" },
    { id: "manual-ship", label: "Book shipment", detail: "Book courier shipment" },
    { id: "manual-writeback", label: "Update Shopify", detail: "Enter tracking details" },
    { id: "manual-labels", label: "Print shipping labels", detail: "Manual label printing" },
    { id: "manual-notify-ship", label: "Send shipment update", detail: "Notify customer shipment" }
  ];

  const MANUAL_MINUTES_PER_ACTION = 2.5;

  const visuals = [
    { id: "Order received", icon: "🧾", desc: "Order event hits the system" },
    { id: "Invoice printed", icon: "🖨️", desc: "Invoice and documents" },
    { id: "Customer notified", icon: "📧", desc: "Confirmation sent" },
    { id: "Parcel stickers", icon: "🏷️", desc: "Parcel stickers generated" },
    { id: "Packing slip", icon: "📄", desc: "Packing slip printed" },
    { id: "Parcels scanned", icon: "📦", desc: "Parcel scans in station" },
    { id: "Shipment created", icon: "🚚", desc: "Courier job booked" },
    { id: "Shopify synced", icon: "🔄", desc: "Tracking pushed" },
    { id: "Labels printed", icon: "🧷", desc: "Shipping labels printed" },
    { id: "Customer updated", icon: "✅", desc: "Customer notified" }
  ];

  const $ = (id) => document.getElementById(id);
  const stepsList = $("stepsList");
  const manualStepsList = $("manualStepsList");
  const visualTimeline = $("visualTimeline");
  const orderStatus = $("orderStatus");
  const visualStatus = $("visualStatus");
  const totalActionsEl = $("totalActions");
  const manualActionsTotalEl = $("manualActionsTotal");
  const efficiencyGainEl = $("efficiencyGain");
  const completedActionsEl = $("completedActions");
  const actionsPerMinuteEl = $("actionsPerMinute");
  const actionsPerDayEl = $("actionsPerDay");
  const manualMinutesSavedEl = $("manualMinutesSaved");
  const progressFill = $("progressFill");
  const runtimeStatus = $("runtimeStatus");
  const estimateNote = $("estimateNote");
  const orderLog = $("orderLog");

  const orderCountInput = $("orderCount");
  const dayCountInput = $("dayCount");
  const stepDelayInput = $("stepDelay");
  const speedFactorSelect = $("speedFactor");
  const startBtn = $("startBtn");
  const pauseBtn = $("pauseBtn");
  const resetBtn = $("resetBtn");

  const state = {
    running: false,
    paused: false,
    orderTotal: 0,
    completed: 0,
    currentOrder: 1,
    stepDelay: 450,
    timerStart: null
  };

  const createStepItem = (step) => {
    const li = document.createElement("li");
    li.className = "stepItem";
    li.dataset.step = step.id;

    const info = document.createElement("div");
    const label = document.createElement("div");
    label.className = "stepLabel";
    label.textContent = step.label;
    const meta = document.createElement("div");
    meta.className = "stepMeta";
    meta.textContent = step.detail;
    info.append(label, meta);

    const check = document.createElement("span");
    check.className = "checkMark";
    check.textContent = "✓";

    li.append(info, check);
    return li;
  };

  const createVisualNode = (node) => {
    const wrap = document.createElement("div");
    wrap.className = "visualNode";
    wrap.dataset.visual = node.id;

    const icon = document.createElement("div");
    icon.className = "visualIcon";
    icon.textContent = node.icon;

    const textWrap = document.createElement("div");
    const title = document.createElement("div");
    title.className = "visualTitle";
    title.textContent = node.id;
    const desc = document.createElement("div");
    desc.className = "visualSub";
    desc.textContent = node.desc;
    textWrap.append(title, desc);

    const status = document.createElement("div");
    status.className = "visualStatus";
    status.textContent = "Queued";

    wrap.append(icon, textWrap, status);
    return wrap;
  };

  const renderSteps = () => {
    stepsList.innerHTML = "";
    steps.forEach((step) => {
      stepsList.append(createStepItem(step));
    });
  };

  const renderManualSteps = () => {
    if (!manualStepsList) return;
    manualStepsList.innerHTML = "";
    manualSteps.forEach((step) => {
      manualStepsList.append(createStepItem(step));
    });
  };

  const renderVisuals = () => {
    visualTimeline.innerHTML = "";
    visuals.forEach((node) => {
      visualTimeline.append(createVisualNode(node));
    });
  };

  const updateMetrics = () => {
    const orderTotal = Number(orderCountInput.value || 0);
    const dayTotal = Number(dayCountInput.value || 1);
    const delay = Math.max(120, Number(stepDelayInput.value || 450));
    const speed = Number(speedFactorSelect.value || 1);
    const finalDelay = Math.max(80, delay / speed);

    state.stepDelay = finalDelay;
    state.orderTotal = orderTotal;

    const totalActions = orderTotal * steps.length;
    const manualActions = orderTotal * manualSteps.length;
    totalActionsEl.textContent = totalActions.toLocaleString();
    if (manualActionsTotalEl) {
      manualActionsTotalEl.textContent = manualActions.toLocaleString();
    }
    actionsPerDayEl.textContent = dayTotal
      ? Math.round(totalActions / dayTotal).toLocaleString()
      : "0";

    const actionsPerMinute = Math.round(60000 / finalDelay);
    actionsPerMinuteEl.textContent = actionsPerMinute.toLocaleString();

    const estimatedMs = totalActions * finalDelay;
    const estSec = Math.round(estimatedMs / 1000);
    const manualMinutes = manualActions * MANUAL_MINUTES_PER_ACTION;
    if (manualMinutesSavedEl) {
      manualMinutesSavedEl.textContent = `${Math.round(manualMinutes).toLocaleString()} min`;
    }
    if (efficiencyGainEl) {
      const autoMinutes = totalActions * (finalDelay / 1000 / 60);
      const gain = autoMinutes > 0 ? (manualMinutes / autoMinutes).toFixed(1) : "0";
      efficiencyGainEl.textContent = `${gain}×`;
    }
    estimateNote.textContent = `Estimated runtime: ${estSec}s @ ${finalDelay.toFixed(0)}ms per action. Manual effort ≈ ${Math.round(manualMinutes)} min.`;
  };

  const setStepState = (index, stateName) => {
    const items = stepsList.querySelectorAll(".stepItem");
    items.forEach((item, i) => {
      item.classList.toggle("stepItemActive", i === index && stateName === "active");
      if (stateName === "reset") {
        item.classList.remove("stepItemDone", "stepItemActive");
      }
    });
    if (stateName === "done") {
      items[index]?.classList.add("stepItemDone");
      items[index]?.classList.remove("stepItemActive");
    }
  };

  const setManualStepState = (index, stateName) => {
    if (!manualStepsList) return;
    const items = manualStepsList.querySelectorAll(".stepItem");
    items.forEach((item, i) => {
      item.classList.toggle("stepItemActive", i === index && stateName === "active");
      if (stateName === "reset") {
        item.classList.remove("stepItemDone", "stepItemActive");
      }
    });
    if (stateName === "done") {
      items[index]?.classList.add("stepItemDone");
      items[index]?.classList.remove("stepItemActive");
    }
  };

  const updateVisual = (label) => {
    const nodes = visualTimeline.querySelectorAll(".visualNode");
    const activeIndex = visuals.findIndex((node) => node.id === label);
    nodes.forEach((node, index) => {
      const isActive = index === activeIndex;
      node.classList.toggle("visualNodeActive", isActive);
      const status = node.querySelector(".visualStatus");
      if (!status) return;
      if (index < activeIndex) {
        status.textContent = "Complete";
      } else if (isActive) {
        status.textContent = "In progress";
      } else {
        status.textContent = "Queued";
      }
    });
  };

  const setProgress = (value, total) => {
    const percent = total ? Math.min(100, Math.round((value / total) * 100)) : 0;
    progressFill.style.width = `${percent}%`;
  };

  const resetSimulation = () => {
    state.running = false;
    state.paused = false;
    state.completed = 0;
    state.currentOrder = 1;
    runtimeStatus.textContent = "Idle";
    visualStatus.textContent = "Waiting for orders";
    completedActionsEl.textContent = "0";
    setProgress(0, 1);
    orderStatus.textContent = `Order 1 of ${state.orderTotal || 0}`;
    stepsList.querySelectorAll(".stepItem").forEach((item) => {
      item.classList.remove("stepItemDone", "stepItemActive");
    });
    if (manualStepsList) {
      manualStepsList.querySelectorAll(".stepItem").forEach((item) => {
        item.classList.remove("stepItemDone", "stepItemActive");
      });
    }
    orderLog.innerHTML = "";
    renderVisuals();
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const waitWithPause = async (ms) => {
    let remaining = ms;
    while (remaining > 0 && state.running) {
      if (state.paused) {
        await sleep(120);
        continue;
      }
      const chunk = Math.min(remaining, 120);
      await sleep(chunk);
      remaining -= chunk;
    }
  };

  const runSimulation = async () => {
    updateMetrics();
    resetSimulation();
    if (!state.orderTotal) return;

    state.running = true;
    state.timerStart = Date.now();
    runtimeStatus.textContent = "Running";

    const totalActions = state.orderTotal * steps.length;
    orderStatus.textContent = `Order 1 of ${state.orderTotal}`;

    for (let orderIndex = 1; orderIndex <= state.orderTotal; orderIndex += 1) {
      if (!state.running) break;
      state.currentOrder = orderIndex;
      orderStatus.textContent = `Order ${orderIndex} of ${state.orderTotal}`;
      visualStatus.textContent = `Processing order ${orderIndex}`;
      stepsList.querySelectorAll(".stepItem").forEach((item) => {
        item.classList.remove("stepItemDone", "stepItemActive");
      });
      if (manualStepsList) {
        manualStepsList.querySelectorAll(".stepItem").forEach((item) => {
          item.classList.remove("stepItemDone", "stepItemActive");
        });
      }

      for (let stepIndex = 0; stepIndex < steps.length; stepIndex += 1) {
        if (!state.running) break;
        const step = steps[stepIndex];
        setStepState(stepIndex, "active");
        setManualStepState(stepIndex, "active");
        updateVisual(step.visual);
        await waitWithPause(state.stepDelay);
        if (!state.running) break;

        setStepState(stepIndex, "done");
        setManualStepState(stepIndex, "done");
        state.completed += 1;
        completedActionsEl.textContent = state.completed.toLocaleString();
        setProgress(state.completed, totalActions);
      }

      const logItem = document.createElement("li");
      const timestamp = new Date().toLocaleTimeString();
      logItem.textContent = `Order ${orderIndex} completed at ${timestamp}`;
      orderLog.prepend(logItem);
    }

    if (state.running) {
      runtimeStatus.textContent = "Complete";
      visualStatus.textContent = "Simulation finished";
    } else {
      runtimeStatus.textContent = "Stopped";
      visualStatus.textContent = "Simulation paused";
    }
    state.running = false;
  };

  startBtn.addEventListener("click", () => {
    if (state.running) return;
    runSimulation();
  });

  pauseBtn.addEventListener("click", () => {
    if (!state.running) return;
    state.paused = !state.paused;
    pauseBtn.textContent = state.paused ? "Resume" : "Pause";
    runtimeStatus.textContent = state.paused ? "Paused" : "Running";
  });

  resetBtn.addEventListener("click", () => {
    state.running = false;
    state.paused = false;
    pauseBtn.textContent = "Pause";
    updateMetrics();
    resetSimulation();
  });

  [orderCountInput, dayCountInput, stepDelayInput, speedFactorSelect].forEach((input) => {
    input.addEventListener("change", () => {
      updateMetrics();
    });
  });

  renderSteps();
  renderManualSteps();
  renderVisuals();
  updateMetrics();
  resetSimulation();
})();
