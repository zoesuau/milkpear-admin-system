import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const configSource = readFileSync(
  new URL("./customer-config.js", import.meta.url),
  "utf8",
);
const stableHtml = execFileSync("git", ["show", "c8257bc:index.html"], {
  cwd: new URL(".", import.meta.url),
  encoding: "utf8",
});
const stableConfigSource = execFileSync(
  "git",
  ["show", "c8257bc:customer-config.js"],
  {
    cwd: new URL(".", import.meta.url),
    encoding: "utf8",
  },
);

function sourceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

const configContext = { window: {} };
new Function("window", configSource)(configContext.window);
const config = configContext.window.ORDER_SYSTEM_CONFIG;
assert.equal(config.productId, "farm-order-fulfillment");
assert.equal(config.customerId, "sanheyuan");
assert.equal(config.environment, "production");
assert.equal(config.features?.adminOrderSnapshot, true);
assert.equal(
  config.gasApiUrl,
  "https://script.google.com/macros/s/AKfycby9r7QgpvOJ7KP_3uVI9eYHkzeJnPVFhP7Z3uQdQBvMogYglPoim79H3HJpjyUAgW57/exec",
);
assert.equal(
  config.adminSiteUrl,
  "https://zoesuau.github.io/milkpear-admin-system",
);
assert.equal(config.line.loginChannelId, "2010484376");

const configScriptPattern = /<script src="\.\/customer-config\.js\?v=([^"]+)"><\/script>/;
const currentConfigVersion = html.match(configScriptPattern)?.[1];
const stableConfigVersion = stableHtml.match(configScriptPattern)?.[1];
assert.ok(currentConfigVersion, "customer config cache version is required");
if (configSource !== stableConfigSource) {
  assert.notEqual(
    currentConfigVersion,
    stableConfigVersion,
    "changed customer config must use a new cache version",
  );
}

const authStart = "      function clearAdminAuthSession()";
const authEnd = "      function switchAdminTab(";
assert.equal(
  sourceBetween(html, authStart, authEnd),
  sourceBetween(stableHtml, authStart, authEnd),
  "LINE Login source must remain byte-for-byte identical to c8257bc",
);

assert.match(html, /SNAPSHOT_DEPLOYMENT_IDENTITY_REQUIRED/);
assert.match(html, /ORDER_SYSTEM_CONFIG\.features\?\.adminOrderSnapshot === true/);
assert.match(html, /ADMIN_CONFIGURED_SITE_URL\.origin === ADMIN_CURRENT_SITE_URL\.origin/);
assert.doesNotMatch(
  html,
  /AKfycby9r7QgpvOJ7KP_3uVI9eYHkzeJnPVFhP7Z3uQdQBvMogYglPoim79H3HJpjyUAgW57/,
  "the deployment URL belongs in config, not hardcoded in the application",
);

const fetchSource = sourceBetween(
  html,
  "      async function fetchAdminOrdersFromGas(options = {})",
  "      async function loadAdminOrdersForCurrentView(options = {})",
);
assert.match(fetchSource, /action: "adminReadOrderSnapshot"/);
assert.doesNotMatch(fetchSource, /action: "adminReadOrders"/);
assert.match(fetchSource, /ADMIN_ORDER_SNAPSHOT_MAX_RETRIES \+ 1/);

for (const [startMarker, endMarker] of [
  ["      function filterByStatus(", "      function filterByDateRange("],
  ["      function filterByDateRange(", "      function handleCustomDateRangeChange("],
  ["      function filterByNotificationMode(", "      function getAdminFilterCardDate("],
]) {
  const localFilterSource = sourceBetween(html, startMarker, endMarker);
  assert.doesNotMatch(
    localFilterSource,
    /fetch\(|fetchAdminOrdersFromGas|adminReadOrderSnapshot|adminReadOrders/,
  );
}

console.log("production snapshot release identity regression passed");
