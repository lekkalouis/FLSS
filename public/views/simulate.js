let simulateInitialized = false;

export function initSimulateView() {
  if (simulateInitialized) return;
  simulateInitialized = true;
  "use strict";

  const steps = [
    {
      id: "order",
      icon: "🧾",
      label: "Order arrives in Shopify",
      detail: "Order event detected & validated",
      systems: ["Shopify", "Automation Engine"],
      knowledge: ["Order validation", "Shopify admin"],
      autoActions: [
        "Listen for new order event",
        "Validate order data",
        "Classify fulfillment path",
        "Create internal job ticket"
      ],
      manualActions: [
        "Open order dashboard",
        "Verify customer details",
        "Check inventory availability",
        "Create job ticket"
      ]
    },
    {
      id: "invoice",
      icon: "🖨️",
      label: "Send invoice",
      detail: "Invoice generated & delivered",
      systems: ["Accounting", "Email Service"],
      knowledge: ["Invoicing", "Customer billing"],
      autoActions: [
        "Generate invoice PDF",
        "Sync invoice to accounting",
        "Queue invoice email"
      ],
      manualActions: [
        "Create invoice in accounting",
        "Export invoice PDF",
        "Email invoice to customer"
      ]
    },
    {
      id: "notify",
      icon: "📧",
      label: "Notify customer",
      detail: "Confirmation sent with ETA",
      systems: ["Email Service", "CRM"],
      knowledge: ["Customer communication"],
      autoActions: [
        "Compose confirmation template",
        "Personalize with order data",
        "Send confirmation email"
      ],
      manualActions: [
        "Draft confirmation email",
        "Copy order details",
        "Send confirmation to customer"
      ]
    },
    {
      id: "stickers",
      icon: "🏷️",
      label: "Print parcel stickers",
      detail: "Stickers queued & printed",
      systems: ["Print Service", "Warehouse"],
      knowledge: ["Packing standards"],
      autoActions: [
        "Generate parcel identifiers",
        "Create sticker print jobs",
        "Route jobs to printer"
      ],
      manualActions: [
        "Create parcel identifiers",
        "Print stickers",
        "Match stickers to parcels"
      ]
    },
    {
      id: "packing",
      icon: "📄",
      label: "Print packing slip",
      detail: "Packing slip attached to order",
      systems: ["Print Service", "Warehouse"],
      knowledge: ["Pick/pack workflow"],
      autoActions: [
        "Generate packing slip",
        "Print packing slip",
        "Attach slip to workflow"
      ],
      manualActions: [
        "Generate packing slip",
        "Print packing slip",
        "Attach slip to order"
      ]
    },
    {
      id: "scan",
      icon: "📦",
      label: "Scan parcels",
      detail: "Parcel scans recorded",
      systems: ["Scanner", "Warehouse"],
      knowledge: ["Scanning workflow"],
      autoActions: [
        "Wait for scan input",
        "Validate parcel count",
        "Sync scan confirmation"
      ],
      manualActions: [
        "Scan each parcel",
        "Confirm parcel count",
        "Record scan confirmation"
      ]
    },
    {
      id: "ship",
      icon: "🚚",
      label: "Create shipment",
      detail: "Courier shipment created",
      systems: ["Courier API", "Shipping Desk"],
      knowledge: ["Carrier booking"],
      autoActions: [
        "Select shipping service",
        "Create courier booking",
        "Receive tracking number"
      ],
      manualActions: [
        "Choose courier service",
        "Book shipment",
        "Copy tracking number"
      ]
    },
    {
      id: "shopify",
      icon: "🔄",
      label: "Write back to Shopify",
      detail: "Tracking synced to order",
      systems: ["Shopify", "Automation Engine"],
      knowledge: ["Order fulfillment"],
      autoActions: [
        "Update fulfillment status",
        "Attach tracking details",
        "Confirm sync status"
      ],
      manualActions: [
        "Open order in Shopify",
        "Paste tracking details",
        "Mark order fulfilled"
      ]
    },
    {
      id: "labels",
      icon: "🧷",
      label: "Print courier labels",
      detail: "Shipping labels printed",
      systems: ["Print Service", "Courier Portal"],
      knowledge: ["Label printing"],
      autoActions: [
        "Generate shipping labels",
        "Queue print job",
        "Confirm label output"
      ],
      manualActions: [
        "Download courier labels",
        "Print labels",
        "Verify label quality"
      ]
    },
    {
      id: "notifyShip",
      icon: "✅",
      label: "Notify customer",
      detail: "Shipment update sent",
      systems: ["Email Service", "CRM"],
      knowledge: ["Customer updates"],
      autoActions: [
        "Compose shipment notification",
        "Insert tracking link",
        "Send shipment update"
      ],
      manualActions: [
        "Draft shipment update",
        "Insert tracking link",
        "Email customer"
      ]
    }
  ];

  const MANUAL_MINUTES_PER_ACTION = 2.5;

  const $ = (id) => document.getElementById(id);
  const stepsList = $("stepsList");
  const orderStatus = $("orderStatus");
  const visualStatus = $("visualStatus");
  const totalActionsEl = $("totalActions");
  const manualActionsTotalEl = $("manualActionsTotal");
  const efficiencyGainEl = $("efficiencyGain");
  const completedActionsEl = $("completedActions");
  const actionsPerMinuteEl = $("actionsPerMinute");
  const actionsPerDayEl = $("actionsPerDay");
  const manualMinutesSavedEl = $("manualMinutesSaved");
  const systemsCountEl = $("systemsCount");
  const knowledgeCountEl = $("knowledgeCount");
  const progressFill = $("progressFill");
  const runtimeStatus = $("runtimeStatus");
  const estimateNote = $("estimateNote");
  const orderLog = $("orderLog");
  const systemsChips = $("systemsChips");
  const knowledgeChips = $("knowledgeChips");

  const orderCountInput = $("orderCount");
  const dayCountInput = $("dayCount");
  const stepDelayInput = $("stepDelay");
  const speedFactorSelect = $("speedFactor");
  const errorRateInput = $("errorRate");
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

  const createActionItem = (label, type, stepIndex, actionIndex) => {
    const li = document.createElement("li");
    li.className = "actionItem";
    li.dataset.stepIndex = String(stepIndex);
    li.dataset.actionIndex = String(actionIndex);
    li.dataset.type = type;

    const dot = document.createElement("span");
    dot.className = "actionDot";
    const text = document.createElement("span");
    text.textContent = label;
    li.append(dot, text);
    return li;
  };

  const createStepItem = (step, stepIndex) => {
    const li = document.createElement("li");
    li.className = "stepItem";
    li.dataset.step = step.id;

    const card = document.createElement("div");
    card.className = "stepCard";

    const icon = document.createElement("div");
    icon.className = "stepIcon";
    icon.textContent = step.icon;

    const detailWrap = document.createElement("div");
    detailWrap.className = "stepDetailGrid";

    const heading = document.createElement("div");
    const label = document.createElement("div");
    label.className = "stepLabel";
    label.textContent = step.label;
    const meta = document.createElement("div");
    meta.className = "stepMeta";
    meta.textContent = step.detail;
    heading.append(label, meta);

    const columns = document.createElement("div");
    columns.className = "stepColumns";

    const autoColumn = document.createElement("div");
    autoColumn.className = "stepColumn";
    const autoTitle = document.createElement("h4");
    autoTitle.textContent = "Automated actions";
    const autoList = document.createElement("ul");
    autoList.className = "actionList";
    step.autoActions.forEach((action, actionIndex) => {
      autoList.append(createActionItem(action, "auto", stepIndex, actionIndex));
    });
    autoColumn.append(autoTitle, autoList);

    const manualColumn = document.createElement("div");
    manualColumn.className = "stepColumn";
    const manualTitle = document.createElement("h4");
    manualTitle.textContent = "Manual actions";
    const manualList = document.createElement("ul");
    manualList.className = "actionList";
    step.manualActions.forEach((action, actionIndex) => {
      manualList.append(createActionItem(action, "manual", stepIndex, actionIndex));
    });
    manualColumn.append(manualTitle, manualList);

    columns.append(autoColumn, manualColumn);

    const metaRow = document.createElement("div");
    metaRow.className = "metaRow";
    step.systems.forEach((system) => {
      const chip = document.createElement("span");
      chip.className = "metaChip";
      chip.textContent = system;
      metaRow.append(chip);
    });
    step.knowledge.forEach((topic) => {
      const chip = document.createElement("span");
      chip.className = "metaChip metaChip--warn";
      chip.textContent = topic;
      metaRow.append(chip);
    });

    const statusWrap = document.createElement("div");
    statusWrap.className = "metaRow";
    const statusChip = document.createElement("span");
    statusChip.className = "metaChip metaChip--ok";
    statusChip.dataset.statusChip = step.id;
    statusChip.textContent = "Queued";
    statusWrap.append(statusChip);

    detailWrap.append(heading, columns, metaRow, statusWrap);
    card.append(icon, detailWrap);
    li.append(card);
    return li;
  };

  const renderSteps = () => {
    stepsList.innerHTML = "";
    steps.forEach((step, index) => {
      stepsList.append(createStepItem(step, index));
    });
  };

  const renderChips = () => {
    if (!systemsChips || !knowledgeChips) return;
    systemsChips.innerHTML = "";
    knowledgeChips.innerHTML = "";
    const systems = [...new Set(steps.flatMap((step) => step.systems))];
    const knowledge = [...new Set(steps.flatMap((step) => step.knowledge))];
    systems.forEach((system) => {
      const chip = document.createElement("span");
      chip.className = "metaChip";
      chip.textContent = system;
      systemsChips.append(chip);
    });
    knowledge.forEach((topic) => {
      const chip = document.createElement("span");
      chip.className = "metaChip metaChip--warn";
      chip.textContent = topic;
      knowledgeChips.append(chip);
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

    const totalActions = orderTotal * steps.reduce((sum, step) => sum + step.autoActions.length, 0);
    const manualActions = orderTotal * steps.reduce((sum, step) => sum + step.manualActions.length, 0);
    const systemsCount = new Set(steps.flatMap((step) => step.systems)).size;
    const knowledgeCount = new Set(steps.flatMap((step) => step.knowledge)).size;
    totalActionsEl.textContent = totalActions.toLocaleString();
    if (manualActionsTotalEl) {
      manualActionsTotalEl.textContent = manualActions.toLocaleString();
    }
    if (systemsCountEl) {
      systemsCountEl.textContent = systemsCount.toLocaleString();
    }
    if (knowledgeCountEl) {
      knowledgeCountEl.textContent = knowledgeCount.toLocaleString();
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
    const statusChip = stepsList.querySelector(`[data-status-chip="${steps[index]?.id}"]`);
    if (statusChip) {
      if (stateName === "active") statusChip.textContent = "In progress";
      if (stateName === "done") statusChip.textContent = "Complete";
      if (stateName === "reset") statusChip.textContent = "Queued";
    }
  };

  const setActionState = (stepIndex, actionIndex, type, stateName) => {
    const selector = `.actionItem[data-step-index="${stepIndex}"][data-action-index="${actionIndex}"][data-type="${type}"]`;
    const item = stepsList.querySelector(selector);
    if (!item) return;
    item.classList.toggle("actionItem--done", stateName === "done");
    item.classList.toggle("actionItem--error", stateName === "error");
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
    stepsList.querySelectorAll(".actionItem").forEach((item) => {
      item.classList.remove("actionItem--done", "actionItem--error");
    });
    steps.forEach((step, index) => setStepState(index, "reset"));
    orderLog.innerHTML = "";
    renderChips();
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

    const totalActions = state.orderTotal * steps.reduce((sum, step) => sum + step.autoActions.length, 0);
    orderStatus.textContent = `Order 1 of ${state.orderTotal}`;

    for (let orderIndex = 1; orderIndex <= state.orderTotal; orderIndex += 1) {
      if (!state.running) break;
      state.currentOrder = orderIndex;
      orderStatus.textContent = `Order ${orderIndex} of ${state.orderTotal}`;
      visualStatus.textContent = `Processing order ${orderIndex}`;
      stepsList.querySelectorAll(".stepItem").forEach((item) => {
        item.classList.remove("stepItemDone", "stepItemActive");
      });
      stepsList.querySelectorAll(".actionItem").forEach((item) => {
        item.classList.remove("actionItem--done", "actionItem--error");
      });

      let orderErrors = 0;
      const errorRate = Math.max(0, Math.min(25, Number(errorRateInput.value || 0))) / 100;

      for (let stepIndex = 0; stepIndex < steps.length; stepIndex += 1) {
        if (!state.running) break;
        const step = steps[stepIndex];
        setStepState(stepIndex, "active");

        for (let actionIndex = 0; actionIndex < step.autoActions.length; actionIndex += 1) {
          if (!state.running) break;
          const errorHit = Math.random() < errorRate;
          setActionState(stepIndex, actionIndex, "auto", errorHit ? "error" : "done");
          state.completed += 1;
          if (errorHit) orderErrors += 1;
          completedActionsEl.textContent = state.completed.toLocaleString();
          setProgress(state.completed, totalActions);
          const logItem = document.createElement("li");
          const timestamp = new Date().toLocaleTimeString();
          logItem.textContent = `Order ${orderIndex} • Auto: ${step.autoActions[actionIndex]} — ${errorHit ? "Error" : "OK"} (${timestamp})`;
          orderLog.prepend(logItem);
          await waitWithPause(state.stepDelay);
        }

        for (let actionIndex = 0; actionIndex < step.manualActions.length; actionIndex += 1) {
          if (!state.running) break;
          const errorHit = Math.random() < errorRate;
          setActionState(stepIndex, actionIndex, "manual", errorHit ? "error" : "done");
          if (errorHit) orderErrors += 1;
          const logItem = document.createElement("li");
          const timestamp = new Date().toLocaleTimeString();
          logItem.textContent = `Order ${orderIndex} • Manual: ${step.manualActions[actionIndex]} — ${errorHit ? "Error" : "OK"} (${timestamp})`;
          orderLog.prepend(logItem);
          await waitWithPause(state.stepDelay * 0.6);
        }

        setStepState(stepIndex, "done");
      }

      const integrityChip = document.createElement("li");
      const integrityStatus = orderErrors ? "Review required" : "Pass";
      const timestamp = new Date().toLocaleTimeString();
      integrityChip.textContent = `Order ${orderIndex} • Data integrity: ${integrityStatus} (${orderErrors} issues) • ${timestamp}`;
      orderLog.prepend(integrityChip);
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

  [orderCountInput, dayCountInput, stepDelayInput, speedFactorSelect, errorRateInput].forEach((input) => {
    input.addEventListener("change", () => {
      updateMetrics();
    });
  });

  renderSteps();
  renderChips();
  updateMetrics();
  resetSimulation();
}
