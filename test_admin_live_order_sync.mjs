import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
const code=html.slice(html.indexOf('      let adminLiveSyncTimer'),html.indexOf('      function refreshAdminOrdersInBackground'));
assert.ok(code.includes('runAdminLiveOrderSync'));
function fixture(){
  const timers=new Map(),events={},log=[];let timer=0,blocked=false,offline=false,fetches=0;
  const orders=Object.assign([{orderNo:'NEW'}],{adminReadMeta:{snapshotLiveVersion:'v1:pending'}});
  const c={adminResumeNeedsCheck:false,reconcilePendingAdminShipment:async()=>{},console,ADMIN_ORDER_SNAPSHOT_CLIENT_ENABLED:true,adminInitialOrdersReady:true,adminInitialOrderLoadSettled:false,adminNetworkRecoveryPending:"orders",adminAuthBlocksDataLoad:false,adminOrderSnapshotReadPromise:null,adminGroupOrderSubmitting:false,adminAddOrderOpening:false,adminOrderQueryRequestId:1,adminCurrentPage:3,adminOrderReadMeta:{snapshotLiveVersion:'v1:empty'},
    document:{visibilityState:'visible',querySelector:()=>blocked?{}:null,addEventListener:(n,f)=>events[n]=f},window:{setTimeout:(f,ms)=>{timers.set(++timer,{f,ms});return timer},clearTimeout:id=>timers.delete(id),addEventListener:(n,f)=>events[n]=f},adminBrowserIsOffline:()=>offline,hasBlockingAdminRefreshWork:()=>blocked,
    fetchAdminOrdersFromGas:async opts=>{fetches++;assert.equal(opts.liveSync,true);assert.equal(opts.silent,true);return orders},
    renderAdminOrders:o=>{log.push('render');c.adminCurrentPage=1;c.adminOrderReadMeta=o.adminReadMeta;return true},updateStatsCounters(){},applyCurrentFilter(){},syncAdminSearchMatches(){log.push('search')},handleBatchCheckChange(){},updateNotifyButton(){},applyReadOnlyModeToRealOrders(){},updateAdminRefreshMeta:()=>log.push('updated'),setAdminRefreshState:()=>log.push('failure')};
  vm.createContext(c);vm.runInContext(code,c);
  return {c,timers,events,log,orders,blocked:v=>blocked=v,offline:v=>offline=v,fetches:()=>fetches};
}
let f=fixture();f.c.initializeAdminLiveOrderSync();f.c.initializeAdminLiveOrderSync();assert.equal(f.timers.size,1);assert.equal([...f.timers.values()][0].ms,3000);
await f.c.runAdminLiveOrderSync();assert.deepEqual(f.log,['render','search','updated']);assert.equal(f.c.adminCurrentPage,3,'keep current page');
f.log.length=0;await f.c.runAdminLiveOrderSync();assert.deepEqual(f.log,['updated'],'same data does not replace DOM or close details');
for(const mode of ['hidden','offline','editing','auth','loading','initial']){
 f=fixture();if(mode==='hidden')f.c.document.visibilityState='hidden';if(mode==='offline')f.offline(true);if(mode==='editing')f.blocked(true);if(mode==='auth')f.c.adminAuthBlocksDataLoad=true;if(mode==='loading')f.c.adminOrderSnapshotReadPromise=Promise.resolve();if(mode==='initial')f.c.adminInitialOrdersReady=false;
 await f.c.runAdminLiveOrderSync();assert.equal(f.fetches(),0,mode);assert.equal(f.log.length,0,mode);
}
f=fixture();let finish;f.c.fetchAdminOrdersFromGas=()=>new Promise(r=>finish=r);const pending=f.c.runAdminLiveOrderSync();await f.c.runAdminLiveOrderSync();f.blocked(true);finish(f.orders);await pending;assert.equal(f.log.length,0,'do not render if editing starts during I/O');
f=fixture();f.c.fetchAdminOrdersFromGas=async()=>{f.c.adminOrderQueryRequestId++;return f.orders};await f.c.runAdminLiveOrderSync();assert.equal(f.log.length,0,'foreground refresh supersedes background response');
f=fixture();f.c.fetchAdminOrdersFromGas=async()=>null;await f.c.runAdminLiveOrderSync();assert.deepEqual(f.log,['failure']);assert.equal([...f.timers.values()].at(-1).ms,6000);await f.c.runAdminLiveOrderSync();assert.equal([...f.timers.values()].at(-1).ms,12000);
f=fixture();f.c.fetchAdminOrdersFromGas=async()=>Object.assign([],{adminReadMeta:{snapshotStale:true}});await f.c.runAdminLiveOrderSync();assert.deepEqual(f.log,['failure'],'stale Drive fallback must not replace live visible orders');
f=fixture();f.c.initializeAdminLiveOrderSync();f.c.document.visibilityState='hidden';f.events.visibilitychange();assert.equal(f.timers.size,0);f.c.document.visibilityState='visible';f.events.visibilitychange();assert.equal([...f.timers.values()][0].ms,0);
assert.match(code,/admin-workflow-save:not\(:disabled\)/);assert.match(code,/admin-note-editor\[data-open="true"\]/);
console.log('PASS live polling: seconds cadence, single flight, unchanged DOM, paging, hidden/offline/auth/edit guards, in-flight edits, superseded reads and failure backoff');
f=fixture();f.c.adminInitialOrdersReady=false;let recoveryCalls=0;
f.c.refreshAdminOrdersFromOverlay=async opts=>{recoveryCalls++;assert.equal(opts.background,true);assert.equal(opts.networkRecovery,true);return false;};
await f.c.runAdminLiveOrderSync();assert.equal(recoveryCalls,0,'do not overlap initial startup');
f.c.adminInitialOrderLoadSettled=true;await f.c.runAdminLiveOrderSync();assert.equal(recoveryCalls,1);assert.equal([...f.timers.values()].at(-1).ms,6000);
f.offline(true);await f.c.runAdminLiveOrderSync();assert.equal(recoveryCalls,1,'pause partial recovery offline');f.offline(false);
f.c.refreshAdminOrdersFromOverlay=async()=>{recoveryCalls++;f.c.adminInitialOrdersReady=true;return true;};
await f.c.runAdminLiveOrderSync();assert.equal(f.c.adminInitialOrdersReady,true);assert.equal([...f.timers.values()].at(-1).ms,3000);
console.log('PASS partial-load recovery joins existing single-flight poll and respects startup/offline guards');

// Publication changes are an explicit completed read, not an unknown mutation.
// Exercise the real consumer to verify exactly one sequential fresh-base retry.
for (const succeeds of [true,false]) {
  const requests=[];
  const c={Date,console,GAS_ORDERS_API_URL:'fixture',ADMIN_LINE_SESSION_TOKEN_KEY:'token',ADMIN_DISPLAY_NAME_KEY:'name',ADMIN_READ_ORDERS_TIMEOUT_MS:20000,ADMIN_ORDER_SNAPSHOT_ATTEMPT_TIMEOUT_MS:20000,adminOrderSnapshotVersion:'v1',adminOrderSnapshotManifest:[],
    document:{getElementById:()=>null},sessionStorage:{getItem:()=> 'fixture',setItem(){},removeItem(){}},createAdminDiagnosticRequestId:()=> 'read',recordAdminReadBreadcrumb(){},getAdminOrderSnapshotKnownChunks:()=>[],markAdminSessionVerified(){},clearAdminNetworkRecoveryPending(){},setAdminStatusPanelVisible(){},updateAdminRefreshMeta(){},
    fetchAdminRecoverableResponse:async(_,options)=>{requests.push(JSON.parse(options.body));return {ok:true,json:async()=>requests.length===1||!succeeds?{ok:false,error:'ADMIN_ORDER_SNAPSHOT_VERSION_NOT_READY'}:{ok:true,action:'adminReadOrderSnapshot',version:'v2'}}},
    mergeAdminOrderSnapshotPayload:async()=>[{orderNo:'NEW'}],classifyAdminReadFrontendError:()=>({event:'BACKEND_ERROR'}),normalizeAdminReadErrorCode:x=>x,isAdminNetworkRecoveryError:()=>false,getAdminOrderReadFailureMessage:()=> 'retry',showAdminAuthOverlay(){}};
  vm.createContext(c);vm.runInContext(html.slice(html.indexOf('      let adminOrderSnapshotReadPromise'),html.indexOf('      async function fetchAdminOrdersFromGas')),c);
  const result=await c.performAdminOrderSnapshotFetch({silent:true,liveSync:true});
  assert.equal(requests.length,2);assert.equal(requests[0].knownVersion,'v1');assert.equal(requests[1].knownVersion,'');assert.deepEqual(requests[1].knownChunks,[]);
  if(succeeds)assert.equal(result[0].orderNo,'NEW');else assert.equal(result,null);
}
console.log('PASS publication-race read retry is fresh, sequential and bounded to two reads');

f=fixture();let reconciled=0;f.c.reconcilePendingAdminShipment=async()=>{reconciled++};
f.c.adminResumeNeedsCheck=true;await f.c.runAdminLiveOrderSync();assert.equal(reconciled,1,'successful resumed order read retains pending shipment readback');
f.c.adminResumeNeedsCheck=false;await f.c.runAdminLiveOrderSync();assert.equal(reconciled,1,'ordinary polling must not repeatedly query shipment results');
