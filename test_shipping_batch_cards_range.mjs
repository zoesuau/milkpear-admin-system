import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const slice = (start, end) => html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start)));
const nodes = new Map();
const document = {getElementById(id) {
  if (!nodes.has(id)) nodes.set(id, {value:'', textContent:'', innerHTML:'', dataset:{}, hidden:true, setAttribute(){}, focus(){}});
  return nodes.get(id);
}};
const c = {document, Date};
vm.createContext(c);
vm.runInContext(slice('      function formatShippingBatchRange', '      function renderShippingBatchManagement') +
  slice('      function shiftShippingBatchIsoDate', '      function openShippingBatchModal'), c);
const batches = [
  {batchId:'old',status:'manually_closed',shippingStartDate:'2026-07-01'},
  {batchId:'later',status:'open',shippingStartDate:'2026-10-01'},
  {batchId:'expired',status:'expired',shippingStartDate:'2026-09-01'},
  {batchId:'now',status:'open',shippingStartDate:'2026-09-21'},
  {batchId:'scheduled',status:'scheduled',shippingStartDate:'2026-09-28'},
];
assert.deepEqual(batches.sort(c.compareShippingBatchesForManagement).map(b=>b.batchId), ['now','later','scheduled','expired','old']);
const el = id=>document.getElementById('shippingBatch'+id);
vm.runInContext('shippingBatchCalendarMonth = "2026-09";', c);
c.selectShippingBatchRangeDay('2026-09-30');
assert.equal(el('EndDate').value, '', 'first click must leave an unfinished range');
assert.equal(el('CutoffAt').value, '');
c.shiftShippingBatchCalendarMonth(1);
c.selectShippingBatchRangeDay('2026-10-03');
assert.equal(el('StartDate').value,'2026-09-30');
assert.equal(el('EndDate').value,'2026-10-03');
assert.equal(el('CutoffAt').value,'2026-10-02T17:00');
assert.equal(el('DisplayLabel').value,'9/30～10/3');
el('DisplayLabel').value='自訂名稱'; el('DisplayLabel').dataset.manuallyEdited='true';
c.selectShippingBatchRangeDay('2026-10-08'); c.selectShippingBatchRangeDay('2026-10-05');
assert.equal(el('StartDate').value,'2026-10-05');
assert.equal(el('EndDate').value,'2026-10-08');
assert.equal(el('DisplayLabel').value,'自訂名稱');
c.selectShippingBatchRangeDay('2027-01-01'); c.selectShippingBatchRangeDay('2027-01-01');
assert.equal(el('CutoffAt').value,'2026-12-31T17:00');
assert.match(c.formatShippingBatchRange('2026-12-30','2027-01-02'), /2026.*2027/);
vm.runInContext(slice('      function validateShippingBatchDraft', '      async function closeAdminShippingBatch'), c);
c.adminShippingBatches=[];
c.adminShippingBatchSubmitting=false;
c.sessionStorage={getItem:()=> 'fixture'};
c.ADMIN_LINE_SESSION_TOKEN_KEY='fixture-key';
c.GAS_ORDERS_API_URL='fixture-url';
c.ADMIN_READ_PRODUCT_CATALOG_TIMEOUT_MS=1000;
c.setShippingBatchManagementFeedback=()=>{};
c.renderShippingBatchManagement=()=>{};
el('Modal').classList={remove(){}};
el('Id').value='fixture';
el('StartDate').value='2026-09-25';
el('EndDate').value='2026-09-27';
el('CutoffAt').value='2026-09-26T17:00';
el('OpensOn').value='2026-09-20';
el('IsActive').checked=true;
let posted;
c.fetchWithTimeout=async(url,options)=>{posted=JSON.parse(options.body);return {ok:true,json:async()=>({ok:true,action:'adminUpsertShippingBatch',batches:[{...posted,status:'scheduled'}]})};};
await c.saveShippingBatchModal();
assert.equal(posted.opensOn,'2026-09-20');
assert.equal(posted.shippingStartDate,'2026-09-25');
assert.equal(posted.shippingEndDate,'2026-09-27');
assert.equal(c.adminShippingBatches[0].status,'scheduled');
c.adminShippingBatches=[];
assert.match(c.validateShippingBatchDraft({...posted,opensOn:'2026-09-27'}), /前台開始顯示日期/);
assert.equal(c.validateShippingBatchDraft({...posted,opensOn:''}), '');
console.log('PASS: open-first sorting, closed history ordering, unfinished selection, cross-month, reverse selection, same day, year boundary, custom label preservation.');
