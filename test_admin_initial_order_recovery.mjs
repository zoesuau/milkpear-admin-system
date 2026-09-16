import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
function block(start, end) {
  const a = html.indexOf(start), b = html.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `missing ${start}`);
  return html.slice(a, b);
}

const source = block(
  '      async function fetchInitialAdminOrdersWithRecovery(options = {})',
  '      async function loadAdminOrdersForCurrentView(',
);

function fixture(results) {
  const requests = [], messages = [];
  const ctx = {
    ADMIN_INITIAL_ORDER_RETRY_DELAY_MS: 0,
    ADMIN_LINE_SESSION_TOKEN_KEY: 'token',
    adminNetworkRecoveryPending: '',
    navigator: { onLine: true },
    sessionStorage: { getItem: key => key === 'token' ? 'fixture-session' : null },
    window: { setTimeout: fn => { queueMicrotask(fn); return 1; } },
    createAdminDiagnosticRequestId: () => `request-${requests.length + 1}`,
    adminBrowserIsOffline: () => ctx.navigator.onLine === false,
    showAdminAuthOverlay: message => messages.push(message),
    fetchAdminOrdersFromGas: async options => {
      requests.push(options);
      const result = results.shift();
      if (result === 'network-failure') {
        ctx.adminNetworkRecoveryPending = 'orders';
        return null;
      }
      if (result === 'offline') {
        ctx.navigator.onLine = false;
        ctx.adminNetworkRecoveryPending = 'orders';
        return null;
      }
      return result;
    },
  };
  vm.createContext(ctx);
  vm.runInContext(source, ctx);
  return { ctx, requests, messages };
}

{
  const f = fixture(['network-failure', []]);
  assert.deepEqual(await f.ctx.fetchInitialAdminOrdersWithRecovery(), []);
  assert.equal(f.requests.length, 2);
  assert.equal(f.requests[0].networkRecovery, true);
  assert.equal(f.requests[0].silent, undefined);
  assert.notEqual(f.requests[0].requestId, f.requests[1].requestId);
  assert.ok(f.messages.some(message => message.includes('自動再試')));
}
{
  const f = fixture(['network-failure', []]);
  assert.deepEqual(await f.ctx.fetchInitialAdminOrdersWithRecovery({ silent: true }), []);
  assert.equal(f.requests.length, 2);
  assert.equal(f.requests[0].silent, true);
  assert.equal(f.messages.length, 0, 'background completion must not cover the usable preview');
}
{
  const f = fixture([[]]);
  assert.deepEqual(await f.ctx.fetchInitialAdminOrdersWithRecovery(), []);
  assert.equal(f.requests.length, 1);
}
{
  const f = fixture(['offline', []]);
  assert.equal(await f.ctx.fetchInitialAdminOrdersWithRecovery(), null);
  assert.equal(f.requests.length, 1);
}
{
  const f = fixture([null, []]);
  assert.equal(await f.ctx.fetchInitialAdminOrdersWithRecovery(), null);
  assert.equal(f.requests.length, 1, 'non-network failures must not be retried automatically');
}

console.log('initial order recovery: PASS bounded automatic retry, new request id, offline stop');
