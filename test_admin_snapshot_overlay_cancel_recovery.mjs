import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");

function sourceBetween(startMarker, endMarker) {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return html.slice(start, end);
}

const overlaySource = sourceBetween(
  "      function getAdminSnapshotOverlayComparableFields",
  "      const ADMIN_PAYMENT_STATE_OPTIONS",
);
assert.match(overlaySource, /pendingAdminSnapshotOrderOverlays\.set/);
assert.match(overlaySource, /visibleOrders\.unshift/);
assert.match(overlaySource, /pendingAdminSnapshotOrderOverlays\.delete/);

const overlayContext = {};
vm.createContext(overlayContext);
vm.runInContext(
  `const pendingAdminSnapshotOrderOverlays = new Map();\n${overlaySource}\n` +
    "this.overlayApi = { preserveAdminOrderUntilSnapshot, mergePendingAdminSnapshotOrderOverlays };",
  overlayContext,
);
const overlayApi = overlayContext.overlayApi;
assert.equal(
  overlayApi.preserveAdminOrderUntilSnapshot({
    orderNo: "P1",
    orderStatus: "已取消",
    notificationStatus: "manual_required",
  }),
  true,
);
const staleMerge = overlayApi.mergePendingAdminSnapshotOrderOverlays([
  { orderNo: "P1", orderStatus: "已安排出貨" },
  { orderNo: "P0", orderStatus: "已安排出貨" },
]);
assert.equal(staleMerge.length, 2);
assert.equal(staleMerge[0].orderStatus, "已取消");
assert.equal(staleMerge[0].notificationStatus, "manual_required");

const currentMerge = overlayApi.mergePendingAdminSnapshotOrderOverlays([
  {
    orderNo: "P1",
    orderStatus: "已取消",
    notificationStatus: "manual_required",
  },
]);
assert.equal(currentMerge[0].orderStatus, "已取消");
const afterConfirmation = overlayApi.mergePendingAdminSnapshotOrderOverlays([]);
assert.equal(
  afterConfirmation.length,
  0,
  "overlay must clear only after the snapshot contains the confirmed state",
);

const groupChildSource = sourceBetween(
  "      async function submitGroupChild",
  "      async function batchMarkGroupOrderPaid",
);
assert.match(groupChildSource, /preserveUntilSnapshot:\s*true/);
assert.doesNotMatch(groupChildSource, /refreshInBackground:\s*true/);
assert.match(groupChildSource, /已建立並加入訂單作業/);

const cancelReadbackSource = sourceBetween(
  "      async function fetchAdminOrderByNoFromGas",
  "      function finishConfirmedAdminCancellation",
);
assert.match(cancelReadbackSource, /action:\s*"adminReadOrders"/);
assert.match(cancelReadbackSource, /query:\s*normalizedOrderNo/);
assert.match(cancelReadbackSource, /exactMatches\.length > 1/);

const cancelSubmitSource = sourceBetween(
  "      async function adminCancelOrderSubmit",
  "      function parseAdminEditableItemsSummary",
);
assert.equal(
  [...cancelSubmitSource.matchAll(/action:\s*"adminCancelOrder"/g)].length,
  1,
  "uncertain cancellation must never submit a second cancellation request",
);
assert.match(cancelSubmitSource, /fetchWithTimeout\(/);
assert.match(cancelSubmitSource, /ADMIN_READ_ORDERS_TIMEOUT_MS/);
assert.doesNotMatch(
  cancelSubmitSource,
  /CANCELLATION_NOTIFICATION_STATUSES\.has\(notificationStatus\)/,
  "notification metadata must not decide whether the business cancellation succeeded",
);
assert.ok(
  [...cancelSubmitSource.matchAll(/recoverConfirmedAdminCancellation\(/g)]
    .length >= 2,
  "both rejected responses and transport failures must use authoritative readback",
);
assert.match(cancelSubmitSource, /不要再次送出取消/);

const cancelFinishSource = sourceBetween(
  "      function finishConfirmedAdminCancellation",
  "      async function recoverConfirmedAdminCancellation",
);
assert.match(cancelFinishSource, /preserveUntilSnapshot:\s*true/);
assert.match(cancelFinishSource, /review_required/);

console.log("admin snapshot overlay and cancellation recovery: PASS");
