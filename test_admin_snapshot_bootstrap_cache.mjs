import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { gzipSync } from 'node:zlib';

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
  'function storeAdminOrderSnapshotCache_(manifest)',
  'function readAdminOrderSnapshotCache_()',
);
assert.match(cacheWriter, /manifest\.bootstrapPayload/);
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
storage.set('snapshot', JSON.stringify({
  version: 'v1',
  manifest,
  chunks: [
    { bucketId: 0, checksum: 'a', data: encodeChunk(0, [{ orderNo: 'A', createdAt: '2026-09-16T02:00:00Z' }]) },
    { bucketId: 1, checksum: 'b', data: encodeChunk(1, [{ orderNo: 'B', createdAt: '2026-09-16T01:00:00Z' }]) },
  ],
}));
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
  [{ bucketId: 0, checksum: 'a' }, { bucketId: 1, checksum: 'b' }],
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
