import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");

function extractFunction(source, functionName) {
  const start = source.indexOf(`function ${functionName}(`);
  assert.notEqual(start, -1, `missing function ${functionName}`);
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`unterminated function ${functionName}`);
}

const storage = new Map();
const context = {
  sessionStorage: {
    getItem(key) {
      return storage.has(key) ? storage.get(key) : null;
    },
    setItem(key, value) {
      storage.set(key, String(value));
    },
    removeItem(key) {
      storage.delete(key);
    },
  },
};
vm.createContext(context);
vm.runInContext(
  `
    const ADMIN_GROUP_CREATE_PENDING_STORAGE_KEY = "test:pending-group-create";
    let adminGroupCreateRequestContext = null;
    let nonce = 0;
    function createAdminRequestKey(action, parts = []) {
      return [action, ...parts].join("|").slice(0, 160);
    }
    function createAdminDiagnosticRequestId(action) {
      nonce += 1;
      return action + "-nonce-" + nonce;
    }
    ${extractFunction(html, "getAdminGroupCreatePayloadFingerprint")}
    ${extractFunction(html, "loadPendingAdminGroupCreateRequest")}
    ${extractFunction(html, "ensureAdminGroupCreateRequestContext")}
    ${extractFunction(html, "storePendingAdminGroupCreateRequest")}
    ${extractFunction(html, "clearPendingAdminGroupCreateRequest")}
    ${extractFunction(html, "shouldPreservePendingAdminGroupCreateRequest")}
    this.groupCreate = {
      ensure: ensureAdminGroupCreateRequestContext,
      store: storePendingAdminGroupCreateRequest,
      clear: clearPendingAdminGroupCreateRequest,
      preserve: shouldPreservePendingAdminGroupCreateRequest,
      resetContext() { adminGroupCreateRequestContext = null; },
    };
  `,
  context,
);

const childPayload = {
  action: "adminCreateGroupOrderChild",
  adminSessionToken: "secret-session-token",
  groupOrderId: "G260826-TEST",
  recipientName: "重送測試收件人",
  recipientPhone: "0912345678",
  recipientAddress: "台北市測試路 1 號",
  items: [{ code: "24A", qty: 1 }],
};

const firstContext = context.groupCreate.ensure(childPayload);
context.groupCreate.store({
  ...childPayload,
  requestKey: firstContext.requestKey,
});
const stored = JSON.parse(storage.get("test:pending-group-create"));
assert.equal(stored.requestKey, firstContext.requestKey);
assert.equal(Object.hasOwn(stored.payload, "adminSessionToken"), false);

context.groupCreate.resetContext();
assert.equal(
  context.groupCreate.ensure(childPayload).requestKey,
  firstContext.requestKey,
  "the same logical retry must reuse its original requestKey",
);
assert.throws(
  () =>
    context.groupCreate.ensure({
      ...childPayload,
      recipientPhone: "0987654321",
    }),
  /GROUP_CREATE_PENDING_CONFLICT/,
);

assert.equal(context.groupCreate.preserve(new Error("network failed")), true);
const indeterminate = new Error("GROUP_CHILD_CREATE_INDETERMINATE");
indeterminate.serverConfirmed = true;
assert.equal(context.groupCreate.preserve(indeterminate), true);
const validationFailure = new Error("GROUP_RESERVED_QUANTITY_INSUFFICIENT");
validationFailure.serverConfirmed = true;
assert.equal(context.groupCreate.preserve(validationFailure), false);
const ambiguousCreateFailure = new Error("GROUP_ORDER_CREATE_FAILED");
ambiguousCreateFailure.serverConfirmed = true;
assert.equal(context.groupCreate.preserve(ambiguousCreateFailure), true);

const parentSubmit = html.slice(
  html.indexOf("async function submitGroupOrder(event)"),
  html.indexOf("function openGroupChildModal"),
);
const childSubmit = html.slice(
  html.indexOf("async function submitGroupChild(event)"),
  html.indexOf("async function batchMarkGroupOrderPaid"),
);
for (const source of [parentSubmit, childSubmit]) {
  assert.match(source, /ensureAdminGroupCreateRequestContext\(payload\)/);
  assert.match(source, /payload\.requestKey = requestContext\.requestKey/);
  assert.match(source, /storePendingAdminGroupCreateRequest\(payload\)/);
  assert.match(source, /clearPendingAdminGroupCreateRequest\(\)/);
  assert.doesNotMatch(source, /requestKey:\s*createAdminRequestKey/);
}

const postAction = html.slice(
  html.indexOf("async function postGroupOrderAction(payload)"),
  html.indexOf("function getGroupOrderById"),
);
assert.match(postAction, /error\.serverConfirmed = true/);

context.groupCreate.clear();
assert.equal(storage.has("test:pending-group-create"), false);

console.log("group-order create retry idempotency checks passed");
