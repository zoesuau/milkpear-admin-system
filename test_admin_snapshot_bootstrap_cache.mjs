import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { gzipSync } from 'node:zlib';
import { createHash, webcrypto } from 'node:crypto';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const gas = fs.readFileSync(new URL('../0707.gs', import.meta.url), 'utf8');

function between(source, start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `missing block ${start}`);
  return source.slice(a, b);
}

const handler = between(
  gas,
  'function handleAdminReadOrderSnapshotRequest_(postData)',
  'function sendAdminOrderSnapshotUsageAlertIfNeeded_()',
);
const bootstrapBranch = between(
  handler,
  '    if (postData.bootstrapOnly === true && manifest.bootstrapPayload)',
  '    var knownVersion = String(postData.knownVersion || "").trim();',
);
assert.match(bootstrapBranch, /data:\s*manifest\.bootstrapPayload/);
assert.match(bootstrapBranch, /chunksMs:\s*0/);
assert.doesNotMatch(bootstrapBranch, /readAdminOrderSnapshotChunksFromFirestore_/);
assert.ok(
  handler.indexOf('postData.bootstrapOnly === true') <
    handler.indexOf('readAdminOrderSnapshotChunksFromFirestore_'),
  'bootstrap must return before any full chunk read',
);

const cacheWriter = between(
  gas,
  'function storeAdminOrderSnapshotCache_(manifest, diagnostic)',
  'function readAdminOrderSnapshotCache_(diagnostic)',
);
assert.match(cacheWriter, /JSON\.stringify\(manifest\)/);
assert.doesNotMatch(cacheWriter, /manifest\.chunks\.length !== 1/);
assert.match(gas, /refreshAdminOrderSnapshotBootstrap_\(manifest, orders\)/);
assert.match(gas, /mergeAdminOrderSnapshotBootstrap_\([\s\S]*?queuedOrders/);

const cacheSource = between(
  html,
  '      async function decodeAdminSnapshotGzipBase64Json(base64Data)',
  '      async function mergeAdminOrderSnapshotPayload(payload)',
);
const storage = new Map();
const encodeChunk = (bucketId, orders) =>
  gzipSync(JSON.stringify({ bucketId, orders })).toString('base64');
const manifest = [
  { bucketId: 0, checksum: 'a', orderCount: 1 },
  { bucketId: 1, checksum: 'b', orderCount: 1 },
];
const cachedFixture = {
  version: 'v1',
  manifest,
  chunks: [
    { bucketId: 0, checksum: 'a', data: encodeChunk(0, [{ orderNo: 'A', createdAt: '2026-09-16T02:00:00Z' }]) },
    { bucketId: 1, checksum: 'b', data: encodeChunk(1, [{ orderNo: 'B', createdAt: '2026-09-16T01:00:00Z' }]) },
  ],
};
for (const chunk of cachedFixture.chunks) {
  chunk.checksum = createHash('sha256').update(Buffer.from(chunk.data, 'base64')).digest('hex');
  manifest.find(e => e.bucketId === chunk.bucketId).checksum = chunk.checksum;
}
storage.set('snapshot', JSON.stringify(cachedFixture));
const context = {
  ADMIN_ORDER_SNAPSHOT_SESSION_CACHE_KEY: 'snapshot',
  ADMIN_ORDERS_PER_PAGE: 20,
  adminOrderSnapshotVersion: '',
  adminOrderSnapshotManifest: [],
  adminOrderSnapshotChunks: new Map(),
  adminOrderSnapshotEncodedChunks: new Map(),
  sessionStorage: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key),
  },
  crypto: webcrypto,
  DecompressionStream,
  Response,
  Blob,
  Uint8Array,
  atob,
  Date,
};
vm.createContext(context);
vm.runInContext(cacheSource, context);
assert.equal(await context.restoreAdminOrderSnapshotSessionCache({
  version: 'v1',
  orderCount: 2,
  manifest,
}), true);
assert.equal(context.adminOrderSnapshotVersion, 'v1');
assert.deepEqual(
  context.getAdminOrderSnapshotKnownChunks().map(value => ({ ...value })),
  manifest.map(({bucketId, checksum}) => ({bucketId, checksum})),
);
assert.equal(context.flattenAdminOrderSnapshotChunks(manifest).length, 2);
assert.equal(context.persistAdminOrderSnapshotSessionCache(), true);

const startup = between(
  html,
  '        const isAdminAllowed = await initAdminAuth(',
  '      // ==========================================',
);
assert.ok(
  startup.indexOf('fetchAdminOrderBootstrapFromGas()') <
    startup.indexOf('fetchInitialAdminOrdersWithRecovery({ silent: true })'),
  'first page must render from bootstrap before the full background read',
);

console.log('snapshot bootstrap cache: PASS no full chunk read, multi-chunk cache, session reuse, bootstrap-first startup');

const bootstrapSource = between(html, '      async function fetchAdminOrderBootstrapFromGas()', '      let adminOrderSnapshotReadPromise');
Object.assign(context, {
 GAS_ORDERS_API_URL: 'https://example.invalid', ADMIN_LINE_SESSION_TOKEN_KEY: 'token', ADMIN_READ_ORDERS_TIMEOUT_MS: 60000,
 ADMIN_ORDER_SNAPSHOT_ATTEMPT_TIMEOUT_MS: 20000,
 createAdminDiagnosticRequestId: () => 'fixture', markAdminSessionVerified() {}, recordAdminReadBreadcrumb() {}, showAdminAuthOverlay() {},
});
storage.set('token', 'fixture-only');
let payload, bootstrapRecoveryOptions;
context.fetchAdminRecoverableResponse = async (...args) => {
 bootstrapRecoveryOptions = args[3];
 return {ok:true, json:async()=>payload};
};
vm.runInContext(bootstrapSource, context);
function reset() {
 storage.set('snapshot', JSON.stringify(cachedFixture)); storage.set('token','fixture-only');
 payload = {ok:true, action:'adminReadOrderSnapshot', bootstrap:true, encoding:'gzip-base64', version:'v1', orderCount:2, manifest:structuredClone(manifest), data:gzipSync(JSON.stringify({version:'v1',orders:[{orderNo:'A'}]})).toString('base64')};
}
reset();
let restored = await context.fetchAdminOrderBootstrapFromGas();
assert.deepEqual(
 JSON.parse(JSON.stringify(bootstrapRecoveryOptions)),
 {totalBudgetMs:20000,maxAttempts:1},
 'bootstrap must allow one complete 20-second response without duplicate reads',
);
assert.equal(restored.fullSnapshot, true, 'validated complete cache must skip second read');
assert.equal(restored.orders.length, 2);
for (const [name, mutate] of [
 ['missing', c=>c.chunks.pop()],
 ['duplicate', c=>c.chunks=[c.chunks[0],c.chunks[0]]],
 ['wrong version', c=>c.version='old'],
 ['bad gzip', c=>c.chunks[0].data='invalid'],
 ['changed content same metadata', c=>c.chunks[0].data=encodeChunk(0,[{orderNo:'OTHER'}])],
 ['wrong count', c=>c.chunks[0].data=encodeChunk(0,[])],
]) {
 reset(); const corrupt=structuredClone(cachedFixture); mutate(corrupt); storage.set('snapshot',JSON.stringify(corrupt));
 const r=await context.fetchAdminOrderBootstrapFromGas();
 assert.equal(r.fullSnapshot,false,name); assert.equal(r.orders.length,1,name);
 assert.equal(context.adminOrderSnapshotVersion,'',name+' clears known version');
 assert.equal(context.adminOrderSnapshotChunks.size,0,name+' clears partial chunks');
}
reset(); payload.stale=true;
assert.equal((await context.fetchAdminOrderBootstrapFromGas()).fullSnapshot,false,'stale cannot bypass read');
reset(); payload.orderCount=3;
assert.equal((await context.fetchAdminOrderBootstrapFromGas()).fullSnapshot,false,'total mismatch');
reset(); payload.manifest[1].bucketId=0;
assert.equal((await context.fetchAdminOrderBootstrapFromGas()).fullSnapshot,false,'duplicate expected manifest');
reset(); payload={ok:false,action:'adminReadOrderSnapshot',error:'ADMIN_SESSION_REQUIRED'};
assert.equal(await context.fetchAdminOrderBootstrapFromGas(),null);
assert.equal(storage.has('token'),false);
reset(); payload.orderCount=0; payload.manifest=[]; payload.data=gzipSync(JSON.stringify({version:'v1',orders:[]})).toString('base64');
storage.set('snapshot',JSON.stringify({version:'v1',manifest:[],chunks:[]}));
restored=await context.fetchAdminOrderBootstrapFromGas();
assert.equal(restored.fullSnapshot,true); assert.equal(restored.orders.length,0);
console.log('PASS verified cache shortcut, corruption, duplicates, stale, session rejection and empty snapshot');

// Execute the real startup branch: assert request count and readiness, not just flags.
const startupBody = startup.slice(0, startup.lastIndexOf('      });'));
async function runStartup(useCache) {
 reset(); if (!useCache) storage.delete('snapshot');
 let bootstrapCalls=0, fullCalls=0, rendered=[];
 const element={className:'',innerText:'',disabled:true,setAttribute(){}};
 const c={
  initAdminAuth:async()=>true,initializeAdminSessionRecovery(){},
  window:{setTimeout:()=>1,clearTimeout(){}},ADMIN_INITIAL_LOAD_SLOW_MS:10000,
  showAdminAuthOverlay(){}, hideAdminAuthOverlay(){},adminAuthBlocksDataLoad:false,
  fetchAdminOrderBootstrapFromGas:async()=>{bootstrapCalls++;return context.fetchAdminOrderBootstrapFromGas();},
  fetchInitialAdminOrdersWithRecovery:async()=>{fullCalls++;return [{orderNo:'A'},{orderNo:'B'}];},
  renderAdminOrders:orders=>{rendered.push(orders.length);return true;},
  updateStatsCounters(){},handleBatchCheckChange(){},updateNotifyButton(){},applyReadOnlyModeToRealOrders(){},
  markAdminSessionVerified(){},recordAdminReadBreadcrumb(){},restoreAdminTab(){},setAdminStatusPanelVisible(){},
  document:{getElementById:()=>element,querySelector:()=>element,querySelectorAll:()=>[]},
  adminProductsReady:false,adminProductCatalogLoadPromise:null,fetchAdminProductCatalogFromGas:async()=>[],scheduleAdminLiveOrderSync(){},
  adminInitialOrdersReady:false,reconcilePendingAdminShipment:async()=>{},recoverPendingAdminCreateOrderOnLoad:async()=>{},
  loadPendingAdminCreateRequest:()=>null,readAdminCreateDraft:()=>null,Date,
 };
 vm.createContext(c); await vm.runInContext('(async()=>{'+startupBody+'})()',c);
 assert.equal(bootstrapCalls,1); assert.equal(fullCalls,useCache?0:1);
 assert.equal(c.adminInitialOrdersReady,true); assert.equal(element.disabled,false);
 assert.equal(rendered.at(-1),2);
}
await runStartup(true); await runStartup(false);
reset(); payload.manifest[0].orderCount=2;
assert.equal((await context.fetchAdminOrderBootstrapFromGas()).fullSnapshot,false,'per-chunk count mismatch');
reset(); storage.delete('token'); let unauthFetches=0;
context.fetchAdminRecoverableResponse=async()=>{unauthFetches++;throw Error('must not fetch');};
assert.equal(await context.fetchAdminOrderBootstrapFromGas(),null);assert.equal(unauthFetches,0);
console.log('PASS real startup uses one request for verified cache, two for cold load; readiness and auth guards');
