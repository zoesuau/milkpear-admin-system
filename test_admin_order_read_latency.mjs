import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const start = html.indexOf('      let adminManualOrderRefreshPending');
const source = html.slice(start < 0 ? html.indexOf('      async function refreshAdminOrdersManually') : start, html.indexOf('      function reloadAdminPage'));
function fixture() {
  const log = []; let blocked = false, resolve;
  const orders = Object.assign([{orderNo:'fixture'}], {adminReadMeta:{snapshotLiveVersion:'v2'}});
  const c = {Date, adminAuthBlocksDataLoad:false, adminInitialOrdersReady:true, adminLastOrderReadFailureMessage:'', adminOrderQueryRequestId:0, adminOrderReadMeta:{snapshotLiveVersion:'v1'},
    hasBlockingAdminRefreshWork:()=>blocked, alert:()=>log.push('alert'), document:{querySelector:()=>blocked?{}:null,getElementById:()=>null},
    syncLatestAdminOrdersToSnapshot:async()=>{log.push('compact');return {version:'v2'}},
    fetchAdminOrdersFromGas:opts=>{log.push(['read',opts]);return new Promise(r=>resolve=r)},
    setAdminRefreshState:(busy,msg)=>log.push([busy,msg]), renderAdminOrders:()=>{log.push('render');return true},
    updateStatsCounters(){},syncAdminSearchMatches(){},applyCurrentFilter(){},handleBatchCheckChange(){},updateNotifyButton(){},applyReadOnlyModeToRealOrders(){},updateAdminRefreshMeta:()=>log.push('updated'),clearAdminNetworkRecoveryPending(){},setAdminStatusPanelVisible(){},hideAdminAuthOverlay(){}};
  vm.createContext(c); vm.runInContext(source,c);
  return {c,log,orders,blocked:v=>blocked=v,finish:()=>resolve(orders),resolve:v=>resolve(v)};
}
let f=fixture(), p=f.c.refreshAdminOrdersManually(); await new Promise(setImmediate);
assert.equal(f.log.includes('compact'),false,'manual read must not wait for a separate compaction request');
assert.equal(f.log.filter(x=>Array.isArray(x)&&x[0]==='read').length,1);
const opts=f.log.find(x=>Array.isArray(x)&&x[0]==='read')[1];
assert.equal(opts.forceReload,undefined,'reuse checksummed chunks');assert.equal(opts.networkRecovery,true,'one bounded read attempt');
await f.c.refreshAdminOrdersManually();assert.equal(f.log.filter(x=>Array.isArray(x)&&x[0]==='read').length,1,'double click shares the operation');
f.finish();await p;assert.ok(f.log.includes('render'));assert.ok(f.log.includes('updated'));
for(const mode of ['editing','superseded','expired','stale','failure']) {
 f=fixture();p=f.c.refreshAdminOrdersManually();
 if(mode==='editing')f.blocked(true);
 if(mode==='superseded')f.c.adminOrderQueryRequestId++;
 if(mode==='expired')f.c.adminAuthBlocksDataLoad=true;
 if(mode==='stale')f.orders.adminReadMeta.snapshotStale=true;
 f.resolve(mode==='failure'?null:f.orders);await p;
 assert.equal(f.log.includes('render'),false,mode+' must preserve the existing screen');
 assert.equal(f.log.includes('updated'),false,mode+' must not claim fresh data');
}
f=fixture();f.c.adminOrderReadMeta.snapshotLiveVersion='v2';p=f.c.refreshAdminOrdersManually();f.finish();await p;
assert.equal(f.log.includes('render'),false,'unchanged live version preserves expanded cards');assert.ok(f.log.includes('updated'));
f=fixture();f.c.adminInitialOrdersReady=false;p=f.c.refreshAdminOrdersManually();f.finish();await p;assert.equal(f.c.adminInitialOrdersReady,true);
f=fixture();p=f.c.refreshAdminOrdersManually();f.resolve(null);await p;p=f.c.refreshAdminOrdersManually();f.finish();await p;assert.ok(f.log.includes('updated'),'failed request permits later retry');
console.log('PASS one-read manual refresh, bounded wait, repeat clicks, drafts, stale/auth/superseded results, unchanged DOM, partial recovery and retry');
