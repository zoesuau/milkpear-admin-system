(function () {
  'use strict';
  const endpoint = 'https://sanheyuan-admin-response.zoe-quokka.workers.dev/request';
  const actions = new Set(['adminAuth', 'adminValidateSession', 'adminReadOrderSnapshot', 'adminReadOrders', 'adminReadProductCatalog']);
  const shippingReads = new Set(['adminReadShippingManifest', 'adminReadEzcatExportCandidates', 'adminReadBlackCatCandidates', 'adminReadBlackCatBatch', 'adminDownloadBlackCatPdf']);
  shippingReads.forEach(action => actions.add(action));
  const config = window.ORDER_SYSTEM_CONFIG || {};
  const enabled = config.customerId === 'sanheyuan' && config.environment === 'production' &&
    config.adminDirectResponseUrl === endpoint && config.features?.adminDirectResponse === true;
  window.AdminDirectResponse = Object.freeze({
    enabledFor: action => enabled && actions.has(action),
    async request(options, timeoutMs) {
      const payload = JSON.parse(options.body);
      if (!enabled || !actions.has(payload.action) || options.method !== 'POST') throw Error('DIRECT_RESPONSE_DISABLED');
      const controller = new AbortController();
      const abort = () => controller.abort();
      options.signal?.addEventListener('abort', abort, { once: true });
      if (options.signal?.aborted) abort();
      const started = Date.now();
      let timer;
      try {
        return await Promise.race([
          (async () => {
            // A single primary request; no Google fallback, rescue request or automatic replay.
            const response = await fetch(endpoint, { method: 'POST',
              headers: { 'content-type': 'text/plain;charset=utf-8' }, body: options.body,
              credentials: 'omit', cache: 'no-store', redirect: 'error', signal: controller.signal });
            const text = await response.text();
            if (shippingReads.has(payload.action) && !response.ok) {
              let failure; try { failure = JSON.parse(text); } catch {}
              const code = failure?.errorCode || failure?.error || '';
              // HTTP 401/403 from the Worker is distinct from its upstream OAuth failure (502).
              if (response.status === 401) throw Error('ADMIN_SESSION_REQUIRED');
              if (response.status === 403) throw Error('ADMIN_ACCESS_DENIED');
              if (response.status === 429) throw Error('SHIPPING_READ_BUSY');
              if (/^(?:API_CONFIGURATION_REQUIRED|API_CREDENTIAL_|DIRECT_RESPONSE_|ACTION_DENIED)/.test(code)) throw Error('SHIPPING_READ_SERVICE_NOT_READY');
              if (response.status === 504 || code === 'API_EXECUTION_TIMEOUT') throw Error('SHIPPING_READ_TIMEOUT');
              throw Error('SHIPPING_READ_CONNECTION_FAILED');
            }
            let value;
            try { value = JSON.parse(text); } catch { throw Error('GAS_NON_JSON_RESPONSE'); }
            if (shippingReads.has(payload.action) && value?.ok === false &&
                ['ACTION_DENIED', '不支援的 action', 'DIRECT_RESPONSE_DISABLED'].includes(value.errorCode || value.error)) {
              throw Error('SHIPPING_READ_SERVICE_NOT_READY');
            }
            if (value?.action !== payload.action || typeof value.ok !== 'boolean' ||
                (payload.action === 'adminAuth' && value.ok === true &&
                  !(value.allowed === false || (value.allowed === true && typeof value.adminSessionToken === 'string' && value.adminSessionToken.trim())))) {
              throw Error('GAS_AUTH_RESPONSE_INVALID');
            }
            return { ok: response.ok, status: response.status, headers: response.headers,
              transportTiming: { attempts: 1, elapsedMs: Date.now() - started, transport: 'direct-response-v1' },
              text: async () => text, json: async () => value };
          })(),
          new Promise((_, reject) => {
            timer = window.setTimeout(() => { controller.abort(); reject(Error('GAS_TIMEOUT')); }, timeoutMs);
          }),
        ]);
      } catch (failure) {
        if (shippingReads.has(payload.action)) {
          const raw = String(failure?.message || '');
          const code = /^(SHIPPING_READ_[A-Z_]+|ADMIN_SESSION_REQUIRED|ADMIN_ACCESS_DENIED)$/.test(raw) ? raw
            : failure?.name === 'AbortError' || raw === 'GAS_TIMEOUT' ? 'SHIPPING_READ_TIMEOUT'
            : ['GAS_NON_JSON_RESPONSE', 'GAS_AUTH_RESPONSE_INVALID'].includes(raw) ? 'SHIPPING_READ_RESPONSE_INVALID'
            : 'SHIPPING_READ_CONNECTION_FAILED';
          const error = new Error(code); error.attempts = 1; error.elapsedMs = Date.now() - started; throw error;
        }
        const error = new Error(/^(GAS_TIMEOUT|GAS_NON_JSON_RESPONSE|GAS_AUTH_RESPONSE_INVALID)$/.test(failure?.message)
          ? failure.message : failure?.name === 'AbortError' ? 'GAS_TIMEOUT' : 'NETWORK_ERROR');
        error.attempts = 1; error.elapsedMs = Date.now() - started;
        throw error;
      } finally {
        window.clearTimeout(timer);
        options.signal?.removeEventListener('abort', abort);
      }
    },
  });
})();
