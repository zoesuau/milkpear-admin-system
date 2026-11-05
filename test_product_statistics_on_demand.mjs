import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import { test } from 'node:test';

const source = process.env.PRODUCT_STATS_TEST_BASE === 'HEAD'
  ? execFileSync('git', ['show','HEAD:index.html'], {cwd:new URL('.',import.meta.url),encoding:'utf8',maxBuffer:4*1024*1024})
  : readFileSync(new URL('./index.html',import.meta.url),'utf8');
function part(a,b) {
  const start=source.indexOf(a), end=source.indexOf(b,start+1);
  assert.ok(start>=0 && end>start,a);
  return source.slice(start,end);
}
const functions = part('      let adminProductCatalog =','      let adminSiteSettings')+
  part('      async function fetchAdminProductCatalogFromGas','      function renderAdminOrders')+
  part('      function getProductOperationsModalContext','      function getProductOperationSourceLabel')+
  part('      function renderProductOperationsModal','      function renderSharedGradeVariantFields');
function fixture() {
  const nodes=new Map(), calls=[], pending=[];
  const node=id=>{
    if(!nodes.has(id)) nodes.set(id,{classList:{toggle(){},add(){},remove(){}},setAttribute(){},textContent:'',innerHTML:''});
    return nodes.get(id);
  };
  const product={id:'p',code:'A',price:100,stock:5,status:'上架'};
  const summary={bookedQty:3,shippedQty:1,bookedOrders:[],shippedOrders:[]};
  const c={
    document:{getElementById:node,querySelector:()=>null,querySelectorAll:()=>[]},console:{error(){}},
    storageToken:'A',sessionStorage:{getItem:()=>c.storageToken,removeItem:()=>{c.storageToken=null;}},
    adminProductCatalogLoadPromise:null,productManagementSaveInFlight:false,adminSiteSettings:{},
    adminOrderMutationRevision:0,adminOrderReadMeta:{snapshotLiveVersion:'orders-v1'},adminOrderSnapshotVersion:'orders-v1',adminGroupOrders:[],
    adminProductOperationsModalCode:'',adminProductOperationsModalMode:'booked',adminProductsReady:true,
    GAS_ORDERS_API_URL:'fixture',ADMIN_LINE_SESSION_TOKEN_KEY:'session',ADMIN_READ_PRODUCT_CATALOG_TIMEOUT_MS:10000,
    setAdminProductCatalogState(ready){c.adminProductsReady=ready;},markAdminSessionVerified(){},
    renderProductManagement(){c.catalogRenders++;},catalogRenders:0,renderShippingManifest(){},
    refreshNewOrderProductOptions(){c.refreshedOptions++;},refreshedOptions:0,updateNewOrderAmountPreview(){},
    normalizeAdminProductCode:code=>code,createAdminDiagnosticRequestId:()=> 'fixture',
    setAdminAuthRetryButtonMode(){},showAdminAuthOverlay(){},escapeHtml:s=>String(s),productUiIcon:()=>'',getProductOperationUnshippedDetails:()=>[],
    fetchAdminRecoverableResponse:async (url,options)=>{
      const body=JSON.parse(options.body);
      calls.push(body);
      return new Promise(resolve=>pending.push((overrides={})=>resolve({ok:true,json:async()=>({
        ok:true,action:'adminReadProductCatalog',products:[{...product}],catalogVersion:'v1',siteSettings:{name:'live'},
        productOperations:body.includeOperations?{complete:true,byCode:{A:{...summary}}}:null,...overrides,
      })})));
    },
  };
  vm.createContext(c);vm.runInContext(functions,c);
  return {c,node,calls,pending,get:key=>vm.runInContext(key,c),set:(key,value)=>{c.fixtureValue=value;vm.runInContext(key+'=fixtureValue',c);}};
}
async function lean(f) {
  const request=f.c.fetchAdminProductCatalogFromGas();
  assert.equal(f.calls.at(-1).includeOperations,false);
  f.pending.shift()();
  await request;
}
test('product page and refresh get the editable catalog without asking for order scans',async()=>{
  const f=fixture();
  await lean(f);await lean(f);
  assert.equal(f.get('adminProductCatalog')[0].stock,5);
  assert.equal(f.c.refreshedOptions,2);
  assert.deepEqual(f.calls.map(call=>call.includeOperations),[false,false]);
});
test('explicit statistics load joins same-context clicks and cannot mutate editable catalog, settings, order options or draft DOM',async()=>{
  const f=fixture();await lean(f);
  const renders=f.c.catalogRenders, options=f.c.refreshedOptions;
  const a=f.c.loadProductOperations(), b=f.c.loadProductOperations();
  assert.deepEqual(f.calls.map(call=>call.includeOperations),[false,true]);
  f.pending.shift()({products:[{id:'p',code:'A',price:1,stock:0,status:'停售'}],siteSettings:{name:'untrusted'}});
  await Promise.all([a,b]);
  assert.equal(f.get('adminProductCatalog')[0].price,100);
  assert.equal(f.get('adminProductCatalog')[0].status,'上架');
  assert.equal(f.c.adminSiteSettings.name,'live');
  assert.equal(f.c.catalogRenders,renders);
  assert.equal(f.c.refreshedOptions,options);
  assert.equal(f.get('getCurrentProductOperations()').byCode.A.bookedQty,3);
  await f.c.loadProductOperations();
  assert.equal(f.calls.length,2);
});
test('unread, waiting, failed and incomplete statistics cannot masquerade as a confirmed zero',async()=>{
  const f=fixture();await lean(f);
  f.c.adminProductOperationsModalCode='p';f.c.renderProductOperationsModal();
  for(const id of ['Booked','Unshipped','Shipped']) assert.doesNotMatch(f.node('productOperations'+id+'Tab').textContent,/0盒/);
  f.c.openProductOperationsModal('p');assert.equal(f.calls.length,2);
  assert.match(f.node('productOperationsModalList').textContent,/讀取/);
  f.pending.shift()({productOperations:{errorCode:'PRODUCT_OPERATIONS_READ_FAILED',complete:false,byCode:{}}});
  await new Promise(setImmediate);
  assert.equal(f.get('getCurrentProductOperations()'),null);
  assert.match(f.node('productOperationsModalList').textContent,/失敗/);
  const retry=f.c.loadProductOperations(true);
  f.pending.shift()({productOperations:{complete:false,unreadableOrderCount:1,byCode:{A:{bookedQty:0,shippedQty:0,bookedOrders:[],shippedOrders:[]}}}});
  await retry;
  assert.match(f.node('productOperationsModalNote').textContent,/部分|未計入|無法/);
  assert.match(f.node('productOperationsBookedTab').textContent,/0盒/);
});
test('session rotation, catalog version, product/order mutation and newer catalog load invalidate slow statistics',async()=>{
  for(const change of ['session','version','product','order','group','snapshot','reload','response-version']){
    const f=fixture();await lean(f);
    const stats=f.c.loadProductOperations();
    const finish=f.pending.shift();
    if(change==='session')f.c.storageToken='B';
    if(change==='version')f.set('adminProductCatalogVersion','v2');
    if(change==='product')f.set('adminProductCatalogMutationEpoch',1);
    if(change==='order')f.c.adminOrderMutationRevision++;
    if(change==='group')f.c.adminGroupOrders=[];
    if(change==='snapshot')f.c.adminOrderReadMeta.snapshotLiveVersion='orders-v2';
    if(change==='reload')await lean(f);
    finish(change==='response-version'?{catalogVersion:'v2'}:{});
    await stats;
    assert.equal(f.get('getCurrentProductOperations()'),null,change);
    assert.equal(f.c.storageToken,change==='session'?'B':'A');
    assert.equal(f.c.adminProductsReady,true);
  }
});
test('a late statistics failure cannot invalidate a new login or a newer successful statistics result',async()=>{
  const f=fixture();await lean(f);
  const old=f.c.loadProductOperations(), finishOld=f.pending.shift();f.c.storageToken='B';
  await lean(f);const current=f.c.loadProductOperations();f.pending.shift()();await current;
  finishOld({ok:false,error:'ADMIN_SESSION_REQUIRED'});await old;
  assert.equal(f.c.storageToken,'B');
  assert.equal(f.get('getCurrentProductOperations()').byCode.A.bookedQty,3);
});
test('new session statistics do not join a previous session catalog flight',async()=>{
  const f=fixture();await lean(f);
  const old=f.c.fetchAdminProductCatalogFromGas({fresh:true}),finish=f.pending.shift();
  f.c.storageToken='B';
  assert.equal(await f.c.loadProductOperations(),null);
  await lean(f);
  const stats=f.c.loadProductOperations();f.pending.shift()();await stats;
  finish({ok:false,error:'ADMIN_SESSION_REQUIRED'});await old;
  assert.equal(f.c.storageToken,'B');
  assert.equal(f.get('getCurrentProductOperations()').byCode.A.bookedQty,3);
});
test('invalid / null / missing totals fail safely while the editable product and order options stay usable',async()=>{
  for(const payload of [null,{ok:true,action:'wrong',products:[]},
    {ok:true,action:'adminReadProductCatalog',catalogVersion:'v1',products:[],productOperations:{complete:true,byCode:{A:{bookedQty:3}}}}]){
    const f=fixture();await lean(f);f.c.adminProductOperationsModalCode='p';
    f.c.fetchAdminRecoverableResponse=async()=>({ok:true,json:async()=>payload});
    assert.equal(await f.c.loadProductOperations(),null);
    assert.equal(f.get('getCurrentProductOperations()'),null);
    assert.equal(f.c.adminProductsReady,true);assert.equal(f.get('adminProductCatalog')[0].stock,5);
    assert.doesNotMatch(f.node('productOperationsBookedTab').textContent,/0盒/);
  }
});
test('a failed refresh can disclose the last confirmed counts only within that same session and version',async()=>{
  const f=fixture();await lean(f);
  const previous=f.c.loadProductOperations();f.pending.shift()();await previous;
  f.c.adminProductOperationsModalCode='p';
  f.c.fetchAdminRecoverableResponse=async()=>{throw new Error('NETWORK_ERROR');};
  await f.c.loadProductOperations(true);
  assert.match(f.c.getProductStatisticsLabel('A'),/已訂 3.*上次統計/);
  assert.match(f.node('productOperationsModalNote').textContent,/更新失敗.*上次統計/);
  f.c.adminOrderMutationRevision++;
  assert.equal(f.c.getCurrentProductOperations(),null);
  f.c.renderProductOperationsModal();
  assert.doesNotMatch(f.node('productOperationsBookedTab').textContent,/3盒|0盒/);
});
test('statistics control is in its own block below the non-wrapping mobile header',()=>{
  const section=part('<section id="product-page-section"','<div class="product-management-toolbar"');
  assert.doesNotMatch(section.split('<div class="product-management-body">')[0],/productStatisticsLoad/);
  assert.match(section,/<div><button[^>]*id="productStatisticsLoad"[^>]*>讀取訂單統計<\/button><\/div>/);
});
test('closing the modal or switching products while a scan is in flight never reopens it or rebuilds an editor',async()=>{
  const f=fixture();await lean(f);
  const before=f.c.catalogRenders, fields={price:'draft price',stock:'draft stock'};
  f.c.renderProductManagement=()=>{fields.price='reset';f.c.catalogRenders++;};
  f.c.openProductOperationsModal('p');
  f.c.closeProductOperationsModal();
  const list=f.node('productOperationsModalList');list.textContent='closed';
  f.pending.shift()();await new Promise(setImmediate);
  assert.equal(f.c.adminProductOperationsModalCode,'');assert.equal(list.textContent,'closed');
  assert.equal(f.c.catalogRenders,before);assert.equal(fields.price,'draft price');
  assert.equal(fields.stock,'draft stock');
});
test('simulated 2700ms scan can remain pending while an independent fresh catalog is already usable',async()=>{
  const f=fixture();await lean(f);
  let scanDone=false;
  const stats=f.c.loadProductOperations().then(()=>{scanDone=true;});
  const finishScan=f.pending.shift();
  const catalog=f.c.fetchAdminProductCatalogFromGas({fresh:true,includeOperations:false});
  f.pending.shift()({products:[{id:'p',code:'A',stock:8,price:200,status:'後台販售'}],catalogVersion:'v2'});
  await catalog;
  assert.equal(scanDone,false);assert.equal(f.c.adminProductsReady,true);assert.equal(f.get('adminProductCatalog')[0].stock,8);
  finishScan();await stats;
  assert.equal(f.get('adminProductCatalog')[0].price,200);
});
test('measure default catalog ready time with a synthetic 120ms catalog and optional 2700ms server scan',async()=>{
  const f=fixture();let requestCount=0, scanIncluded;
  f.c.fetchAdminRecoverableResponse=async(_,options)=>{
    requestCount++;scanIncluded=JSON.parse(options.body).includeOperations;
    await new Promise(resolve=>setTimeout(resolve,120+(scanIncluded?2700:0)));
    return {ok:true,json:async()=>({ok:true,action:'adminReadProductCatalog',catalogVersion:'v1',products:[{code:'A',stock:5}]})};
  };
  const start=performance.now();
  const products=await f.c.fetchAdminProductCatalogFromGas();
  assert.equal(products[0].stock,5);assert.equal(f.c.adminProductsReady,true);
  console.log(JSON.stringify({fixture:'synthetic-catalog-ready',catalogDelayMs:120,statisticsDelayMs:2700,
    firstCatalogReadyMs:Math.round(performance.now()-start),requestCount,scanIncluded}));
  assert.equal(scanIncluded,false);
});
