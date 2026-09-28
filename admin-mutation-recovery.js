/* Durable result recovery for existing order edits. No write is retried during
 * an attempt. Storage contains only an operation key and a one-way fingerprint. */
(function (root) {
  'use strict';
  const actions = new Set(['adminUpdateOrderWorkflow','adminUpdateOrderContent',
    'adminUpdateOrderAdminNote','adminUpdateActualShippingDate','adminCancelOrder',
    'adminImportTrackingNumbers','adminUpdateGroupOrder','adminBatchMarkGroupOrderPaid',
    'adminSetGroupCodAmount','adminCloseGroupOrder']);
  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
    return value;
  }
  root.createAdminMutationClient = function (config) {
    let flight = null;
    const key = config.storageKey;
    const notify = (state) => { try { config.onState?.(state); } catch {} };
    const load = () => {
      const raw = config.storage.getItem(key);
      if (!raw) return null;
      const value = JSON.parse(raw);
      if (!value?.requestKey || !value.fingerprint || !actions.has(value.action)) throw Error('ADMIN_MUTATION_STORAGE_INVALID');
      return value;
    };
    const store = value => { try { config.storage.setItem(key, JSON.stringify(value)); } catch { throw Error("ADMIN_MUTATION_STORAGE_INVALID"); } };
    const supported = (url,options) => {
      try { return url === config.url && options?.method === 'POST' && actions.has(JSON.parse(options.body).action); } catch { return false; }
    };
    const diagnosticRequestId = entry => entry.action+'_'+entry.requestKey.slice(9).replace(/-/g,'');
    const bindFlow = (entry,flow) => { try { config.diagnostics?.bindRequestToFlow?.(diagnosticRequestId(entry),flow); } catch {} };
    const response = (result,entry,flow) => ({ok:true,status:200,json:async()=>result,text:async()=>JSON.stringify(result),diagnosticFlow:flow,diagnosticRequestId:diagnosticRequestId(entry)});
    async function request(body, timeoutMs) {
      const controller = new AbortController(); let timer;
      try {
        return await Promise.race([
          (async () => {
            const res=await config.fetch(config.url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(body),signal:controller.signal});
            const text=await res.text();
            if (!res.ok) throw Error('HTTP_'+res.status);
            return JSON.parse(text);
          })(),
          new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('GAS_TIMEOUT'));},timeoutMs);})
        ]);
      } finally {clearTimeout(timer);}
    }
    async function read(entry,token,flow) {
      notify('checking');
      bindFlow(entry,flow);
      for(let attempt=0;attempt<2;attempt++) {
        try {
          const result=await request({action:'adminReadOrderMutationResult',requestKey:entry.requestKey,mutationAction:entry.action,requestId:diagnosticRequestId(entry),adminSessionToken:token},8000);
          if(result?.errorCode==='ADMIN_SESSION_REQUIRED') throw Error('ADMIN_SESSION_REQUIRED');
          if(result?.ok===true && result.action==='adminReadOrderMutationResult' && result.requestKey===entry.requestKey) {
            if(result.state==='completed' && result.result?.action===entry.action && typeof result.result.ok==='boolean') return result.result;
            if(result.state==='not_found') {entry.notFound=true;store(entry);}
            else {entry.notFound=false;store(entry);}
          }
        } catch(error) { if(error.message==='ADMIN_SESSION_REQUIRED') throw error; }
      }
      notify('unknown'); throw Error('ADMIN_MUTATION_UNCONFIRMED');
    }
    async function execute(options) {
      const payload=JSON.parse(options.body),token=payload.adminSessionToken,flow=options.diagnosticFlow;
      delete payload.adminSessionToken;
      const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(canonical(payload))));
      const fingerprint=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
      let entry=load();
      if(entry) {
        // A different draft can query the previous operation but cannot be
        // labelled saved by a result belonging to that previous draft.
        if(entry.fingerprint!==fingerprint || !entry.notFound) {
          const result=await read(entry,token,flow);
          config.storage.removeItem(key);notify('resolved');
          if(entry.fingerprint!==fingerprint) throw Error('ADMIN_MUTATION_PREVIOUS_RESOLVED');
          return response(result,entry,flow);
        }
      } else {
        entry={requestKey:'mutation_'+crypto.randomUUID(),action:payload.action,fingerprint,notFound:false};
      }
      entry.notFound=false;
      store(entry); // Fail closed before the write if browser storage is unavailable.
      notify('saving');
      bindFlow(entry,flow);
      try {
        const result=await request({action:'adminExecuteOrderMutation',requestKey:entry.requestKey,requestId:diagnosticRequestId(entry),mutation:payload,adminSessionToken:token},15000);
        if(result?.action===entry.action && typeof result.ok==='boolean' && result.errorCode!=='ADMIN_MUTATION_UNCONFIRMED') {
          if(result.ok && result.requestKey!==entry.requestKey) throw Error('RESULT_KEY_MISMATCH');
          config.storage.removeItem(key);notify('resolved');return response(result,entry,flow);
        }
      } catch { /* Transport failure is not a business failure. Read, do not resend. */ }
      const result=await read(entry,token,flow);
      config.storage.removeItem(key);notify('resolved');return response(result,entry,flow);
    }
    return {
      supported,
      fetch(url,options) {
        if(!supported(url,options)) return config.fetch(url,options);
        if(flight) return Promise.reject(Error('ADMIN_MUTATION_BUSY'));
        flight=execute(options).finally(()=>{flight=null;});return flight;
      },
      hasPending:()=>!!load(),
    };
  };
})(typeof window === 'undefined' ? globalThis : window);
