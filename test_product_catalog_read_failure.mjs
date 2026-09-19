import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const extract = (start, end) => html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start)));
const oldProducts = [{code:'A',stock:2}];
const operations = {byCode:{A:{bookedQty:3}},complete:true};
let fail = true;
const context = vm.createContext({
  console:{error(){}}, adminProductCatalogLoadPromise:null,
  GAS_ORDERS_API_URL:'https://example.test', ADMIN_LINE_SESSION_TOKEN_KEY:'session',
  ADMIN_READ_PRODUCT_CATALOG_TIMEOUT_MS:60000,
  sessionStorage:{getItem:()=> 'test',removeItem(){}},
  adminProductCatalog:oldProducts,adminProductCatalogVersion:'old',
  adminProductOperations:operations,adminProductCatalogLoading:false,
  adminProductCatalogReadFailed:false,adminProductOperationsLoading:false,adminSiteSettings:{},
  document:{querySelector:()=>null},
  renderProductManagement(){},renderShippingManifest(){},refreshNewOrderProductOptions(){},updateNewOrderAmountPreview(){},
  setAdminProductCatalogState(ready){context.ready=ready},markAdminSessionVerified(){},
  fetchAdminRecoverableResponse:async()=>{if(fail)throw new Error('TIMEOUT');return {json:async()=>({ok:true,action:'adminReadProductCatalog',products:[{code:'B',stock:1}],catalogVersion:'new'})}},
});
vm.runInContext(extract('      async function fetchAdminProductCatalogFromGas(', '      function renderAdminOrders('),context);
assert.equal(await context.fetchAdminProductCatalogFromGas(),null);
assert.equal(context.adminProductCatalog,oldProducts);
assert.equal(context.adminProductOperations,operations);
assert.equal(context.adminProductCatalogVersion,'old');
assert.equal(context.ready,false,'stale products must not authorize order submission');
assert.equal(context.adminProductCatalogReadFailed,true);
assert.equal(context.adminProductCatalogLoading,false);
assert.equal(context.adminProductCatalogLoadPromise,null);
assert.match(html,/商品更新失敗，顯示上次資料/);
assert.match(html,/>重試<\/button>/);
fail=false;
await context.fetchAdminProductCatalogFromGas();
assert.equal(context.ready,true);
assert.equal(context.adminProductCatalogReadFailed,false);
assert.equal(context.adminProductCatalog[0].code,'B');
fail=true;
context.adminProductCatalog=[];
await context.fetchAdminProductCatalogFromGas();
const elements={
  'product-management-list':{innerHTML:''},
  productCatalogReadFeedback:{hidden:true,innerHTML:''},
};
context.document.getElementById=id=>elements[id];
context.renderProductBannerSettings=()=>{};
context.renderShippingBatchManagement=()=>{};
const renderStart=html.indexOf('      function renderProductManagement()');
vm.runInContext(html.slice(renderStart,html.indexOf('      function ',renderStart+20)),context);
context.renderProductManagement();
assert.match(elements.productCatalogReadFeedback.innerHTML,/商品讀取失敗，請重試/);
assert.match(elements.productCatalogReadFeedback.innerHTML,/>重試<\/button>/);
assert.doesNotMatch(elements['product-management-list'].innerHTML,/目前沒有商品資料/);
assert.match(html,/if \(!adminProductsReady\) \{ await refreshAdminCreateProducts\(\); return; \}/);
const app = readFileSync(new URL('../app.js',import.meta.url),'utf8');
const publicContext=vm.createContext({PUBLIC_PRODUCT_CATALOG:[
  {id:'zero',active:true,stock:0},{id:'one',active:true,stock:1},
  {id:'unlimited',active:true,stock:null},{id:'hidden',active:false,stock:5},
]});
vm.runInContext(app.slice(app.indexOf('function getActivePublicProducts()'),app.indexOf('async function fetchPublicProductCatalog()')),publicContext);
assert.equal(publicContext.getActivePublicProducts().map(p=>p.id).join(','),'one,unlimited');
console.log('PASS: read failure retains data, blocks order readiness, retry restores readiness, public zero stock hidden');
