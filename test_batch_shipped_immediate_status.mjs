import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
function between(start, end) {
  const from = html.indexOf(start);
  const to = html.indexOf(end, from);
  assert.ok(from >= 0 && to > from);
  return html.slice(from, to);
}
const batch = between("      const ADMIN_PENDING_SHIPMENT_KEY", '      document\n        .getElementById("batchShippedBtn")');
const overlays = between("      function getAdminSnapshotOverlayComparableFields", "      const ADMIN_PAYMENT_STATE_OPTIONS");
const status = between("      function getAdminOrderStatusMeta", "      function formatAdminMoney");
const render = between("      function renderAdminOrders", "      function replaceAdminOrderLocally");
const old = ["A", "B", "C"].map(orderNo => ({ orderNo, orderStatus: "已安排出貨" }));
const shipped = old.slice(0, 2).map(order => ({ ...order, orderStatus: "已寄出", notificationStatus: "sent", lastNotificationType: "shipment_notice", actualShippingDate: "2026-09-15" }));

async function run({ orders = shipped, snapshot = old, ok = true, lostResponse = false, expired = false, readErrors = [], renderError = false } = {}) {
  let writes = 0;
  let reads = 0;
  const stored = new Map([["test", "test"]]);
  const nodes = new Map();
  const node = id => {if(!nodes.has(id)) {const classes=new Set(['hidden']);nodes.set(id,{innerHTML:'',textContent:'',classList:{add:k=>classes.add(k),remove:k=>classes.delete(k),contains:k=>classes.has(k)}})}return nodes.get(id)};
  const c = {
    latestAdminOrders: structuredClone(old), adminOrderReadMeta: {},
    adminCurrentPage: 1, ADMIN_ORDERS_PER_PAGE: 20,
    ADMIN_STORAGE_NAMESPACE: "fixture", AbortController,
    localStorage: { getItem: k => stored.get(k)||null, setItem: (k,v) => stored.set(k,v) },
    ensureAdminSessionReady: async () => true, markAdminSessionVerified() {}, setAdminAuthRetryButtonMode() {}, showAdminAuthOverlay() {},
    document: { visibilityState: "visible", getElementById: node },
    pendingAdminSnapshotOrderOverlays: new Map(),
    adminBatchProcessing: false, selectedOrderNos: new Set(["A", "B"]),
    unconfirmedNotificationOrderNos: new Set(),
    getSelectedAdminOrders: () => old.slice(0, 2), isBatchShippableOrder: () => true,
    window: { confirm: () => true, setTimeout: (fn,ms) => setTimeout(fn, ms === 60000 ? ms : 0), clearTimeout }, sessionStorage: { getItem: k => stored.get(k)||null, setItem: (k,v) => stored.set(k,v), removeItem: k => stored.delete(k) },
    ADMIN_LINE_SESSION_TOKEN_KEY: "test", GAS_ORDERS_API_URL: "mock",
    createAdminDiagnosticRequestId: action => action + "|fixture123",
    fetch: async (url, options) => { assert.equal(JSON.parse(options.body).requestId, "adminBatchMarkOrdersShipped|fixture123"); writes++; if(lostResponse) throw Error("network"); return { ok, json: async () => (expired ? {ok:false,action:"adminBatchMarkOrdersShipped",errorCode:"ADMIN_SESSION_REQUIRED"} : { ok, action: "adminBatchMarkOrdersShipped", updated: { count: 2, orderNos: ["A", "B"] }, orders }) }; },
    fetchAdminRecoverableResponse: async () => { reads++; if(readErrors.length) throw Error(readErrors.shift()); return {ok:true,json:async()=>({ok:true,action:"adminReadShipmentResults",orders:snapshot.filter(x=>["A","B"].includes(x.orderNo)),unresolved:[]})}; },
    fetchAdminOrdersFromGas: async () => { reads++; return snapshot; },
    setBatchFeedback: (message, error = false) => { c.feedback = { message, error }; },
    syncBatchSelectionUi() {}, updateStatsCounters() {},
    applyCurrentFilter() { if(renderError) throw Error('private-render-stack-token'); c.cardClasses = c.latestAdminOrders.map(order => c.getAdminOrderStatusMeta(order.orderStatus).cardClass); },
    updateNotifyButton() {}, applyReadOnlyModeToRealOrders() {},
  };
  vm.createContext(c);
  vm.runInContext(overlays + status + render + batch, c);
  await c.batchUpdateStatusToShipped();
  assert.equal(writes, 1, "never repeat the mutation");
  return { c, get reads() { return reads; }, get writes() { return writes; }, stored, nodes };
}

const { c, reads } = await run();
assert.equal(c.latestAdminOrders[0].orderStatus, "已寄出", "success must update immediately");
assert.equal(reads, 0, "confirmed orders must not wait for snapshot network reads");
assert.equal(c.feedback.error, false);
assert.equal(c.selectedOrderNos.size, 0);
assert.equal(c.getAdminOrderStatusMeta(c.latestAdminOrders[0].orderStatus).cardClass, "status-shipped");
assert.equal(c.cardClasses[0], "status-shipped");
assert.equal(c.latestAdminOrders[2].orderStatus, "已安排出貨");
c.renderAdminOrders(old);
assert.equal(c.latestAdminOrders[0].orderStatus, "已寄出", "stale snapshot must not revert status");
assert.equal(c.latestAdminOrders[1].notificationStatus, "sent");
c.renderAdminOrders([...shipped, old[2]]);
assert.equal(c.pendingAdminSnapshotOrderOverlays.size, 0, "current snapshot releases overlays");

for (const orders of [null, [shipped[0]], [shipped[0], shipped[0]], old.slice(0, 2)]) {
  const { c } = await run({ orders });
  assert.equal(c.feedback.error, true, "unverified stale data must not report success");
  assert.equal(c.latestAdminOrders[0].orderStatus, "已安排出貨");
}
const fallback = await run({ orders: null, snapshot: [...shipped, old[2]] });
assert.equal(fallback.c.latestAdminOrders[0].orderStatus, "已寄出");
assert.equal(fallback.c.feedback.error, false);
const rejected = await run({ ok: false });
assert.equal(rejected.c.latestAdminOrders[0].orderStatus, "已安排出貨");
assert.equal(rejected.c.pendingAdminSnapshotOrderOverlays.size, 0);
const failedRead = await run({ orders: null, snapshot: null });
assert.equal(failedRead.c.feedback.error, true);
assert.equal(failedRead.c.latestAdminOrders[0].orderStatus, "已安排出貨");
const recovered = await run({lostResponse:true,snapshot:[...shipped,old[2]]});
assert.equal(recovered.c.latestAdminOrders[0].orderStatus,"已寄出");
assert.equal(recovered.reads,1);
assert.equal(recovered.c.loadPendingAdminShipment(),null);
const uncertain=await run({lostResponse:true});
assert.ok(uncertain.c.loadPendingAdminShipment());
assert.equal(uncertain.c.latestAdminOrders[0].orderStatus,"已安排出貨");
await uncertain.c.batchUpdateStatusToShipped();
assert.equal(uncertain.writes,1);
const expired=await run({expired:true});
assert.match(expired.c.feedback.message,/登入已過期/);
assert.equal(expired.reads,0);
assert.equal(expired.c.loadPendingAdminShipment(),null);
console.log("batch shipped regression passed: response loss, no resend, expiry, stale overlays and readback");
const transient = await run({lostResponse:true,snapshot:[...shipped,old[2]],readErrors:['GAS_TIMEOUT']});
assert.equal(transient.c.loadPendingAdminShipment(),null,'a transient read failure must recover without another operator click');
assert.equal(transient.reads,2);
assert.equal(transient.writes,1);
const diagnosticKey='fixture:shipment-diagnostics-v1';
const history=JSON.parse(transient.stored.get(diagnosticKey));
assert.ok(history.some(x=>x.stage==='WRITE_REQUEST'&&x.code==='NETWORK_ERROR'));
assert.ok(history.some(x=>x.stage==='READBACK_REQUEST'&&x.code==='GAS_TIMEOUT'&&x.attempt===1));
assert.equal(history.at(-1).code,'OK');
assert.equal(history.at(-1).attempt,2);
assert.equal(new Set(history.map(x=>x.operationId)).size,1);
assert.match(history[0].operationId,/^ship_/);
assert.equal(transient.nodes.get('adminShipmentDiagnostics').classList.contains('hidden'),true,'successful recovery hides extra diagnostics controls');
for(const code of ['HTTP_401','HTTP_403','SHIPMENT_READBACK_INVALID','GAS_AUTH_RESPONSE_INVALID']) {
 const stopped=await run({lostResponse:true,readErrors:[code],snapshot:shipped});
 assert.equal(stopped.reads,1,`${code} is not retried`);
 assert.ok(stopped.c.loadPendingAdminShipment());
 assert.equal(JSON.parse(stopped.stored.get(diagnosticKey)).at(-1).code,code);
 assert.equal(stopped.nodes.get('adminShipmentDiagnostics').classList.contains('hidden'),false);
}
const exhausted=await run({lostResponse:true,readErrors:['NETWORK_ERROR','HTTP_503','GAS_TIMEOUT'],snapshot:shipped});
assert.equal(exhausted.reads,3,'bounded recovery has at most three read requests');
assert.equal(exhausted.writes,1);
assert.ok(exhausted.c.loadPendingAdminShipment());
const savedHistory=exhausted.stored.get(diagnosticKey);
vm.runInContext('adminShipmentDiagnosticsMemory=[]',exhausted.c);
assert.equal(JSON.stringify(exhausted.c.readAdminShipmentDiagnostics()),savedHistory,'history survives page reinitialization');
const rendering=await run({lostResponse:true,snapshot:shipped,renderError:true});
assert.equal(rendering.reads,1,'render faults do not start more network retries');
assert.equal(JSON.parse(rendering.stored.get(diagnosticKey)).at(-1).code,'SHIPMENT_RENDER_FAILED');
assert.equal(rendering.c.loadPendingAdminShipment().orderNos.length,2);
assert.equal(rendering.stored.get(diagnosticKey).includes('private-render-stack-token'),false);
const before=exhausted.reads;
exhausted.c.window.setTimeout=(fn)=>{exhausted.c.document.visibilityState='hidden';queueMicrotask(fn);return 1};
exhausted.c.fetchAdminRecoverableResponse=async()=>{throw Error('NETWORK_ERROR')};
await exhausted.c.reconcilePendingAdminShipment();
assert.equal(exhausted.reads,before,'fixture replacement does not call the old reader');
assert.equal(JSON.parse(exhausted.stored.get(diagnosticKey)).at(-1).code,'SHIPMENT_PAUSED','visibility is checked again after backoff');
let count=0,releaseRead;
exhausted.c.document.visibilityState='visible';
exhausted.c.fetchAdminRecoverableResponse=()=>{count++;return new Promise(resolve=>releaseRead=resolve)};
const first=exhausted.c.reconcilePendingAdminShipment(),second=exhausted.c.reconcilePendingAdminShipment();
assert.equal(count,1,'repeated confirmation shares the same read');
releaseRead({ok:true,status:200,json:async()=>({ok:true,action:'adminReadShipmentResults',orders:shipped,unresolved:[]})});
await Promise.all([first,second]);
assert.equal(exhausted.writes,1);
for(let i=0;i<45;i++) exhausted.c.recordAdminShipmentDiagnostic({operationId:'secret-token'},'https://private','customer-private-message',{token:'SECRET',orderNo:'PRIVATE',httpStatus:503,responseFormat:'<html>secret</html>'});
const sanitized=exhausted.stored.get(diagnosticKey);
assert.equal(JSON.parse(sanitized).length,40);
for(const secret of ['secret-token','private','SECRET','PRIVATE','<html>'])assert.equal(sanitized.includes(secret),false);
exhausted.c.localStorage={getItem:()=>{throw Error('disabled')},setItem:()=>{throw Error('disabled')}};
assert.doesNotThrow(()=>exhausted.c.recordAdminShipmentDiagnostic(null,'RECONCILE','GAS_TIMEOUT'));
assert.equal(exhausted.c.readAdminShipmentDiagnostics().at(-1).code,'GAS_TIMEOUT','storage failure retains in-memory evidence');
console.log('shipment diagnostics/recovery PASS: transient retry, permissions stop, bounded attempts, persistent/redacted history, render errors, hidden-page pause, single flight, storage fallback');
const bounded=await run({lostResponse:true,readErrors:['GAS_TIMEOUT','GAS_TIMEOUT','GAS_TIMEOUT']});
let now=0,boundedReads=0;const RealDate=Date;
bounded.c.Date=class extends RealDate {static now(){return now}};
bounded.c.window.setTimeout=(fn,ms)=>{now+=ms;queueMicrotask(fn);return 1};
bounded.c.fetchAdminRecoverableResponse=async(url,options,timeout)=>{boundedReads++;now+=timeout;throw Error('GAS_TIMEOUT')};
await bounded.c.reconcilePendingAdminShipment();
assert.equal(boundedReads,3);assert.equal(now,45000,'all three reads and backoff share one 45-second budget');
assert.equal(bounded.writes,1);
const late=await run({lostResponse:true,readErrors:['GAS_TIMEOUT','GAS_TIMEOUT','GAS_TIMEOUT']});
let lateNow=0,lateReads=0;
late.c.Date=class extends RealDate {static now(){return lateNow}};
late.c.window.setTimeout=(fn)=>{lateNow=60000;queueMicrotask(fn);return 1};
late.c.fetchAdminRecoverableResponse=async()=>{lateReads++;throw Error('GAS_TIMEOUT')};
await late.c.reconcilePendingAdminShipment();assert.equal(lateReads,1,'late background timer cannot start a read after budget expiry');
assert.equal(JSON.parse(late.stored.get(diagnosticKey)).at(-1).code,'SHIPMENT_BUDGET_EXHAUSTED');
const parse=await run();
parse.c.fetch=async()=>({ok:true,status:200,json:async()=>{throw SyntaxError('private-response-body')}});
await assert.rejects(parse.c.sendAdminShipmentOnce({action:'fixture'}),/GAS_NON_JSON_RESPONSE/);
const parseLog=JSON.parse(parse.stored.get(diagnosticKey)).at(-1);
assert.equal(parseLog.stage,'WRITE_RESPONSE');assert.equal(parseLog.httpStatus,200);assert.equal(parseLog.responseFormat,'non-json');assert.equal(parse.stored.get(diagnosticKey).includes('private-response-body'),false);
console.log('shipment timing/parse PASS: total budget, delayed timer, response format and sanitized HTTP evidence');
