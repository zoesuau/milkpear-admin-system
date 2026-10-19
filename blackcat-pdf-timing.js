/* Local browser diagnostics only. Observes UI; never calls an API or clicks a control. */
(() => {
  'use strict';
  const storageKey = 'blackcat-pdf-ui-timing-v1';
  const actions = { blackcatSubmit: 'print', blackcatRecover: 'resume', blackcatDownload: 'download', blackcatOpenPdf: 'reopen', blackcatRetryPdf: 'retry' };
  let records = [], observer = null, active = null, started = 0;
  const clock = () => typeof performance !== 'undefined' ? performance.now() : Date.now();
  function publish() {
    try {
      let output = document.getElementById('blackcatPdfTiming');
      if (!output) { output = document.createElement('output'); output.id = 'blackcatPdfTiming'; output.hidden = true; document.body.appendChild(output); }
      output.setAttribute('data-timings', JSON.stringify(records));
    } catch (_) { /* Diagnostics must never block printing. */ }
    try { sessionStorage.setItem(storageKey, JSON.stringify(records)); } catch (_) {}
  }
  try {
    const prior = JSON.parse(sessionStorage.getItem(storageKey) || '[]');
    if (Array.isArray(prior)) records = prior.slice(-5);
  } catch (_) {}
  publish();
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') window.addEventListener('blackcat-pdf-delivery', event => {
    if (!active) return;
    const input = event.detail || {}, timing = {};
    // Only server/client timestamps; no payload, order, file ID or credentials.
    for (const key of ['storedAt', 'storageReturnedAt', 'fileVerifiedAt', 'journalConfirmedAt', 'checkedAt'])
      if (Number.isFinite(input[key]) && input[key] > 0) timing[key] = input[key];
    timing.storedClock = input.storedClock === 'drive-created-time' ? 'drive-created-time' : 'storage-call-return';
    timing.clientOpenRequestedAt = Date.now();
    if (timing.storedAt && timing.checkedAt >= timing.storedAt) timing.serverPostStoreMs = timing.checkedAt - timing.storedAt;
    // Client/server clock difference is included. Never treat this estimate as
    // an exact cross-clock SLA result or as the PDF viewer's first paint.
    if (timing.storedAt) timing.estimatedStoredToOpenMs = timing.clientOpenRequestedAt - timing.storedAt;
    active.delivery = timing; publish();
  });
  document.addEventListener('click', event => {
    try {
      const button = event.target?.closest('button');
      const mode = button && actions[button.id];
      if (!mode || button.disabled || event.isTrusted === false) return;
      const feedback = document.getElementById('blackcatFeedback');
      if (!feedback) return;
      if (observer) observer.disconnect();
      if (active) active.status = 'interrupted';
      active = { mode, startedAt: Date.now(), status: 'waiting' }; started = clock();
      records = [...records.slice(-4), active]; publish();
      observer = new MutationObserver(() => {
        try {
          const text = feedback.textContent || '', ms = Math.max(0, Math.round(clock() - started));
          if (text.includes('單號已存好，宅配單可以開啟') && active.readyObservedMs === undefined) active.readyObservedMs = ms;
          if (text.includes('正在準備宅配單') && active.pdfRequestObservedMs === undefined) active.pdfRequestObservedMs = ms;
          if (text.includes('PDF 已下載並開啟') || text.includes('已開啟本次 PDF')) {
            // This is the UI's open/navigation request, NOT the PDF viewer's first paint.
            active.openRequestedMs = ms; active.finishedAt = Date.now(); active.status = 'open_requested';
            publish(); observer.disconnect(); observer = null; active = null;
          } else publish();
        } catch (_) { /* Observing an error must not change the shipping flow. */ }
      });
      observer.observe(feedback, { childList: true, subtree: true, characterData: true });
    } catch (_) { /* Missing diagnostics APIs do not affect the carrier client. */ }
  }, true);
})();
