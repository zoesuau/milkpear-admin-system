import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const sourcePath = process.argv[2] || "index.html";
const html = readFileSync(sourcePath, "utf8");
const match = html.match(
  /function shouldShowOrderChangeAlertForCard\([\s\S]*?\n      }\n\n      function buildAdminOrderCardHtml/,
);
assert.ok(match, "shouldShowOrderChangeAlertForCard helper not found");
const functionSource = match[0].replace(
  /\n\n      function buildAdminOrderCardHtml[\s\S]*$/,
  "",
);
const context = {};
vm.createContext(context);
vm.runInContext(`${functionSource}\nthis.evaluateAlert = shouldShowOrderChangeAlertForCard;`, context);

const base = {
  isAdminCreatedOrder: true,
  orderStatus: "已安排出貨",
  lastNotificationType: "change_notice",
  isPendingNotification: true,
  isManualRescheduleDecision: false,
  shouldHideManualOrderConfirmationNotice: false,
  shouldHideCancellationNotice: false,
};

assert.equal(context.evaluateAlert(base), true, "管理員訂單寄出前的資料異動應顯示");
assert.equal(
  context.evaluateAlert({ ...base, lastNotificationType: "schedule_notice" }),
  false,
  "管理員訂單的初次排程通知不應顯示橘框",
);
assert.equal(
  context.evaluateAlert({ ...base, orderStatus: "已寄出", lastNotificationType: "shipment_notice" }),
  false,
  "管理員訂單的寄出通知不應顯示橘框",
);
assert.equal(
  context.evaluateAlert({ ...base, orderStatus: "已寄出" }),
  false,
  "管理員訂單寄出後的資料異動橘框應結案",
);
assert.equal(
  context.evaluateAlert({ ...base, orderStatus: "已取消" }),
  false,
  "管理員訂單取消後的資料異動橘框應結案",
);
assert.equal(
  context.evaluateAlert({
    ...base,
    isAdminCreatedOrder: false,
    orderStatus: "已寄出",
    lastNotificationType: "shipment_notice",
  }),
  true,
  "一般 LINE 訂單的寄出通知提示應維持原流程",
);

assert.match(html, /shouldShowAdminCreatedChangeAlert[\s\S]*?⚠️ 以下資訊已異動/);
console.log("admin notification alert lifecycle regression checks passed");
