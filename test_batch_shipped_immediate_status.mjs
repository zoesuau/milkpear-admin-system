import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
function between(start, end) {
  const from = html.indexOf(start);
  const to = html.indexOf(end, from);
  assert.ok(from >= 0 && to > from);
  return html.slice(from, to);
}
const batch = between("      const ADMIN_PENDING_SHIPMENT_KEY", '      document\n        .getElementById("batchShippedBtn")');
const overlays = between("      function getAdminSnapshotOverlayComparableFields", "      const ADMIN_PAYMENT_STATE_OPTIONS");
const status = between("      function getAdminOrderStatusMeta", "      function formatAdminMoney");
const render = between("      function renderAdminOrders", "      function replaceAdminOrderLocally");
const old = ["A", "B", "C"].map(orderNo => ({ orderNo, orderStatus: "已安排出貨" }));
const shipped = old.slice(0, 2).map(order => ({ ...order, orderStatus: "已寄出", notificationStatus: "sent", lastNotificationType: "shipment_notice", actualShippingDate: "2026-09-15" }));

async function run({ orders = shipped, snapshot = old, ok = true, lostResponse = false, expired = false } = {}) {
  let writes = 0;
  let reads = 0;
  const stored = new Map([["test", "test"]]);
  const c = {
    latestAdminOrders: structuredClone(old), adminOrderReadMeta: {},
    adminCurrentPage: 1, ADMIN_ORDERS_PER_PAGE: 20,
    ADMIN_STORAGE_NAMESPACE: "fixture", AbortController,
    ensureAdminSessionReady: async () => true, markAdminSessionVerified() {}, setAdminAuthRetryButtonMode() {}, showAdminAuthOverlay() {},
    document: { visibilityState: "visible", getElementById: () => ({ innerHTML: "" }) },
    pendingAdminSnapshotOrderOverlays: new Map(),
    adminBatchProcessing: false, selectedOrderNos: new Set(["A", "B"]),
    unconfirmedNotificationOrderNos: new Set(),
    getSelectedAdminOrders: () => old.slice(0, 2), isBatchShippableOrder: () => true,
    window: { confirm: () => true, setTimeout: (fn,ms) => setTimeout(fn, ms === 60000 ? ms : 0), clearTimeout }, sessionStorage: { getItem: k => stored.get(k)||null, setItem: (k,v) => stored.set(k,v), removeItem: k => stored.delete(k) },
    ADMIN_LINE_SESSION_TOKEN_KEY: "test", GAS_ORDERS_API_URL: "mock",
    fetch: async () => { writes++; if(lostResponse) throw Error("network"); return { ok, json: async () => (expired ? {ok:false,action:"adminBatchMarkOrdersShipped",errorCode:"ADMIN_SESSION_REQUIRED"} : { ok, action: "adminBatchMarkOrdersShipped", updated: { count: 2, orderNos: ["A", "B"] }, orders }) }; },
    fetchAdminRecoverableResponse: async () => { reads++; return {ok:true,json:async()=>({ok:true,action:"adminReadShipmentResults",orders:snapshot.filter(x=>["A","B"].includes(x.orderNo)),unresolved:[]})}; },
    fetchAdminOrdersFromGas: async () => { reads++; return snapshot; },
    setBatchFeedback: (message, error = false) => { c.feedback = { message, error }; },
    syncBatchSelectionUi() {}, updateStatsCounters() {},
    applyCurrentFilter() { c.cardClasses = c.latestAdminOrders.map(order => c.getAdminOrderStatusMeta(order.orderStatus).cardClass); },
    updateNotifyButton() {}, applyReadOnlyModeToRealOrders() {},
  };
  vm.createContext(c);
  vm.runInContext(overlays + status + render + batch, c);
  await c.batchUpdateStatusToShipped();
  assert.equal(writes, 1, "never repeat the mutation");
  return { c, reads, get writes() { return writes; }, stored };
}

const { c, reads } = await run();
assert.equal(c.latestAdminOrders[0].orderStatus, "已寄出", "success must update immediately");
assert.equal(reads, 0, "confirmed orders must not wait for snapshot network reads");
assert.equal(c.feedback.error, false);
assert.equal(c.selectedOrderNos.size, 0);
assert.equal(c.getAdminOrderStatusMeta(c.latestAdminOrders[0].orderStatus).cardClass, "status-shipped");
assert.equal(c.cardClasses[0], "status-shipped");
assert.equal(c.latestAdminOrders[2].orderStatus, "已安排出貨");
c.renderAdminOrders(old);
assert.equal(c.latestAdminOrders[0].orderStatus, "已寄出", "stale snapshot must not revert status");
assert.equal(c.latestAdminOrders[1].notificationStatus, "sent");
c.renderAdminOrders([...shipped, old[2]]);
assert.equal(c.pendingAdminSnapshotOrderOverlays.size, 0, "current snapshot releases overlays");

for (const orders of [null, [shipped[0]], [shipped[0], shipped[0]], old.slice(0, 2)]) {
  const { c } = await run({ orders });
  assert.equal(c.feedback.error, true, "unverified stale data must not report success");
  assert.equal(c.latestAdminOrders[0].orderStatus, "已安排出貨");
}
const fallback = await run({ orders: null, snapshot: [...shipped, old[2]] });
assert.equal(fallback.c.latestAdminOrders[0].orderStatus, "已寄出");
assert.equal(fallback.c.feedback.error, false);
const rejected = await run({ ok: false });
assert.equal(rejected.c.latestAdminOrders[0].orderStatus, "已安排出貨");
assert.equal(rejected.c.pendingAdminSnapshotOrderOverlays.size, 0);
const failedRead = await run({ orders: null, snapshot: null });
assert.equal(failedRead.c.feedback.error, true);
assert.equal(failedRead.c.latestAdminOrders[0].orderStatus, "已安排出貨");
const recovered = await run({lostResponse:true,snapshot:[...shipped,old[2]]});
assert.equal(recovered.c.latestAdminOrders[0].orderStatus,"已寄出");
assert.equal(recovered.reads,1);
assert.equal(recovered.c.loadPendingAdminShipment(),null);
const uncertain=await run({lostResponse:true});
assert.ok(uncertain.c.loadPendingAdminShipment());
assert.equal(uncertain.c.latestAdminOrders[0].orderStatus,"已安排出貨");
await uncertain.c.batchUpdateStatusToShipped();
assert.equal(uncertain.writes,1);
const expired=await run({expired:true});
assert.match(expired.c.feedback.message,/登入已過期/);
assert.equal(expired.reads,0);
assert.equal(expired.c.loadPendingAdminShipment(),null);
console.log("batch shipped regression passed: response loss, no resend, expiry, stale overlays and readback");
