import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const html = fs.readFileSync(new URL('./index.html', import.meta.url),'utf8');
const diagnostics = fs.readFileSync(new URL('./admin-diagnostics.js', import.meta.url),'utf8');
const configSource = fs.readFileSync(new URL('./customer-config.js', import.meta.url),'utf8');
const start = html.indexOf('      function isAdminStartupWorkspaceEnabled(');
const flagSource = html.slice(start, html.indexOf('      let adminAuthCompletionPromise',start));
function fixture() {
  let now = 0;
  const values = new Map(), elements = new Map(), timers = new Map();
  const wall = Date.now();
  class Clock extends Date {static now(){return wall+now;}}
  const c = {URLSearchParams,Date:Clock,crypto:webcrypto,performance:{now:()=>now},
    localStorage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)},
    sessionStorage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)},
    navigator:{userAgent:'iPhone test',onLine:true},
    document:{documentElement:{dataset:{releaseVersion:'test'}},addEventListener(){},getElementById(id){if(!elements.has(id))elements.set(id,{textContent:''});return elements.get(id);}},
    setTimeout:(fn,ms)=>{const id=timers.size+1;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id)};
  c.window={location:{search:''},addEventListener(){},fetch:()=>{throw Error('No network permitted in this test');}};
  vm.createContext(c);vm.runInContext(configSource,c);vm.runInContext(flagSource,c);
  vm.runInContext(diagnostics,c);
  return {c,values,elements,setClock:x=>{now=x;},api:c.window.AdminDiagnostics,
    summary:()=>elements.get('adminStartupSummary')?.textContent||''};
}
let count=0;
function check(name,fn){fn();count++;console.log('PASS '+name);}
check('production default works without a URL flag, with a new tab and after LINE return',()=>{
  const f=fixture();assert.equal(f.c.isAdminStartupWorkspaceEnabled(),true);
  f.c.window.location.search='?code=synthetic&state=synthetic';assert.equal(f.c.isAdminStartupWorkspaceEnabled(),true);
  assert.equal(fixture().c.isAdminStartupWorkspaceEnabled(),true);
  for(const config of [{customerId:'different',environment:'production',features:{adminStartupWorkspace:true}},
    {customerId:'sanheyuan',environment:'staging',features:{adminStartupWorkspace:true}},
    {customerId:'sanheyuan',environment:'production',features:{}}]){
    f.c.window.ORDER_SYSTEM_CONFIG=config;assert.equal(f.c.isAdminStartupWorkspaceEnabled(),false);
  }
});
check('explicit compatibility override survives reload and can be re-enabled',()=>{
  const f=fixture();f.c.window.location.search='?startupWorkspace=0';assert.equal(f.c.isAdminStartupWorkspaceEnabled(),false);
  f.c.window.location.search='';assert.equal(f.c.isAdminStartupWorkspaceEnabled(),false);
  f.c.window.location.search='?startupWorkspace=1';assert.equal(f.c.isAdminStartupWorkspaceEnabled(),true);
  f.c.window.location.search='?code=synthetic';assert.equal(f.c.isAdminStartupWorkspaceEnabled(),true);
});
check('unavailable trial storage does not disable the production default or bypass auth storage',()=>{
  const f=fixture();f.c.sessionStorage.getItem=()=>{throw Error('storage blocked');};
  f.c.sessionStorage.setItem=()=>{throw Error('storage blocked');};
  assert.equal(f.c.isAdminStartupWorkspaceEnabled(),true);
  f.c.window.location.search='?startupWorkspace=0';assert.equal(f.c.isAdminStartupWorkspaceEnabled(),false);
  assert.equal(f.values.has('token'),false);
});
check('summary counts startup through complete UI, and remains stable after 110 sync records',()=>{
  const f=fixture();f.api.startupMode('complete');const flow=f.api.beginFlow('startup');
  f.setClock(2000);f.api.markFlow(flow,'auth_complete');
  f.setClock(2200);f.api.markFlow(flow,'full_data');
  assert.match(f.summary(),/完整畫面就緒：尚未完成/);assert.match(f.summary(),/等待完成/);
  f.setClock(2250);f.api.markFlow(flow,'ui_updated');f.api.finishFlow(flow,{outcome:'success',code:'OK'});
  const saved=f.summary();assert.match(saved,/完整訂單一次載入/);assert.match(saved,/完整畫面就緒：2.25 秒/);assert.match(saved,/已達標/);
  for(let i=0;i<110;i++){f.setClock(10000+i);f.api.record({action:'adminReadOrderSnapshot',stage:'RESULT',outcome:'success',code:'OK',elapsedMs:99});}
  assert.equal(f.summary(),saved);
});
check('compatibility summary includes first-page wait, background download and render',()=>{
  const f=fixture();f.api.startupMode('page');const start=f.api.beginFlow('startup');
  f.setClock(1807);f.api.markFlow(start,'auth_complete');f.setClock(1840);f.api.finishFlow(start,{outcome:'success',code:'OK'});
  const background=f.api.beginFlow('workspace');f.setClock(4025);f.api.markFlow(background,'full_data');
  f.setClock(4057);f.api.markFlow(background,'ui_updated');
  assert.match(f.summary(),/完整畫面就緒：4.06 秒/);assert.match(f.summary(),/尚未達標/);
});
check('failure cannot report success from downloaded data alone; hidden time is disclosed',()=>{
  const f=fixture();const flow=f.api.beginFlow('startup');f.setClock(500);f.api.markFlow(flow,'full_data');
  f.api.record({stage:'PAGE',outcome:'hidden',code:'OK'});
  f.api.finishFlow(flow,{outcome:'failure',code:'WORKSPACE_RENDER_FAILED'});
  assert.match(f.summary(),/本次未完成/);assert.match(f.summary(),/完整畫面就緒：尚未完成/);assert.match(f.summary(),/包含背景等待/);
});
check('query flows cannot replace startup result and arbitrary mode text is rejected',()=>{
  const f=fixture();f.api.startupMode('complete');const flow=f.api.beginFlow('startup');f.setClock(3010);
  f.api.markFlow(flow,'full_data');f.api.markFlow(flow,'ui_updated');const saved=f.summary();
  const query=f.api.beginFlow('query');f.setClock(3100);f.api.markFlow(query,'ui_updated');f.api.startupMode('PRIVATE_TOKEN');
  assert.equal(f.summary(),saved);assert.match(saved,/尚未達標/);assert.ok(!saved.includes('PRIVATE_TOKEN'));
});
check('startup includes page download time, while ordinary operations retain their own start',()=>{
  const f=fixture();f.c.performance.timeOrigin=f.c.Date.now()-400;
  const flow=f.api.beginFlow('startup');f.setClock(2700);f.api.markFlow(flow,'full_data');f.api.markFlow(flow,'ui_updated');
  assert.match(f.summary(),/完整畫面就緒：3.10 秒/);assert.match(f.summary(),/尚未達標/);
  const query=f.api.beginFlow('query');assert.equal(query.startedAt,f.c.Date.now());
  f.c.performance.timeOrigin=f.c.Date.now()+1000;const invalid=f.api.beginFlow('startup');assert.equal(invalid.startedAt,f.c.Date.now());
});
console.log(JSON.stringify({passed:count,networkRequests:0}));

// Exercise the actual initializer while an auth result is pending: early startup
// and the later DOMContentLoaded event must share one attempt.
{
  const a=html.indexOf('      async function initializeAdminPage()'),
    b=html.indexOf('      function waitForAdminStartupPaint()',a);
  assert.ok(a>0&&b>a);
  let calls=0, completeAuth;
  const element={addEventListener(){},classList:{remove(){}},dataset:{}};
  const c={Date,Promise,adminPageInitializationStarted:false,GROUP_ORDERS_ENABLED:false,
    document:{getElementById:()=>element,querySelector:()=>null},
    window:{addEventListener(){},AdminDiagnostics:{beginFlow(){},startupMode(){},finishFlow(){}}},
    isAdminStartupWorkspaceEnabled:()=>true,readAdminShipmentDiagnostics:()=>[],
    getShippingManifestCustomCalendarMonthSeed:()=>({year:2026,month:10}),
    initAdminAuth:()=>{calls++;return new Promise(resolve=>{completeAuth=resolve;});}};
  const noops=['initializeAdminManualRefreshControl','initializeAdminCardViewMode','handleAdminNetworkOffline',
    'handleAdminNetworkRestored','flushPendingAdminAuthDiagnostics','handleAdminCustomerSearchInput',
    'handleAdminCustomerSearchKeydown','handleAdminCustomerSearchConfirm','handleNewOrderSameAsRecipientChange',
    'handleNewOrderSenderNameInput','autofillHistoricalBuyerPhone','handleNewOrderSenderPhoneInput',
    'syncNewOrderSenderFromRecipient','refreshAdminOrdersFromOverlay','hideAdminAuthOverlay',
    'setShippingManifestCustomCalendarMonth','renderShippingManifestCustomDateCalendar','bindAdminWorkflowEvents',
    'updateCurrentWeekFilterButtonLabel','renderCustomDateCalendar','calculateCardAmount','updateStatsCounters',
    'handleBatchCheckChange','initShipmentBaseline','updateNotifyButton','renderProductManagement'];
  for(const name of noops)c[name]=()=>{};
  vm.createContext(c);vm.runInContext(html.slice(a,b),c);
  const first=c.initializeAdminPage();await c.initializeAdminPage();
  assert.equal(calls,1);completeAuth(false);await first;await c.initializeAdminPage();assert.equal(calls,1);
  console.log('PASS early startup and DOM ready share exactly one auth attempt');
}
{
  const a=html.indexOf('      function waitForAdminStartupPaint()'),b=html.indexOf('      // ==========================================',a);
  const frames=[];const c={Promise,window:{requestAnimationFrame:fn=>frames.push(fn)}};vm.createContext(c);vm.runInContext(html.slice(a,b),c);
  let done=false;const pending=c.waitForAdminStartupPaint().then(()=>{done=true;});
  assert.equal(done,false);frames.shift()();await Promise.resolve();assert.equal(done,false);
  frames.shift()();await pending;assert.equal(done,true);
  console.log('PASS complete UI waits for a browser paint opportunity');
}
