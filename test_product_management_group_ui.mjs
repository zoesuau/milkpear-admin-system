import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");

function section(start, end) {
  const startIndex = html.indexOf(start);
  const endIndex = html.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0 && endIndex > startIndex, `missing section ${start}`);
  return html.slice(startIndex, endIndex);
}

const management = section(
  "function renderProductManagement()",
  "function renderProductManagementCard(product)",
);
assert.match(management, /const varieties = \["牛奶梨", "蔗香梨", "日本蜜柑"\]/);
assert.doesNotMatch(
  management,
  /if \(!products\.length\) return ""/,
  "fixed product groups must remain visible when empty",
);

const card = section(
  "function renderProductManagementCard(product)",
  "function getProductOperationsModalContext()",
);
assert.match(card, /product-admin-meta">\$\{escapeHtml\(product\.count \|\| ""\)\}裝<\/div>/);
assert.doesNotMatch(card, /盒免運/, "collapsed cards must not show shipping-rule text");

const fields = section(
  "function renderProductManagementFields(product)",
  "function getAdminProductShippingRule(product)",
);
assert.match(fields, /data-product-field="shippingRule"/);
assert.doesNotMatch(fields, /系統代碼|data-product-field="(?:id|code)"/);

const readCard = section(
  "function readProductManagementCard(card)",
  "function validateProductManagementProducts(products, newProduct = null)",
);
assert.match(readCard, /existingProduct\?\.id/);
assert.match(readCard, /existingProduct\?\.code/);
assert.doesNotMatch(readCard, /getValue\("(?:id|code)"\)/);

console.log("product management group UI tests passed");
