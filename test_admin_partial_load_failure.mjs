import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(process.env.CANDIDATE_HTML || new URL('./index.html',import.meta.url),'utf8');
const part=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
const startup=part('        const isAdminAllowed = await initAdminAuth(', '      // ==========================================');
const status={innerText:'',className:''};let catalog=0,delay=0,rendered=[];
const c={Date,ADMIN_INITIAL_LOAD_SLOW_MS:12000,adminAuthBlocksDataLoad:false,adminInitialOrdersReady:false,adminProductsReady:false,adminProductCatalogLoadPromise:null,
 window:{setTimeout:()=>1,clearTimeout(){}},document:{getElementById:()=>status,querySelectorAll:()=>[],querySelector:()=>null},
 initAdminAuth:async()=>true,initializeAdminSessionRecovery(){},fetchAdminOrderBootstrapFromGas:async()=>({orders:[{orderNo:'PARTIAL'}]}),
 renderAdminOrders:o=>{rendered.push(o);return true;},updateStatsCounters(){},handleBatchCheckChange(){},updateNotifyButton(){},applyReadOnlyModeToRealOrders(){},markAdminSessionVerified(){},recordAdminReadBreadcrumb(){},hideAdminAuthOverlay(){},showAdminAuthOverlay(){},restoreAdminTab(){},setAdminStatusPanelVisible(){},
 fetchAdminProductCatalogFromGas:async()=>{catalog++;return [];},fetchInitialAdminOrdersWithRecovery:async()=>null,scheduleAdminLiveOrderSync:ms=>delay=ms};
vm.createContext(c);await vm.runInContext('(async()=>{'+startup.slice(0,startup.lastIndexOf('      });'))+'})()',c);
assert.equal(catalog,0,'catalog remains lazy and cannot contend with failed initial page recovery');
assert.equal(rendered.length,0,'failed formal page must not render or unlock a bootstrap preview');assert.equal(c.adminInitialOrdersReady,false);
assert.equal(c.adminInitialOrderLoadSettled,true);assert.equal(delay,15000);
const m={};vm.createContext(m);vm.runInContext(part('      function isAdminNetworkRecoveryError','      function getAdminCreatePayloadFingerprint'),m);
assert.match(m.getAdminOrderReadFailureMessage(Error('HTTP_404')),/404/);
assert.match(m.getAdminOrderReadFailureMessage(Error('GAS_TIMEOUT')),/回覆逾時/);
assert.match(m.getAdminOrderReadFailureMessage(Error('ADMIN_NETWORK_OFFLINE')),/已斷線/);
assert.ok(!m.getAdminOrderReadFailureMessage(Error('GAS_NON_JSON_RESPONSE')).includes('網路連線不穩'));
assert.equal(m.isAdminNetworkRecoveryError(Error('HTTP_404')),true);
let overlays=0,reads=0,applied=0,editing=false;
const r={window:{},adminInitialOrdersReady:false,adminOrderMutationRevision:0,adminOrderViewHasDraft:()=>editing,queueAdminCompleteWorkspaceLoad(){},adminAuthBlocksDataLoad:false,adminOverlayRefreshPending:false,adminOrderQueryRequestId:0,adminLastOrderReadFailureMessage:'訂單服務回覆錯誤（404）',
 setAdminRefreshState(){},showAdminAuthOverlay(){overlays++;},fetchAdminOrdersFromGas:async opts=>{reads++;assert.equal(opts.silent,true);return null;},
 document:{visibilityState:'visible',getElementById:()=>status,querySelector:()=>null},hasBlockingAdminRefreshWork:()=>editing,setAdminStatusPanelVisible(){},
 renderAdminOrders(){applied++;return true;},updateStatsCounters(){},syncAdminSearchMatches(){},applyCurrentFilter(){},handleBatchCheckChange(){},updateNotifyButton(){},applyReadOnlyModeToRealOrders(){},updateAdminRefreshMeta(){},clearAdminNetworkRecoveryPending(){},hideAdminAuthOverlay(){},reconcilePendingAdminShipment:async()=>{}};
vm.createContext(r);vm.runInContext(part('      async function refreshAdminOrdersFromOverlay','      window.refreshAdminOrdersFromOverlay'),r);
assert.equal(await r.refreshAdminOrdersFromOverlay({background:true,networkRecovery:true}),false);assert.equal(overlays,0);assert.equal(applied,0);assert.match(status.innerText,/404/);
r.fetchAdminOrdersFromGas=async()=>[];editing=true;
assert.equal(await r.refreshAdminOrdersFromOverlay({background:true}),false);assert.equal(applied,0,'do not replace draft started during read');
editing=false;assert.equal(await r.refreshAdminOrdersFromOverlay({background:true}),true);assert.equal(applied,1);assert.equal(status.innerText,'');assert.equal(r.adminInitialOrdersReady,true);
console.log('PASS formal-page startup failure: lazy catalog, no preview unlock, preserved cards, recovery scheduling, precise error text, quiet recovery, draft guard, successful recovery clears banner');
