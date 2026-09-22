import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
const part=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
// Exercise the actual initialization tail: Orders gates the UI; unrelated catalog
// and print requests must not contend before the first usable order view.
const startup=part('        const isAdminAllowed = await initAdminAuth(', '      // ==========================================');
const runSource='async function start(){'+startup.slice(0,startup.lastIndexOf('      });'))+'}';
let orderResolve,events=[];
const c={Date,ADMIN_INITIAL_LOAD_SLOW_MS:12000,adminAuthBlocksDataLoad:false,adminProductsReady:true,adminProductCatalogLoadPromise:null,document:{querySelector:()=>({setAttribute(){}}),getElementById:()=>null},window:{setTimeout,clearTimeout},
 initAdminAuth:async opts=>{assert.equal(opts.validateWithOrders,true);events.push('auth-deferred');return true},initializeAdminSessionRecovery(){},
 fetchAdminOrderBootstrapFromGas:async()=>null,
 fetchInitialAdminOrdersWithRecovery:()=>new Promise(r=>orderResolve=r),fetchAdminOrdersFromGas:()=>{throw Error('startup must use bounded initial recovery')},renderAdminOrders:()=>{events.push('render');return true},updateStatsCounters(){},handleBatchCheckChange(){},updateNotifyButton(){},applyReadOnlyModeToRealOrders(){},markAdminSessionVerified(){},recordAdminReadBreadcrumb(){},showAdminAuthOverlay(){},hideAdminAuthOverlay:()=>events.push('usable'),restoreAdminTab:()=>events.push('restore-tab'),reconcilePendingAdminShipment:async()=>events.push('readback'),loadPendingAdminCreateRequest:()=>null,readAdminCreateDraft:()=>null,recoverPendingAdminCreateOrderOnLoad:async()=>{},fetchAdminProductCatalogFromGas:()=>{throw Error('catalog must not run on the initial orders critical path')}};
vm.createContext(c);vm.runInContext(runSource,c);const pending=c.start();await new Promise(setImmediate);assert.deepEqual(events,['auth-deferred']);orderResolve([{orderNo:'fixture'}]);await pending;assert.deepEqual(events,['auth-deferred','render','usable','restore-tab','readback']);
// Concurrent ordinary reads share one request; an explicit required-version read
// waits then issues a separate read, so it cannot reuse an obsolete response.
const loadSource=part('      let adminOrderSnapshotReadPromise','      async function performAdminOrderSnapshotFetchOnce');
let releases=[],calls=[];const d={performAdminOrderSnapshotFetchOnce:opts=>{calls.push(opts);return new Promise(r=>releases.push(r))}};vm.createContext(d);vm.runInContext(loadSource,d);
const one=d.performAdminOrderSnapshotFetch(),two=d.performAdminOrderSnapshotFetch(),fresh=d.performAdminOrderSnapshotFetch({requiredVersion:'new'});assert.equal(calls.length,1);releases[0](['old']);assert.deepEqual(await one,['old']);assert.deepEqual(await two,['old']);await new Promise(setImmediate);assert.equal(calls.length,2);assert.equal(calls[1].requiredVersion,'new');releases[1](['new']);assert.deepEqual(await fresh,['new']);
// Timing evidence is strictly allowlisted and excludes arbitrary server fields.
let saved;const m={ADMIN_READ_OBSERVABILITY_LEVEL:'DEBUG',ADMIN_READ_ERROR_BREADCRUMB_EVENTS:new Set(),ADMIN_READ_FAILURE_STAGES:new Set(),ADMIN_READ_BREADCRUMB_REQUEST_LIMIT:20,ADMIN_READ_BREADCRUMB_STORAGE_KEY:'fixture',localStorage:{getItem:()=>null,setItem:(k,v)=>saved=v},console:{log(){},error(){}}};vm.createContext(m);vm.runInContext(part('      function normalizeAdminReadErrorCode','      function classifyAdminReadFrontendError'),m);m.recordAdminReadBreadcrumb('FETCH_SUCCESS',{requestId:'test',elapsedMs:10,timing:{sessionMs:1,cacheHit:true,serverMs:3,transportMs:8,decodeMs:2,attempts:1,token:'do-not-store'}});assert.equal(JSON.parse(saved)[0].timing.serverMs,3);assert.ok(!saved.includes('do-not-store'));
console.log('load pipeline: PASS authenticated first view, no catalog contention, one render, shared reads, required version freshness, sanitized timings');
// Deferred catalog must still be loaded when dependent tabs are first used.
let catalogModes=[],groups=0,manifests=0;
const tabs={ADMIN_TAB_NAMES:new Set(['orders','products','shippingPrint','groupOrders']),GROUP_ORDERS_ENABLED:true,ADMIN_ACTIVE_TAB_KEY:'tab',
 sessionStorage:{setItem(){}},document:{getElementById:()=>({style:{},setAttribute(){}}),querySelectorAll:()=>[]},adminProductsReady:false,adminShippingBatchesLoaded:true,adminGroupOrdersLoaded:false,
 fetchAdminProductCatalogFromGas:opts=>catalogModes.push(opts?.includeOperations ?? true),renderProductManagement(){},renderShippingManifest(){},loadCompleteShippingManifestOrders:()=>manifests++,fetchAdminGroupOrders:()=>groups++};
vm.createContext(tabs);vm.runInContext(part('      function switchAdminTab','      function restoreAdminTab'),tabs);
tabs.switchAdminTab('orders');assert.equal(catalogModes.length,0);
tabs.switchAdminTab('shippingPrint');tabs.switchAdminTab('groupOrders');tabs.switchAdminTab('products');
assert.deepEqual(catalogModes,[false,false,true]);assert.equal(groups,1);assert.equal(manifests,1);
console.log('dependent tabs: PASS print and group retain lazy catalog loading; product management retains full stats');
