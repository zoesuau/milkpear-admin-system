/* Diagnostic telemetry is best-effort. It never retries a business request. */
(function () {
  'use strict';
  const config = window.ORDER_SYSTEM_CONFIG || {};
  if (config.customerId !== 'sanheyuan' || config.environment !== 'production') return;
  const rawFetch = window.fetch.bind(window);
  const endpoint = String(config.adminAuthDiagnosticsUrl || '').replace(/\/admin-auth-failures$/, '/admin-diagnostics');
  const prefix = 'sanheyuan:diagnostics:v2:';
  const MAX_QUEUE = 500, MAX_HISTORY = 100, MAX_AGE = 7 * 86400000;
  const actions = new Set(['adminAuth','adminValidateSession','adminReadOrders','adminReadOrderSnapshot','adminReadProductCatalog','adminReadShipmentResults','adminCreateOrder','adminCheckCreateOrderResult','adminUpdateOrderContent','adminUpdateOrderWorkflow','adminUpdateOrderAdminNote','adminCancelOrder','adminMarkOrderShipped','adminBatchMarkOrdersShipped','adminAdjustProductInventory','adminReadInventoryAdjustmentResult','adminBatchMarkGroupOrderPaid','adminCloseGroupOrder','adminCloseShippingBatch','adminCreateEzcatExportBatch','adminCreateGroupOrder','adminCreateGroupOrderChild','adminDownloadEzcatExportBatch','adminImportTrackingNumbers','adminReadEzcatExportCandidates','adminReadGroupOrders','adminReadProductInventoryContext','adminReadShippingBatches','adminSearchCustomers','adminSetGroupCodAmount','adminSyncOrderSnapshot','adminUpdateGroupOrder','adminUpdateProductManagement','adminUpdateProductFields','adminReadProductSaveResult','adminUploadBannerImage','adminUpsertShippingBatch']);
  const stages = new Set(['REQUEST','RESPONSE','RESULT','RENDER','RECONCILE','PAGE','NETWORK','AUTH']);
  const outcomes = new Set(['started','success','failure','interrupted','online','offline','visible','hidden']);
  const codes = new Set(['OK','UNKNOWN_ERROR','AUTH_START_FAILED','AUTH_PROVIDER_CALLBACK_ERROR','AUTH_CALLBACK_CONTEXT_MISSING','AUTH_CALLBACK_STATE_MISMATCH','AUTH_CALLBACK_PARAMETER_MISSING','ADMIN_AUTH_PENDING','ADMIN_AUTH_RESULT_NOT_FOUND','ADMIN_AUTH_RESTART_REQUIRED','GOOGLE_AUTH_REQUIRED','GAS_SERVER_ERROR','GAS_AUTH_REQUEST_FAILED','LINE_TOKEN_EXCHANGE_FAILED','INVENTORY_RESULT_UNCONFIRMED','INVENTORY_REVIEW_REQUIRED','INVENTORY_UPDATE_INDETERMINATE','INVENTORY_PENDING_CHANGED','INVENTORY_STOCK_CHANGED','INVENTORY_UPDATE_BUSY','INVENTORY_REQUEST_KEY_CONFLICT','PRODUCT_SAVE_UNCONFIRMED','PRODUCT_SAVE_REVIEW_REQUIRED','PRODUCT_FIELD_CONFLICT','PRODUCT_SAVE_REQUEST_CONFLICT','PRODUCT_SAVE_RECEIPT_INVALID','PRODUCT_CATALOG_STALE','PRODUCT_CATALOG_INVALID','PRODUCT_CATALOG_HEADER_MISMATCH','PRODUCT_CATALOG_VERSION_REQUIRED','PRODUCT_MANAGEMENT_UPDATE_BUSY','PRODUCT_MANAGEMENT_UPDATE_FAILED','PRODUCT_MANAGEMENT_SAVE_FAILED','PRODUCT_ID_CODE_IMMUTABLE','PRODUCT_SPEC_IMMUTABLE','PRODUCT_SHIPPING_RULE_INVALID','PRODUCT_STOCK_SEPARATE_ACTION_REQUIRED','SITE_SETTINGS_INVALID','SITE_SETTINGS_HEADER_MISMATCH','NETWORK_ERROR','GAS_TIMEOUT','GAS_NON_JSON_RESPONSE','ADMIN_NETWORK_OFFLINE','ADMIN_SESSION_REQUIRED','ADMIN_SESSION_VALIDATION_FAILED','GAS_AUTH_RESPONSE_INVALID','LINE_AUTH_MISSING_FIELD','LINE_AUTH_FAILED','AUTH_GOOGLE_403','SHIPMENT_RESPONSE_TIMEOUT','SHIPMENT_READBACK_FAILED','SHIPMENT_READBACK_INVALID','SHIPMENT_RESPONSE_INVALID','SHIPMENT_RENDER_FAILED','SHIPMENT_STATE_PENDING','SHIPMENT_PAUSED','SHIPMENT_BUDGET_EXHAUSTED','SHIPMENT_NOT_COMMITTED','ORDER_CREATE_FAILED','ORDER_CREATE_INDETERMINATE','ORDER_CREATE_LOCAL_UPDATE_FAILED','PRODUCT_STOCK_INSUFFICIENT','ADMIN_ORDERS_READ_FAILED','ABORTED','UNCONFIRMED']);
  let storageOK = true, pending = new Map(), history = [], dropped = 0, timer, uploading = false, retry = 0, lastUpload = '', uploadState = '';
  const uuid = () => crypto.randomUUID();
  function read(key, fallback) { try { return JSON.parse(localStorage.getItem(prefix + key)) ?? fallback; } catch { storageOK = false; return fallback; } }
  function write(key, value) { try { localStorage.setItem(prefix + key, JSON.stringify(value)); } catch { storageOK = false; } }
  const isId = x => typeof x === 'string' && /^[a-f0-9-]{36}$/.test(x);
  let deviceId = read('device', ''); if (!isId(deviceId)) { deviceId = uuid(); write('device', deviceId); }
  const pageId = uuid();
  const version = document.documentElement.dataset.releaseVersion || 'unknown';
  function sanitizeSnapshotTiming(value) {
    if (!value || typeof value !== 'object') return null;
    const readReasons = new Set(['NOT_ATTEMPTED','DISABLED','DIRTY','VERSION_MISSING','INDEX_MISSING','VERSION_MISMATCH','INDEX_INVALID','SEGMENT_MISSING','SEGMENT_INVALID','LENGTH_MISMATCH','CHECKSUM_MISMATCH','MANIFEST_INVALID','PUBLICATION_CHANGED','HIT','READ_EXCEPTION','REQUIRED_VERSION_MISMATCH']);
    const writeReasons = new Set(['NOT_ATTEMPTED','DIRTY','VERSION_MISSING','VERSION_MISMATCH','MANIFEST_INVALID','TOO_LARGE','PUBLICATION_CHANGED','STORED','WRITE_EXCEPTION']);
    const result = {};
    for (const key of ['serverElapsedMs','sessionMs','cacheMs','manifestMs','chunksMs','firestoreMs','driveMs']) {
      result[key] = Number.isFinite(value[key]) && value[key] >= 0 ? Math.min(600000, value[key]) : null;
    }
    result.cacheHit = typeof value.cacheHit === 'boolean' ? value.cacheHit : null;
    result.cacheReadReason = readReasons.has(value.cacheReadReason) ? value.cacheReadReason : 'UNKNOWN';
    result.cacheWriteReason = writeReasons.has(value.cacheWriteReason) ? value.cacheWriteReason : 'UNKNOWN';
    return result;
  }

  // Match only IDs generated by createAdminDiagnosticRequestId; use the same
  // separator normalization as the GAS execution logger. Never accept arbitrary text.
  function safeRequestId(value) {
    if (typeof value !== 'string') return '';
    const match = /^(admin[A-Za-z0-9]{1,60})[|_](?:([a-f0-9]{32})|([0-9]{13}[a-z0-9]{1,20}))$/.exec(value);
    if (!match || !(actions.has(match[1]) || match[1] === 'adminReadOrderSnapshotBootstrap')) return '';
    return value.replace('|', '_');
  }

  function clean(value) {
    if (!value || !isId(value.id) || !isId(value.operationId) || !isId(value.deviceId) || !isId(value.pageId)) return null;
    if (!Number.isFinite(value.at) || value.at < Date.now() - MAX_AGE || value.at > Date.now() + 300000) return null;
    return {requestId:safeRequestId(value.requestId), id:value.id, operationId:value.operationId, deviceId:value.deviceId, pageId:value.pageId, at:value.at,
      action:actions.has(value.action) ? value.action : 'client', stage:stages.has(value.stage) ? value.stage : 'RESULT',
      outcome:outcomes.has(value.outcome) ? value.outcome : 'failure',
      code:codes.has(value.code) || /^HTTP_[45]\d\d$/.test(value.code) ? value.code : 'UNKNOWN_ERROR',
      elapsedMs:Math.min(600000, Math.max(0, Number(value.elapsedMs) || 0)),
      headersMs:Number.isFinite(value.headersMs) ? Math.min(600000,Math.max(0,value.headersMs)) : null,
      snapshotTiming:value.action==='adminReadOrderSnapshot' && value.stage==='RESULT' ? sanitizeSnapshotTiming(value.snapshotTiming) : null,
      bodyMs:Number.isFinite(value.bodyMs) ? Math.min(600000,Math.max(0,value.bodyMs)) : null,
      responseHost:['google-script','google-content','other','unknown'].includes(value.responseHost) ? value.responseHost : 'unknown',
      redirected:typeof value.redirected === 'boolean' ? value.redirected : null,
      httpStatus:Number.isInteger(value.httpStatus) && value.httpStatus >= 100 && value.httpStatus <= 599 ? value.httpStatus : null,
      version:/^[a-zA-Z0-9._-]{1,80}$/.test(value.version) ? value.version : 'unknown',
      deviceType:['mobile','desktop','unknown'].includes(value.deviceType) ? value.deviceType : 'unknown',
      online:value.online === true};
  }
  const deviceType = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || '') ? 'mobile' : 'desktop';
  function restore() {
    const rows = read('history', []); history = Array.isArray(rows) ? rows.map(clean).filter(Boolean).slice(-MAX_HISTORY) : [];
    const rowsPending = read('queue', []); if (Array.isArray(rowsPending)) for (const r of rowsPending) { const e=clean(r); if(e) pending.set(e.id,e); }
    dropped = Math.max(0, Number(read('dropped',0)) || 0);
  }
  function syncQueue() {
    // Merge rather than overwrite another tab's pending records. Server deduplication
    // makes acknowledgement loss / tab races safe (only diagnostics are replayed).
    const saved = read('queue', []);
    if (Array.isArray(saved)) for (const r of saved) {const e=clean(r); if(e) pending.set(e.id,e);}
    for (const [id,e] of pending) if (!clean(e)) {pending.delete(id); dropped++;}
    while (pending.size > MAX_QUEUE) {pending.delete(pending.keys().next().value); dropped++;}
    write('queue',[...pending.values()]); write('dropped',dropped);
  }
  function schedule(delay=3000) { if (!timer) timer=setTimeout(()=>{timer=null; void flush();},delay); }
  function record(input={}) {
    try {
      const e=clean({...input,id:uuid(),operationId:isId(input.operationId)?input.operationId:uuid(),deviceId,pageId,at:Date.now(),version,deviceType,online:navigator.onLine !== false});
      if(!e)return; history.push(e); history=history.slice(-MAX_HISTORY);pending.set(e.id,e);
      write('history',history);syncQueue();render();schedule();
    } catch { /* Must not affect application control flow. */ }
  }
  async function flush() {
    if(uploading || !endpoint || navigator.onLine === false)return;
    syncQueue(); if(!pending.size){render();return;}
    uploading=true;uploadState='正在背景上傳';render();
    const batch=[...pending.values()].slice(0,20); const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),10000);
    try {
      const response=await rawFetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({productId:config.productId,customerId:config.customerId,environment:config.environment,events:batch}),signal:controller.signal,keepalive:true});
      const result=await response.json();if(!response.ok || result.ok!==true || !Array.isArray(result.ack))throw new Error('UPLOAD_FAILED');
      const sent=new Set(batch.map(e=>e.id));syncQueue();
      for(const id of result.ack)if(sent.has(id))pending.delete(id);
      write('queue',[...pending.values()]);retry=0;lastUpload=new Date().toLocaleString();uploadState='';
    } catch {retry++;uploadState='上傳暫未成功，紀錄已保留，會自動再試';}
    finally {clearTimeout(timeout);uploading=false;render();if(pending.size)schedule(Math.min(60000,3000 * 2 ** Math.min(retry,5)));}
  }
  const labels={REQUEST:'請求開始',RESPONSE:'伺服器回覆',RESULT:'處理結果',RENDER:'畫面更新',RECONCILE:'查回結果',PAGE:'頁面狀態',NETWORK:'網路狀態',AUTH:'登入流程'};
  function responseMetadata(response) {
    let responseHost='unknown';
    try {const host=new URL(response.url).hostname;
      responseHost=host==='script.google.com'?'google-script':host==='script.googleusercontent.com'?'google-content':'other';
    } catch {}
    return {responseHost,redirected:typeof response.redirected==='boolean'?response.redirected:null};
  }
  function format(e){return `${new Date(e.at).toLocaleString()}｜${e.action}｜${labels[e.stage]||e.stage}｜${e.outcome}｜${e.code}${e.elapsedMs?'｜'+(e.elapsedMs/1000).toFixed(2)+' 秒':''}${e.headersMs!==null&&e.headersMs!==undefined?'｜回應標頭 '+(e.headersMs/1000).toFixed(2)+' 秒':''}${e.bodyMs!==null&&e.bodyMs!==undefined?'｜資料讀取 '+(e.bodyMs/1000).toFixed(2)+' 秒':''}${e.responseHost&&e.responseHost!=='unknown'?'｜'+e.responseHost:''}${e.redirected===true?'｜已轉址':''}${e.snapshotTiming?'｜快取讀取 '+e.snapshotTiming.cacheReadReason+'｜快取存入 '+e.snapshotTiming.cacheWriteReason+(e.snapshotTiming.serverElapsedMs!==null?'｜後端 '+(e.snapshotTiming.serverElapsedMs/1000).toFixed(2)+' 秒':''):''}\n操作 ${e.operationId}${e.requestId ? "｜請求 " + e.requestId : ""}｜${e.deviceType}｜${e.version}`;}
  function render(){try{
    const el=document.getElementById('adminDiagnosticsText'); if(el)el.textContent=history.length?history.slice().reverse().map(format).join('\n\n'):'目前這個瀏覽器沒有診斷紀錄。';
    const status=document.getElementById('adminDiagnosticsStatus');if(status)status.textContent=`本機 ${history.length} 筆｜待上傳 ${pending.size} 筆${dropped?'｜超過保存上限／期限 '+dropped+' 筆':''}。${!storageOK?'瀏覽器無法持久保存，關閉後尚未上傳的紀錄可能遺失。':''}${navigator.onLine===false?'目前離線，恢復連線後自動補傳。':uploadState}${lastUpload?' 最近上傳：'+lastUpload:''}`;
  }catch{}}
  // No body, URL parameters, credentials, order identifiers or raw error messages
  // enter the diagnostic record. Original responses and failures are unchanged.
  const requestGroups = new Map();
  window.fetch = async function(input, options) {
    const url=typeof input==='string'?input:input?.url;let action, requestKey;
    try {if(url===config.gasApiUrl && typeof options?.body==='string'){const body=JSON.parse(options.body);action=body.action;requestKey=body.diagnosticRequestId||body.requestId;}}catch{}
    if(!actions.has(action))return rawFetch(input,options);
    let operationId=requestKey && requestGroups.get(action+'|'+requestKey);
    if(!operationId){operationId=uuid();if(requestKey){requestGroups.set(action+'|'+requestKey,operationId);if(requestGroups.size>200)requestGroups.delete(requestGroups.keys().next().value);}}
    const requestId=safeRequestId(requestKey);
    const start=Date.now();record({requestId,operationId,action,stage:'REQUEST',outcome:'started',code:'OK'});
    try {
      const response=await rawFetch(input,options);
      const headersAt=Date.now(), metadata={requestId,...responseMetadata(response),headersMs:headersAt-start};
      record({...metadata,operationId,action,stage:'RESPONSE',outcome:response.ok?'success':'failure',code:response.ok?'OK':'HTTP_'+response.status,httpStatus:response.status,elapsedMs:Date.now()-start});
      // Observe a copy asynchronously; never await telemetry or alter a business response.
      try {void response.clone().json().then(body=>{
        const ok=response.ok && body?.ok===true && (action!=='adminUpdateProductFields' || body.state==='committed');
        record({...metadata,snapshotTiming:action==='adminReadOrderSnapshot' && body?.action===action ? sanitizeSnapshotTiming({...body.timing,...(body.timing ? {} : body.diagnostic),serverElapsedMs:body.elapsedMs}) : null,bodyMs:Date.now()-headersAt,operationId,action,stage:'RESULT',outcome:ok?'success':'failure',code:ok?'OK':body?.errorCode||body?.error||'UNCONFIRMED',httpStatus:response.status,elapsedMs:Date.now()-start});
      },error=>record({...metadata,bodyMs:Date.now()-headersAt,operationId,action,stage:'RESULT',outcome:'failure',code:error?.name==='AbortError'?'ABORTED':error?.name==='SyntaxError'?'GAS_NON_JSON_RESPONSE':'NETWORK_ERROR',httpStatus:response.status,elapsedMs:Date.now()-start}));}catch{}
      return response;
    } catch(error) {record({requestId,operationId,action,stage:'RESULT',outcome:'failure',code:error?.name==='AbortError'?'ABORTED':'NETWORK_ERROR',elapsedMs:Date.now()-start});throw error;}
  };
  const shipIds=new Map();
  window.AdminDiagnostics={record,flush,render, async query(token) {
    if(!token)throw new Error('請先完成管理員登入。');
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),30000);
    try {const response=await rawFetch(endpoint+'/query',{method:'POST',headers:{'content-type':'application/json'},signal:controller.signal,body:JSON.stringify({adminSessionToken:token})});const result=await response.json();if(!response.ok||!result.ok)throw new Error('暫時無法讀取集中紀錄，請確認登入或服務狀態。');return result.events.map(format).join('\n\n')||'集中紀錄目前沒有資料。';}finally{clearTimeout(timeout);}
  }, shipment(value) {let id=shipIds.get(value.operationId);if(!id){id=uuid();shipIds.set(value.operationId,id);if(shipIds.size>100)shipIds.delete(shipIds.keys().next().value);}record({operationId:id,action:'adminBatchMarkOrdersShipped',stage:value.stage==='RENDER'?'RENDER':'RECONCILE',outcome:value.code==='OK'?'success':'failure',code:value.code,elapsedMs:value.elapsedMs,httpStatus:value.httpStatus});}};
  restore();
  window.addEventListener('online',()=>{record({stage:'NETWORK',outcome:'online',code:'OK'});void flush();});
  window.addEventListener('offline',()=>record({stage:'NETWORK',outcome:'offline',code:'ADMIN_NETWORK_OFFLINE'}));
  window.addEventListener('storage',e=>{if(e.key===prefix+'queue'){try{const rows=JSON.parse(e.newValue||'[]');pending=new Map((Array.isArray(rows)?rows:[]).map(clean).filter(Boolean).map(r=>[r.id,r]));}catch{}render();schedule();}});
  document.addEventListener('visibilitychange',()=>{record({stage:'PAGE',outcome:document.hidden?'hidden':'visible',code:'OK'});if(!document.hidden)void flush();});
  window.addEventListener('pagehide',()=>{syncQueue();void flush();});
  document.addEventListener('DOMContentLoaded',()=>{render();document.getElementById('adminDiagnostics')?.addEventListener('toggle',render);});
  record({stage:'PAGE',outcome:'visible',code:'OK'});
})();
