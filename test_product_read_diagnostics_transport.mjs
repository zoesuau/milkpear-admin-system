import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(process.env.CATALOG_HTML_SOURCE || new URL('./index.html', import.meta.url),'utf8');
const begin=html.indexOf('      async function fetchAdminRecoverableResponse(');
const end=html.indexOf('      function createAdminRequestKey(',begin);
const endpoint='https://fixture.invalid',id='adminReadProductCatalog|'+'a'.repeat(32);
async function run(mode){
 let now=0,n=0,done=false,error,result;
 const timers=new Map(),requests=[];
 const context={Date:{now:()=>now},AbortController,navigator:{onLine:true},GAS_ORDERS_API_URL:endpoint,ADMIN_ORDER_SNAPSHOT_ATTEMPT_TIMEOUT_MS:20000,
  window:{setTimeout(fn,ms){const key=++n;timers.set(key,{at:now+ms,fn});return key;},clearTimeout:key=>timers.delete(key)},
  fetch:async(_,o)=>{
    requests.push(JSON.parse(o.body));
    if(mode==='timeout')return new Promise((_,reject)=>o.signal.addEventListener('abort',()=>reject(Object.assign(new Error('timeout'),{name:'AbortError'}))));
    const status=requests.length===1?404:200;
    return {ok:status===200,status,text:async()=>JSON.stringify({ok:status===200,action:'adminReadProductCatalog'})};
  }};
 vm.createContext(context);vm.runInContext(html.slice(begin,end),context);
 context.fetchAdminRecoverableResponse(endpoint,{method:'POST',body:JSON.stringify({action:'adminReadProductCatalog',requestId:id,includeOperations:true,adminSessionToken:'fixture'})},60000).then(r=>{result=r;done=true},e=>{error=e;done=true});
 for(let i=0;i<30&&!done;i++){
  await new Promise(setImmediate);if(done)break;
  const next=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];assert.ok(next);timers.delete(next[0]);now=next[1].at;next[1].fn();
 }
 assert.ok(done);assert.equal(timers.size,0);
 assert.ok(requests.every((r,i)=>r.requestId===id&&r.diagnosticAttempt===i+1));
 return {now,error,result,requests};
}
const retried=await run('retry');assert.equal(retried.requests.length,2);assert.equal(retried.error,undefined);assert.equal(retried.now,500);
const timeout=await run('timeout');assert.equal(timeout.requests.length,3);assert.equal(timeout.error.message,'GAS_TIMEOUT');assert.equal(timeout.now,30000,'diagnostics-only preserves production 30-second total and 12-second attempts');
assert.equal(timeout.error.attempts,3);
console.log('PASS diagnostics-only retry correlation and existing 12-second/30-second timeout behavior');
