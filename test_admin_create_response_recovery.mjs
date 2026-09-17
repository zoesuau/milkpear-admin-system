import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=fs.readFileSync(process.env.ADMIN_CANDIDATE_HTML || new URL('./index.html',import.meta.url),'utf8');
function block(s,e){const a=html.indexOf(s),b=html.indexOf(e,a);assert.ok(a>=0&&b>a);return html.slice(a,b);}
const transportSource=block('      async function fetchWithTimeout(', '      async function fetchAdminRecoverableResponse(');
const recoverySource=block('      async function performPendingAdminCreateOrderRecovery(', '      async function checkPendingAdminCreateOrder(');
// Stalled body and fetch are bounded, including browsers without AbortController.
for(const noAbort of [false,true])for(const stalled of ['body','headers']){
 const timers=new Map();let next=0,calls=0,signal;
 const c={AbortController:noAbort?undefined:AbortController,window:{setTimeout(fn){timers.set(++next,fn);return next;},clearTimeout:id=>timers.delete(id)},
 fetch:async(_u,o)=>{calls++;signal=o.signal;return stalled==='headers'?new Promise(()=>{}):{text:()=>new Promise(()=>{})};}};
 vm.createContext(c);vm.runInContext(transportSource,c);
 const result=c.fetchWithTimeout('fixture',{},15000,true).then(()=>null,e=>e);
 await Promise.resolve();assert.equal(timers.size,1);
 [...timers.values()][0]();assert.equal((await Promise.race([result,new Promise(resolve=>setTimeout(()=>resolve({name:'UNBOUNDED'}),25))]))?.name,'AbortError');assert.equal(calls,1);assert.equal(timers.size,0);if(!noAbort)assert.equal(signal.aborted,true);
}
{
 const c={AbortController,window:{setTimeout,clearTimeout},fetch:async()=>new Response('{"ok":true}')};
 vm.createContext(c);vm.runInContext(transportSource,c);
 const r=await c.fetchWithTimeout('fixture',{},100,true);assert.equal((await r.json()).ok,true);
 assert.equal(await r.text(),'{"ok":true}');
}
function fixture(sequence){
 let now=0,reads=0,finishes=0,writes=0,active=true;const budgets=[],feedback={},button={},overlays=[];
 const c={Date:{now:()=>now},navigator:{onLine:true},document:{getElementById:()=>null},window:{setTimeout(fn,ms){now+=ms;fn();}},
 sessionStorage:{getItem:()=> 'fixture-session',removeItem(){}},ADMIN_LINE_SESSION_TOKEN_KEY:'token',GAS_ORDERS_API_URL:'fixture',
 ADMIN_CREATE_AUTO_CHECK_DELAYS_MS:[0,2500,6000],ADMIN_CREATE_CHECK_TIMEOUT_MS:15000,ADMIN_CREATE_ORDER_TIMEOUT_MS:60000,
 adminCreateOrderChecking:false,adminCreateOrderSubmitting:false,
 loadPendingAdminCreateRequest:()=>({requestKey:'same-fixture-key'}),isPendingAdminCreateRequestActive:()=>active,
 getPendingAdminCreatePayload:()=>({action:'adminCreateOrder',adminSessionToken:'fixture-session',requestKey:'same-fixture-key'}),
 showAdminAuthOverlay:m=>overlays.push(m),showPendingAdminCreateOfflineState:()=>false,
 finishAdminCreateOrder:()=>{finishes++;return true;},
 fetchWithTimeout:async(_u,o,budget,full)=>{
  const body=JSON.parse(o.body);assert.equal(full,true);assert.equal(body.requestKey,'same-fixture-key');budgets.push(budget);
  if(body.action==='adminCreateOrder')writes++;else {assert.equal(body.action,'adminCheckCreateOrderResult');reads++;}
  const step=sequence.shift();assert.ok(step,'unexpected request');if(step.advance)now+=Math.min(step.advance,budget);
  if(step.offline)c.navigator.onLine=false;if(step.stale)active=false;if(step.error)throw step.error;
  return {ok:!step.http||step.http===200,status:step.http||200,json:async()=>{if(step.jsonError)throw new SyntaxError('fixture');return step.payload||{ok:true,action:'adminCheckCreateOrderResult',status:step.status||'completed'};}};
 }};
 vm.createContext(c);vm.runInContext(recoverySource,c);
 return {c,run:()=>c.performPendingAdminCreateOrderRecovery({feedback,submitButton:button}),stats:()=>({reads,writes,finishes,now}),budgets,overlays};
}
const timeout=()=>Object.assign(new Error('fixture'),{name:'AbortError'});
for(const failure of [{error:timeout()},{error:new TypeError('network')},{http:404},{http:503},{jsonError:true}]){
 const f=fixture([failure,{}]);assert.equal(await f.run(),true);assert.deepEqual(f.stats(),{reads:2,writes:0,finishes:1,now:2500});
}
for(const first of [{http:401},{http:403},{payload:{ok:false,action:'adminCheckCreateOrderResult',errorCode:'ADMIN_SESSION_REQUIRED'}},{payload:{ok:false,action:'adminCheckCreateOrderResult',errorCode:'ORDER_CREATE_CHECK_INVALID'}}]){
 const f=fixture([first,{}]);assert.equal(await f.run(),false);assert.equal(f.stats().reads,1);assert.equal(f.stats().writes,0);
}
{
 const f=fixture([{error:timeout()},{status:'not_found'},{status:'not_found'}]);await f.run();assert.equal(f.stats().writes,0,'failed read must veto automatic resend');assert.equal(f.stats().reads,3);
}
{
 const f=fixture(Array.from({length:3},()=>({error:timeout(),advance:15000})));await f.run();assert.equal(f.stats().now,45000);assert.deepEqual(f.budgets,[15000,15000,6500]);assert.equal(f.stats().writes,0);
}
{
 const f=fixture([{error:timeout(),offline:true},{}]);await f.run();assert.equal(f.stats().reads,1);assert.equal(f.stats().writes,0);
}
{
 const f=fixture([{stale:true}]);await f.run();assert.equal(f.stats().finishes,0,'late read must not finish a replaced operation');
}
console.log('PASS full-body timeout, no AbortController, transient read retry, permission/business stop, no uncertain resend, total budget, offline, stale result');

{
 const f=fixture([{status:'not_found'},{status:'not_found'},{status:'not_found'},
  {payload:{ok:true,action:'adminCreateOrder',created:{orderNo:'FIXTURE-1'}}}]);
 assert.equal(await f.run(),true);assert.equal(f.stats().reads,3);assert.equal(f.stats().writes,1);
}
{
 const f=fixture([{}]);f.c.finishAdminCreateOrder=()=>{throw new TypeError('render failure');};
 assert.equal(await f.run(),false);assert.equal(f.stats().reads,1,'render failure must not be retried as network failure');
}
console.log('PASS existing confirmed-not-found same-key resend and render-failure separation');
