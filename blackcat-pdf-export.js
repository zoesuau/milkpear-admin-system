/* PDF export only. The caller supplies an authenticated, current PDF; no carrier API here. */
(() => {
  'use strict';
  let dialog, active = null;
  const id = name => document.getElementById(name);
  function current(state) { return active === state && state.isCurrent(); }
  function status(text) { id('blackcatPdfExportStatus').textContent = text; }
  function supportsShare(file) {
    try { return typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({files:[file]}); }
    catch (_) { return false; }
  }
  function dispose() {
    const previous = active;
    active = null;
    if (previous) { previous.file = null; previous.focus?.focus?.(); }
  }
  function ensureDialog() {
    if (dialog) return;
    const style = document.createElement('style');
    style.textContent = '#blackcatPdfExportDialog{width:min(440px,calc(100% - 32px));max-height:calc(100dvh - 32px);margin:auto;padding:22px;border:1px solid #d5e2da;border-radius:16px;background:#fff;color:#253b30;overflow:auto;font-family:inherit}#blackcatPdfExportDialog::backdrop{background:#14251b80}#blackcatPdfExportDialog h3{margin:0 0 12px;font-size:20px}#blackcatPdfExportDialog p{margin:10px 0;line-height:1.6;overflow-wrap:anywhere}#blackcatPdfExportDialog .bc-export-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px}#blackcatPdfExportDialog button{min-height:44px;padding:10px 14px;border:1px solid #b9ccbf;border-radius:9px;background:#fff;color:#315640;font:inherit;cursor:pointer}#blackcatPdfExportDialog #blackcatPdfExportSave{background:#355e46;color:white}#blackcatPdfExportDialog button:disabled{opacity:.5;cursor:wait}#blackcatPdfExportDialog [hidden]{display:none!important}';
    document.head.appendChild(style);
    dialog = document.createElement('dialog');
    dialog.id = 'blackcatPdfExportDialog';
    dialog.setAttribute('aria-labelledby','blackcatPdfExportTitle');
    dialog.innerHTML = '<h3 id="blackcatPdfExportTitle">下載／分享 PDF</h3><p id="blackcatPdfExportStatus" role="status" aria-live="polite"></p><p id="blackcatPdfExportHint" hidden>在分享選單選「儲存到檔案」，即可另存到手機或 iCloud Drive。</p><div class="bc-export-actions"><button type="button" id="blackcatPdfExportSave" disabled>準備 PDF 中…</button><button type="button" id="blackcatPdfExportDownload" hidden>直接下載 PDF</button><button type="button" id="blackcatPdfExportClose">關閉</button></div>';
    document.body.appendChild(dialog);
    id('blackcatPdfExportClose').onclick = () => { dispose(); dialog.close(); };
    dialog.addEventListener('cancel', dispose);
    dialog.addEventListener('close', dispose);
    id('blackcatPdfExportSave').onclick = () => save(false);
    id('blackcatPdfExportDownload').onclick = () => save(true);
  }
  async function prepare(state, refreshed = false) {
    if (!current(state) || state.busy) return;
    state.busy = true; state.file = null;
    const button = id('blackcatPdfExportSave');
    button.disabled = true; button.textContent = '準備 PDF 中…';
    id('blackcatPdfExportDownload').hidden = true;
    id('blackcatPdfExportHint').hidden = true;
    status('正在確認並準備這次的 PDF，請稍候。');
    try {
      const result = await state.load();
      if (!current(state)) {
        if (active === state) status('登入或訂單狀態已更新，請關閉後重新開啟下載。');
        return;
      }
      if (typeof result?.pdfBase64 !== 'string' || !result.pdfBase64.startsWith('JVBERi0') || result.pdfBase64.length > 14 * 1024 * 1024) throw Error('PDF 回覆不完整，請重試。');
      const bytes = Uint8Array.from(atob(result.pdfBase64), c => c.charCodeAt(0));
      const name = String(result.fileName || '三合院黑貓託運單.pdf').replace(/[\\/\u0000-\u001f]/g,'_');
      state.file = new File([bytes], /\.pdf$/i.test(name) ? name : name+'.pdf', {type:'application/pdf'});
      state.readyAt = Date.now();
      const share = supportsShare(state.file);
      button.textContent = share ? '儲存／分享 PDF' : '下載 PDF';
      id('blackcatPdfExportDownload').hidden = !share;
      id('blackcatPdfExportHint').hidden = !share;
      status((refreshed ? 'PDF 已重新確認，請再點一次儲存：' : 'PDF 已備妥：')+state.file.name);
    } catch (error) {
      if (active !== state) return;
      status(error.message || 'PDF 準備失敗，請重試。');
      button.textContent = '重新準備 PDF';
    } finally {
      state.busy = false;
      if (active === state) button.disabled = !current(state);
    }
  }
  function downloadFile(file) {
    const url = URL.createObjectURL(file), link = document.createElement('a');
    link.href = url; link.download = file.name;
    document.body.appendChild(link);
    link.click(); link.remove();
    // Give mobile download handlers time to consume the Blob before releasing it.
    setTimeout(() => URL.revokeObjectURL(url),60000);
  }
  async function save(forceDownload) {
    const state = active;
    if (!state || state.busy) return;
    if (!current(state)) { state.file = null; status('訂單或登入狀態已更新，請關閉後重新開啟下載。'); return; }
    // Refresh old preparations, then require a new tap for Web Share activation.
    if (!state.file || Date.now()-state.readyAt > 60000) return prepare(state, !!state.file);
    state.busy = true;
    id('blackcatPdfExportSave').disabled = true;
    id('blackcatPdfExportDownload').disabled = true;
    try {
      if (!forceDownload && supportsShare(state.file)) {
        // No await/network call before share: this must run in the user's tap.
        await navigator.share({files:[state.file]});
        if (active === state) status('已交由系統處理。若選擇另存，請到「檔案」確認。');
      } else {
        downloadFile(state.file);
        if (active === state) status('已送出下載，請到瀏覽器下載項目或「檔案」確認。');
      }
    } catch (error) {
      if (active !== state) return;
      if (error.name !== 'AbortError') console.warn('BlackCat PDF export:', error.name || 'Error');
      status(error.name === 'AbortError' ? '已取消分享，可再次點選儲存。' : '分享未完成。可以再試一次，或選「直接下載 PDF」。');
      id('blackcatPdfExportDownload').hidden = false;
    } finally {
      state.busy = false;
      if (active === state) {
        id('blackcatPdfExportSave').disabled = false;
        id('blackcatPdfExportDownload').disabled = false;
      }
    }
  }
  window.BlackCatPdfExport = { open({load,isCurrent}) {
    ensureDialog();
    if (active) return;
    const state = {load,isCurrent,focus:document.activeElement,file:null,busy:false};
    active = state;
    id('blackcatPdfExportDownload').disabled = false;
    dialog.showModal();
    void prepare(state);
  }};
})();
