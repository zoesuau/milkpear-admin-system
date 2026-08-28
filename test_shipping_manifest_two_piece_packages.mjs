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

const context = {
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
};
vm.createContext(context);
vm.runInContext(
  `${html.slice(functionsStart, functionsEnd)}
this.getPackageSpecs = getShippingManifestOrderPackageSpecs;
this.buildStats = buildShippingManifestStats;`,
  context,
);

const order = (itemsSummary, totalBoxes) => ({
  itemsSummary,
  totalBoxes,
  finalAmount: 0,
});

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

const stats = context.buildStats([
  order("蔗香梨 30 A｜2顆（$600 × 6盒）", 6),
]);
assert.equal(stats.boxTotal, 6, "總盒數仍須顯示 6 個實體禮盒");
assert.equal(stats.package120cmTotal, 1);
assert.equal(stats.package90cmTotal, 0);

assert.match(
  html,
  /function buildShippingTrackingNumberSlotsHtml\(order\)[\s\S]*?getShippingManifestOrderPackageSpecs\(order\)/,
  "宅配單號欄位必須沿用同一套包裹規格規則",
);

console.log("shipping manifest two-piece package rules: ok");
