import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
const part=(a,b)=>{const i=html.indexOf(a),j=html.indexOf(b,i);assert.ok(i>=0&&j>i,a);return html.slice(i,j)};
const source=part('      const ADMIN_CREATE_DRAFT_KEY','      function calculateNewOrderPreviewTotals')+
 part('      function formatAdminCreateDiagnostic','      function showPendingAdminCreateOfflineState')+
 part('      async function handleNewOrderSubmit','    </script>');
const noop=()=>{};
function fixture(){
 const storage=new Map([['token','valid']]),nodes=new Map(),requests=[],verified=[],overlays=[];
 const node=id=>{if(!nodes.has(id)){const classes=new Set();nodes.set(id,{id,type:'text',value:'',checked:false,innerText:'',style:{},disabled:false,classList:{add:n=>classes.add(n),remove:n=>classes.delete(n),contains:n=>classes.has(n),toggle:(n,b)=>b?classes.add(n):classes.delete(n)},querySelector:()=>({scrollTop:42}),reset:noop});}return nodes.get(id)};
 const inputs={'new-name':'測試收件人','new-phone':'0900000000','new-address':'測試路1號','new-sender-name':'測試寄件人','new-sender-phone':'0900000001','new-note':'未完成備註','new-payment-method':'bank_unpaid','new-expected-shipping-date':'2026-09-16','new-delivery-time-slot':'4'};
 for(const [id,value]of Object.entries(inputs))node(id).value=value;
 node('admin-sync-customer-profile').type='checkbox';node('admin-sync-customer-profile').checked=true;
 const select={value:'sku',options:[{value:'sku'}]},qty={value:'3'},row={querySelector:q=>q==='.modal-spec-select'?select:qty};
 let pending=null,checks=0,catalogReads=0;
 const c={console,ADMIN_STORAGE_NAMESPACE:'fixture',ADMIN_LINE_SESSION_TOKEN_KEY:'token',GAS_ORDERS_API_URL:'fixture',ADMIN_CREATE_ORDER_TIMEOUT_MS:60000,
 sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
 document:{getElementById:node,querySelector:()=>row,querySelectorAll:q=>q.includes('input[id]')?[...nodes.values()].filter(n=>n.id.startsWith('new-')||n.id==='admin-sync-customer-profile'):[row],body:{style:{}}},
 adminProductsReady:true,adminSelectedCustomer:{customerId:'test-customer'},adminCreateOrderSubmitting:false,adminCreateOrderChecking:false,adminCreateRequestContext:null,
 resetAdminCustomerLookup:noop,resetModalProductRows:noop,updateNewOrderAmountPreview:noop,
 ensureAdminSessionReady:()=>{throw Error('unnecessary preflight')},adminWorkflowIsValidDate:()=>true,
 loadPendingAdminCreateRequest:()=>pending,checkPendingAdminCreateOrder:async()=>{checks++},
 ensureAdminCreateRequestContext:()=>{c.adminCreateRequestContext={requestKey:'same-logical-create-key'}},
 storePendingAdminCreateRequest:p=>{pending={...p}},clearPendingAdminCreateRequest:()=>{pending=null},
 markAdminSessionVerified:t=>verified.push(t),applySingleOrderResponse:(order,card,options)=>{assert.equal(options.refreshInBackground,false);return true},
 updateStatsCounters:noop,applyCurrentFilter:noop,handleBatchCheckChange:noop,updateNotifyButton:noop,applyReadOnlyModeToRealOrders:noop,scrollAdminOrderCardIntoView:noop,
 setAdminRefreshState:(loading,message)=>{c.header=message},setAdminAuthRetryButtonMode:noop,showAdminAuthOverlay:m=>overlays.push(m),
 fetchAdminProductCatalogFromGas:async()=>{catalogReads++;c.adminProductsReady=true;return[{code:'sku'}]},
 fetchWithTimeout:async(u,o)=>{requests.push(JSON.parse(o.body));return{ok:true,json:async()=>({ok:true,action:'adminCreateOrder',created:{orderNo:'TEST-1'},order:{orderNo:'TEST-1'},diagnostic:{elapsedMs:11000}})}}
 };
 vm.createContext(c);vm.runInContext(source,c);
 return {c,node,storage,requests,verified,overlays,select,qty,checks:()=>checks,catalogReads:()=>catalogReads};
}
const event={preventDefault(){}};
let f=fixture();await f.c.openAddOrderModal();assert.equal(f.node('addOrderModal').classList.contains('open'),true);assert.equal(f.catalogReads(),1);
await f.c.handleNewOrderSubmit(event);assert.equal(f.requests.length,1);assert.equal(f.requests[0].action,'adminCreateOrder');assert.equal(f.requests[0].items[0].qty,3);assert.deepEqual(f.verified,['valid']);assert.equal(f.node('addOrderModal').classList.contains('open'),false);assert.equal(f.storage.has('fixture:create-draft-v1'),false);assert.equal(f.header,undefined);assert.equal(f.c.header,'✅ 訂單 TEST-1 已建立');assert.match(f.node('adminCreateTimingText').textContent,/11.0/);

f=fixture();let release;f.c.fetchWithTimeout=async(u,o)=>{f.requests.push(JSON.parse(o.body));return new Promise(r=>release=r)};
const one=f.c.handleNewOrderSubmit(event);await f.c.handleNewOrderSubmit(event);assert.equal(f.requests.length,1);assert.equal(f.checks(),0,'double click cannot start recovery while original create is in flight');
release({ok:true,json:async()=>({ok:true,action:'adminCreateOrder',created:{orderNo:'TEST-2'},order:{orderNo:'TEST-2'}})});await one;

f=fixture();f.node('addOrderModal').classList.add('open');f.c.persistAdminCreateDraft();
const draft=f.c.readAdminCreateDraft();assert.equal(draft.fields['new-note'],'未完成備註');assert.equal(draft.fields['admin-sync-customer-profile'],true);assert.equal(draft.items[0].qty,'3');assert.ok(!f.storage.get('fixture:create-draft-v1').includes('valid'));
f.node('new-note').value='';f.c.adminSelectedCustomer=null;f.c.restoreAdminCreateDraftFields(draft);assert.equal(f.node('new-note').value,'未完成備註');assert.equal(f.c.adminSelectedCustomer.customerId,'test-customer');
f.c.closeAddOrderModal();assert.equal(f.c.readAdminCreateDraft(),null,'explicit cancel clears draft');

f=fixture();f.node('addOrderModal').classList.add('open');f.storage.delete('token');await f.c.handleNewOrderSubmit(event);assert.equal(f.requests.length,0);assert.match(f.overlays[0],/登入已過期/);assert.equal(f.c.readAdminCreateDraft().fields['new-note'],'未完成備註');
f=fixture();f.node('addOrderModal').classList.add('open');f.c.adminProductsReady=false;await f.c.handleNewOrderSubmit(event);assert.equal(f.requests.length,0);assert.equal(f.catalogReads(),1);assert.equal(f.node('new-note').value,'未完成備註');

f=fixture();let finishCatalog;f.c.fetchAdminProductCatalogFromGas=()=>new Promise(r=>finishCatalog=r);const opening=f.c.openAddOrderModal();
assert.equal(f.node('addOrderModal').classList.contains('open'),true,'form is available before catalog finishes');f.node('new-note').value='切出去複製後貼上';await f.c.handleNewOrderSubmit(event);assert.equal(f.requests.length,0,'cannot submit with catalog pending');
finishCatalog(null);await opening;assert.equal(f.node('addOrderModal').classList.contains('open'),true);assert.equal(f.node('new-note').value,'切出去複製後貼上');assert.equal(f.node('new-order-submit').formNoValidate,true,'catalog retry works before required customer fields are complete');

f=fixture();f.c.fetchWithTimeout=async()=>{throw Error('NETWORK_ERROR')};await f.c.handleNewOrderSubmit(event);assert.equal(f.checks(),1,'uncertain writes enter existing recovery rather than issue a second create');assert.equal(f.c.adminCreateOrderChecking,true);
f=fixture();f.node('addOrderModal').classList.add('open');f.c.fetchWithTimeout=async()=>({ok:true,json:async()=>({ok:false,action:'adminCreateOrder',errorCode:'ADMIN_SESSION_REQUIRED'})});await f.c.handleNewOrderSubmit(event);assert.equal(f.verified.length,0);assert.equal(f.storage.has('token'),false);assert.equal(f.c.readAdminCreateDraft().fields['new-note'],'未完成備註');assert.equal(f.c.loadPendingAdminCreateRequest(),null,'confirmed pre-commit auth rejection clears only pending write');
console.log('create continuity: PASS immediate editing, one protected create, double click, success merge, draft/cancel/expiry, catalog retry, uncertain result recovery');
