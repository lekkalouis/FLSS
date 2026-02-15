import { computeOrderEconomics, storeKpiSnapshot } from "./order-economics.js";

let started = false;
let hourlyTimer = null;
let dailyTimer = null;

function msUntilEndOfDay() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(23, 59, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

export function startOrderEconomicsCron() {
  if (started) return;
  started = true;

  hourlyTimer = setInterval(async () => {
    try {
      await computeOrderEconomics({ period: "month", force: true });
    } catch (err) {
      console.error("[order-economics] hourly recompute failed", err);
    }
  }, 60 * 60 * 1000);

  const scheduleDaily = () => {
    dailyTimer = setTimeout(async () => {
      try {
        const kpi = await computeOrderEconomics({ period: "month", force: true });
        await storeKpiSnapshot(kpi);
      } catch (err) {
        console.error("[order-economics] snapshot store failed", err);
      } finally {
        scheduleDaily();
      }
    }, msUntilEndOfDay());
  };

  scheduleDaily();
}

export function stopOrderEconomicsCron() {
  if (hourlyTimer) clearInterval(hourlyTimer);
  if (dailyTimer) clearTimeout(dailyTimer);
  started = false;
}
