import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const start = html.indexOf('      async function fetchAdminRecoverableResponse(');
const source = html.slice(start, html.indexOf('      function createAdminRequestKey(', start));
async function scenario({ action = 'adminReadOrderSnapshot', plan, offlineAt = Infinity,
  changeContextAt = Infinity, enabled = true, budget = 20000 }) {
  let now = 0, id = 0, done = false, value, error;
  const timers = new Map(), calls = [], aborted = [], bindings = [];
  const schedule = (fn, ms) => { const k = ++id; timers.set(k, {at: now + ms, fn}); return k; };
  const payload = { action, requestId: 'orders-fixture', adminSessionToken: 'token', viewMode: 'page' };
  if (action === 'adminAuth') Object.assign(payload, {code:'one-time', nonce:'nonce', codeVerifier:'proof', diagnosticRequestId:'auth-fixture'});
  const c = {
    Date: {now: () => now}, AbortController, navigator: {get onLine() {return now < offlineAt;}},
    GAS_ORDERS_API_URL: 'fixture', ADMIN_ORDER_SNAPSHOT_ATTEMPT_TIMEOUT_MS: 20000,
    ADMIN_LINE_SESSION_TOKEN_KEY: 'session', ADMIN_LINE_NONCE_KEY: 'nonce',
    sessionStorage: {getItem: k => now >= changeContextAt ? 'changed' : k === 'nonce' ? 'nonce' : 'token'},
    window: {setTimeout:schedule, clearTimeout:k=>timers.delete(k), AdminDiagnostics:{
      bindRequestToFlow:(...args)=>bindings.push(args), record() {},
    }},
    fetch: async (_, options) => {
      const b = JSON.parse(options.body), n = calls.length;
      calls.push({body:b,at:now});
      const p = plan(n, b);
      return new Promise((resolve, reject) => {
        const k = schedule(() => {
          if (p.error) return reject(new Error(p.error));
          const data = p.data || {action,ok:true,allowed:true,adminSessionToken:'confirmed',orders:[{fixture:true}]};
          resolve({ok:!(p.status >= 400), status:p.status || 200,headers:{},text:()=>new Promise(r=>schedule(()=>r(p.text ?? JSON.stringify(data)),p.bodyDelay || 0))});
        }, p.delay);
        options.signal.addEventListener('abort',()=>{aborted.push(n);timers.delete(k);const e=new Error('aborted');e.name='AbortError';reject(e);},{once:true});
      });
    },
  };
  vm.createContext(c); vm.runInContext(source,c);
  c.fetchAdminRecoverableResponse('fixture',{method:'POST',body:JSON.stringify(payload)},budget,
    {maxAttempts:1,totalBudgetMs:budget,deliveryRecovery:enabled,flow:{flowId:'fixture'}})
    .then(async r=>{value=await r.json();done=true;}, e=>{error=e.message;done=true;});
  for(let step=0;step<100 && !done;step++) {
    await new Promise(setImmediate); if(done)break;
    assert.ok(timers.size,'pending request must have a deadline');
    const [key,t]=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];timers.delete(key);now=t.at;t.fn();
  }
  assert.ok(done,'bounded completion');
  await new Promise(setImmediate);
  assert.ok(calls.length<=2,'at most one additional read');
  assert.ok(calls.filter(x=>x.body.code).length<=1,'never replay LINE code');
  return {now,value,error,calls,aborted,timers,bindings};
}

let r=await scenario({plan:n=>({delay:n===0?45000:2500})});
assert.equal(r.value?.ok,true,'lost original response must recover before the 20s timeout');
assert.equal(r.now,10500); assert.equal(r.calls.length,2);
assert.ok(r.aborted.includes(0)); assert.equal(r.timers.size,0);
assert.notEqual(r.calls[0].body.requestId,r.calls[1].body.requestId);
assert.equal(r.bindings.length,1);
r=await scenario({action:'adminAuth',budget:30000,plan:n=>({delay:n===0?45000:2500})});
assert.equal(r.now,10500); assert.equal(r.value.allowed,true);
assert.equal(r.calls[1].body.resultOnly,true);assert.equal(r.calls[1].body.code,undefined);
assert.equal(r.calls[1].body.nonce,'nonce');assert.equal(r.calls[1].body.codeVerifier,'proof');
for(const delay of [3500,7900]) {
  r=await scenario({plan:()=>({delay})});assert.equal(r.now,delay);assert.equal(r.calls.length,1);assert.equal(r.timers.size,0);
}
r=await scenario({plan:n=>({delay:n===0?9000:12000})});
assert.equal(r.now,9000);assert.ok(r.aborted.includes(1));assert.equal(r.timers.size,0);
r=await scenario({action:'adminAuth',budget:30000,plan:n=>({delay:n===0?13000:100,data:n?{action:'adminAuth',ok:false,error:'ADMIN_AUTH_PENDING'}:undefined})});
assert.equal(r.now,13000);assert.equal(r.value.allowed,true,'pending receipt must not replace original exchange');
for(const extra of [{status:404},{text:'<html>error</html>'},{error:'network'}]) {
  r=await scenario({plan:n=>n?{delay:100,...extra}:{delay:13000}});
  assert.equal(r.now,13000);assert.equal(r.value.ok,true,'failed alternate must not cancel valid slow original');
}
r=await scenario({plan:()=>({delay:45000})});assert.equal(r.now,20000);assert.equal(r.error,'GAS_TIMEOUT');assert.equal(r.timers.size,0);
r=await scenario({plan:n=>({delay:n?100:10,status:403})});assert.equal(r.calls.length,1);
for(const restriction of [{offlineAt:4000},{changeContextAt:4000},{enabled:false}]) {
  r=await scenario({plan:()=>({delay:13000}),...restriction});assert.equal(r.calls.length,1);
}
r=await scenario({plan:n=>n?{delay:100}:{delay:10,bodyDelay:12000}});
assert.equal(r.now,8100,'recovery covers body delivery as well as headers');
for(const action of ['adminCreateOrder','adminBatchMarkOrdersShipped','adminUpdateProductFields']) {
  r=await scenario({action,plan:()=>({delay:100})});assert.equal(r.error,'ADMIN_RECOVERY_ACTION_NOT_ALLOWED');assert.equal(r.calls.length,0);
}
console.log('PASS delivery recovery: lost response, one LINE exchange, slow original, pending receipt, failure, deadlines, context, body, mutation exclusion');
