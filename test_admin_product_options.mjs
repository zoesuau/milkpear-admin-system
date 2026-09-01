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
   ${sortingSource}
   this.sortOptions = (products) => products.slice().sort(compareAdminProductsForOrderOptions);
   this.stockLabel = getAdminProductOptionStockLabel;`,
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
assert.match(html, /formatAdminMoney\(product\.price\)\)\}｜\$\{escapeHtml\(getAdminProductOptionStockLabel\(product\)\)\}/);

console.log("admin product option sorting and stock labels: PASS");
