import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
const a=html.indexOf('      function switchAdminTab('),b=html.indexOf('      function setShippingBatchManagementFeedback(',a);
assert.ok(a>0&&b>a);
const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{style:{},hidden:false,attrs:{},value:'preserved',setAttribute(k,v){this.attrs[k]=v;}});return nodes.get(id);};
const stored=new Map();let reads=0;
const buttons=['orders','shippingPrint','products'].map(tab=>({dataset:{tab},active:false,classList:{toggle(_,v){buttons.find(b=>b.dataset.tab===tab).active=v;}}}));
const c={document:{getElementById:node,querySelectorAll:()=>buttons},sessionStorage:{setItem:(k,v)=>stored.set(k,v),getItem:k=>stored.get(k)},ADMIN_ACTIVE_TAB_KEY:'tab',GROUP_ORDERS_ENABLED:true,
 ADMIN_TAB_NAMES:new Set(['orders','groupOrders','shippingPrint','products','systemRecords']),adminProductsReady:true,adminShippingBatchesLoaded:true,adminGroupOrdersLoaded:true,
 fetchAdminProductCatalogFromGas:()=>reads++,renderProductManagement:()=>reads++,fetchAdminShippingBatchesFromGas:()=>reads++,renderShippingManifest:()=>reads++,loadCompleteShippingManifestOrders:()=>reads++,fetchAdminGroupOrders:()=>reads++};
vm.createContext(c);vm.runInContext(html.slice(a,b),c);
c.switchAdminTab('systemRecords');
assert.equal(reads,0,'Opening records must not read orders/products or shipping');
assert.equal(node('system-records-page-section').style.display,'');
for(const id of ['order-page-section','group-order-page-section','shipping-print-page-section','product-page-section'])assert.equal(node(id).style.display,'none');
assert.equal(node('systemRecordsTabButton').attrs['aria-selected'],'true');
assert.equal(buttons[0].active,true,'records belongs to order workspace');
assert.equal(stored.get('tab'),'systemRecords');
c.restoreAdminTab();assert.equal(node('system-records-page-section').style.display,'');assert.equal(reads,0);
c.switchAdminTab('orders');assert.equal(node('system-records-page-section').style.display,'none');assert.equal(node('order-page-section').style.display,'');
c.switchAdminTab('shippingPrint');assert.equal(node('system-records-page-section').style.display,'none');assert.equal(node('order-workspace-section').style.display,'none');assert.equal(reads,2);
c.GROUP_ORDERS_ENABLED=false;c.switchAdminTab('systemRecords');assert.equal(node('order-workspace-tabs').hidden,false);assert.equal(node('groupOrdersTabButton').hidden,true);assert.equal(node('system-records-page-section').style.display,'');
console.log('PASS records navigation, workspace selection, persisted tab, no unrelated reads, shipping isolation, groups-disabled availability');
