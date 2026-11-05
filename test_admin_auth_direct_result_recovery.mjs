import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const load = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const transport = load('./admin-direct-response.js');
const html = load('./index.html');
function block(first, next) {
  const start = html.indexOf(first);
  const end = html.indexOf(next, start);
  assert.ok(start >= 0 && end > start);
  return html.slice(start, end);
}
const source = transport +
  block('      async function fetchAdminRecoverableResponse(', '      function createAdminRequestKey(') +
  block('      function isAdminAuthUnacceptedBusy(', '      async function completeAdminAuth(');
const endpoint = 'https://sanheyuan-admin-response.zoe-quokka.workers.dev/request';
const login = { action: 'adminAuth', claimRetryProtocol: 1, code: 'fixture-code',
  nonce: 'fixture-nonce', codeVerifier: 'fixture-proof', redirectUri: 'https://fixture.invalid/admin',
  diagnosticRequestId: 'adminAuth_fixture', startup: {filter: {page: 1, pageSize: 20}, requestId: 'fixture-startup', workspace: true} };
const success = {ok: true, action: 'adminAuth', allowed: true, adminSessionToken: 'fixture-session'};
const json = value => new Response(JSON.stringify(value));
function brokenBody(status = 200, beforeThrow = () => {}) {
  return {ok: status >= 200 && status < 300, status, headers: new Headers(), async text() {
    beforeThrow();
    throw new TypeError('fixture secret transport details');
  }};
}

function fixture(responses) {
  const recKey = 'nonce:recovery', deadline = 61000;
  const state = new Map([['nonce', login.nonce], ['proof', login.codeVerifier], ['nonce:submitted', login.nonce],
    [recKey, JSON.stringify({nonce: login.nonce, startedAt: 1000, deadline, diagnosticRequestId: login.diagnosticRequestId})]]);
  const sessionStorage = {getItem: k => state.get(k) ?? null, setItem: (k,v) => state.set(k, String(v))};
  const calls = [], timeouts = [];
  const f = {now: 1000, offline: false, sessionStorage, state, recKey, deadline, calls, timeouts};
  f.context = () => {
    const ctx = {
      Date: class extends Date { static now() { return f.now; } }, JSON, AbortController, sessionStorage,
      ADMIN_LINE_NONCE_KEY: 'nonce', ADMIN_LINE_CODE_VERIFIER_KEY: 'proof', GAS_ORDERS_API_URL: 'fixture:gas',
      adminBrowserIsOffline: () => f.offline, showAdminAuthOverlay() {},
      window: {
        setTimeout(fn, ms) { timeouts.push(ms); return setTimeout(fn, ms); }, clearTimeout,
        ORDER_SYSTEM_CONFIG: {customerId: 'sanheyuan', environment: 'production', features: {adminDirectResponse:true}, adminDirectResponseUrl: endpoint},
      },
      async fetch(url, options) {
        assert.equal(url, endpoint);
        const body = JSON.parse(options.body);
        calls.push({body, saved: JSON.parse(state.get(recKey))});
        const next = responses.shift();
        assert.ok(next, 'unexpected additional request');
        return next(f, body);
      },
    };
    vm.createContext(ctx); vm.runInContext(source, ctx); return ctx;
  };
  f.submit = (override = {}, ctx = f.context(), recovery = {}) =>
    ctx.fetchAdminAuthWithResultRecovery({...login, ...override}, {deadline, ...recovery});
  return f;
}

test('business response body error carries only the prior status and fixed stage', async () => {
  const f = fixture([() => brokenBody()]);
  const job = f.context().window.AdminDirectResponse.request({method:'POST',body:JSON.stringify(login)}, 5000);
  await assert.rejects(job, e => e.message === 'NETWORK_ERROR' && e.responseStage === 'body_read' &&
    e.httpStatus === 200 && e.responseFormat === 'body-read-failed' && !JSON.stringify(e).includes('secret'));
});

test('a settled broken body triggers exactly one code-free lookup under the original deadline', async () => {
  let originalBodySettled = false;
  const f = fixture([() => brokenBody(200, () => { f.now += 4350; originalBodySettled = true; }),
    (_f, read) => {
      assert.ok(originalBodySettled);
      assert.equal(f.calls[1].saved.bodyResultCheckUsed, true, 'reserve the only check before dispatch');
      assert.equal(f.calls[1].saved.deadline, f.deadline);
      assert.equal(JSON.stringify(f.calls[1].saved).includes(login.code), false);
      assert.deepEqual(read, {action: login.action, claimRetryProtocol: 1, resultOnly: true, nonce: login.nonce,
        codeVerifier: login.codeVerifier, redirectUri: login.redirectUri, diagnosticRequestId: login.diagnosticRequestId,
        startup: login.startup});
      return json(success);
    }]);
  assert.deepEqual(await (await f.submit({extra:'must-be-discarded'})).json(), success);
  assert.deepEqual(f.timeouts, [60000, 55650]);
  assert.equal(f.calls.length, 2);
});

test('pending, busy or broken lookup cannot trigger another dispatch, including after a reload', async () => {
  for (const response of [() => json({ok:false,action:'adminAuth',error:'ADMIN_AUTH_PENDING',state:'pending'}),
      () => json({ok:false,action:'adminAuth',error:'ADMIN_AUTH_BUSY',state:'busy',claimRetryProtocol:1,requestAccepted:false,retryable:true}),
      () => brokenBody()]) {
    const f = fixture([() => brokenBody(), response]);
    const unconfirmed = e => e.message === 'ADMIN_AUTH_RESULT_UNAVAILABLE' && e.responseFormat === 'auth-result-read-budget-used';
    await assert.rejects(f.submit(), unconfirmed);
    assert.equal(f.calls.length, 2);
    await assert.rejects(f.submit({resultOnly:true,code:undefined}, f.context()), unconfirmed);
    assert.equal(f.calls.length, 2);
  }
});

test('normal success, application rejection, wrong JSON and failures before body read do not trigger recovery', async () => {
  const denied = {ok:false,action:'adminAuth',error:'LINE_TOKEN_EXCHANGE_FAILED',restartRequired:true};
  const cases = [
    [() => json(success), success], [() => json(denied), denied],
    [() => new Response('<html>'), 'GAS_NON_JSON_RESPONSE'],
    [() => json({action:'wrong', ok:true}), 'GAS_AUTH_RESPONSE_INVALID'],
    [() => { throw new TypeError('network unavailable'); }, 'NETWORK_ERROR'],
    [() => brokenBody(403), 'NETWORK_ERROR'],
  ];
  for (const [response, expected] of cases) {
    const f = fixture([response]);
    if (typeof expected === 'string') await assert.rejects(f.submit(), e => e.message === expected);
    else assert.deepEqual(await (await f.submit()).json(), expected);
    assert.equal(f.calls.length, 1);
  }
});

test('a failed diagnostic copy leaves a successful business response untouched', async () => {
  let failedObservations = 0;
  const f = fixture([async () => {
    const businessResponse = json(success);
    businessResponse.clone = () => ({json: async () => { throw Error('observer failure'); }});
    await businessResponse.clone().json().catch(() => { failedObservations++; });
    return businessResponse;
  }]);
  assert.deepEqual(await (await f.submit()).json(), success);
  assert.equal(failedObservations, 1);
  assert.equal(f.calls.length, 1);
});

test('no automatic lookup after deadline, offline, changed proof, or an already read-only request', async () => {
  const cases = [
    [f => {f.now = f.deadline;}, {}, 'ADMIN_AUTH_RECOVERY_EXPIRED'],
    [f => {f.offline = true;}, {}, 'ADMIN_NETWORK_OFFLINE'],
    [f => {f.state.set('proof','new-proof');}, {}, 'AUTH_CALLBACK_CONTEXT_MISSING'],
    [() => {}, {resultOnly:true,code:undefined}, 'NETWORK_ERROR'],
  ];
  for (const [change, override, expected] of cases) {
    const f = fixture([() => brokenBody(200, () => change(f))]);
    await assert.rejects(f.submit(override), e => e.message === expected);
    assert.equal(f.calls.length, 1);
  }
});

test('going offline at body failure defers the one lookup across an online event and reload', async () => {
  const f = fixture([() => brokenBody(200, () => { f.offline = true; }), () => brokenBody()]);
  await assert.rejects(f.submit(), /ADMIN_NETWORK_OFFLINE/);
  assert.equal(f.calls.length, 1);
  f.offline = false;
  f.now += 3000;
  const read = {resultOnly: true, code: undefined};
  const spent = e => e.message === 'ADMIN_AUTH_RESULT_UNAVAILABLE' && e.responseFormat === 'auth-result-read-budget-used';
  await assert.rejects(f.submit(read, f.context()), spent);
  await assert.rejects(f.submit(read, f.context()), spent);
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[1].body.resultOnly, true);
  assert.equal(Object.hasOwn(f.calls[1].body, 'code'), false);
  assert.deepEqual(f.timeouts, [60000, 57000]);
});

test('an abandoned callback with matching stored nonce cannot reserve a lookup or reuse its delayed result', async () => {
  for (const abandonAt of ['first body', 'result check']) {
    let active = true;
    const f = fixture([() => brokenBody(200, () => { if (abandonAt === 'first body') active = false; }),
      () => { active = false; return json(success); }]);
    await assert.rejects(f.submit({}, f.context(), {stillCurrent: () => active}), /AUTH_CALLBACK_CONTEXT_MISSING/);
    assert.equal(f.calls.length, abandonAt === 'first body' ? 1 : 2);
    assert.equal(JSON.parse(f.state.get(f.recKey)).bodyResultCheckUsed, abandonAt === 'first body' ? undefined : true);
  }
});
