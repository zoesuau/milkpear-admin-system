import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('      const ADMIN_PENDING_INVENTORY_KEY'),html.indexOf('      async function submitProductInventoryAdjustment'));
function fixture(storage=new Map()) {
 const payload={action:'adminAdjustProductInventory',adminSessionToken:'SECRET_TEST_TOKEN',catalogVersion:'v1',requestKey:'inventory_fixture_00001',productId:'p14',mode:'restock',quantity:5};
 const context={productId:'p14',stock:8,mode:'restock',requestKey:payload.requestKey,pendingOrderQuantity:0,ready:true};
 const writes=[],reads=[];
 const receipt=(key,state='committed')=>({ok:true,action:'adminReadInventoryAdjustmentResult',requestKey:key,state,products:[{id:'p14',stock:12}],catalogVersion:'v2',adjustment:{productId:'p14',mode:'restock',enteredQuantity:5,afterStock:13}});
 const c={sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},GAS_ORDERS_API_URL:'fixture',setProductInventoryAdjustmentFeedback(){},fetchWithTimeout:async(u,o)=>{writes.push(JSON.parse(o.body));throw Error('lost response')},fetchAdminRecoverableResponse:async(u,o)=>{const p=JSON.parse(o.body);reads.push(p);return {ok:true,json:async()=>receipt(p.requestKey)}}};
 vm.createContext(c);vm.runInContext(source,c);
 return {c,payload,context,writes,reads,storage,receipt,run:p=>c.sendOrReconcileInventorySave(p||payload,context)};
}
let f=fixture();let result=await f.run();assert.equal(result.action,'adminAdjustProductInventory');assert.equal(result.adjustment.afterStock,13);assert.equal(result.products[0].stock,12);assert.equal(f.writes.length,1);assert.equal(f.reads.length,1);assert.equal(f.storage.size,0);
f=fixture();f.c.fetchAdminRecoverableResponse=async()=>{throw Error('offline')};await assert.rejects(f.run(),/offline/);assert.equal(f.storage.size,1);assert.ok(!JSON.stringify([...f.storage]).includes('SECRET_TEST_TOKEN'));
let reload=fixture(f.storage);await reload.run({...reload.payload,requestKey:'new_key_not_used'});assert.equal(reload.writes.length,0);assert.equal(reload.reads[0].requestKey,f.payload.requestKey);
f=fixture();f.c.fetchAdminRecoverableResponse=async()=>{throw Error('offline')};await assert.rejects(f.run());reload=fixture(f.storage);await assert.rejects(reload.run({...reload.payload,quantity:9}),/INVENTORY_PREVIOUS_CONFIRMED/);assert.equal(reload.writes.length,0,'do not silently apply a different quantity');
f=fixture();f.c.fetchAdminRecoverableResponse=async(u,o)=>({ok:true,json:async()=>f.receipt(JSON.parse(o.body).requestKey,'pending')});await assert.rejects(f.run(),/INVENTORY_RESULT_UNCONFIRMED/);await assert.rejects(f.run(),/INVENTORY_RESULT_UNCONFIRMED/);assert.equal(f.writes.length,1);
for(const state of ['review_required','rolled_back']) {
 f=fixture();f.c.fetchAdminRecoverableResponse=async(u,o)=>({ok:true,json:async()=>f.receipt(JSON.parse(o.body).requestKey,state)});
 await assert.rejects(f.run(),state==='rolled_back'?/INVENTORY_PREVIOUS_ROLLED_BACK/:/INVENTORY_REVIEW_REQUIRED/);
 assert.equal(f.storage.size,state==='rolled_back'?0:1);
}
f=fixture();f.c.fetchAdminRecoverableResponse=async(u,o)=>({ok:true,json:async()=>f.receipt(JSON.parse(o.body).requestKey,'not_found')});await assert.rejects(f.run());assert.equal(f.writes.length,1);await assert.rejects(f.run());assert.equal(f.writes.length,2);assert.equal(f.writes[0].requestKey,f.writes[1].requestKey);
console.log('PASS inventory lost response readback, persistent original key, no stored token, changed quantity isolation, pending/review never replay, rollback, explicit same-key retry');
