import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
const root='.';
const script=fs.readFileSync(root+'/admin-direct-response.js','utf8');
const html=fs.readFileSync(root+'/index.html','utf8');
const begin=html.indexOf('      async function fetchAdminRecoverableResponse(');
const end=html.indexOf('      function createAdminRequestKey(',begin);
assert.ok(begin>=0&&end>begin);
const ctx={AbortController,URLSearchParams,navigator:{onLine:true},Date,
  GAS_ORDERS_API_URL:'https://fixture.invalid/gas',ADMIN_ORDER_SNAPSHOT_ATTEMPT_TIMEOUT_MS:20000,
  window:{setTimeout,clearTimeout,ORDER_SYSTEM_CONFIG:{customerId:'sanheyuan',environment:'production',
    features:{adminDirectResponse:true},adminDirectResponseUrl:'https://sanheyuan-admin-response.zoe-quokka.workers.dev/request'}}};
let calls=[]; let fixture='success';
ctx.fetch=async(url,options)=>{
  calls.push({url,options}); const action=JSON.parse(options.body).action;
  assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');
  if(fixture==='network') throw Error('private transport failure');
  if(fixture==='timeout') return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(Object.assign(Error('aborted'),{name:'AbortError'}))));
  if(fixture==='body-timeout') return {ok:true,status:200,headers:new Headers(),text:()=>new Promise(()=>{})};
  return new Response(JSON.stringify(fixture==='malformed' ? {ok:true,action:'wrong'} : fixture==='denied' ?
    {ok:false,action,error:'ADMIN_SESSION_REQUIRED'} : {ok:true,action,unchanged:true}));
};
vm.createContext(ctx);vm.runInContext(script+'\n'+html.slice(begin,end),ctx);
for(fixture of ['success','denied','malformed','network','timeout','body-timeout']){
  calls=[];
  const job=ctx.fetchAdminRecoverableResponse(ctx.GAS_ORDERS_API_URL,{method:'POST',body:JSON.stringify({action:'adminReadOrderSnapshot',adminSessionToken:'ISOLATED_FAKE_TOKEN'})},fixture.includes('timeout')?25:1000,{deliveryRecovery:true,maxAttempts:3});
  if(fixture==='success') assert.equal((await (await job).json()).unchanged,true);
  else if(fixture==='denied') assert.equal((await (await job).json()).error,'ADMIN_SESSION_REQUIRED');
  else await assert.rejects(job);
  assert.equal(calls.length,1,fixture+' must not trigger the old recovery race');
  assert.equal(calls[0].url,'https://sanheyuan-admin-response.zoe-quokka.workers.dev/request');
}
assert.equal(ctx.window.AdminDirectResponse.enabledFor('adminCreateOrder'),false);
assert.equal(ctx.window.AdminDirectResponse.enabledFor('adminExecuteOrderMutation'),false);
const saved=ctx.window.AdminDirectResponse;
delete ctx.window.AdminDirectResponse; calls=[];
await assert.rejects(ctx.fetchAdminRecoverableResponse(ctx.GAS_ORDERS_API_URL,{method:'POST',body:JSON.stringify({action:'adminReadOrderSnapshot'})},1000),/DIRECT_RESPONSE_UNAVAILABLE/);
assert.equal(calls.length,0,'missing module must fail closed rather than silently restoring the broken Google path');
ctx.window.AdminDirectResponse=saved;
// Regression fixture from the recorded Google 302 -> 302 back to /exec -> unsupported action.
// Run the exact c98ae1a transport against the terminal payload, then the candidate against
// the same successfully computed result delivered on the primary Worker channel.
const baselineHtml=execFileSync('git',['show','c98ae1ab8c4255f960e4160fdafed3a6349ca27e:index.html'],{encoding:'utf8'});
const baselineFunction=baselineHtml.slice(baselineHtml.indexOf('      async function fetchAdminRecoverableResponse('),baselineHtml.indexOf('      function createAdminRequestKey('));
const legacy={...ctx,window:{setTimeout,clearTimeout},fetch:async()=>new Response(JSON.stringify({ok:false,error:'不支援的 action'}))};
vm.createContext(legacy);vm.runInContext(baselineFunction,legacy);
const options={method:'POST',body:JSON.stringify({action:'adminReadOrderSnapshot',adminSessionToken:'ISOLATED_FAKE_TOKEN'})};
await assert.rejects(legacy.fetchAdminRecoverableResponse(ctx.GAS_ORDERS_API_URL,options,1000,{maxAttempts:1}),/GAS_AUTH_RESPONSE_INVALID/);
fixture='success';calls=[];
assert.equal((await (await ctx.fetchAdminRecoverableResponse(ctx.GAS_ORDERS_API_URL,options,1000,{maxAttempts:1})).json()).unchanged,true);
assert.equal(calls.length,1);
console.log(JSON.stringify({suite:'actual frontend direct branch',passed:true,cases:['single-primary','no-fallback','no-rescue','no-retry','denial-preserved','contract-validated','body-timeout','mutations-excluded'],productionRequests:0}));
