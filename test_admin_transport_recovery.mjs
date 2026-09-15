import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
function block(start, end) {
  const a = html.indexOf(start), b = html.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `missing ${start}`);
  return html.slice(a, b);
}
const source = block('      async function fetchAdminRecoverableResponse(', '      function createAdminRequestKey(');
const endpoint = 'https://fixture.invalid/api';
const json = payload => new Response(JSON.stringify(payload), { headers: { 'content-type': 'application/json' } });
const success = action => ({ ok: true, action, allowed: true, adminSessionToken: 'fake-session' });
function fixture(sequence) {
  const requests = [], timers = new Map();
  let tick = 0, nextTimer = 0;
  const ctx = { Response, AbortController, Date: { now: () => tick }, GAS_ORDERS_API_URL: endpoint,
    window: { setTimeout(fn, ms) { const id = ++nextTimer; timers.set(id, { fn, ms }); if (ms <= 1000) queueMicrotask(() => { if (timers.delete(id)) { tick += ms; fn(); } }); return id; }, clearTimeout(id) { timers.delete(id); } },
    fetch: async (url, options) => { requests.push({ url, body: options.body, signal: options.signal }); const step = sequence.shift(); if (typeof step === 'function') return step(ctx, timers); if (step instanceof Error) throw step; assert.ok(step, 'unexpected extra request'); return step; },
  };
  vm.createContext(ctx); vm.runInContext(source, ctx);
  return { ctx, requests, timers, call(action = 'adminValidateSession', url = endpoint) { return ctx.fetchAdminRecoverableResponse(url, { method: 'POST', body: JSON.stringify({ action, adminSessionToken: 'fake-session', code: 'fake-code', nonce: 'fake-nonce', codeVerifier: 'fake-pkce' }) }, 60000); } };
}
for (const bad of [new Response('<html>missing</html>', { status: 404 }), new Response('<html>error</html>'), json({ ok: false, error: '不支援的 action' }), new TypeError('network'), new Response('unavailable', { status: 503 })]) {
  const f = fixture([bad, json(success('adminValidateSession'))]);
  assert.equal((await (await f.call()).json()).allowed, true);
  assert.equal(f.requests.length, 2);
  assert.equal(f.requests[0].body, f.requests[1].body);
  assert.equal(f.timers.size, 0);
}
for (const action of ['adminAuth', 'adminValidateSession', 'adminReadOrders', 'adminReadOrderSnapshot', 'adminReadProductCatalog']) {
  const f = fixture([new Response('missing', { status: 404 }), json(success(action))]);
  await f.call(action);
  assert.equal(f.requests[0].body, f.requests[1].body, 'all recovery must retain the original payload, including auth nonce/PKCE');
}
for (const action of ['adminCreateOrder', 'adminBatchMarkOrdersShipped', 'adminMarkOrderShipped', 'adminUpdatePaymentStatus', 'adminSyncOrderSnapshot']) {
  const f = fixture([]);
  await assert.rejects(f.call(action), /ADMIN_RECOVERY_ACTION_NOT_ALLOWED/);
  assert.equal(f.requests.length, 0);
}
{
  const f = fixture([]);
  await assert.rejects(f.call('adminValidateSession', 'https://other.invalid/'), /ADMIN_RECOVERY_ACTION_NOT_ALLOWED/);
}
for (const payload of [{ ok: false, action: 'adminValidateSession', error: 'ADMIN_SESSION_REQUIRED' }, { ok: true, action: 'adminAuth', allowed: false }, { ok: false, action: 'adminAuth', error: 'LINE_TOKEN_EXCHANGE_FAILED' }]) {
  const f = fixture([json(payload)]);
  assert.equal((await (await f.call(payload.action)).json()).ok, payload.ok);
  assert.equal(f.requests.length, 1, 'do not retry genuine business/auth rejection');
}
for (const status of [401, 403]) {
  const f = fixture([new Response('denied', { status })]);
  assert.equal((await f.call()).status, status);
  assert.equal(f.requests.length, 1);
}
{
  const f = fixture([new Response('missing', { status: 404 }),
    json({ ok: false, action: 'adminAuth', error: 'LINE_TOKEN_EXCHANGE_FAILED' }),
    json(success('adminAuth'))]);
  assert.equal((await (await f.call('adminAuth')).json()).adminSessionToken, 'fake-session');
  assert.equal(new Set(f.requests.map(r => r.body)).size, 1);
}
{
  const f = fixture([json({ ok: true, action: 'adminAuth', allowed: true }), json(success('adminAuth'))]);
  assert.equal((await (await f.call('adminAuth')).json()).adminSessionToken, 'fake-session');
  assert.equal(f.requests.length, 2, 'malformed auth success must not discard callback context');
}
{
  const f = fixture(Array.from({ length: 3 }, () => new Response('missing', { status: 404 })));
  await assert.rejects(f.call(), /HTTP_404/);
  assert.equal(f.requests.length, 3);
  assert.equal(f.timers.size, 0);
}
{
  // A stalled body must time out too, not only the initial response headers.
  const stall = (ctx, timers) => { queueMicrotask(() => { const timeout = [...timers.values()].find(t => t.ms > 1000); timeout.fn(); }); return { ok: true, status: 200, text: () => new Promise(() => {}) }; };
  const f = fixture([stall, json(success('adminValidateSession'))]);
  assert.equal((await (await f.call()).json()).allowed, true);
  assert.equal(f.requests[0].signal.aborted, true);
}
{
  const f = fixture([() => new Promise(() => {})]);
  const request = f.call();
  // Simulate reaching the overall budget while the first attempt is stalled.
  f.ctx.Date.now = () => 90000;
  [...f.timers.values()][0].fn();
  await assert.rejects(request, /GAS_TIMEOUT/);
  assert.equal(f.requests.length, 1);
}
console.log('admin transport recovery: PASS');

// Exercise real snapshot/catalog consumers as well as the transport helper.
for (const action of ['adminReadOrderSnapshot', 'adminReadProductCatalog']) {
  const payload = action === 'adminReadOrderSnapshot'
    ? { ok: true, action, unchanged: true, orderCount: 1 }
    : { ok: true, action, products: [{ code: 'fixture-product' }] };
  const f = fixture([new Response('missing', { status: 404 }), json(payload)]);
  let status = '';
  Object.assign(f.ctx, {
    sessionStorage: { getItem: () => 'fixture-session', setItem() {} },
    document: { getElementById: () => null, querySelector: () => null },
    markAdminSessionVerified() {}, refreshNewOrderProductOptions() {},
    ADMIN_LINE_SESSION_TOKEN_KEY: 'session', ADMIN_DISPLAY_NAME_KEY: 'name',
    ADMIN_READ_ORDERS_TIMEOUT_MS: 60000, ADMIN_READ_PRODUCT_CATALOG_TIMEOUT_MS: 60000,
    adminOrderSnapshotVersion: 'fixture-v1', adminSiteSettings: {},
    latestAdminOrders: [{ orderNo: 'fixture-order' }], adminProductCatalogLoadPromise: null,
    createAdminDiagnosticRequestId: () => 'fixture-request', recordAdminReadBreadcrumb() {},
    getAdminOrderSnapshotKnownChunks: () => [], attachAdminOrderSnapshotReadMeta: orders => orders,
    setAdminStatusPanelVisible() {}, updateAdminRefreshMeta() {},
    setAdminProductCatalogState: (ready) => { status = ready; },
    renderProductManagement() {}, renderShippingManifest() {}, resetModalProductRows() {},
    updateNewOrderAmountPreview() {}, console,
  });
  if (action === 'adminReadOrderSnapshot') {
    vm.runInContext(block('      let adminOrderSnapshotReadPromise', '      async function fetchAdminOrdersFromGas('), f.ctx);
    const orders = await f.ctx.performAdminOrderSnapshotFetch();
    assert.equal(orders[0].orderNo, 'fixture-order');
  } else {
    vm.runInContext(block('      async function fetchAdminProductCatalogFromGas(', '      function renderAdminOrders('), f.ctx);
    const products = await f.ctx.fetchAdminProductCatalogFromGas();
    assert.equal(products[0].code, 'fixture-product');
    assert.equal(status, true);
  }
  assert.equal(f.requests.length, 2);
}
assert.equal([...html.matchAll(/await fetchAdminRecoverableResponse\(/g)].length, 6, 'only the six reviewed read/auth callers use recovery');
console.log('snapshot and catalog recovery integration: PASS');
