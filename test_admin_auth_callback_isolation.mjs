import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import vm from 'node:vm';

// Exercise the production callback and validation paths using synthetic state only.
const html = process.env.ADMIN_CALLBACK_TEST_BASE === 'HEAD'
  ? execFileSync('git', ['show','HEAD:index.html'], {cwd: new URL('.', import.meta.url), encoding:'utf8', maxBuffer:4*1024*1024})
  : readFileSync(new URL('./index.html', import.meta.url), 'utf8');
function section(first, last) {
  const start = html.indexOf(first);
  const end = html.indexOf(last, start + first.length);
  assert.ok(start >= 0 && end > start, first);
  return html.slice(start, end);
}
const source = section('      function clearAdminAuthSession', '      function base64UrlEncode') +
  section('      let adminSessionVerifiedAt', '      function adminBrowserIsOffline') +
  section('      function setAdminNetworkRecoveryPending', '      function markAdminSessionVerified') +
  section('      async function startAdminAuth', '      let adminLoginOrderBootstrap') +
  section('      let adminAuthCompletionPromise', '      function isAdminAuthUnacceptedBusy') +
  section('      async function completeAdminAuth', '      // ADMIN_SETTINGS_CONTROLS_START') +
  section('      async function handleAdminNetworkRestored()', '      async function recoverPendingAdminCreateOrderOnLoad');
const success = token => ({ ok: true, action: 'adminAuth', allowed: true, adminSessionToken: token });
function response(payload) {
  return { ok: true, status: 200, headers: {get: () => 'application/json'},
    json: async () => payload, text: async () => JSON.stringify(payload) };
}
function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { resolve, promise };
}
function fixture(search, entries = {}, validate = async () => response({ ok: true, action: 'adminValidateSession', allowed: true })) {
  const data = new Map(Object.entries(entries));
  const overlay = [], diagnostics = [], exchanges = [], checks = [], navigation = [], verified = [];
  const retry = { dataset: {} };
  const location = { origin: 'https://fixture.invalid', pathname: '/admin', hash: '', search, assign: url => navigation.push(url) };
  const c = {
    URLSearchParams, URL, window: {location, setTimeout: fn => queueMicrotask(fn)}, document: {title: '', getElementById: id => id === 'adminAuthRetryBtn' ? retry : null},
    history: { replaceState: (a,b,url) => { location.search = new URL(url).search; } },
    sessionStorage: {getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,v), removeItem: k => data.delete(k)},
    ADMIN_LINE_STATE_KEY: 'state', ADMIN_LINE_NONCE_KEY: 'nonce', ADMIN_LINE_CODE_VERIFIER_KEY: 'verifier', ADMIN_LINE_SESSION_TOKEN_KEY: 'token',
    ADMIN_DISPLAY_NAME_KEY: 'display', ADMIN_AUTH_TIMEOUT_MS: 20000, ADMIN_AUTH_REDIRECT_URI: location.origin, LINE_LOGIN_CHANNEL_ID: 'fixture',
    GAS_ORDERS_API_URL: 'fixture', adminAuthNavigationPending: false, adminSessionVerificationRevision: 0,
    adminSessionValidationFlight: null, adminAuthBlocksDataLoad: true, adminOrderMutationRevision: 0, adminLoginOrderBootstrap: 'old-bootstrap',
    createAdminDiagnosticRequestId: a => a + '_fixture', publishAdminAuthDiagnostic: e => diagnostics.push(e.errorCode),
    showAdminAuthOverlay: m => overlay.push(m), clearAdminNetworkRecoveryPending() {}, setAdminNetworkRecoveryPending() {},
    flushPendingAdminAuthDiagnostics() {}, handleAdminCreateNetworkRestored() {}, persistAdminCreateDraft() { data.set('draft','saved'); },
    isAdminAuthUnacceptedBusy: () => false, isAdminNetworkRecoveryError: () => false, getAdminAuthErrorMessage: x => x,
    adminBrowserIsOffline: () => false, markAdminSessionVerified: t => verified.push(t), isLineLoginConfigured: () => true,
    createRandomBase64Url: () => 'new-proof', createCodeChallenge: async () => 'challenge',
    fetchAdminAuthWithResultRecovery: async p => { exchanges.push(p); return response(success('new-session')); },
    fetchAdminRecoverableResponse: async (url, options) => { checks.push(JSON.parse(options.body)); return validate(); },
  };
  vm.runInNewContext(source, c);
  return {c, data, overlay, diagnostics, exchanges, checks, navigation, verified, retry, location};
}
const proof = {state:'state-B', nonce:'nonce-B', verifier:'pkce-B'};
test('mismatched state rejects the code, keeps the newer proof and independently verifies the existing session', async () => {
  const f = fixture('?code=A&state=state-A', {...proof, token:'existing'});
  assert.equal(await f.c.initAdminAuth({validateWithOrders:true}), true);
  assert.deepEqual(f.diagnostics, ['AUTH_CALLBACK_STATE_MISMATCH']);
  assert.equal(f.exchanges.length, 0);
  assert.deepEqual(f.verified, ['existing']);
  assert.equal(f.checks.length, 1);
  assert.equal(f.location.search, '');
  assert.deepEqual(Object.fromEntries(f.data), {...proof, token:'existing'});
});
test('missing verifier rejects the exchange and validates independently, even on fast startup', async () => {
  const f = fixture('?code=B&state=state-B', {state:'state-B',nonce:'nonce-B',token:'existing'});
  assert.equal(await f.c.initAdminAuth({validateWithOrders:true}), true);
  assert.deepEqual(f.diagnostics, ['AUTH_CALLBACK_CONTEXT_MISSING']);
  assert.deepEqual(f.verified, ['existing']);
  assert.equal(f.exchanges.length, 0);
});
test('expired session is rejected without automatic navigation, transport uncertainty stays locked with session retry', async () => {
  for (const expired of [true,false]) {
    const f = fixture('?code=A&state=state-A', {token:'existing'}, async () => {
      if (expired) return response({action:'adminValidateSession',ok:false,error:'ADMIN_SESSION_REQUIRED'});
      throw new Error('GAS_TIMEOUT');
    });
    assert.equal(await f.c.initAdminAuth(), false);
    assert.equal(f.checks.length, 1);
    assert.equal(f.data.has('token'), !expired);
    assert.equal(f.navigation.length, 0);
    assert.equal(f.verified.length, 0);
    if (!expired) assert.equal(f.retry.dataset.retrySession, 'true');
    assert.equal(f.c.adminAuthBlocksDataLoad, true);
  }
});
test('parameterless proof / stale provider error cannot erase a later attempt, never dispatches without an existing session', async () => {
  for (const search of ['?code=A', '?error=access_denied&state=state-A', '?code=A&state=state-A']) {
    const f = fixture(search, proof);
    assert.equal(await f.c.initAdminAuth(), false);
    assert.deepEqual(Object.fromEntries(f.data), proof);
    assert.equal(f.exchanges.length + f.checks.length + f.navigation.length, 0);
  }
});
test('late result cannot replace bootstrap, UI or token if its session was explicitly removed', async () => {
  const f = fixture('?code=B&state=state-B', {...proof, token:'existing'});
  const flight = deferred();
  f.c.fetchAdminAuthWithResultRecovery = () => flight.promise;
  const attempt = f.c.initAdminAuth();
  f.data.delete('token');
  f.c.adminLoginOrderBootstrap = 'next-bootstrap';
  const count = f.overlay.length;
  flight.resolve(response(success('late-session')));
  assert.equal(await attempt, false);
  assert.equal(f.data.has('token'), false);
  assert.equal(f.overlay.length, count);
  assert.equal(f.c.adminLoginOrderBootstrap, 'next-bootstrap');
});
test('in-flight duplicate joins one request; a distinct newer proof gets its own completion', async () => {
  const f = fixture('?code=B&state=state-B', proof);
  const first = deferred();
  const sent = [];
  f.c.fetchAdminAuthWithResultRecovery = p => { sent.push(p.nonce); return p.nonce === 'nonce-B' ? first.promise : response(success('C-session')); };
  const old = f.c.initAdminAuth(), duplicate = f.c.initAdminAuth();
  assert.deepEqual(sent, ['nonce-B']);
  for (const [key,value] of Object.entries({state:'state-C',nonce:'nonce-C',verifier:'pkce-C'})) f.data.set(key,value);
  f.data.delete('nonce:recovery');
  f.location.search = '?code=C&state=state-C';
  const current = f.c.initAdminAuth();
  assert.deepEqual(sent, ['nonce-B','nonce-C']);
  assert.equal(await current, true);
  const count = f.overlay.length;
  first.resolve(response(success('wrong-session')));
  assert.equal(await old, false);
  assert.equal(await duplicate, false);
  assert.equal(f.data.get('token'), 'C-session');
  assert.equal(f.overlay.length, count);
});
test('an explicit fresh LINE login invalidates the old session immediately; a pending validation cannot unlock during navigation', async () => {
  const flight = deferred();
  const f = fixture('?code=A&state=state-A', {...proof,token:'existing'}, () => flight.promise);
  const recover = f.c.initAdminAuth();
  assert.equal(f.checks.length, 1);
  const challenge = deferred();
  f.c.createCodeChallenge = () => challenge.promise;
  const login = f.c.startAdminAuth(true);
  flight.resolve(response({action:'adminValidateSession',ok:true,allowed:true}));
  assert.equal(await recover, false);
  assert.equal(f.data.has('token'), false);
  assert.equal(f.c.adminAuthBlocksDataLoad, true);
  assert.deepEqual(f.verified, []);
  challenge.resolve('challenge');
  await login;
  assert.equal(f.navigation.length, 1);
});
test('after a real explicit LINE restart and page navigation, missing callback proof cannot restore the previous identity', async () => {
  const first = fixture('', {token:'previous-account', ...proof});
  await first.c.startAdminAuth(true);
  assert.equal(first.navigation.length, 1);
  assert.equal(new URL(first.navigation[0]).searchParams.get('disable_auto_login'), 'true');
  const stored = Object.fromEntries(first.data);
  const returnedState = new URL(first.navigation[0]).searchParams.get('state');
  delete stored.verifier;
  const nextPage = fixture('?code=fresh&state=' + returnedState, stored);
  assert.equal(await nextPage.c.initAdminAuth(), false);
  assert.equal(nextPage.exchanges.length + nextPage.checks.length + nextPage.navigation.length, 0);
  assert.equal(nextPage.data.has('token'), false);
  assert.deepEqual(nextPage.verified, []);
  assert.equal(first.data.has('token'), false);
});
test('offline explicit switch retains the old session, cached data and draft but suppresses old validation / callbacks until reconnect', async () => {
  const validation = deferred();
  const f = fixture('?code=A&state=state-A', {...proof,token:'existing',cache:'snapshot'}, () => validation.promise);
  f.c.ADMIN_ORDER_SNAPSHOT_SESSION_CACHE_KEY = 'cache';
  const recovering = f.c.initAdminAuth();
  assert.equal(f.checks.length, 1);
  f.c.adminBrowserIsOffline = () => true;
  await f.c.startAdminAuth(true);
  assert.equal(f.data.get('token'), 'existing');
  assert.equal(f.data.get('cache'), 'snapshot');
  assert.equal(f.data.get('draft'), 'saved');
  assert.equal(f.data.get('verifier'), 'pkce-B');
  validation.resolve(response({action:'adminValidateSession',ok:true,allowed:true}));
  assert.equal(await recovering, false);
  assert.equal(await f.c.validateExistingAdminSession('existing'), false);
  f.location.search = '?code=B&state=state-B';
  assert.equal(await f.c.initAdminAuth(), false);
  assert.equal(f.checks.length, 1);
  assert.deepEqual(f.verified, []);
  assert.equal(f.exchanges.length + f.navigation.length, 0);
  // A reload in this same tab keeps the explicit intent without moving any
  // code/verifier elsewhere. A valid-looking old callback remains unusable.
  const reload = fixture(f.location.search, Object.fromEntries(f.data));
  reload.c.adminBrowserIsOffline = () => true;
  assert.equal(await reload.c.initAdminAuth(), false);
  assert.equal(reload.checks.length + reload.exchanges.length + reload.navigation.length, 0);
  assert.equal(reload.data.get('token'), 'existing');
  assert.equal(reload.data.get('draft'), 'saved');
  f.c.adminBrowserIsOffline = () => false;
  await f.c.handleAdminNetworkRestored();
  assert.equal(f.navigation.length, 1);
  assert.equal(new URL(f.navigation[0]).searchParams.get('disable_auto_login'), 'true');
  assert.equal(f.data.has('token'), false);
  assert.equal(f.data.has('cache'), false);
  assert.equal(f.data.get('draft'), 'saved');
  assert.notEqual(f.data.get('verifier'), 'pkce-B');
});
test('late expiry after a fresh LINE start cannot replace the new overlay', async () => {
  const flight = deferred();
  const f = fixture('?state=bad', {token:'previous'}, () => flight.promise);
  const recovering = f.c.initAdminAuth();
  assert.equal(f.checks.length, 1);
  await f.c.startAdminAuth(true);
  const messages = f.overlay.length;
  flight.resolve(response({action:'adminValidateSession',ok:false,error:'ADMIN_SESSION_REQUIRED'}));
  assert.equal(await recovering, false);
  assert.equal(f.overlay.length, messages);
  assert.equal(f.data.get('state'), 'new-proof');
  assert.equal(f.data.has('token'), false);
});
test('an older validation cannot unlock the page while the correct callback is running', async () => {
  const validation = deferred(), exchange = deferred();
  const f = fixture('?code=A&state=state-A', {...proof,token:'existing'}, () => validation.promise);
  f.c.fetchAdminAuthWithResultRecovery = () => exchange.promise;
  const older = f.c.initAdminAuth();
  assert.equal(f.checks.length, 1);
  f.location.search = '?code=B&state=state-B';
  const newer = f.c.initAdminAuth();
  const count = f.overlay.length;
  validation.resolve(response({action:'adminValidateSession',ok:true,allowed:true}));
  assert.equal(await older, false);
  assert.equal(f.overlay.length, count);
  assert.equal(f.c.adminAuthBlocksDataLoad, true);
  assert.deepEqual(f.verified, []);
  exchange.resolve(response(success('newer-session')));
  assert.equal(await newer, true);
  assert.equal(f.data.get('token'), 'newer-session');
});
test('explicit denial from the current callback cannot recover a previously stored session', async () => {
  const f = fixture('?code=B&state=state-B', {...proof,token:'existing'});
  f.c.fetchAdminAuthWithResultRecovery = async () => response({action:'adminAuth',ok:true,allowed:false});
  assert.equal(await f.c.initAdminAuth(), false);
  assert.equal(f.checks.length, 0);
  assert.equal(f.data.has('token'), false);
  assert.deepEqual(f.verified, []);
});
test('exhausted body-recovery budget offers a fresh explicit login and no retry of the old callback', async () => {
  const f = fixture('?code=B&state=state-B', proof);
  f.c.fetchAdminAuthWithResultRecovery = async () => {
    throw Object.assign(new Error('ADMIN_AUTH_RESULT_UNAVAILABLE'),
      {responseFormat:'auth-result-read-budget-used',responseStage:'result_lookup'});
  };
  assert.equal(await f.c.initAdminAuth(), false);
  assert.equal(f.location.search, '');
  assert.equal(f.retry.dataset.retryCallback, 'false');
  assert.equal(f.navigation.length, 0);
});
