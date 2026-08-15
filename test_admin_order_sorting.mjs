import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");

function sourceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

const timeSource = sourceBetween(
  html,
  "      function parseAdminSortTime",
  "      function attachAdminOrderSnapshotReadMeta",
);
const cardSortSource = sourceBetween(
  html,
  "      function compareText",
  "      function getFilteredAdminCards",
);

const context = vm.createContext({ Date, Number, String });
vm.runInContext(
  `${timeSource}
   let currentFilterStatus = "待確認";
   ${cardSortSource}
   this.parseTime = parseAdminSortTime;
   this.sortOrders = (orders) => orders.slice().sort(compareAdminOrdersByCreatedAtDesc);
   this.sortCards = sortAdminCardsForCurrentStatus;`,
  context,
);

assert.equal(
  context.parseTime("2026/8/15 下午 8:30:29"),
  Date.UTC(2026, 7, 15, 20, 30, 29),
);
assert.equal(
  context.parseTime("2026/8/15 上午 12:05:06"),
  Date.UTC(2026, 7, 15, 0, 5, 6),
);
assert.equal(
  context.parseTime("2026/8/15 下午 12:05:06"),
  Date.UTC(2026, 7, 15, 12, 5, 6),
);
assert.equal(
  context.parseTime("2026-08-15T13:00:00.000Z"),
  Date.parse("2026-08-15T13:00:00.000Z"),
);
assert.equal(context.parseTime(""), 0);

const snapshotSorted = context.sortOrders([
  { orderNo: "older", createdAt: "2026/8/15 下午 4:01:23" },
  { orderNo: "latest", createdAt: "2026/8/15 下午 8:30:29" },
  { orderNo: "morning", createdAt: "2026/8/15 上午 11:59:59" },
]);
assert.deepEqual(
  snapshotSorted.map((order) => order.orderNo),
  ["latest", "older", "morning"],
);

function card(orderNo, createdAt, requestedShippingSortOrder) {
  return {
    dataset: {
      orderNo,
      createdAt,
      requestedShippingSortOrder: String(requestedShippingSortOrder),
    },
  };
}

const newOrderCards = context.sortCards([
  card("third-older", "2026/8/15 下午 4:01:23", 3),
  card("third-latest", "2026/8/15 下午 8:30:29", 3),
  card("second-older", "2026/8/14 下午 1:00:00", 2),
]);
assert.deepEqual(
  newOrderCards.map((item) => item.dataset.orderNo),
  ["second-older", "third-latest", "third-older"],
  "new orders should keep shipping batch priority, then newest created time",
);

console.log("admin order sorting regression: PASS");
