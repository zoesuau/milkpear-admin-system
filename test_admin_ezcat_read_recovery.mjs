import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(process.env.ADMIN_CANDIDATE_HTML || new URL('./index.html',import.meta.url),'utf8');
const between=(a,b)=>{const i=html.indexOf(a),j=html.indexOf(b,i);assert.ok(i>=0&&j>i,`missing ${a}`);return html.slice(i,j)};
const helper=between(html.includes('      function fetchAdminEzcatCandidates(') ? '      function fetchAdminEzcatCandidates(' : '      async function loadCompleteShippingManifestOrders(', '      function parseShippingManifestItems(');
const transport=between('      async function fetchWithTimeout(', '      async function fetchAdminRecoverableResponse(');
const modal=between('      async function openEzcatExportModal(', '      function setEzcatExportView(');
const payload={ok:true,action:'adminReadEzcatExportCandidates',candidates:[{orderNo:'fixture'}],recentBatches:[]};
function fixture(){
 const calls=[],timers=new Map(),nodes=new Map();let token='fixture-token',range={startDate:'2026-09-20',endDate:'2026-09-20'},id=0;
 const node=()=>({innerText:'',classList:{add(){},remove(){}},style:{}});
 const c={Map,JSON,Error,AbortController,console:{error(){}},ADMIN_EZCAT_READ_TIMEOUT_MS:30000,adminEzcatCandidateRequests:new Map(),GAS_ORDERS_API_URL:'mock',
 createAdminDiagnosticRequestId:()=>`adminReadEzcatExportCandidates_${String(++id).padStart(32,'0')}`,
 window:{setTimeout:(fn,ms)=>{assert.equal(ms,30000);timers.set(id,fn);return id},clearTimeout:i=>timers.delete(i)},
 fetch:(_url,options)=>new Promise((resolve,reject)=>calls.push({options,resolve,reject})),
 shippingManifestLoadRequestId:0,shippingManifestDateMode:'today',shippingManifestRemoteRangeKey:'',shippingManifestRemoteCandidates:[],shippingManifestRemoteBatches:[],
 ezcatExportLoadRequestId:0,ezcatExportSubmitting:false,ezcatExportSelections:new Map(),
 ADMIN_LINE_SESSION_TOKEN_KEY:'token',sessionStorage:{getItem:()=>token},getShippingManifestDateRange:()=>range,
 adminWorkflowIsValidDate:()=>true,renderShippingManifest(){},mapShippingManifestRemoteOrder:x=>x,
 document:{body:node(),getElementById:id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id)}},
 setEzcatExportFeedback(){},formatShippingManifestDate:x=>x,setEzcatExportView(){},updateEzcatExportSummary(){},showAdminAuthOverlay(){},
 applyEzcatExportCandidateData:x=>{c.applied=x},
 };
 vm.createContext(c);vm.runInContext(transport+helper+modal,c);
 return {c,calls,timers,setToken:x=>token=x,setRange:x=>range=x,reply:(n,p=payload,status=200)=>calls[n].resolve({ok:status===200,status,text:async()=>typeof p==='string'?p:JSON.stringify(p)})};
}
let shared=fixture();
const manifest=shared.c.loadCompleteShippingManifestOrders('manifest_tab'),modalRead=shared.c.openEzcatExportModal();
assert.equal(shared.calls.length,1,'manifest and export modal must share the same in-flight range request');
shared.reply(0);await Promise.all([manifest,modalRead]);
let f=fixture();let a=f.c.fetchAdminEzcatCandidates('a','b','token','manifest_tab'),b=f.c.fetchAdminEzcatCandidates('a','b','token','export_modal');assert.equal(a,b);assert.equal(f.calls.length,1);f.reply(0);await a;assert.equal(f.c.adminEzcatCandidateRequests.size,0);
let body=JSON.parse(f.calls[0].options.body);assert.match(body.requestId,/^adminReadEzcatExportCandidates_/);assert.equal(body.requestSource,'manifest_tab_attempt1');
f=fixture();a=f.c.fetchAdminEzcatCandidates('a','b','one');b=f.c.fetchAdminEzcatCandidates('a','c','one');let d=f.c.fetchAdminEzcatCandidates('a','b','two');assert.equal(f.calls.length,3);f.calls.forEach((_,i)=>f.reply(i));await Promise.all([a,b,d]);
for(const [raw,status,code] of [['<html>404</html>',404,'HTTP_404'],['invalid',200,'GAS_NON_JSON_RESPONSE'],[{ok:false,errorCode:'ADMIN_SESSION_REQUIRED'},200,'ADMIN_SESSION_REQUIRED']]){
 f=fixture();a=f.c.fetchAdminEzcatCandidates('a','b','token');f.reply(0,raw,status);await assert.rejects(a,new RegExp(code));assert.equal(f.calls.length,1);assert.equal(f.c.adminEzcatCandidateRequests.size,0);
 b=f.c.fetchAdminEzcatCandidates('a','b','token');assert.equal(f.calls.length,2);f.reply(1);await b;
}
for(const phase of ['headers','body']){
 f=fixture();a=f.c.fetchAdminEzcatCandidates('a','b','token');const rejection=assert.rejects(a,{name:'AbortError'});
 if(phase==='body'){f.calls[0].resolve({ok:true,status:200,text:()=>new Promise(()=>{})});await new Promise(setImmediate)}
 [...f.timers.values()][0]();await rejection;assert.equal(f.calls[0].options.signal.aborted,true);assert.equal(f.calls.length,1);assert.equal(f.c.adminEzcatCandidateRequests.size,0);
}
// Invalidation after a committed import cannot reuse pre-import data; old cleanup cannot remove new work.
f=fixture();a=f.c.fetchAdminEzcatCandidates('a','b','token');f.c.adminEzcatCandidateRequests.clear();b=f.c.fetchAdminEzcatCandidates('a','b','token');f.reply(0);await a;assert.equal(f.c.adminEzcatCandidateRequests.size,1);f.reply(1);await b;
// The actual manifest and modal callers share one request.
f=fixture();a=f.c.loadCompleteShippingManifestOrders('manifest_tab');b=f.c.openEzcatExportModal();assert.equal(f.calls.length,1);f.reply(0);await Promise.all([a,b]);assert.equal(f.c.applied.length,1);
// Closing a modal prevents its late completion from applying any data.
f=fixture();a=f.c.openEzcatExportModal();f.c.closeEzcatExportModal();f.reply(0);await a;assert.equal(f.c.applied,undefined);
// An invalid/newer range prevents old data from becoming printable.
f=fixture();a=f.c.loadCompleteShippingManifestOrders();f.setRange({startDate:'',endDate:''});await f.c.loadCompleteShippingManifestOrders();f.reply(0);assert.equal(await a,false);assert.equal(f.c.shippingManifestRemoteRangeKey,'');
// Session changes and a newer date selection cannot be overwritten by an old reply.
f=fixture();a=f.c.loadCompleteShippingManifestOrders();f.setToken('new-token');f.reply(0);assert.equal(await a,false);assert.equal(f.c.shippingManifestRemoteRangeKey,'');
f=fixture();a=f.c.loadCompleteShippingManifestOrders();f.setRange({startDate:'2026-09-21',endDate:'2026-09-21'});b=f.c.loadCompleteShippingManifestOrders();f.reply(1);assert.equal(await b,true);f.reply(0);assert.equal(await a,false);assert.equal(f.c.shippingManifestRemoteRangeKey,'2026-09-21|2026-09-21');
f=fixture();a=f.c.openEzcatExportModal();f.c.closeEzcatExportModal();f.setRange({startDate:'2026-09-21',endDate:'2026-09-21'});b=f.c.openEzcatExportModal();f.reply(1,{...payload,candidates:[{orderNo:'new'}]});await b;f.reply(0);await a;assert.equal(f.c.applied[0].orderNo,'new');
console.log('EZcat read PASS: full-body deadline, HTTP classification, no retry, range/session deduplication, shared callers, invalidation and stale UI');
