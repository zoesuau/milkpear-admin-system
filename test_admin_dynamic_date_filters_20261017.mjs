import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
assert.equal([...html.matchAll(/id="singleShippingDateInput"/g)].length,1,'single-date selection must have exactly one real DOM field');
function extract(name){const a=html.indexOf('      function '+name+'(');assert.ok(a>=0,name);const b=html.indexOf('\n      function ',a+10);return html.slice(a,b);}
const nodes=new Map();
for(const id of ['orderDateSelect','orderStatusSelect','orderSourceSelect','singleShippingDateInput','customDateStart','customDateEnd','searchBar','orderDropdownHelp','orderFilterResult'])nodes.set(id,{value:'',innerText:'',innerHTML:'',disabled:false,querySelector:()=>({hidden:false})});
const orders=[
 {orderNo:'A',orderStatus:'已安排出貨',expectedShippingDate:'2026-10-23',source:'phone'},
 {orderNo:'B',orderStatus:'已寄出',expectedShippingDate:'2026-10-24',actualShippingDate:'2026-10-23',source:'line'},
 {orderNo:'C',orderStatus:'已取消',expectedShippingDate:'2026-10-23',source:'phone'},
 {orderNo:'D',orderStatus:'待確認',requestedShippingStartDate:'2026-10-23',requestedShippingEndDate:'2026-10-25',source:'line'},
 {orderNo:'E',orderStatus:'已安排出貨',expectedShippingDate:'2026-10-24',source:'phone'},
 {orderNo:'F',orderStatus:'待確認',source:'phone'},
 {orderNo:'G',orderStatus:'已安排出貨',expectedShippingDate:'2027-01-02',source:'phone'},
];
const c={console,document:{getElementById:id=>nodes.get(id)||null},currentDateFilter:'全部',currentFilterStatus:'全部',currentNotificationFilter:'全部',latestAdminOrders:orders,
 adminOrderWorkspaceComplete:true,adminOrderReadMeta:{serverFiltered:false},GROUP_ORDERS_ENABLED:true,
 normalizeAdminDateValue:x=>String(x||''),adminWorkflowIsValidDate:x=>/^\d{4}-\d{2}-\d{2}$/.test(x),getTaipeiToday:()=> '2026-10-17',escapeHtml:x=>String(x),
 buildAdminOrderFilterCard:o=>({order:o,dataset:{status:o.orderStatus,actualShippingDate:o.actualShippingDate||'',expectedShippingDate:o.expectedShippingDate||'',searchText:o.orderNo,canLineNotify:String(o.source==='line')},getAttribute:k=>k==='data-status'?o.orderStatus:''}),
 sortAdminCardsForCurrentStatus:x=>x,isNoticeWorkCard:()=>false};
vm.createContext(c);
vm.runInContext(['syncOrderSearchClear','getOrderDropdownDate','buildOrderDropdownDateCounts','getSelectedOrderDropdownDate','syncOrderDropdowns','changeOrderDropdown','isDropdownCardDateMatched'].map(extract).join('\n')+['getAdminFilterCardDate','isCardDateMatched','isCardStatusMatched','isNotificationModeMatched','getFilteredAdminCards'].map(extract).join('\n'),c);
function query(date,status='全部',source='全部'){
 c.currentDateFilter=/^\d/.test(date)?'指定單日':date;c.currentFilterStatus=status;c.currentNotificationFilter=source;
 nodes.get('singleShippingDateInput').value=date;
 return Array.from(c.getFilteredAdminCards(),card=>card.order.orderNo);
}
assert.deepEqual(query('全部'),['A','B','D','E','F','G']);
assert.deepEqual(query('2026-10-23'),['A','B']);
assert.deepEqual(query('2026-10-23','已安排出貨'),['A']);
assert.deepEqual(query('2026-10-23','已寄出'),['B']);
assert.deepEqual(query('2026-10-23','已取消'),['C']);
assert.deepEqual(query('全部','已取消'),['C']);
assert.deepEqual(query('未安排','待確認'),['D','F'],'requested range must not masquerade as scheduled date');
assert.deepEqual(query('未安排','已寄出'),[]);
assert.deepEqual(query('2026-10-23','全部','line'),['B']);
assert.deepEqual(query('2026-10-24','已寄出'),[],'actual date wins over planned date');
nodes.get('customDateStart').value='2026-10-23';nodes.get('customDateEnd').value='2026-10-24';
assert.deepEqual(query('自訂'),['A','B','E']);
query('2026-10-23','已寄出');c.syncOrderDropdowns(1);
const options=nodes.get('orderDateSelect').innerHTML;
assert.match(options,/10\/23（2）/);assert.match(options,/未安排日期（2）/);assert.match(options,/2027\/01\/02/);
assert.ok(options.endsWith('自訂日期區間…</option>'));
assert.equal(nodes.get('orderFilterResult').innerText,'符合 1 張訂單');
query('2026-10-23','待確認');c.syncOrderDropdowns(0);
assert.equal(nodes.get('orderDateSelect').innerHTML,options,'counts independent of selected status');
c.latestAdminOrders=orders.filter(o=>!['A','B','C'].includes(o.orderNo));c.syncOrderDropdowns(0);
assert.match(nodes.get('orderDateSelect').innerHTML,/10\/23（0）/);assert.equal(nodes.get('orderDateSelect').value,'2026-10-23');
c.adminOrderWorkspaceComplete=false;c.adminOrderReadMeta.serverFiltered=true;c.syncOrderDropdowns(0);
assert.equal(nodes.get('orderDateSelect').disabled,true,'partial page cannot present global counts');
const many=Array.from({length:37},()=>orders[0]);assert.equal(c.buildOrderDropdownDateCounts(many).get('2026-10-23'),37);
c.adminOrderWorkspaceComplete=true;c.adminOrderReadMeta.serverFiltered=false;c.latestAdminOrders=orders;
query('全部');c.selectedOrderNos=new Set(['A','E']);c.adminOrderViewHasDraft=()=>false;
let feedback='';c.setAdminSearchStatus=message=>feedback=message;
c.changeOrderDropdown('date','2026-10-23');
assert.equal(c.currentDateFilter,'全部');assert.equal(c.selectedOrderNos.size,2);assert.match(feedback,/勾選/);
console.log('PASS date × status × source, actual vs planned, canceled access/exclusion, unscheduled vs requested, custom interval, stable global counts >20, cross-year, retained zero date and incomplete-data guard');
console.log('PASS dropdown changes preserve batch selection and restore previous filter');
