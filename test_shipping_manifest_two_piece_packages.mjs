import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const functionsStart = html.indexOf("function parseShippingManifestItems");
const functionsEnd = html.indexOf(
  "function buildShippingManifestProductSummary",
  functionsStart,
);
assert.ok(functionsStart >= 0 && functionsEnd > functionsStart);
const trackingFunctionStart = html.indexOf(
  "function buildShippingTrackingNumberSlotsHtml",
  functionsEnd,
);
const trackingFunctionEnd = html.indexOf(
  "function getShippingManifestNote",
  trackingFunctionStart,
);
assert.ok(
  trackingFunctionStart >= 0 && trackingFunctionEnd > trackingFunctionStart,
);

const context = {
  adminProductCatalogLoading: false,
  adminProductCatalog: [
    {
      id: "general-12a",
      code: "12A",
      variety: "牛奶梨",
      grade: "12 A",
      count: "12顆",
      category: "一般禮盒",
      price: 800,
    },
    {
      id: "two-piece-30a",
      code: "30A",
      variety: "蔗香梨",
      grade: "30 A",
      count: "2顆",
      category: "兩粒禮盒",
      price: 600,
    },
  ],
  normalizeAdminProductCode(value) {
    return String(value || "").replace(/\s+/g, "").toUpperCase();
  },
  normalizeAdminProductCategory(value) {
    return String(value || "").includes("兩粒") ? "兩粒禮盒" : "一般禮盒";
  },
  getActiveShippingTrackingNumbersFromStoredValue() {
    return [];
  },
  formatShippingTrackingNumberForDisplay(value) {
    return String(value || "");
  },
  escapeHtml(value) {
    return String(value ?? "");
  },
};
vm.createContext(context);
vm.runInContext(
  `${html.match(/function getAdminProductShippingRule\([\s\S]*?\n      \}/)[0]}
${html.slice(functionsStart, functionsEnd)}
${html.slice(trackingFunctionStart, trackingFunctionEnd)}
this.getPackageSpecs = getShippingManifestOrderPackageSpecs;
this.buildStats = buildShippingManifestStats;
this.buildTrackingSlots = buildShippingTrackingNumberSlotsHtml;`,
  context,
);

const order = (itemsSummary, totalBoxes) => ({
  itemsSummary,
  totalBoxes,
  finalAmount: 0,
});

context.adminProductCatalog.push({id:'mikan-five',code:'M5',variety:'日本蜜柑',grade:'5斤',count:'5斤',category:'一般禮盒',price:500,shippingRule:'half_6'});
assert.deepEqual(Array.from(context.getPackageSpecs(order('日本蜜柑 5斤（$500 × 1盒）',1))),['2'],'single five-jin box must not be rejected as an incomplete pear pair');
assert.deepEqual(Array.from(context.getPackageSpecs(order('日本蜜柑 5斤（$500 × 6盒）',6))),['3'],'six five-jin boxes use the same package units as six small pear boxes');

assert.deepEqual(
  Array.from(
    context.getPackageSpecs(
      order("蔗香梨 30 A｜2顆（$600 × 6盒）", 6),
    ),
  ),
  ["3"],
  "出貨總表：兩粒裝 6 盒只能顯示一件 120cm",
);
assert.deepEqual(
  Array.from(
    context.getPackageSpecs(
      order("蔗香梨 30 A｜2顆（$600 × 8盒）", 8),
    ),
  ),
  ["3", "2"],
  "出貨總表：兩粒裝 8 盒應顯示 120cm 加 90cm",
);
assert.deepEqual(
  Array.from(
    context.getPackageSpecs(
      order(
        "牛奶梨 12 A｜12顆（$800 × 1盒）\n蔗香梨 30 A｜2顆（$600 × 4盒）",
        5,
      ),
    ),
  ),
  ["3"],
  "出貨總表：一般 1 盒加兩粒裝 4 盒應合計一件 120cm",
);
assert.equal(
  context.getPackageSpecs(
    order("蔗香梨 30 A｜2顆（$600 × 3盒）", 3),
  ),
  null,
  "出貨總表：兩粒裝奇數盒不得產生推測尺寸",
);

for (const [physicalBoxes, expectedSpecs] of [
  [1, ["2"]],
  [3, ["3"]],
  [5, ["3"]],
]) {
  assert.deepEqual(
    Array.from(
      context.getPackageSpecs({
        ...order(
          `蔗香梨 30 A｜2顆（$600 × ${physicalBoxes}盒）`,
          physicalBoxes,
        ),
        orderSource: "管理端",
      }),
    ),
    expectedSpecs,
    `管理端兩粒裝 ${physicalBoxes} 盒必須顯示正確包裹規格`,
  );
}

const adminOddStats = context.buildStats([
  {
    ...order("蔗香梨 30 A｜2顆（$600 × 5盒）", 5),
    orderSource: "管理端",
  },
]);
assert.equal(adminOddStats.boxTotal, 5);
assert.equal(adminOddStats.package120cmTotal, 1);
assert.equal(adminOddStats.package90cmTotal, 0);

const stats = context.buildStats([
  order("蔗香梨 30 A｜2顆（$600 × 6盒）", 6),
]);
assert.equal(stats.boxTotal, 6, "總盒數仍須顯示 6 個實體禮盒");
assert.equal(stats.package120cmTotal, 1);
assert.equal(stats.package90cmTotal, 0);

context.adminProductCatalog = [];
context.adminProductCatalogLoading = true;
assert.match(
  context.buildTrackingSlots(order("無法辨識商品", 1)),
  /尺寸讀取中/,
  "商品目錄載入期間不可把尺寸顯示為待確認",
);
context.adminProductCatalogLoading = false;
assert.match(
  context.buildTrackingSlots(order("無法辨識商品", 1)),
  /尺寸待確認/,
  "商品目錄完成後仍無法辨識時才顯示尺寸待確認",
);

assert.match(
  html,
  /function buildShippingTrackingNumberSlotsHtml\(order\)[\s\S]*?getShippingManifestOrderPackageSpecs\(order\)/,
  "宅配單號欄位必須沿用同一套包裹規格規則",
);

console.log("shipping manifest two-piece package rules: ok");
