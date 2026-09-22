import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
const start=html.indexOf('      const PRODUCT_MANAGEMENT_PATCH_FIELDS');
const end=html.indexOf('      async function performProductManagementSave',start);
function fixture(storage=new Map()) {
 let writes=[],reads=[],message='',finish;
 const controls=[{disabled:false,value:'draft'}];
 const plan={productId:'p14',changes:[{field:'status',before:'停售',after:'僅後台販售'}]};
 const receipt=(key,state='committed')=>({ok:true,action:'adminReadProductSaveResult',requestKey:key,state,products:[{id:'p14',status:'僅後台販售'}],catalogVersion:'v2'});
 const c={document:{querySelectorAll:q=>q==='.product-admin-card.editing'?[]:controls},sessionStorage:{getItem:k=>k==='token'?'fixture':storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},ADMIN_LINE_SESSION_TOKEN_KEY:'token',GAS_ORDERS_API_URL:'fixture',adminProductCatalog:[],adminProductCatalogVersion:'v1',adminProductCatalogMutationEpoch:0,createAdminInventoryRequestKey:()=> 'inventory_fixture_000001',setProductManagementFeedback:m=>message=m,setAdminProductCatalogState(){},renderProductManagement(){},refreshNewOrderProductOptions(){},updateNewOrderAmountPreview(){},fetchWithTimeout:async(u,o)=>{writes.push(JSON.parse(o.body));throw new SyntaxError('broken response')},fetchAdminRecoverableResponse:async(u,o)=>{const p=JSON.parse(o.body);reads.push(p);return {ok:true,json:async()=>receipt(p.requestKey)}}};
 vm.createContext(c);vm.runInContext(html.slice(start,end),c);
 return {c,storage,plan,writes,reads,controls,receipt,message:()=>message};
}
let f=fixture();assert.equal(await f.c.saveProductManagementPayload(f.plan),true);assert.equal(f.writes.length,1);assert.equal(f.reads.length,1);assert.equal(f.reads[0].action,'adminReadProductSaveResult');assert.equal(f.writes[0].requestKey,f.reads[0].requestKey);assert.equal(f.storage.size,0);assert.equal(f.c.adminProductCatalogVersion,'v2');assert.match(f.message(),/已確認/);
// Offline reconciliation preserves the operation across a page reload. It must
// not issue another write when the prior durable receipt exists.
f=fixture();f.c.fetchAdminRecoverableResponse=async()=>{throw Error('offline')};assert.equal(await f.c.saveProductManagementPayload(f.plan),false);assert.equal(f.storage.size,1);assert.equal(f.controls[0].value,'draft');
let reload=fixture(f.storage);assert.equal(await reload.c.saveProductManagementPayload(reload.plan),true);assert.equal(reload.writes.length,0);assert.equal(reload.reads.length,1);
// Reusing the page for a different SKU must not report that new edit as saved.
f=fixture();f.c.fetchAdminRecoverableResponse=async()=>{throw Error('offline')};await f.c.saveProductManagementPayload(f.plan);reload=fixture(f.storage);assert.equal(await reload.c.saveProductManagementPayload({...reload.plan,productId:'p20'}),false);assert.equal(reload.writes.length,0);assert.match(reload.message(),/上一筆/);
// A request not yet received is not silently replayed in the same attempt.
f=fixture();f.c.fetchAdminRecoverableResponse=async(u,o)=>({ok:true,json:async()=>({ok:true,action:'adminReadProductSaveResult',requestKey:JSON.parse(o.body).requestKey,state:'not_found'})});assert.equal(await f.c.saveProductManagementPayload(f.plan),false);assert.equal(f.writes.length,1);const key=f.writes[0].requestKey;
await f.c.saveProductManagementPayload(f.plan);assert.equal(f.writes.length,2,'explicit retry after not_found may retry only the same idempotent operation');assert.equal(f.writes[1].requestKey,key);
// A pending server operation is queried, never resent.
f=fixture();f.c.fetchAdminRecoverableResponse=async(u,o)=>({ok:true,json:async()=>({ok:true,action:'adminReadProductSaveResult',requestKey:JSON.parse(o.body).requestKey,state:'pending'})});await f.c.saveProductManagementPayload(f.plan);await f.c.saveProductManagementPayload(f.plan);assert.equal(f.writes.length,1);
// True same-field conflicts are explicit; a rejected operation never overwrites.
f=fixture();const card={dataset:{productId:'p14'},productEditBase:{status:'停售',price:800}};f.c.document.querySelectorAll=q=>q==='.product-admin-card.editing'?[card]:[];
f.c.fetchWithTimeout=async(u,o)=>({ok:true,json:async()=>({...f.receipt(JSON.parse(o.body).requestKey,'rejected'),action:'adminUpdateProductFields',error:'PRODUCT_FIELD_CONFLICT',conflicts:[{field:'status',current:'上架',requested:'僅後台販售'}]})});
assert.equal(await f.c.saveProductManagementPayload(f.plan),false);assert.equal(card.productEditBase.status,'上架');assert.equal(card.productEditBase.price,800);assert.match(f.message(),/確認仍要套用/);assert.equal(f.storage.size,0);
console.log('PASS readback after non-JSON, no blind replay, stable operation key, reload recovery, different draft isolation, pending request protection, explicit conflicts');
