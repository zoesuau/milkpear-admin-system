import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");

assert.match(
  html,
  /const ADMIN_ACTIVE_TAB_KEY[\s\S]*?function switchAdminTab[\s\S]*?sessionStorage\.setItem\(ADMIN_ACTIVE_TAB_KEY, normalizedTabName\)[\s\S]*?function restoreAdminTab[\s\S]*?sessionStorage\.getItem\(ADMIN_ACTIVE_TAB_KEY\)/,
  "重新整理後必須從 sessionStorage 還原目前管理頁籤",
);
assert.match(
  html,
  /id="shippingManifestSearchInput"[\s\S]*?placeholder="[^"]*母單[^"]*"/,
  "出貨單搜尋提示必須包含母單",
);
assert.match(
  html,
  /id="shippingManifestSenderFilterMode"[\s\S]*?value="include"[\s\S]*?value="exclude"/,
  "出貨總表必須提供只顯示及排除寄件人模式",
);
assert.match(
  html,
  /data-shipping-manifest-mode="today"[\s\S]*?data-shipping-manifest-mode="tomorrow"[\s\S]*?data-shipping-manifest-mode="custom"[\s\S]*?>\s*自訂\s*</,
  "出貨總表日期列必須提供今天、明天與自訂頁籤",
);
assert.doesNotMatch(
  html,
  /shippingManifestDateInput|shippingManifestStartDateInput|shippingManifestEndDateInput|data-shipping-manifest-mode="range"/,
  "舊的指定日期與獨立區間控制不得殘留",
);
for (const id of [
  "shippingManifestCustomDateStart",
  "shippingManifestCustomDateEnd",
  "shippingManifestCustomDateCalendarGrid",
]) {
  assert.ok(html.includes(`id="${id}"`), `缺少自訂日期控制：${id}`);
}
const shippingSearchIndex = html.indexOf('id="shippingManifestSearchInput"');
const shippingSortIndex = html.indexOf('id="shippingManifestSortMode"');
const shippingSenderFilterIndex = html.indexOf(
  'id="shippingManifestSenderFilterMode"',
);
assert.ok(
  shippingSearchIndex >= 0 &&
    shippingSearchIndex < shippingSortIndex &&
    shippingSortIndex < shippingSenderFilterIndex,
  "出貨總表排列方式必須緊接搜尋之後，並位於寄件人篩選之前",
);

const shippingDateRangeStart = html.indexOf(
  "function getShippingManifestDateRange",
);
const shippingDateRangeEnd = html.indexOf(
  "function setShippingManifestDateMode",
  shippingDateRangeStart,
);
assert.ok(
  shippingDateRangeStart >= 0 && shippingDateRangeEnd > shippingDateRangeStart,
  "必須能擷取出貨總表日期範圍函式",
);
const shippingDateValues = {
  shippingManifestCustomDateStart: { value: "2026-08-28" },
  shippingManifestCustomDateEnd: { value: "2026-08-28" },
};
const shippingDateContext = vm.createContext({
  shippingManifestDateMode: "custom",
  document: {
    getElementById: (id) => shippingDateValues[id] || null,
  },
  normalizeAdminDateValue: (value) => String(value || ""),
  getTaipeiToday: () => "2026-08-28",
  addDaysToDateString: () => "2026-08-29",
});
vm.runInContext(
  html.slice(shippingDateRangeStart, shippingDateRangeEnd),
  shippingDateContext,
);
assert.deepEqual(
  { ...shippingDateContext.getShippingManifestDateRange() },
  { startDate: "2026-08-28", endDate: "2026-08-28" },
  "自訂日曆第一次選取必須可作為單日篩選",
);
shippingDateValues.shippingManifestCustomDateEnd.value = "2026-08-31";
assert.deepEqual(
  { ...shippingDateContext.getShippingManifestDateRange() },
  { startDate: "2026-08-28", endDate: "2026-08-31" },
  "自訂日曆第二次選取必須可形成日期區間",
);

const shippingDateSelectStart = html.indexOf(
  "function setShippingManifestCustomDateRange",
);
const shippingDateSelectEnd = html.indexOf(
  "function moveShippingManifestCustomDateCalendarMonth",
  shippingDateSelectStart,
);
assert.ok(
  shippingDateSelectStart >= 0 && shippingDateSelectEnd > shippingDateSelectStart,
  "必須能擷取出貨總表日期選取函式",
);
const selectedShippingDates = {
  shippingManifestCustomDateStart: { value: "" },
  shippingManifestCustomDateEnd: { value: "" },
};
const shippingDateSelectContext = vm.createContext({
  shippingManifestDateMode: "today",
  shippingManifestCustomDateRangeSelectingEnd: false,
  document: {
    getElementById: (id) =>
      selectedShippingDates[id] || {
        classList: { add() {} },
      },
    querySelectorAll: () => [],
  },
  renderShippingManifestCustomDateCalendar() {},
  renderShippingManifest() {},
  loadCompleteShippingManifestOrders() {},
});
vm.runInContext(
  html.slice(shippingDateSelectStart, shippingDateSelectEnd),
  shippingDateSelectContext,
);
shippingDateSelectContext.selectShippingManifestCustomDateRangeDay(
  "2026-08-28",
);
assert.equal(selectedShippingDates.shippingManifestCustomDateStart.value, "2026-08-28");
assert.equal(selectedShippingDates.shippingManifestCustomDateEnd.value, "2026-08-28");
shippingDateSelectContext.selectShippingManifestCustomDateRangeDay(
  "2026-08-31",
);
assert.equal(selectedShippingDates.shippingManifestCustomDateStart.value, "2026-08-28");
assert.equal(selectedShippingDates.shippingManifestCustomDateEnd.value, "2026-08-31");
const helperStart = html.indexOf(
  "function normalizeShippingManifestSenderKey",
);
const helperEnd = html.indexOf(
  "function getShippingManifestOrderingSummary",
  helperStart,
);
assert.ok(helperStart >= 0 && helperEnd > helperStart);

const context = vm.createContext({
  shippingManifestSortMode: "original",
  shippingManifestPrioritySenderKey: "",
  shippingManifestSenderFilterMode: "all",
  shippingManifestSenderFilterKey: "",
  getShippingManifestOrderBoxCount: () => 1,
  renderShippingManifest() {},
  document: { getElementById: () => null },
  escapeHtml: (value) => String(value),
});
vm.runInContext(html.slice(helperStart, helperEnd), context);

const groupChild = {
  orderNo: "P260828-001",
  recipientName: "王小明",
  recipientPhone: "0912-345-678",
  recipientAddress: "台北市",
  buyerName: "林小姐",
  buyerPhone: "04-1234-5678",
  groupOrderId: "G260828-001",
  groupName: "八月公司團購",
  groupBuyerName: "陳團主",
  groupBuyerPhone: "0911-000-111",
  trackingNo: "1234-5678-9012",
};
for (const query of [
  "G260828001",
  "八月公司團購",
  "陳團主",
  "0911000111",
]) {
  assert.equal(
    context.shippingManifestOrderMatchesSearch(groupChild, query),
    true,
    `母單搜尋必須命中：${query}`,
  );
}

const sameNameDifferentPhone = {
  ...groupChild,
  orderNo: "P260828-002",
  buyerPhone: "04-9999-9999",
};
const selectedKey = context.getShippingManifestSenderKey(groupChild);
assert.notEqual(
  selectedKey,
  context.getShippingManifestSenderKey(sameNameDifferentPhone),
  "同名但電話不同的寄件人不可被誤合併",
);

context.shippingManifestSenderFilterKey = selectedKey;
context.shippingManifestSenderFilterMode = "include";
assert.deepEqual(
  Array.from(
    context.applyShippingManifestSenderFilter([
      groupChild,
      sameNameDifferentPhone,
    ]),
    (order) => order.orderNo,
  ),
  ["P260828-001"],
  "只顯示模式只能保留指定寄件人",
);
context.shippingManifestSenderFilterMode = "exclude";
assert.deepEqual(
  Array.from(
    context.applyShippingManifestSenderFilter([
      groupChild,
      sameNameDifferentPhone,
    ]),
    (order) => order.orderNo,
  ),
  ["P260828-002"],
  "排除模式必須移除指定寄件人",
);

const ezcatModalStart = html.indexOf("async function openEzcatExportModal");
const ezcatModalEnd = html.indexOf(
  "function closeEzcatExportModal",
  ezcatModalStart,
);
assert.ok(ezcatModalStart >= 0 && ezcatModalEnd > ezcatModalStart);
assert.doesNotMatch(
  html.slice(ezcatModalStart, ezcatModalEnd),
  /shippingManifestSenderFilter/,
  "寄件人列印篩選不得改變黑貓 CSV 候選資料",
);

console.log("shipping manifest group search and sender filters: PASS");
