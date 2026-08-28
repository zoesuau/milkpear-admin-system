import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const start = html.indexOf("function normalizeMoney");
const end = html.indexOf("function formatOperationTime", start);
assert.ok(start >= 0 && end > start, "找不到管理端金額預覽函式");

const context = {
  adminProductsReady: true,
  adminProductCatalog: [
    { id: "general", code: "G1", variety: "牛奶梨", grade: "12 A", count: "10顆", category: "一般禮盒", price: 800 },
    { id: "two-piece", code: "T2", variety: "蔗香梨", grade: "30 A", count: "2顆", category: "兩粒禮盒", price: 600 },
  ],
  OFFSHORE_SHIPPING_KEYWORDS: ["澎湖"],
  normalizeAdminProductCategory: (value) => String(value || "").includes("兩粒") ? "兩粒禮盒" : "一般禮盒",
  getAdminProductDisplayName: (product) => `${product.variety} ${product.grade}`,
};
vm.createContext(context);
vm.runInContext(
  `${html.slice(start, end)}\nthis.calculate = calculateOrderAmount; this.hasOdd = hasIncompleteAdminTwoPieceSelection;`,
  context,
);

for (const [qty, mainlandFee, offshoreFee] of [
  [1, 150, 300], [2, 150, 300], [3, 250, 350],
  [4, 250, 350], [5, 250, 350], [6, 0, 400],
]) {
  const mainland = context.calculate([{ productCode: "T2", qty }], "銀行轉帳", 0, "台北市");
  const offshore = context.calculate([{ productCode: "T2", qty }], "銀行轉帳", 0, "澎湖縣");
  assert.equal(mainland.totalBoxes, qty, "總盒數必須保留實體盒數");
  assert.equal(mainland.shippingFee, mainlandFee, `本島 ${qty} 盒運費錯誤`);
  assert.equal(offshore.shippingFee, offshoreFee, `離島 ${qty} 盒運費錯誤`);
}

const mixed = context.calculate(
  [{ productCode: "G1", qty: 1 }, { productCode: "T2", qty: 3 }],
  "銀行轉帳", 0, "台北市",
);
assert.equal(mixed.totalBoxes, 4);
assert.equal(mixed.shippingFee, 250, "一般 1 盒加兩粒裝 3 盒為 2.5 單位");
assert.equal(context.hasOdd([{ code: "T2", qty: 5 }]), true);
assert.equal(context.hasOdd([{ code: "T2", qty: 6 }]), false);
assert.match(
  html,
  /String\(order\.orderSource \|\| ""\)\.trim\(\) !== "管理端"[\s\S]*?hasIncompleteAdminTwoPieceSelection\(items\)/,
  "編輯 LINE 訂單時不得把兩粒裝改成奇數盒",
);

console.log("admin two-piece odd shipping preview: ok");
