(function () {
  'use strict';
  const endpoint = 'https://sanheyuan-admin-response.zoe-quokka.workers.dev/request';
  const actions = new Set(['adminAuth', 'adminValidateSession', 'adminReadOrderSnapshot', 'adminReadOrders', 'adminReadProductCatalog']);
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
            let value;
            try { value = JSON.parse(text); } catch { throw Error('GAS_NON_JSON_RESPONSE'); }
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
