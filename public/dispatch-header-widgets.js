(() => {
  "use strict";

  function getIsoWeekNumber(date) {
    const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = utc.getUTCDay() || 7;
    utc.setUTCDate(utc.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
    return Math.ceil((((utc - yearStart) / 86400000) + 1) / 7);
  }

  function renderHeaderDateTime() {
    const el = document.getElementById("dispatchDateTimeSummary");
    if (!el) return;
    const now = new Date();
    const day = String(now.getDate()).padStart(2, "0");
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const year = String(now.getFullYear()).slice(-2);
    const week = String(getIsoWeekNumber(now)).padStart(2, "0");
    const batchCode = `${day}${month}${year}/${week}`;
    const dateLabel = now.toLocaleDateString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
    el.textContent = `${dateLabel} | Batch Code: ${batchCode}`;
  }

  function syncTruckHeaderWidgets() {
    const truckBtn = document.getElementById("dispatchTruckBookedMetric");
    const truckActionBtn = document.getElementById("truckBookBtn");
    const bookedCount = document.getElementById("dispatchTruckBookedParcelCount");
    const recentList = document.getElementById("dispatchRecentlyShipped");
    if (bookedCount) {
      const value = String(bookedCount.textContent || "").match(/\d+/)?.[0] || "0";
      bookedCount.textContent = value;
    }
    if (recentList && /recently shipped/i.test(recentList.textContent || "")) {
      recentList.innerHTML = recentList.innerHTML.replace(/recently shipped/gi, "recently fulfilled");
    }
    if (!truckBtn) return;
    const booked = truckBtn.classList.contains("is-booked");
    const status = booked ? "Booked" : "Not booked";
    truckBtn.setAttribute("title", `Booked status: ${status}`);
    truckBtn.setAttribute("aria-label", `Truck booking status: ${status}`);
    if (!truckBtn.dataset.wired) {
      truckBtn.addEventListener("click", () => {
        if (truckActionBtn) truckActionBtn.click();
      });
      truckBtn.dataset.wired = "true";
    }
  }

  function start() {
    renderHeaderDateTime();
    syncTruckHeaderWidgets();
    setInterval(renderHeaderDateTime, 60000);
    setInterval(syncTruckHeaderWidgets, 1000);
    const truckBtn = document.getElementById("dispatchTruckBookedMetric");
    if (truckBtn && typeof MutationObserver === "function") {
      const observer = new MutationObserver(syncTruckHeaderWidgets);
      observer.observe(truckBtn, { attributes: true, attributeFilter: ["class"] });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
