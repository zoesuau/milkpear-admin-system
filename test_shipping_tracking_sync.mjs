import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");

assert.match(
  html,
  /id="shippingManifestLoadStatus"[\s\S]*?role="status"[\s\S]*?aria-live="polite"/,
);
assert.match(
  html,
  /function printShippingManifest\(\)[\s\S]*?shippingManifestRemoteLoading[\s\S]*?shippingManifestRemoteError[\s\S]*?shippingManifestRemoteRangeKey\s*!==\s*rangeKey/,
);
assert.match(
  html,
  /shippingManifestRemoteRangeKey\s*=\s*"";[\s\S]*?shippingManifestRemoteLoading\s*=\s*true;[\s\S]*?await refreshAdminOrdersManually\(\);[\s\S]*?await loadCompleteShippingManifestOrders\(\);[\s\S]*?宅配單號已寫入，但出貨總表同步失敗/,
);

const renderStart = html.indexOf("function renderShippingManifest()");
const renderEnd = html.indexOf(
  "function filterBySingleShippingDate",
  renderStart,
);
assert.ok(renderStart >= 0 && renderEnd > renderStart);

const elements = new Map();
function element(id) {
  if (!elements.has(id)) {
    const classes = new Set();
    elements.set(id, {
      disabled: false,
      innerHTML: "",
      innerText: "",
      classList: {
        add: (...names) => names.forEach((name) => classes.add(name)),
        remove: (...names) => names.forEach((name) => classes.delete(name)),
        toggle(name, force) {
          if (force) classes.add(name);
          else classes.delete(name);
        },
      },
    });
  }
  return elements.get(id);
}

const context = {
  document: { getElementById: element },
  shippingManifestDateMode: "today",
  shippingManifestSearchQuery: "",
  shippingManifestSenderFilterMode: "all",
  shippingManifestSenderFilterKey: "",
  shippingManifestRemoteRangeKey: "",
  shippingManifestRemoteLoading: true,
  shippingManifestRemoteError: "",
  getShippingManifestDateRange: () => ({
    startDate: "2026-08-20",
    endDate: "2026-08-20",
  }),
  adminWorkflowIsValidDate: () => true,
  syncEzcatPrepareButton() {},
  getShippingManifestBaseOrdersForRange: () => [
    { orderNo: "P1", buyerName: "寄件人", finalAmount: 1000 },
  ],
  applyShippingManifestSenderFilter: (orders) => orders,
  applyShippingManifestOrdering: (orders) => orders,
  syncShippingManifestSenderFilterControls() {},
  syncShippingManifestOrderingControls() {},
  buildShippingManifestStats: () => ({
    orderCount: 1,
    boxTotal: 1,
    totalAmount: 1000,
  }),
  buildShippingManifestProductSummary: () => "商品統計",
  formatShippingManifestDate: () => "2026/8/20",
  getShippingManifestOrderingSummary: () => "",
  getShippingManifestSenderFilterSummary: () => "",
  normalizeShippingManifestSearchText: (value) => String(value || ""),
  formatShippingManifestPrintTime: () => "2026/08/20 13:00",
  escapeHtml: (value) => String(value),
  formatAdminMoney: (value) => String(value),
  getShippingManifestNote: () => "",
  getShippingManifestSequenceLabel: () => "1",
  formatMultilineHtml: (value) => String(value),
  buildShippingTrackingNumberSlotsHtml: () => "<span>-</span>",
};

runInNewContext(
  `${html.slice(renderStart, renderEnd)}\nthis.render = renderShippingManifest;`,
  context,
);

context.render();
assert.equal(element("shippingManifestPrintButton").disabled, true);
assert.match(element("shippingManifestLoadStatus").innerHTML, /載入中/);

context.shippingManifestRemoteLoading = false;
context.shippingManifestRemoteRangeKey = "2026-08-20|2026-08-20";
context.render();
assert.equal(element("shippingManifestPrintButton").disabled, false);
assert.match(element("shippingManifestLoadStatus").innerHTML, /已同步/);

context.shippingManifestRemoteError = "READ_FAILED";
context.render();
assert.equal(element("shippingManifestPrintButton").disabled, true);
assert.match(element("shippingManifestLoadStatus").innerHTML, /重新載入/);

console.log("shipping tracking synchronization controls: ok");
