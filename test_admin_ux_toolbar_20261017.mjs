import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const path=process.env.ADMIN_CANDIDATE_HTML || new URL('./index.html',import.meta.url);
const html=fs.readFileSync(path,'utf8');
function extract(name){const start=html.indexOf('      function '+name+'(');assert.ok(start>=0,name);const end=html.indexOf('\n      function ',start+10);return html.slice(start,end);}
function manifest({count=0,loading=false,error='',ready=true,query='',pending=false,valid=true}={}){
 const nodes=new Map();const node=id=>{if(!nodes.has(id)){const classes=new Set();nodes.set(id,{innerText:'',innerHTML:'',disabled:false,classList:{add:s=>classes.add(s),remove:s=>classes.delete(s),toggle:(s,v)=>v?classes.add(s):classes.delete(s),contains:s=>classes.has(s)}});}return nodes.get(id);};
 const ctx={document:{getElementById:node},shippingManifestDateMode:pending?'pending':'today',shippingManifestRemoteRangeKey:ready?(pending?'pending':'2026-10-17|2026-10-17'):'',shippingManifestRemoteError:error,shippingManifestRemoteLoading:loading,shippingManifestSearchQuery:query,shippingManifestSenderFilterMode:'all',shippingManifestSenderFilterKey:'',
 getShippingManifestDateRange:()=>({startDate:valid?'2026-10-17':'',endDate:valid?'2026-10-17':''}),adminWorkflowIsValidDate:()=>true,
 syncEzcatPrepareButton(){},getShippingManifestBaseOrdersForRange:()=>Array.from({length:count},()=>({recipientName:'Demo',finalAmount:100})),syncShippingManifestSenderFilterControls(){},applyShippingManifestSenderFilter:x=>x,applyShippingManifestOrdering:x=>x,syncShippingManifestOrderingControls(){},
 buildShippingManifestStats:()=>({totalAmount:100,package120cmTotal:0,package90cmTotal:0}),buildShippingManifestProductSummary:()=>'',formatShippingManifestDate:x=>x,getShippingManifestOrderingSummary:()=>'',getShippingManifestSenderFilterSummary:()=>'',normalizeShippingManifestSearchText:x=>x,formatShippingManifestPrintTime:()=>'',escapeHtml:x=>String(x),getEzcatReadErrorMessage:()=> '讀取失敗',formatAdminMoney:x=>x,
 getShippingManifestNote:()=>'',getShippingManifestSequenceLabel:()=>1,formatMultilineHtml:()=>'',buildShippingTrackingNumberSlotsHtml:()=>''};
 vm.createContext(ctx);vm.runInContext(extract('renderShippingManifest'),ctx);ctx.renderShippingManifest();return {status:node('shippingManifestLoadStatus'),button:node('shippingManifestPrintButton'),empty:node('shippingManifestEmpty')};
}
let r=manifest();assert.equal(r.button.disabled,true);assert.doesNotMatch(r.status.innerHTML,/可以列印/,'Empty result must not claim print readiness');assert.match(r.status.innerHTML,/改選日期/);
for(const args of [{count:1,loading:true},{count:1,error:'FAIL'},{count:1,ready:false},{valid:false}]){r=manifest(args);assert.equal(r.button.disabled,true);assert.doesNotMatch(r.status.innerHTML,/可以列印/);assert.equal(r.status.classList.contains('is-ready'),false);}
r=manifest({count:1});assert.equal(r.button.disabled,false);assert.match(r.status.innerHTML,/可以列印/);assert.equal(r.status.classList.contains('is-ready'),true);
r=manifest({query:'missing'});assert.match(r.status.innerHTML,/清除搜尋/);assert.equal(r.button.disabled,true);
r=manifest({pending:true});assert.match(r.status.innerHTML,/沒有待排/);assert.equal(r.button.disabled,true);
r=manifest({error:'FAIL',ready:false});assert.match(r.empty.innerText,/讀取失敗/);assert.doesNotMatch(r.empty.innerText,/沒有出貨訂單|正在確認/);
console.log('PASS print availability: nonempty, empty, filtered-empty, pending-empty, loading, failed, unsynced, invalid date');

const nodes=new Map();let loads=0,clears=0,draft=false;
const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'seed',focus(){this.focused=true;},querySelector:()=>({}),classList:{remove(){}}});return nodes.get(id);};
const c={document:{getElementById:node},window:{clearTimeout(){clears++;}},adminOrderSearchTimer:1,adminOrderSearchRequestId:0,adminOrderQueryRequestId:0,currentFilterStatus:'已寄出',currentDateFilter:'自訂',currentNotificationFilter:'line',customDateRangeSelectingEnd:true,adminOrderViewHasDraft:()=>draft,loadAdminOrdersForCurrentView:({page})=>{assert.equal(page,1);loads++;},setActiveFilterButton(){}};
vm.createContext(c);vm.runInContext(extract('clearAdminOrderSearch')+extract('resetAdminOrderFilters'),c);
c.clearAdminOrderSearch();assert.equal(node('searchBar').value,'');assert.equal(c.currentFilterStatus,'已寄出');assert.equal(c.currentDateFilter,'自訂');assert.equal(loads,1);assert.equal(node('searchBar').focused,true);
c.resetAdminOrderFilters();for(const key of ['currentFilterStatus','currentDateFilter','currentNotificationFilter'])assert.equal(c[key],'全部');for(const id of ['searchBar','customDateStart','customDateEnd','singleShippingDateInput'])assert.equal(node(id).value,'');assert.equal(c.customDateRangeSelectingEnd,false);assert.equal(loads,2);assert.equal(clears,2);
draft=true;node('searchBar').value='preserved';c.currentDateFilter='自訂';c.clearAdminOrderSearch();c.resetAdminOrderFilters();assert.equal(node('searchBar').value,'preserved');assert.equal(c.currentDateFilter,'自訂');assert.equal(loads,2);assert.equal(clears,2);
console.log('PASS clear search/reset all: preserve other filters, one reload at page 1, cancel debounce, reset date state, preserve active draft');
