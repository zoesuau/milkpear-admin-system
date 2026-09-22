import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
const between=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
const source=between('      function showAdminAuthOverlay(', '      async function fetchWithTimeout')+between('      let adminSessionVerifiedAt','      async function startAdminAuth')+
 between('      async function validateExistingAdminSession','      function switchAdminTab');
function fixture(){
 let reads=0,checks=0,navigations=0,reloads=0;
 const events={},storage=new Map([['token','fixture']]);
 const nodes=Object.fromEntries(['adminAuthOverlay','adminAuthMessage','adminAuthRetryBtn','adminAuthRefreshBtn','adminAuthCloseBtn','adminSessionStatus'].map(id=>{const classes=new Set();return [id,{dataset:{},innerText:'',classList:{toggle:(name,hidden)=>hidden?classes.add(name):classes.delete(name),add:name=>classes.add(name),remove:name=>classes.delete(name),contains:name=>classes.has(name)}}]}));
 const node=nodes.adminAuthRetryBtn;
 const c={initializeAdminLiveOrderSync(){},adminCreateOrderSubmitting:false,adminCreateProductsRefreshing:false,adminAddOrderOpening:false,Date,URLSearchParams,ADMIN_LINE_SESSION_TOKEN_KEY:'token',ADMIN_LINE_STATE_KEY:'state',ADMIN_AUTH_TIMEOUT_MS:60000,GAS_ORDERS_API_URL:'mock',adminAuthBlocksDataLoad:false,
 shouldOfferAdminRefreshFromMessage:()=>false,document:{visibilityState:'visible',getElementById:id=>nodes[id],addEventListener:(n,f)=>events[n]=f},window:{location:{search:'',reload:()=>{reloads++}},addEventListener:(n,f)=>events[n]=f},sessionStorage:{getItem:k=>storage.get(k)||null,removeItem:k=>storage.delete(k)},setAdminAuthRetryButtonMode(){},createAdminDiagnosticRequestId:()=> 'fixture',publishAdminAuthDiagnostic(){},reconcilePendingAdminShipment:async()=>{reads++},startAdminAuth:async()=>{navigations++},fetchAdminRecoverableResponse:async()=>{checks++;return {ok:true,json:async()=>({ok:true,action:'adminValidateSession',allowed:true})}}};
 vm.createContext(c);vm.runInContext(source,c);
 return {c,events,storage,node,nodes,stats:()=>({checks,reads,navigations,reloads})};
}
let f=fixture();assert.equal(await f.c.initAdminAuth({validateWithOrders:true}),true);assert.equal(f.stats().checks,0,'initial protected order read performs validation; no redundant login request');assert.equal(f.nodes.adminAuthOverlay.classList.contains('hidden'),false,'no usable UI until authenticated data arrives');
f=fixture();vm.runInContext('adminInitialOrdersReady=true',f.c);f.c.markAdminSessionVerified();assert.equal(await f.c.ensureAdminSessionReady(),true);assert.equal(f.stats().checks,0);
f.c.initializeAdminSessionRecovery();f.c.document.visibilityState='hidden';f.events.visibilitychange();assert.equal(f.stats().checks,0);f.c.document.visibilityState='visible';f.events.visibilitychange();await new Promise(setImmediate);assert.equal(f.stats().checks,0,'brief app switching must reuse a recent verification');
f=fixture();let finish;f.c.fetchAdminRecoverableResponse=()=>new Promise(r=>finish=r);const one=f.c.ensureAdminSessionReady(true),two=f.c.ensureAdminSessionReady(true);assert.equal(f.c.adminAuthBlocksDataLoad,true);assert.equal(f.node.classList.contains('hidden'),true,'do not offer LINE navigation during a pending session check');assert.match(f.nodes.adminAuthMessage.innerText,/正在確認/);finish({ok:true,json:async()=>({ok:true,allowed:true,action:'adminValidateSession'})});assert.equal(await one,true);assert.equal(await two,true);
f=fixture();f.c.fetchAdminRecoverableResponse=async()=>({ok:true,json:async()=>({ok:false,action:'adminValidateSession',error:'ADMIN_SESSION_REQUIRED'})});assert.equal(await f.c.ensureAdminSessionReady(true),false);assert.equal(f.storage.has('token'),false);assert.match(f.nodes.adminAuthMessage.innerText,/登入已過期/);assert.equal(f.stats().navigations,0,'resuming an expired form must not automatically navigate away and discard draft');assert.equal(f.c.adminAuthBlocksDataLoad,true);
f=fixture();f.c.fetchAdminRecoverableResponse=async()=>{throw Error('NETWORK_ERROR')};assert.equal(await f.c.ensureAdminSessionReady(true),false);assert.equal(f.storage.get('token'),'fixture');assert.equal(f.node.dataset.retrySession,'true');
f=fixture();vm.runInContext('adminInitialOrdersReady=true',f.c);f.c.fetchAdminRecoverableResponse=async()=>{throw Error('NETWORK_ERROR')};await f.c.ensureAdminSessionReady(true);assert.equal(f.node.dataset.retrySession,'true');
f.c.showAdminAuthOverlay('讀取訂單中',false);assert.match(f.nodes.adminAuthMessage.innerText,/暫時無法確認/,'ordinary loading must not overwrite a blocked authentication failure');
f.c.fetchAdminRecoverableResponse=()=>new Promise(r=>finish=r);const retry=f.c.retryAdminSessionFromOverlay();assert.equal(f.node.disabled,true);assert.equal(f.node.classList.contains('hidden'),true);assert.equal(f.stats().reloads,0);finish({ok:true,json:async()=>({ok:true,allowed:true,action:'adminValidateSession'})});await retry;assert.equal(f.stats().reloads,0,'resuming retry preserves the current page and unsaved draft');assert.equal(f.stats().reads,1,'only reconcile pending results; no order reload or mutation');assert.equal(f.node.disabled,false);assert.equal(f.nodes.adminAuthOverlay.classList.contains('hidden'),true);
f.c.fetchAdminRecoverableResponse=async()=>{throw Error('NETWORK_ERROR')};await f.c.retryAdminSessionFromOverlay();assert.equal(f.node.disabled,false);assert.equal(f.node.classList.contains('hidden'),false);assert.equal(f.storage.get('token'),'fixture');assert.equal(f.stats().reloads,0);
f=fixture();await f.c.retryAdminSessionFromOverlay();assert.equal(f.stats().reloads,1,'initial failed bootstrap still follows the existing initialization path');
console.log('session resume: PASS initial request elimination, protected UI, hidden/resume, single flight, expired draft retention, network distinction');

// Long-away checks run in the background and never take ownership of the UI.
const tick = () => new Promise(setImmediate);
f=fixture();vm.runInContext('adminInitialOrdersReady=true',f.c);
f.c.hideAdminAuthOverlay();f.c.initializeAdminSessionRecovery();
let calls=0,backgroundOptions;
f.c.fetchAdminRecoverableResponse=(u,o,timeout,options)=>{calls++;backgroundOptions={timeout,options};return new Promise(r=>finish=r)};
f.events.visibilitychange();await tick();
assert.equal(calls,1);assert.equal(backgroundOptions.timeout,10000);assert.equal(backgroundOptions.options.singleAttempt,true);
assert.equal(f.c.adminAuthBlocksDataLoad,false);assert.equal(f.nodes.adminAuthOverlay.classList.contains('hidden'),true);
f.events.visibilitychange();await tick();assert.equal(calls,1,'concurrent returns share a background check');
finish({ok:true,json:async()=>({ok:true,allowed:true,action:'adminValidateSession'})});await tick();
f.events.visibilitychange();await tick();assert.equal(calls,1,'recent success avoids another check');assert.equal(f.stats().reloads,0);

f=fixture();f.c.hideAdminAuthOverlay();f.c.fetchAdminRecoverableResponse=async()=>{throw Error('NETWORK_ERROR')};
assert.equal(await f.c.validateExistingAdminSession('fixture',{background:true}),false);
assert.equal(f.storage.get('token'),'fixture');assert.equal(f.c.adminAuthBlocksDataLoad,false);assert.equal(f.nodes.adminAuthOverlay.classList.contains('hidden'),true);assert.match(f.nodes.adminSessionStatus.textContent,/可繼續填寫/);
f.c.fetchAdminRecoverableResponse=async()=>({ok:true,json:async()=>({ok:false,action:'adminValidateSession',error:'ADMIN_SESSION_REQUIRED'})});
await f.c.validateExistingAdminSession('fixture',{background:true});assert.equal(f.storage.has('token'),false);assert.equal(f.stats().navigations,0);assert.match(f.nodes.adminSessionStatus.textContent,/登入已過期/);assert.equal(f.nodes.adminAuthOverlay.classList.contains('hidden'),true);

for(const newer of ['success','token']) {
 f=fixture();f.c.fetchAdminRecoverableResponse=()=>new Promise(r=>finish=r);
 const pending=f.c.validateExistingAdminSession('fixture',{background:true});
 if(newer==='success')f.c.markAdminSessionVerified('fixture');else f.storage.set('token','new-session');
 finish({ok:true,json:async()=>({ok:false,action:'adminValidateSession',error:'ADMIN_SESSION_REQUIRED'})});
 await pending;assert.equal(f.storage.get('token'),newer==='success'?'fixture':'new-session','stale background results cannot invalidate a newer verified operation/session');
}
f=fixture();vm.runInContext('adminInitialOrdersReady=true',f.c);f.c.initializeAdminSessionRecovery();calls=0;
f.c.fetchAdminRecoverableResponse=async()=>{calls++;throw Error('NETWORK_ERROR')};
f.events.visibilitychange();await tick();f.events.visibilitychange();await tick();assert.equal(calls,1,'failed checks are throttled during repeated app switching');
console.log('background resume: PASS non-blocking, bounded single flight, failure throttling, expiry distinction, stale response races');

f=fixture();vm.runInContext('adminInitialOrdersReady=true',f.c);f.c.initializeAdminSessionRecovery();
for(const busy of ['adminCreateOrderSubmitting','adminCreateProductsRefreshing','adminAddOrderOpening']) {
 f.c[busy]=true;f.events.visibilitychange();await tick();f.c[busy]=false;
}
assert.equal(f.stats().checks,0,'resuming must not add validation traffic alongside catalog/create requests');
console.log('busy create/catalog resume: PASS no additional authentication request');

// Background and foreground requests share transport, but each preserves its UI semantics.
for (const outcome of ['success','expired','network','storage']) {
 f=fixture();vm.runInContext('adminInitialOrdersReady=true',f.c);f.c.initializeAdminSessionRecovery();
 let count=0,resolve,reject;
 f.c.fetchAdminRecoverableResponse=()=>{count++;return new Promise((r,j)=>{resolve=r;reject=j})};
 f.events.visibilitychange();const foreground=f.c.ensureAdminSessionReady();
 assert.equal(count,1,'background + foreground must send only one validation');
 if(outcome==='network') reject(Error('NETWORK_ERROR'));
 else resolve({ok:true,json:async()=>outcome==='success'?{ok:true,allowed:true,action:'adminValidateSession'}:{ok:false,action:'adminValidateSession',error:outcome==='expired'?'ADMIN_SESSION_REQUIRED':'ADMIN_SESSION_VALIDATION_FAILED'}});
 assert.equal(await foreground,outcome==='success');await tick();
 assert.equal(f.storage.has('token'),outcome!=='expired');
 assert.equal(f.c.adminAuthBlocksDataLoad,outcome!=='success');
 if(outcome==='expired')assert.match(f.nodes.adminAuthMessage.innerText,/登入已過期/);
 if(outcome==='network'||outcome==='storage')assert.match(f.nodes.adminAuthMessage.innerText,/暫時無法確認/);
}
for (const outcome of ['network','expired']) {
 f=fixture();vm.runInContext('adminInitialOrdersReady=true',f.c);let resolve,reject;
 f.c.fetchAdminRecoverableResponse=()=>new Promise((r,j)=>{resolve=r;reject=j});
 const foreground=f.c.ensureAdminSessionReady(true);f.c.markAdminSessionVerified('fixture');
 if(outcome==='network')reject(Error('NETWORK_ERROR'));
 else resolve({ok:true,json:async()=>({ok:false,action:'adminValidateSession',error:'ADMIN_SESSION_REQUIRED'})});
 assert.equal(await foreground,true,'newer same-session success supersedes old failure');
 assert.equal(f.storage.get('token'),'fixture');assert.equal(f.c.adminAuthBlocksDataLoad,false);
}
f=fixture();let resolveOld;f.c.fetchAdminRecoverableResponse=()=>new Promise(r=>resolveOld=r);
const old=f.c.ensureAdminSessionReady(true);f.storage.set('token','different');
resolveOld({ok:true,json:async()=>({ok:true,allowed:true,action:'adminValidateSession'})});
assert.equal(await old,false,'old session success cannot authorize a different session');
assert.equal(f.c.adminAuthBlocksDataLoad,true);
console.log('session shared validation PASS: single request, expiry/storage/network distinctions, newer success and session isolation');
// Reverse arrival order shares the foreground request as well; failure allows a fresh manual retry.
f=fixture();let complete,rejectFlight,requestCount=0;
f.c.fetchAdminRecoverableResponse=()=>{requestCount++;return new Promise((r,j)=>{complete=r;rejectFlight=j})};
const fg=f.c.ensureAdminSessionReady(true),bg=f.c.validateExistingAdminSession('fixture',{background:true});
assert.equal(requestCount,1);rejectFlight(Error('NETWORK_ERROR'));await Promise.all([fg,bg]);
const retried=f.c.ensureAdminSessionReady(true);assert.equal(requestCount,2);complete({ok:true,json:async()=>({ok:true,allowed:true,action:'adminValidateSession'})});assert.equal(await retried,true);
// Different session tokens cannot share validation or erase the newer flight during cleanup.
f=fixture();const flights=[];f.c.fetchAdminRecoverableResponse=()=>new Promise(r=>flights.push(r));
const firstToken=f.c.validateExistingAdminSession('fixture',{background:true});f.storage.set('token','new');
const nextToken=f.c.validateExistingAdminSession('new',{background:true});assert.equal(flights.length,2);
flights[0]({ok:true,json:async()=>({ok:true,allowed:true,action:'adminValidateSession'})});assert.equal(await firstToken,false);
const joined=f.c.validateExistingAdminSession('new',{background:true});assert.equal(flights.length,2);
flights[1]({ok:true,json:async()=>({ok:true,allowed:true,action:'adminValidateSession'})});assert.equal(await nextToken,true);assert.equal(await joined,true);
console.log('session flight lifecycle PASS: reverse sharing, manual retry, separate tokens and old cleanup');
