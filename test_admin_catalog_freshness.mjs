import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
const part=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
const source=part('      function refreshNewOrderProductOptions','      function resetModalProductRows')+
 part('      async function fetchAdminProductCatalogFromGas','      function renderAdminOrders')+
 part('      let adminAddOrderOpening','      function closeAddOrderModal');
let catalog=[{code:'A',price:100,stock:5}],requests=[],open=false,preview=0;
const select={value:'A',options:[{value:'A',textContent:'A $100'}],get selectedOptions(){return this.options.filter(o=>o.value===this.value)},set innerHTML(value){this.options=JSON.parse(value)},prepend(o){this.options.unshift(o);this.value=o.value}};
const qty={value:'3'},draft={recipient:'fixture recipient',note:'keep note'};
const row={querySelector:q=>q==='.modal-spec-select'?select:qty};
const modal={classList:{add(){open=true}},querySelector:()=>({scrollTop:0})};
const trigger={disabled:false,setAttribute(){}};
const c={adminProductCatalogLoadPromise:null,adminProductsReady:true,GAS_ORDERS_API_URL:'mock',ADMIN_LINE_SESSION_TOKEN_KEY:'token',ADMIN_READ_PRODUCT_CATALOG_TIMEOUT_MS:60000,
 adminProductCatalog:catalog,adminSiteSettings:{},adminProductOperations:{byCode:{A:{bookedQty:9}}},
 document:{querySelectorAll:()=>[row],querySelector:q=>q==='.btn-add-order-trigger'?trigger:row,getElementById:()=>modal,body:{style:{}},createElement:()=>({})},
 sessionStorage:{getItem:()=> 'fixture'},window:{setTimeout:fn=>fn()},requestAnimationFrame:fn=>fn(),console:{error(){}},alert:m=>{c.alert=m},
 ensureAdminSessionReady:async()=>true,resetAdminCustomerLookup(){},resetModalProductRows(){throw Error('must preserve draft rows')},renderProductManagement(){},renderShippingManifest(){},updateNewOrderAmountPreview(){preview++},
 buildAdminProductOptionsHtml:()=>JSON.stringify(c.adminProductCatalog.map(p=>({value:p.code,textContent:`${p.code} $${p.price} stock:${p.stock}`}))),
 setAdminProductCatalogState:ready=>{c.adminProductsReady=ready},
 fetchAdminRecoverableResponse:async(u,o)=>{requests.push(JSON.parse(o.body));return{ok:true,json:async()=>({ok:true,action:'adminReadProductCatalog',products:catalog,catalogVersion:'v'+catalog[0]?.price})}},
};
vm.createContext(c);vm.runInContext(source,c);
await c.openAddOrderModal();assert.equal(open,true);assert.equal(requests.length,1);assert.equal(requests[0].includeOperations,false);
catalog=[{code:'A',price:250,stock:2},{code:'B',price:300,stock:8}];open=false;
await c.openAddOrderModal();assert.equal(requests.length,2,'each opening refreshes even after a prior successful load');assert.equal(select.value,'A');assert.match(select.options[0].textContent,/250.*stock:2/);assert.equal(qty.value,'3');assert.equal(draft.note,'keep note');assert.equal(c.adminProductOperations.byCode.A.bookedQty,9,'light read must not wipe management stats');
catalog=[{code:'B',price:300,stock:8}];await c.openAddOrderModal();assert.equal(select.value,'A','removed selected product must not silently switch to B');assert.match(select.options[0].textContent,/已無法訂購/);assert.equal(qty.value,'3');
let resolveRead;c.fetchAdminRecoverableResponse=()=>new Promise(r=>resolveRead=r);const before=requests.length;const one=c.openAddOrderModal();await new Promise(setImmediate);const two=c.openAddOrderModal();resolveRead({ok:true,json:async()=>({ok:true,action:'adminReadProductCatalog',products:catalog})});await Promise.all([one,two]);assert.equal(qty.value,'3');
c.fetchAdminRecoverableResponse=async()=>{throw Error('NETWORK_ERROR')};open=false;await c.openAddOrderModal();assert.equal(open,false);assert.equal(c.adminProductsReady,false);assert.match(c.alert,/最新商品/);assert.equal(draft.recipient,'fixture recipient');
// Management must not reuse the lean request started by Add Order/print.
let modes=[],finishLean;
c.fetchAdminRecoverableResponse=async(u,o)=>{const p=JSON.parse(o.body);modes.push(p.includeOperations);if(modes.length===1)await new Promise(r=>finishLean=r);return{ok:true,json:async()=>({ok:true,action:'adminReadProductCatalog',products:catalog,productOperations:{byCode:{B:{bookedQty:12}},complete:true}})}};
const lean=c.fetchAdminProductCatalogFromGas({includeOperations:false});
const full=c.fetchAdminProductCatalogFromGas();
assert.deepEqual(modes,[false]);finishLean();await Promise.all([lean,full]);
assert.deepEqual(modes,[false,true]);assert.equal(c.adminProductOperations.byCode.B.bookedQty,12);
console.log('catalog freshness: PASS repeat openings, external price/stock change, preserved quantity/selection, removed SKU, duplicate opening and failed refresh');
