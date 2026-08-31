import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const start = html.indexOf("function formatAdminCreateDiagnostic");
const end = html.indexOf("function finishAdminCreateOrder", start);
assert.ok(start >= 0 && end > start, "create diagnostic formatter should exist");
const source = html.slice(start, end);

assert.match(source, /diagnostic\.elapsedMs/);
assert.match(source, /diagnostic\.stages\?\./);
for (const label of ["庫存", "Orders", "客戶／索引", "通知紀錄", "群組通知"]) {
  assert.match(source, new RegExp(label));
}
assert.match(
  html,
  /訂單 \$\{createdOrderNo\} 已建立\$\{formatAdminCreateDiagnostic\(/,
);

console.log("admin create timing display regression checks passed");
