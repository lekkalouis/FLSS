const ORDER_LIST = "ORDER_LIST";
const ORDER_DETAIL = "ORDER_DETAIL";
const PAYMENTS = "PAYMENTS";

export const CONTROLLER_VIEWS = { ORDER_LIST, ORDER_DETAIL, PAYMENTS };

export function reduceControllerEvent(state, event) {
  const current = state?.view || ORDER_LIST;
  const next = { ...state, view: current };

  if (event.event === "ROTATE") {
    const step = event.data?.dir === "CCW" ? -1 : 1;
    if (current === ORDER_LIST) {
      next.selectionOffset = (next.selectionOffset || 0) + step * (event.data?.steps || 1);
    }
    if (current === ORDER_DETAIL) {
      const multiplier = event.data?.shift ? 10 : 1;
      next.qtyDelta = (next.qtyDelta || 0) + step * (event.data?.steps || 1) * multiplier;
    }
    if (current === PAYMENTS) {
      const multiplier = event.data?.shift ? 5 : 1;
      next.paymentCursor = (next.paymentCursor || 0) + step * (event.data?.steps || 1) * multiplier;
    }
    return next;
  }

  if (event.event !== "PRESS") return next;
  if (event.data?.action !== "click") return next;

  if (current === ORDER_LIST) {
    if (event.data?.button === "CONFIRM") next.view = ORDER_DETAIL;
    if (event.data?.button === "MODE") next.menuOpen = true;
    if (event.data?.button === "QUICK") next.reprintRequested = true;
    return next;
  }

  if (current === ORDER_DETAIL) {
    if (event.data?.button === "BACK") next.view = ORDER_LIST;
    if (event.data?.button === "CONFIRM") next.saveRequested = true;
    return next;
  }

  if (current === PAYMENTS) {
    if (event.data?.button === "CONFIRM") next.allocateRequested = true;
    if (event.data?.button === "QUICK") next.partialFullToggle = !(next.partialFullToggle);
  }

  return next;
}
