import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
const fn=name=>{const m=html.match(new RegExp(`      (?:async )?function ${name}\\([\\s\\S]*?\\n      \\}`));assert.ok(m,name);return m[0]};
const helpers=html.slice(html.indexOf('      let adminCreateGroupsReady'),html.indexOf('      function refreshNewOrderProductOptions'));
function fixture(){
 const nodes=new Map(),storage=new Map(),requests=[],rows=[];let pending=null;
 const node=id=>{if(!nodes.has(id)) {let markup='';const n={id,value:'',type:'text',style:{},dataset:{},attrs:{},options:[],textContent:'',innerText:'',disabled:false,required:false,closest:()=>({hidden:false}),setAttribute(k,v){this.attrs[k]=v},removeAttribute(k){delete this[k]},classList:{add(){},remove(){},contains:()=>true},insertAdjacentHTML(_,v){this.innerHTML+=v}};Object.defineProperty(n,'innerHTML',{get:()=>markup,set:v=>{markup=v;n.options=[...v.matchAll(/<option value="([^"]*)"[^>]*>([^<]*)/g)].map(m=>({value:m[1],textContent:m[2]}));}});nodes.set(id,n)}return nodes.get(id)};
 const products=[{code:'20A-6',variety:'蔗香梨',grade:'20A',count:'6顆',price:1000,stock:0,status:'停售'},{code:'28A-2',variety:'蔗香梨',grade:'28A',count:'2顆',price:500,stock:0},{code:'OUTSIDE',variety:'牛奶梨',grade:'24A',count:'8顆',price:800,stock:100}];
 const groups=[{groupOrderId:'G1',groupName:'王小姐團購',status:'open',buyerName:'王小姐',buyerPhone:'0900000000',items:[{code:'20A-6',remainingQty:22},{code:'28A-2',remainingQty:0}],children:[]},{groupOrderId:'G2',groupName:'已付團體',status:'open',items:[{code:'28A-2',remainingQty:5}],children:[{paymentStatus:'已付款',cancelled:false},{paymentStatus:'未付款',cancelled:true}]},{groupOrderId:'END',groupName:'已結束團體',status:'closed',items:[],children:[]}];
 const c=vm.createContext({console,GROUP_ORDERS_ENABLED:true,adminGroupOrders:groups,adminGroupOrderSubmitting:false,adminProductsReady:true,ADMIN_TAB_NAMES:new Set(['orders','groupOrders','products','shippingPrint']),ADMIN_ACTIVE_TAB_KEY:'tab',
 document:{getElementById:node,querySelectorAll:q=>q.includes('.product-edit-row')?rows:q==='.admin-tab-btn'?[node('topOrders'),node('topProducts')]:[],body:{style:{}}},
 sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
 getGroupOrderById:id=>groups.find(g=>g.groupOrderId===id)||null,getProductByCode:code=>products.find(p=>p.code===code),normalizeAdminProductCode:x=>String(x||'').trim().toUpperCase(),escapeHtml:x=>String(x??''),buildAdminProductOptionsHtml:()=>'<option value="OUTSIDE">一般商品</option>',
 loadPendingAdminGroupCreateRequest:()=>pending,fetchAdminGroupOrders:async()=>groups,refreshNewOrderProductOptions:()=>{},updateNewOrderAmountPreview:()=>{},persistAdminCreateDraft:()=>{},resetModalProductRows:()=>{},
 setGroupOrderFeedback:(m,e,id)=>{node(id||'groupOrderFeedback').textContent=m},
 ensureAdminGroupCreateRequestContext:()=>({requestKey:pending?.requestKey||'fixture-unique-request'}),storePendingAdminGroupCreateRequest:p=>{pending={action:p.action,requestKey:p.requestKey,payload:structuredClone(p)}},clearPendingAdminGroupCreateRequest:()=>{pending=null},shouldPreservePendingAdminGroupCreateRequest:e=>e.serverConfirmed!==true,
 postGroupOrderAction:async p=>{requests.push(structuredClone(p));return{orderNo:'P1',group:groups[0],order:{orderNo:'P1'}}},renderAdminGroupOrders(){},applySingleOrderResponse(){},closeGroupChildModal(){},switchAdminTab(){},restoreAdminCreateDraftItems(){},
 });
 vm.runInContext(helpers+'\n'+fn('submitGroupChild'),c);
 node('new-group-order').value='G1';node('new-discount-amount').value='0';node('new-expected-shipping-date').value='2026-10-01';node('new-payment-method').value='cod';
 const add=(code,qty)=>{const q={value:String(qty),removeAttribute(k){delete this[k]}};rows.push({querySelector:s=>s==='.modal-spec-select'?{value:code}:q});return q};
 return {c,node,groups,products,rows,requests,add,storage,getPending:()=>pending,setPending:p=>pending=p};
}
let f=fixture();await f.c.refreshNewOrderGroups('G1');f.c.syncNewOrderGroupContext(true);
assert.equal(f.node('new-sender-name').value,'王小姐');assert.equal(f.node('new-payment-method').value,'bank_unpaid');assert.equal(f.node('new-payment-method').disabled,true);
let options=f.c.buildNewOrderProductOptionsHtml();assert.match(options,/20A.*6顆.*剩餘可分配 22 盒/);assert.doesNotMatch(options,/OUTSIDE|28A-2/);assert.equal(f.products[0].stock,0,'reserved stock stays selectable at zero general stock');
const q=f.add('20A-6',3);f.c.updateNewOrderGroupQuantityLimits();assert.equal(q.max,'22');
f.node('new-group-order').value='G2';f.c.syncNewOrderGroupContext();assert.equal(f.node('new-payment-method').value,'bank_paid');
f.node('new-group-order').value='';f.c.syncNewOrderGroupContext();f.c.updateNewOrderGroupQuantityLimits();assert.equal(f.node('new-payment-method').disabled,false);assert.equal(q.max,undefined);assert.match(f.c.buildNewOrderProductOptionsHtml(),/一般商品/);
f.c.renderNewOrderGroupChoices();assert.match(f.node('new-group-order').innerHTML,/王小姐團購/);assert.doesNotMatch(f.node('new-group-order').innerHTML,/已結束團體/);

f=fixture();await f.c.refreshNewOrderGroups('G1');f.add('20A-6',3);await f.c.submitGroupChild({preventDefault(){}});assert.equal(f.requests.length,1,f.node("new-order-feedback").textContent);assert.equal(f.requests[0].action,'adminCreateGroupOrderChild');assert.equal(f.requests[0].groupOrderId,'G1');assert.equal(Object.hasOwn(f.requests[0],'paymentState'),false);assert.equal(Object.hasOwn(f.requests[0],'codCollectionAmount'),false);assert.equal(f.getPending(),null);
for(const [code,qty] of [['OUTSIDE',1],['20A-6',23],['20A-6',0]]) {f=fixture();await f.c.refreshNewOrderGroups('G1');f.add(code,qty);await f.c.submitGroupChild({preventDefault(){}});assert.equal(f.requests.length,0);}
f=fixture();await f.c.refreshNewOrderGroups('G1');f.add('20A-6',1);f.add('20A-6',1);await f.c.submitGroupChild({preventDefault(){}});assert.equal(f.requests.length,0);
f=fixture();f.c.fetchAdminGroupOrders=async()=>null;await f.c.refreshNewOrderGroups('G1');f.add('20A-6',1);await f.c.submitGroupChild({preventDefault(){}});assert.equal(f.requests.length,0);assert.match(f.node('new-order-feedback').textContent,/重新讀取團體/);
f=fixture();await f.c.refreshNewOrderGroups('G1');f.add('20A-6',3);f.c.postGroupOrderAction=async p=>{f.requests.push(structuredClone(p));throw Error('TIMEOUT')};await f.c.submitGroupChild({preventDefault(){}});const first=f.requests[0];assert.ok(f.getPending());assert.equal(f.node('new-order-submit').formNoValidate,true);
f.groups[0].items[0].remainingQty=0;f.rows.length=0;f.c.postGroupOrderAction=async p=>{f.requests.push(structuredClone(p));return{orderNo:'P1',group:f.groups[0]}};await f.c.submitGroupChild({preventDefault(){}});assert.deepEqual(f.requests[1],first,'uncertain result replays exactly the original request even after allocation is exhausted');assert.equal(f.getPending(),null);

// An unresolved child cannot fall through into ordinary creation after a mode change.
f=fixture();f.setPending({action:'adminCreateGroupOrderChild',payload:{groupOrderId:'G1'}});f.node('new-group-order').value='';
Object.assign(f.c,{adminCreateOrderSubmitting:false,adminCreateOrderChecking:false,adminCreateProductsRefreshing:false,adminAddOrderOpening:false,loadPendingAdminCreateRequest:()=>null,ADMIN_LINE_SESSION_TOKEN_KEY:'token'});f.storage.set('token','fixture');
vm.runInContext(fn('handleNewOrderSubmit'),f.c);await f.c.handleNewOrderSubmit({preventDefault(){}});assert.equal(f.requests.length,0);assert.match(f.node('new-order-feedback').textContent,/先確認原子單結果/);

// Real navigation function preserves one outer order workspace and separates its panes.
f=fixture();for(const id of ['topOrders','topProducts'])f.node(id).classList={toggle:(name,on)=>{f.node(id).active=on}};f.node('topOrders').dataset.tab='orders';f.node('topProducts').dataset.tab='products';f.c.adminGroupOrdersLoaded=true;vm.runInContext(fn('switchAdminTab'),f.c);f.c.switchAdminTab('groupOrders');assert.equal(f.node('order-workspace-section').style.display,'');assert.equal(f.node('order-page-section').style.display,'none');assert.equal(f.node('group-order-page-section').style.display,'');assert.equal(f.node('topOrders').active,true);assert.equal(f.node('groupOrdersTabButton').attrs['aria-selected'],'true');f.c.switchAdminTab('orders');assert.equal(f.node('order-page-section').style.display,'');assert.equal(f.node('group-order-page-section').style.display,'none');
assert.ok(!html.includes('id="groupChildModal"'));assert.match(html,/id="new-group-order"/);
console.log('PASS group workspace tabs, shared form, mother-only stock/limits, locked payment, freshness failures, split route and immutable retry');
