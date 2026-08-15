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

const helperSource = sourceBetween(
  html,
  "      const ADMIN_READ_ERROR_BREADCRUMB_EVENTS",
  "      function getAdminCreatePayloadFingerprint",
);

function createContext(storageFailure = false) {
  const stored = new Map();
  const records = [];
  const context = vm.createContext({
    Date,
    Error,
    JSON,
    Math,
    Number,
    Set,
    String,
    localStorage: {
      getItem(key) {
        if (storageFailure) throw new Error("storage unavailable");
        return stored.get(key) || null;
      },
      setItem(key, value) {
        if (storageFailure) throw new Error("storage unavailable");
        stored.set(key, String(value));
      },
    },
    console: {
      log(value) { records.push(JSON.parse(value)); },
      error(value) { records.push(JSON.parse(value)); },
    },
  });
  vm.runInContext(
    `const ADMIN_READ_OBSERVABILITY_LEVEL = "DEBUG";
     const ADMIN_READ_BREADCRUMB_STORAGE_KEY = "test-admin-read";
     const ADMIN_READ_BREADCRUMB_REQUEST_LIMIT = 20;
     ${helperSource}
     this.record = recordAdminReadBreadcrumb;`,
    context,
  );
  return { context, records, stored };
}

const test = createContext();
for (let index = 1; index <= 21; index += 1) {
  const requestId = `adminread-test-${index}`;
  test.context.record("FETCH_START", {
    requestId,
    adminSessionToken: "must-not-be-recorded",
    recipientName: "must-not-be-recorded",
  });
  test.context.record("FETCH_SUCCESS", {
    requestId,
    elapsedMs: index,
    orderCount: 397,
    responseBody: "must-not-be-recorded",
  });
}
const breadcrumbs = JSON.parse(test.stored.get("test-admin-read"));
const ids = [...new Set(breadcrumbs.map((entry) => entry.requestId))];
assert.equal(ids.length, 20);
assert.equal(ids.includes("adminread-test-1"), false);
assert.equal(ids.includes("adminread-test-21"), true);
for (const entry of breadcrumbs) {
  assert.deepEqual(Object.keys(entry).sort(), [
    "elapsedMs", "errorCode", "errorStage", "event", "orderCount",
    "requestId", "timestamp",
  ].sort());
  assert.equal(JSON.stringify(entry).includes("must-not-be-recorded"), false);
}
assert.doesNotThrow(() =>
  createContext(true).context.record("FETCH_START", { requestId: "storage-failure" }),
);

const readSource = sourceBetween(
  html,
  "      async function performAdminOrdersFetchFromGas",
  "      async function decodeAdminSnapshotGzipBase64Json",
);
assert.match(readSource, /options\.requestId\s*\|\|\s*createAdminDiagnosticRequestId\("adminReadOrders"\)/);
assert.match(readSource, /action:\s*"adminReadOrders"[\s\S]*?requestId:\s*observabilityRequestId/);
assert.match(readSource, /recordAdminReadBreadcrumb\("FETCH_START"/);
assert.match(readSource, /recordAdminReadBreadcrumb\("FETCH_SUCCESS"/);
assert.match(readSource, /adminFrontendStage\s*=\s*"FRONTEND_PARSE"/);
assert.match(readSource, /ADMIN_SESSION_REQUIRED/);
assert.match(readSource, /payload\.ok\s*!==\s*true/);
assert.match(readSource, /Array\.isArray\(payload\.orders\)/);
assert.doesNotMatch(readSource, /ADMIN_ORDER_SNAPSHOT_ENABLED|snapshotRead|snapshotVersion/);

const snapshotSource = sourceBetween(
  html,
  "      async function decodeAdminSnapshotGzipBase64Json",
  "      async function loadAdminOrdersForCurrentView",
);
assert.match(snapshotSource, /action:\s*"adminReadOrderSnapshot"/);
assert.match(snapshotSource, /knownVersion:/);
assert.match(snapshotSource, /knownChunks:/);
assert.match(snapshotSource, /payload\?\.action\s*!==\s*"adminReadOrderSnapshot"/);
assert.match(snapshotSource, /payload\.unchanged\s*===\s*true/);
assert.match(snapshotSource, /ADMIN_ORDER_SNAPSHOT_COUNT_MISMATCH/);
assert.match(snapshotSource, /decodeAdminSnapshotGzipBase64Json/);

const providerSource = sourceBetween(
  html,
  "      async function fetchAdminOrdersFromGas",
  "      async function loadAdminOrdersForCurrentView",
);
assert.match(providerSource, /if \(!ADMIN_ORDER_SNAPSHOT_CLIENT_ENABLED\)/);
assert.match(providerSource, /return performAdminOrdersFetchFromGas/);
assert.match(providerSource, /return performAdminOrderSnapshotFetch/);
assert.doesNotMatch(providerSource, /performAdminOrderSnapshotFetch[\s\S]*performAdminOrdersFetchFromGas/);
assert.doesNotMatch(snapshotSource, /MAX_RETRIES|RETRY_DELAY|waitForAdminRetry/);

const configSource = readFileSync(
  new URL("./customer-config.js", import.meta.url),
  "utf8",
);
assert.match(configSource, /"adminOrderSnapshot": true/);

console.log("admin read observability and snapshot provider tests: PASS");
