import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");

function sourceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

assert.match(
  html,
  /id="adminRefreshOrdersBtn"[\s\S]*?>\s*同步最新訂單\s*</,
  "manual refresh button should describe that it synchronizes the latest orders",
);

const refreshStateSource = sourceBetween(
  html,
  "      function setAdminRefreshState",
  "      function updateAdminRefreshMeta",
);
assert.match(refreshStateSource, /isRefreshing\s*\?\s*"同步中\.\.\."\s*:\s*"同步最新訂單"/);

const syncSource = sourceBetween(
  html,
  "      async function syncLatestAdminOrdersToSnapshot",
  "      async function refreshAdminOrdersManually",
);
assert.match(syncSource, /action:\s*"adminSyncOrderSnapshot"/);
assert.match(syncSource, /adminSessionToken/);
assert.match(syncSource, /payload\?\.action\s*!==\s*"adminSyncOrderSnapshot"/);
assert.match(syncSource, /ADMIN_SESSION_REQUIRED/);

const manualRefreshSource = sourceBetween(
  html,
  "      async function refreshAdminOrdersManually",
  "      function reloadAdminPage",
);
const syncCallIndex = manualRefreshSource.indexOf(
  "await syncLatestAdminOrdersToSnapshot()",
);
const readCallIndex = manualRefreshSource.indexOf("await fetchAdminOrdersFromGas");
assert.ok(syncCallIndex >= 0, "manual refresh should synchronize pending mutations");
assert.ok(readCallIndex > syncCallIndex, "snapshot read must happen after synchronization");
assert.match(manualRefreshSource, /forceReload:\s*true/);
assert.match(manualRefreshSource, /同步失敗，原本畫面已保留/);

console.log("admin manual snapshot sync frontend regression: PASS");
