import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.dirname(fileURLToPath(import.meta.url));
const html = readFileSync(path.join(root, "index.html"), "utf8");
const config = readFileSync(path.join(root, "customer-config.js"), "utf8");
const source = html.replace(
  /<script src="\.\/customer-config\.js[^"]*"><\/script>/,
  `<script>${config}</script>`,
);

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.addInitScript(() => {
  const original = window.addEventListener.bind(window);
  window.addEventListener = (type, listener, options) => {
    if (type === "DOMContentLoaded") return;
    return original(type, listener, options);
  };
});
await page.setContent(source, { waitUntil: "domcontentloaded" });
await page.evaluate(() => {
  adminProductCatalog = [
    {
      id: "p12A",
      code: "12A",
      variety: "牛奶梨",
      category: "一般禮盒",
      grade: "12 A",
      count: "10顆",
      price: 800,
      stock: 80,
      adminReservedStock: 0,
      status: "上架",
      active: true,
      sortOrder: 1,
    },
  ];
  adminProductsReady = true;
  adminGroupOrders = [
    {
      groupOrderId: "G260816-TEST",
      groupName: "王小姐送禮 50 盒",
      buyerName: "王小姐",
      buyerPhone: "0912345678",
      totalBoxes: 50,
      status: "open",
      adminNote: "測試母單",
      items: [{ code: "12A", qty: 50, allocatedQty: 2, remainingQty: 48 }],
      children: [
        {
          orderNo: "P260816-TEST",
          recipientName: "第一位收件人",
          orderStatus: "已安排出貨",
          paymentMethod: "銀行轉帳",
          paymentStatus: "未付款",
          groupCodAmount: 0,
          cancelled: false,
        },
      ],
    },
  ];
  const tab = document.getElementById("groupOrdersTabButton");
  tab.hidden = false;
  document.querySelector(".admin-tab-bar").classList.add("group-orders-enabled");
  document.getElementById("adminAuthOverlay").style.display = "none";
  switchAdminTab("groupOrders");
  renderAdminGroupOrders();
});

assert.equal(await page.getByRole("button", { name: "團體訂單" }).isVisible(), true);
assert.match(await page.locator("#groupOrderCards").innerText(), /已分配 2／50 盒，尚餘 48 盒/);
assert.equal(await page.getByRole("button", { name: /批次轉帳已付款/ }).count(), 1);
const panelBox = await page.locator(".group-order-panel").boundingBox();
assert.ok(panelBox && panelBox.width <= 390, "團體訂單頁不可超出 390px 手機畫面");

await page.getByRole("button", { name: "＋ 新增母單" }).click();
const parentModalBox = await page.locator("#groupOrderModal .modal-container").boundingBox();
assert.ok(parentModalBox && parentModalBox.width <= 390, "母單視窗需適合手機");
await page.locator("#groupOrderModal .modal-close-btn").click();

await page.getByRole("button", { name: "＋ 新增收件人" }).click();
const childModalBox = await page.locator("#groupChildModal .modal-container").boundingBox();
assert.ok(childModalBox && childModalBox.width <= 390, "子單視窗需適合手機");
assert.match(await page.locator("#group-child-parent-summary").innerText(), /尚餘 48 盒/);
assert.equal(await page.locator("#group-child-buyer-name").inputValue(), "王小姐");
assert.equal(await page.locator("#group-child-buyer-phone").inputValue(), "0912345678");
await page.locator("#group-child-buyer-name").fill("李小姐");
assert.equal(await page.locator("#group-child-buyer-name").inputValue(), "李小姐");

await browser.close();
console.log("group order mobile UI checks passed");
