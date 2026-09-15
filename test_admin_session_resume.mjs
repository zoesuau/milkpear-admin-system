import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
const between=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
const source=between('      let adminSessionVerifiedAt','      async function startAdminAuth')+
 between('      async function validateExistingAdminSession','      function switchAdminTab');
function fixture(){
 let reads=0,checks=0,navigations=0,release;
 const events={},storage=new Map([['token','fixture']]),node={dataset:{},innerText:''};
 const c={Date,URLSearchParams,ADMIN_LINE_SESSION_TOKEN_KEY:'token',ADMIN_LINE_STATE_KEY:'state',ADMIN_AUTH_TIMEOUT_MS:60000,GAS_ORDERS_API_URL:'mock',adminAuthBlocksDataLoad:false,
 document:{visibilityState:'visible',getElementById:()=>node,addEventListener:(n,f)=>events[n]=f},window:{location:{search:''},addEventListener:(n,f)=>events[n]=f},sessionStorage:{getItem:k=>storage.get(k)||null,removeItem:k=>storage.delete(k)},showAdminAuthOverlay(message,retry){c.message=message;if(retry)c.adminAuthBlocksDataLoad=true},hideAdminAuthOverlay(){c.hidden=true},setAdminAuthRetryButtonMode(){},createAdminDiagnosticRequestId:()=> 'fixture',publishAdminAuthDiagnostic(){},reconcilePendingAdminShipment:async()=>{reads++},startAdminAuth:async()=>{navigations++},fetchAdminRecoverableResponse:async()=>{checks++;return {ok:true,json:async()=>({ok:true,action:'adminValidateSession',allowed:true})}}};
 vm.createContext(c);vm.runInContext(source,c);
 return {c,events,storage,node,stats:()=>({checks,reads,navigations})};
}
let f=fixture();assert.equal(await f.c.initAdminAuth({validateWithOrders:true}),true);assert.equal(f.stats().checks,0,'initial protected order read performs validation; no redundant login request');assert.equal(f.c.hidden,undefined,'no usable UI until authenticated data arrives');
f=fixture();vm.runInContext('adminInitialOrdersReady=true',f.c);f.c.markAdminSessionVerified();assert.equal(await f.c.ensureAdminSessionReady(),true);assert.equal(f.stats().checks,0);
f.c.initializeAdminSessionRecovery();f.c.document.visibilityState='hidden';f.events.visibilitychange();assert.equal(f.stats().checks,0);f.c.document.visibilityState='visible';f.events.visibilitychange();await new Promise(setImmediate);assert.equal(f.stats().checks,1);assert.equal(f.stats().reads,1);assert.equal(f.c.hidden,true);
f=fixture();let finish;f.c.fetchAdminRecoverableResponse=()=>new Promise(r=>finish=r);const one=f.c.ensureAdminSessionReady(true),two=f.c.ensureAdminSessionReady(true);assert.equal(f.c.adminAuthBlocksDataLoad,true);finish({ok:true,json:async()=>({ok:true,allowed:true,action:'adminValidateSession'})});assert.equal(await one,true);assert.equal(await two,true);
f=fixture();f.c.fetchAdminRecoverableResponse=async()=>({ok:true,json:async()=>({ok:false,action:'adminValidateSession',error:'ADMIN_SESSION_REQUIRED'})});assert.equal(await f.c.ensureAdminSessionReady(true),false);assert.equal(f.storage.has('token'),false);assert.match(f.c.message,/登入已過期/);assert.equal(f.stats().navigations,0,'resuming an expired form must not automatically navigate away and discard draft');assert.equal(f.c.adminAuthBlocksDataLoad,true);
f=fixture();f.c.fetchAdminRecoverableResponse=async()=>{throw Error('NETWORK_ERROR')};assert.equal(await f.c.ensureAdminSessionReady(true),false);assert.equal(f.storage.get('token'),'fixture');assert.equal(f.node.dataset.retrySession,'true');
console.log('session resume: PASS initial request elimination, protected UI, hidden/resume, single flight, expired draft retention, network distinction');
