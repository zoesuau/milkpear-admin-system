import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
const start=html.indexOf('      let productManagementSaveInFlight');
const end=html.indexOf('      function getActiveAdminProducts',start);
let finish, calls=0, renders=0;
const controls=[{disabled:false,value:'draft'},{disabled:true}];
const messages=[];
const c={adminProductCatalogMutationEpoch:0,document:{querySelectorAll:q=>q==='.product-admin-card.editing'?[]:controls},sessionStorage:{getItem:()=> 'fixture'},ADMIN_LINE_SESSION_TOKEN_KEY:'token',GAS_ORDERS_API_URL:'fixture',adminProductCatalogVersion:'v1',adminProductCatalog:[],adminSiteSettings:{},setProductManagementFeedback:m=>messages.push(m),setAdminProductCatalogState(){},renderProductManagement(){renders++},refreshNewOrderProductOptions(){},updateNewOrderAmountPreview(){},console:{error(){}},fetch:()=>{calls++;return new Promise(r=>finish=r)}};
vm.createContext(c);vm.runInContext(html.slice(start,end),c);
const first=c.saveProductManagementPayload({products:[{id:'p',status:'停售'}]});
assert.equal(calls,1);assert.equal(controls[0].disabled,true);
assert.equal(await c.saveProductManagementPayload({products:[{id:'q'}]}),false);
assert.equal(calls,1,'concurrent writes must be blocked');
finish({ok:true,json:async()=>({ok:true,action:'adminUpdateProductManagement',products:[{id:'p',status:'停售'}],catalogVersion:'v2'})});
assert.equal(await first,true);assert.equal(controls[0].disabled,false);assert.equal(controls[1].disabled,true);assert.equal(c.adminProductCatalogVersion,'v2');
const before=renders;
const failed=c.saveProductManagementPayload({products:[{id:'p'}]});
finish({ok:true,json:async()=>{throw new SyntaxError('invalid JSON')}});
assert.equal(await failed,false);assert.equal(controls[0].value,'draft');assert.equal(controls[0].disabled,false);assert.equal(renders,before,'failure must not rebuild and discard the draft');assert.match(messages.at(-1),/尚未確認儲存結果/);
const stale=c.saveProductManagementPayload({products:[{id:'p'}]});
finish({ok:true,json:async()=>({ok:false,action:'adminUpdateProductManagement',error:'PRODUCT_CATALOG_STALE'})});
assert.equal(await stale,false);assert.match(messages.at(-1),/商品資料版本已變更/);assert.doesNotMatch(messages.at(-1),/庫存已被訂單/);
for(const path of [new URL('./admin-diagnostics.js',import.meta.url),new URL('../sanheyuan-admin-auth-diagnostics-worker/worker.js',import.meta.url)]) {
 const source=fs.readFileSync(path,'utf8');
 assert.match(source,/'PRODUCT_CATALOG_STALE'/);assert.match(source,/'PRODUCT_MANAGEMENT_UPDATE_BUSY'/);
}
console.log('PASS single in-flight catalog write, original control state, failed draft preservation, honest errors and product diagnostic codes');
