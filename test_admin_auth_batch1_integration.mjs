import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { webcrypto, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { gzipSync } from 'node:zlib';

// Exercise the real page initializer, callback, direct transport and compressed
// workspace validator together. Delivery and the visual DOM are local fixtures.
const root = new URL('./', import.meta.url);
const readSource = filename => process.env.ADMIN_AUTH_TEST_BASE === '1'
  ? execFileSync('git', ['show', 'e48b6d960443af0c2a087c3be2d424ec3bde4ffa:'+filename],
    {cwd:root, encoding:'utf8', maxBuffer:4*1024*1024})
  : readFileSync(new URL(filename, root), 'utf8');
const html = readSource('index.html');
const direct = readSource('admin-direct-response.js');
function block(start, end) {
  const pos = html.indexOf(start);
  const stop = html.indexOf(end, pos);
  assert.ok(pos >= 0 && stop > pos, start);
  return html.slice(pos, stop);
}
function fn(name) {
  const pattern = new RegExp('^      (?:async )?function ' + name + '\\([\\s\\S]*?^      }$', 'm');
  const match = html.match(pattern);
  assert.ok(match, name);
  return match[0];
}
const entryPoints = [
  block('      async function fetchAdminRecoverableResponse(', '      function createAdminRequestKey('),
  block('      function clearAdminAuthSession()', '      function base64UrlEncode'),
  block('      let adminSessionVerifiedAt', '      // ADMIN_SETTINGS_CONTROLS_START'),
  block('      let adminOrderSnapshotReadPromise', '      async function loadAdminOrdersForCurrentView'),
  ...['isAdminNetworkRecoveryError','classifyAdminReadFrontendError','showAdminAuthOverlay','hideAdminAuthOverlay',
    'getAdminAuthErrorMessage','getAdminOrderReadFailureMessage','normalizeAdminReadErrorCode','compareAdminOrdersByCreatedAtDesc','decodeAdminSnapshotGzipBase64Json',
    'attachAdminOrderSnapshotReadMeta','acceptAdminStartupWorkspace','initializeAdminPage','waitForAdminStartupPaint'].map(fn),
].join('\n');
const relay = 'https://sanheyuan-admin-response.zoe-quokka.workers.dev/request';
const fixtureOrder = 'FIXTURE-ONLY-1';
const fixtureState = 'fixture-state';
const fixtureNonce = 'fixture-nonce';
const fixtureVerifier = 'fixture-verifier';
const fixtureToken = 'fixture-session';
function workspace(requestId, corrupt = false) {
  const compressed = gzipSync(JSON.stringify({bucketId: 0, orders: [{orderNo: fixtureOrder}]}));
  const checksum = createHash('sha256').update(compressed).digest('hex');
  return {ok:true, action:'adminReadOrderSnapshot', requestId, source:'firestore', stale:false,
    schemaVersion:1, version:'fixture', liveVersion:'fixture:1', orderCount:1, bucketCount:1,
    manifest:[{bucketId:0, orderCount:1, checksum}],
    chunks:[{bucketId:0, checksum:corrupt ? '0'.repeat(64) : checksum, encoding:'gzip-base64', data:compressed.toString('base64')}]};
}
function fixture({callback='valid', existing=false, sessionAllowed=true, delivery='normal', receipt='success', corrupt=false}={}) {
  const values = new Map([['state',fixtureState],['verifier',fixtureVerifier],['nonce',fixtureNonce]]);
  if (callback === 'missing') values.delete('state');
  if (existing) values.set('token', fixtureToken);
  const sessionStorage = {getItem:k=>values.get(k) ?? null, setItem(k,v){values.set(k,String(v));}, removeItem(k){values.delete(k);}};
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) {
      const classes = new Set();
      nodes.set(id, {dataset:{}, disabled:id==='add', classList:{contains:k=>classes.has(k), add:k=>classes.add(k), remove:k=>classes.delete(k),
        toggle(k, on){if(on) classes.add(k); else classes.delete(k);}}, setAttribute(){},addEventListener(){}});
    }
    return nodes.get(id);
  };
  const calls=[], diagnostics=[], phases=[], renders=[];
  const location = new URL('https://fixture.invalid/admin/?code=one-time-fixture&state='+ (callback==='different'?'unmatched':fixtureState));
  const timers = new Set();
  const window = {location,addEventListener(){},requestAnimationFrame:f=>queueMicrotask(f),
    setTimeout(f,ms){const handle=setTimeout(f,ms);timers.add(handle);return handle;},
    clearTimeout:clearTimeout,ORDER_SYSTEM_CONFIG:{customerId:'sanheyuan',environment:'production',adminDirectResponseUrl:relay,
      features:{adminDirectResponse:true,adminStartupWorkspace:true}},
    AdminDiagnostics:{beginFlow(name){return {name};},markFlow(f,phase){phases.push([f?.name,phase]);},
      finishFlow(f, result){phases.push([f?.name,result.outcome]);},bindRequestToFlow(){}}};
  const json=value=>new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
  const actions = ['adminAuth','adminValidateSession','adminReadOrderSnapshot'];
  let seq=0;
  const context = {window, document:{title:'Fixture',visibilityState:'visible',addEventListener(){},getElementById:node,querySelector:s=>s==='.btn-add-order-trigger'?node('add'):null},
    history:{replaceState(_state,_title,url){location.href=url;}},sessionStorage,navigator:{onLine:true},
    Date,URL,URLSearchParams,AbortController,Response,Blob,DecompressionStream,atob,crypto:webcrypto,console,
    ADMIN_LINE_STATE_KEY:'state',ADMIN_LINE_NONCE_KEY:'nonce',ADMIN_LINE_CODE_VERIFIER_KEY:'verifier',ADMIN_LINE_SESSION_TOKEN_KEY:'token',
    ADMIN_DISPLAY_NAME_KEY:'name',ADMIN_AUTH_REDIRECT_URI:'https://fixture.invalid/admin/',ADMIN_AUTH_TIMEOUT_MS:60000,
    GAS_ORDERS_API_URL:'fixture:gas',ADMIN_ORDER_SNAPSHOT_CLIENT_ENABLED:true,ADMIN_ORDER_SNAPSHOT_ATTEMPT_TIMEOUT_MS:20000,ADMIN_READ_ORDERS_TIMEOUT_MS:20000,
    ADMIN_INITIAL_LOAD_SLOW_MS:12000,ADMIN_INITIAL_ORDER_RETRY_DELAY_MS:1,GROUP_ORDERS_ENABLED:false,
    ADMIN_ORDERS_PER_PAGE:20,adminCurrentPage:1,adminPageInitializationStarted:false,adminOrderMutationRevision:0,adminOrderWorkspaceComplete:false,
    adminOrderSnapshotVersion:'',adminOrderSnapshotManifest:[],adminOrderSnapshotChunks:new Map(),adminOrderSnapshotEncodedChunks:new Map(),
    adminAuthBlocksDataLoad:false,adminAuthNavigationPending:false,currentAdminName:'',getAdminOrderPageFilter:()=>({page:1,pageSize:20}),
    getShippingManifestCustomCalendarMonthSeed:()=>({year:2026,month:11}), readAdminShipmentDiagnostics:()=>[],
    loadPendingAdminCreateRequest:()=>null, readAdminCreateDraft:()=>null, shouldOfferAdminRefreshFromMessage:()=>false,
    createAdminDiagnosticRequestId:action=>action+'_'+String(++seq).padStart(32,'0'),
    publishAdminAuthDiagnostic:event=>diagnostics.push(event), renderAdminOrders(orders){renders.push(orders.map(o=>o.orderNo));return true;},
    fetch:async(url,options)=>{
      assert.equal(url,relay,'all network is intercepted or rejected');const q=JSON.parse(options.body);calls.push(q);
      assert.ok(actions.includes(q.action),'no notifications or writes');
      if(q.action==='adminValidateSession'){
        if(sessionAllowed==='unconfirmed')throw new TypeError('fixture validation transport unavailable');
        return json(sessionAllowed?{ok:true,allowed:true,action:q.action}:{ok:false,action:q.action,error:'ADMIN_SESSION_REQUIRED'});
      }
      if(q.action==='adminReadOrderSnapshot'){
        assert.equal(q.adminSessionToken,fixtureToken);
        return json(sessionAllowed?workspace(q.requestId,corrupt):{ok:false,action:q.action,error:'ADMIN_SESSION_REQUIRED'});
      }
      if(!q.resultOnly && delivery==='body-loss') {
        return {status:200,ok:true,headers:new Headers({'content-type':'application/json'}),text:async()=>{throw new TypeError('stream disconnected');}};
      }
      if(q.resultOnly){
        assert.ok(!Object.hasOwn(q,'code'),'receipt read never replays the one-time code');
        const original=calls.find(x=>x.action==='adminAuth');
        for(const key of ['nonce','codeVerifier','redirectUri','diagnosticRequestId'])assert.equal(q[key],original[key],key);
        if(receipt==='denied')return json({ok:true,action:q.action,allowed:false,state:'rejected'});
        if(receipt!=='success')return json({ok:false,action:q.action,error:receipt,restartRequired:receipt!=='ADMIN_AUTH_PENDING'});
        // The deployed Execution API attaches the requested protected workspace
        // to a successful resultOnly response just as it does for a new session.
        assert.deepEqual(q.startup,original.startup);
        return json({ok:true,action:q.action,allowed:true,adminSessionToken:fixtureToken,state:'succeeded',reused:true,
          startup:{requestId:q.startup.requestId,workspace:true,snapshot:workspace(q.startup.requestId,corrupt)}});
      }
      assert.equal(q.code,'one-time-fixture');assert.equal(q.nonce,fixtureNonce);assert.equal(q.codeVerifier,fixtureVerifier);
      return json({ok:true,action:q.action,allowed:true,adminSessionToken:fixtureToken,startup:{requestId:q.startup.requestId,workspace:true,snapshot:workspace(q.startup.requestId,corrupt)}});
    }};
  for(const name of ['initializeAdminManualRefreshControl','initializeAdminCardViewMode','flushPendingAdminAuthDiagnostics',
    'handleAdminNetworkOffline','handleAdminNetworkRestored','refreshAdminOrdersFromOverlay','handleAdminCustomerSearchInput','handleAdminCustomerSearchKeydown','handleAdminCustomerSearchConfirm',
    'handleNewOrderSameAsRecipientChange','handleNewOrderSenderNameInput','handleNewOrderSenderPhoneInput','autofillHistoricalBuyerPhone','syncNewOrderSenderFromRecipient','setShippingManifestCustomCalendarMonth',
    'renderShippingManifestCustomDateCalendar','bindAdminWorkflowEvents','updateCurrentWeekFilterButtonLabel','renderCustomDateCalendar','calculateCardAmount',
    'updateStatsCounters','handleBatchCheckChange','initShipmentBaseline','updateNotifyButton','renderProductManagement','initializeAdminLiveOrderSync',
    'reconcilePendingAdminShipment','recoverPendingAdminCreateOrderOnLoad','applyReadOnlyModeToRealOrders','recordAdminReadBreadcrumb','setAdminStatusPanelVisible',
    'updateAdminRefreshMeta','restoreAdminTab','queueAdminCompleteWorkspaceLoad','persistAdminOrderSnapshotSessionCache','clearAdminOrderSnapshotSessionCache',
    'scheduleAdminLiveOrderSync'])context[name]=()=>{};
  window.fetch=context.fetch;vm.createContext(context);vm.runInContext(direct+'\n'+entryPoints,context);
  return {calls,values,diagnostics,phases,node,renders,async run(){try{await context.initializeAdminPage();}finally{for(const h of timers)clearTimeout(h);}}};
}
function assertReady(f){
  assert.equal(f.values.get('token'),fixtureToken);
  assert.deepEqual(f.renders.flat(),[fixtureOrder]);
  assert.equal(f.node('add').disabled,false);
  assert.equal(f.node('adminAuthOverlay').classList.contains('hidden'),true);
  assert.ok(f.phases.some(([name,p])=>name==='startup'&&p==='first_usable'));
  assert.ok(f.phases.some(([name,p])=>name==='startup'&&p==='success'));
}
function assertBlocked(f){
  assert.equal(f.renders.length,0);
  assert.equal(f.node('add').disabled,true);
  assert.ok(!f.phases.some(([n,p])=>n==='startup'&&['first_usable','success'].includes(p)));
}
test('normal callback renders the actual compressed first workspace with one application call',async()=>{
  const f=fixture();await f.run();assertReady(f);assert.deepEqual(f.calls.map(x=>x.action),['adminAuth']);
});
test('lost HTTP 200 body can confirm the same exchange and render its protected workspace',async()=>{
  const f=fixture({delivery:'body-loss'});await f.run();assertReady(f);
  assert.deepEqual(f.calls.map(x=>[x.action,!!x.resultOnly]),[['adminAuth',false],['adminAuth',true]]);
});
for(const callback of ['missing','different']){
  test('stale callback '+callback+' can only resume an independently verified current session',async()=>{
    const f=fixture({callback,existing:true});await f.run();assertReady(f);
    assert.deepEqual(f.calls.map(x=>x.action),['adminValidateSession','adminReadOrderSnapshot']);
  });
  test('stale callback '+callback+' with expired session does not render or exchange code',async()=>{
    const f=fixture({callback,existing:true,sessionAllowed:false});await f.run();assertBlocked(f);
    assert.deepEqual(f.calls.map(x=>x.action),['adminValidateSession']);assert.ok(!f.values.has('token'));
  });
}
test('stale callback without a stored session does not attempt an exchange',async()=>{
  const f=fixture({callback:'different'});await f.run();assertBlocked(f);assert.equal(f.calls.length,0);
});
test('unconfirmed existing session keeps the blocked screen and token available for a safe recheck',async()=>{
  const f=fixture({callback:'different',existing:true,sessionAllowed:'unconfirmed'});
  await f.run();assertBlocked(f);assert.equal(f.values.get('token'),fixtureToken);
  assert.deepEqual(f.calls.map(x=>x.action),['adminValidateSession']);
});
for(const receipt of ['ADMIN_AUTH_PENDING','denied','ADMIN_AUTH_CONTEXT_INVALID','ADMIN_AUTH_RESULT_NOT_FOUND']){
  test('lost response with '+receipt+' cannot expose protected order UI',async()=>{
    const f=fixture({delivery:'body-loss',receipt});await f.run();assertBlocked(f);
    assert.equal(f.calls.filter(x=>x.action==='adminAuth'&&!x.resultOnly).length,1);
    assert.equal(f.calls.filter(x=>x.resultOnly).length,1);
    const [first,check]=f.calls;
    assert.ok(!Object.hasOwn(check,'code'));
    for(const key of ['nonce','codeVerifier','redirectUri','diagnosticRequestId','startup'])assert.deepEqual(check[key],first[key]);
    assert.ok(!f.values.has('token'));assert.ok(f.calls.every(x=>x.action==='adminAuth'));
  });
}
test('successfully recovered receipt with damaged workspace cannot mark the screen ready',async()=>{
  const f=fixture({delivery:'body-loss',corrupt:true});await f.run();assertBlocked(f);
  assert.ok(f.calls.some(x=>x.resultOnly && x.startup?.workspace===true));
  assert.equal(f.calls.filter(x=>x.action==='adminAuth'&&!x.resultOnly).length,1);
});
