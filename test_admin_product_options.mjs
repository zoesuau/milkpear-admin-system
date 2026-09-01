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

const sortingSource = sourceBetween(
  html,
  "      function getAdminProductVarietyRank",
  "      function getAdminProductDisplayName",
);

const context = vm.createContext({ Number, String });
vm.runInContext(
  `function normalizeAdminProductStatus(value) { return value; }
   function normalizeAdminProductCategory(value) { return value; }
   function isAdminProductSellable(product) { return ["上架", "僅後台販售"].includes(product?.status); }
   ${sortingSource}
   this.sortOptions = (products) => products.slice().sort(compareAdminProductsForOrderOptions);
   this.stockLabel = getAdminProductOptionStockLabel;
   this.isAvailable = isAdminProductAvailableForOrderOption;
   this.categorySegment = getAdminProductOptionCategorySegment;`,
  context,
);

const sorted = context.sortOptions([
  { code: "A14AA", variety: "蔗香梨", grade: "14A", category: "一般禮盒", status: "僅後台販售" },
  { code: "17A", variety: "牛奶梨", grade: "17 A", category: "一般禮盒", status: "上架" },
  { code: "A18", variety: "蔗香梨", grade: "18A", category: "一般禮盒", status: "上架" },
  { code: "12A", variety: "牛奶梨", grade: "12 A", category: "一般禮盒", status: "僅後台販售" },
  { code: "13A", variety: "牛奶梨", grade: "13 A", category: "一般禮盒", status: "上架" },
]);

assert.deepEqual(
  sorted.map((product) => product.code),
  ["13A", "17A", "12A", "A18", "A14AA"],
  "order options should keep each variety together, then sort by status and grade",
);
assert.equal(context.stockLabel({ stock: 33 }), "剩餘 33 盒");
assert.equal(context.stockLabel({ stock: 0 }), "剩餘 0 盒");
assert.equal(context.stockLabel({ stock: null }), "庫存未控管");
assert.equal(context.isAvailable({ status: "上架", stock: 0 }), false);
assert.equal(context.isAvailable({ status: "上架", stock: 1 }), true);
assert.equal(context.isAvailable({ status: "僅後台販售", stock: null }), true);
assert.equal(context.isAvailable({ status: "停售", stock: 10 }), false);
assert.equal(context.categorySegment({ category: "一般禮盒" }), "");
assert.equal(context.categorySegment({ category: "兩粒禮盒" }), "｜兩粒禮盒");
assert.match(html, /formatAdminMoney\(product\.price\)\)\}｜\$\{escapeHtml\(getAdminProductOptionStockLabel\(product\)\)\}/);
assert.match(html, /filter\(\(product\) => isAdminProductAvailableForOrderOption\(product\)\)/);
assert.doesNotMatch(html, /getAdminProductDisplayName\(product\)\)\}｜\$\{escapeHtml\(product\.category/);

console.log("admin product option grouping, labels, and availability: PASS");
