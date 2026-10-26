(function () {
  'use strict';
  const core = window.SeasonArchiveCore;
  const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const dollars = value => 'NT$ ' + Number(value || 0).toLocaleString('zh-TW', {maximumFractionDigits:2});
  const reasons = {unscheduled:'尚未排定或日期待確認',crossesSeason:'預計出貨區間跨產季',unfinished:'訂單尚未完成',notificationPending:'通知仍待處理',amountInvalid:'金額待確認',groupIncomplete:'同團訂單尚未全部符合'};
  const errors = {
    ADMIN_SESSION_REQUIRED:'登入已失效，請重新登入。', SEASON_ARCHIVE_LOCKED:'目前只開放產季準備，尚未開放執行封存。',
    SEASON_INVALID:'請確認產季名稱與日期，結束日不能早於開始日。', SEASON_OVERLAP:'這個日期範圍與另一產季重疊，請調整範圍。',
    SEASON_REVISION_CONFLICT:'另一個操作已更新產季資料，請重新載入後再操作。', SEASON_PREVIEW_CHANGED:'訂單在預覽後有變動，請重新預覽。',
    SEASON_ALREADY_ARCHIVED:'這個產季已封存，請先解除封存再修改。', SEASON_ARCHIVE_EMPTY:'目前沒有符合封存條件的訂單。',
    SEASON_FILTER_INVALID:'請確認查詢日期與搜尋條件。', SEASON_ARCHIVE_INTEGRITY_FAILED:'歷史資料完整性核對未通過，已停止顯示與下載。',
    SEASON_SOURCE_MISSING:'原始訂單筆數不符，已停止解除封存，請先核對資料。', SEASON_EXPORT_TOO_LARGE:'本次匯出資料較多，請縮小日期或產季範圍。',
    SEASON_CAPACITY_REVIEW_REQUIRED:'資料量超過本次安全上限，尚未變更，請先檢查儲存容量。', SEASON_BUSY:'另一個操作正在進行，請稍後再試。',
    SEASON_ORDERS_INVALID:'訂單編號或完整性檢查未通過，請先確認來源資料。', SEASON_NOT_ENDED:'這個產季尚未結束，請於產季結束後再封存。'
  };
  function message(error) { return errors[error?.message] || '目前無法完成操作，請重新載入資料後再試；若剛才正在儲存，請先確認是否已儲存。'; }
  const newId = prefix => prefix + crypto.randomUUID().replaceAll('-', '');
  function summary(s) {
    return `<p class="season-result-total">共 <strong>${s.count} 筆</strong> · 已寄出訂單金額 ${dollars(s.amount)} · 已取消 ${s.cancelledCount} 筆（${dollars(s.cancelledAmount)}，另計）</p>`;
  }
  function table(orders, detail) {
    if (!orders.length) return '<p class="season-empty">沒有符合條件的訂單。</p>';
    return `<div class="season-table-wrap"><table><thead><tr><th>訂單編號</th><th>預計出貨</th><th>訂購人</th><th>狀態</th><th>金額</th>${detail?'<th>查看</th>':''}</tr></thead><tbody>${orders.map(o=>`<tr><td>${escape(o.orderNo)}</td><td>${escape(o.expectedShippingDate)}</td><td>${escape(o.buyerName)}</td><td>${escape(o.orderStatus)}</td><td>${dollars(o.finalAmount)}</td>${detail?`<td><button type="button" data-detail="${escape(o.orderNo)}">明細</button></td>`:''}</tr>`).join('')}</tbody></table></div>`;
  }
  function printDocument(result, filterLabel) {
    return `<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><title>三合院農園｜歷史訂單</title><style>body{font-family:Arial,"Noto Sans TC",sans-serif;color:#222;margin:26px;font-size:12px;line-height:1.6}h1{font-size:22px}article{break-inside:avoid;border-top:1px solid #bbb;margin-top:18px;padding-top:12px}h2{font-size:15px}dl{display:grid;grid-template-columns:90px 1fr;gap:3px 14px}dt{color:#555}dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}.tools{margin:20px 0}button{padding:10px 18px}@media print{.tools{display:none}@page{size:A4;margin:16mm}body{margin:0}}</style><h1>三合院農園｜歷史訂單</h1><p>${escape(filterLabel)}<br>共 ${result.totalCount} 筆；已寄出訂單金額 ${dollars(result.summary.amount)}；已取消 ${result.summary.cancelledCount} 筆（金額另計 ${dollars(result.summary.cancelledAmount)}）。</p><p>此為訂單紀錄，不代表實收款。匯出時間：${escape(new Date().toLocaleString('zh-TW'))}</p><div class="tools"><button onclick="window.print()">列印／另存 PDF</button></div>${result.orders.map(o=>`<article><h2>${escape(o.orderNo)} · ${escape(o.orderStatus)}</h2><dl>${core.columns.filter(c=>o[c[0]]!==undefined&&o[c[0]]!=='').map(c=>`<dt>${escape(c[1])}</dt><dd>${escape(o[c[0]])}</dd>`).join('')}</dl></article>`).join('')}</html>`;
  }
  window.AdminSeasons = Object.freeze({
    printDocument,
    mount(root, request, options = {}) {
      let list = null, preview = null, history = null, mode = options.mode === 'prepare' ? 'prepare' : 'history', busy = false, epoch = 0, filters = {}, mutation = null;
      const listeners = new AbortController();
      const allowExecution = options.allowExecution === true;
      const q = selector => root.querySelector(selector);
      function feedback(text, error = false) { const el=q('[data-feedback]'); if(el){el.textContent=text;el.classList.toggle('error',error);} }
      function setBusy(value) { busy=value; root.setAttribute('aria-busy',String(value)); root.querySelectorAll('button').forEach(b=>{b.disabled=value||b.dataset.locked==='true';}); }
      async function run(work) {
        if(busy)return; setBusy(true); const current=epoch;
        try { await work(current); } catch(error) { if(current===epoch){ if(['SEASON_REVISION_CONFLICT','SEASON_PREVIEW_CHANGED'].includes(error.message)){preview=null;history=null;q('[data-preview]')?.replaceChildren();q('[data-history]')?.replaceChildren();} feedback(message(error),true); } }
        finally { if(current===epoch)setBusy(false); }
      }
      async function call(action, input = {}) { const current=epoch; const r=await request(action,input); if(current!==epoch)throw Error('ADMIN_SESSION_REQUIRED'); if(!r||r.ok!==true||r.action!==action)throw Error(r?.error||'SEASON_SERVICE_UNAVAILABLE'); return r; }
      function form() {
        const available=list.seasons.filter(s=>!list.archives.some(a=>a.seasonId===s.id&&a.status==='archived')).sort((a,b)=>b.start.localeCompare(a.start));
        const selected=available[0]||{id:newId('season_'),name:'',start:'',end:''};
        return `<form data-season-form><input type="hidden" name="id" value="${selected.id}">${available.length>1?`<label>要結束的產季<select data-pick-season>${available.map(s=>`<option value="${s.id}">${escape(s.name)}</option>`).join('')}</select></label>`:''}<label>產季名稱<input name="name" maxlength="60" placeholder="例如：2026 水梨產季" value="${escape(selected.name)}" required></label><div class="season-dates"><label>預計出貨起日<input type="date" name="start" min="2000-01-01" max="2199-12-31" value="${selected.start}" required></label><label>預計出貨迄日<input type="date" name="end" min="2000-01-01" max="2199-12-31" value="${selected.end}" required></label></div><p class="season-muted">確認本季的預計出貨日期範圍。未完成的訂單會繼續留在訂單列表。</p><div class="season-actions"><button class="primary" type="submit">檢查可封存訂單</button></div></form>`;
      }
      function render() {
        root.className='season-panel';
        root.innerHTML=`<h2>${mode==='prepare'?'產季結束':'歷史訂單'}</h2><p class="season-muted">${mode==='prepare'?'一年只需在產季結束時操作。先確認範圍，再檢查訂單。':'查找以前的訂單，或下載留存。'}</p><p data-feedback class="season-message" role="status" aria-live="polite"></p>${mode==='prepare'?`${form()}<section data-preview></section>`:`<form data-history-form class="season-history-filter"><label>產季<select name="seasonId"><option value="">全部歷史產季</option>${list.seasons.filter(s=>list.archives.some(a=>a.seasonId===s.id&&a.status==='archived')).map(s=>`<option value="${s.id}">${escape(s.name)}</option>`).join('')}</select></label><label>搜尋<input name="query" maxlength="100" placeholder="訂單編號、姓名或電話"></label><button type="submit" class="primary">查詢</button><details class="season-date-filter"><summary>指定日期範圍</summary><div class="season-dates"><label>預計出貨起日<input type="date" name="start"></label><label>預計出貨迄日<input type="date" name="end"></label></div></details></form><div data-history></div>`}<div class="season-actions season-secondary"><button type="button" data-reload>重新讀取</button></div><dialog data-detail-dialog><div class="season-actions"><h3 style="flex:1;margin:0">歷史訂單明細</h3><button type="button" data-close-detail>關閉</button></div><div data-detail-content></div></dialog>`;
      }
      async function reload() { list=await call('adminReadSeasons'); preview=null;history=null;filters={};render();if(mode==='history')await search(); }
      function showPreview(p) {
        preview=p; const heldTotal=p.held.length;
        q('[data-preview]').innerHTML=`<div class="season-box" style="margin-top:22px"><h3>本季結束後</h3><p><strong>${p.eligible.length} 筆已完成訂單</strong>可移至歷史；<strong>${heldTotal} 筆</strong>繼續保留處理。</p><p class="season-muted">只有已寄出或已取消且無待處理事項的訂單會封存。這次尚未開放封存，請等效能修正完成。</p><div class="season-actions"><button type="button" data-archive ${allowExecution&&p.executionEnabled?'':'disabled data-locked="true"'} class="primary">${allowExecution&&p.executionEnabled?'確認封存本產季':'封存尚未開放'}</button><span class="season-muted">目前僅預覽，訂單沒有移動。</span></div><details><summary>查看符合訂單（${p.eligible.length} 筆）</summary>${table(p.eligible.slice(0,20),false)}${p.eligible.length>20?'<p class="season-muted">此處預覽前 20 筆，統計與封存檢查涵蓋全部符合訂單。</p>':''}</details><details><summary>保留在作業區／待確認（${heldTotal} 筆）</summary><ul>${Object.keys(reasons).filter(k=>p.reasons[k]).map(k=>`<li>${reasons[k]}：${p.reasons[k]} 筆</li>`).join('')}</ul>${table(p.held.slice(0,20).map(r=>r.order),false)}${heldTotal>20?'<p class="season-muted">此處列出前 20 筆待確認訂單。</p>':''}</details></div>`;
      }
      async function search(page=1) {
        history=await call('adminReadSeasonHistory',Object.assign({},filters,{page,expectedRevision:list.revision}));
        q('[data-history]').innerHTML=`${summary(history.summary)}<div class="season-actions"><button type="button" data-export="csv" ${history.totalCount?'':'disabled data-locked="true"'}>下載全部查詢結果 CSV</button><button type="button" data-export="pdf" ${history.totalCount?'':'disabled data-locked="true"'}>列印／另存 PDF</button></div>${table(history.orders,true)}<div class="season-pager"><button type="button" data-page="${history.page-1}" ${history.page===1?'disabled data-locked="true"':''}>上一頁</button><span>${history.page} / ${history.totalPages} 頁 · 共 ${history.totalCount} 筆</span><button type="button" data-page="${history.page+1}" ${history.page===history.totalPages?'disabled data-locked="true"':''}>下一頁</button></div><p class="season-muted">下載包含這次查詢的全部結果，不只目前這一頁。歷史訂單為封存時的紀錄，僅供查看。</p>`;
      }
      async function exportAll(type,popup) {
        try {
          const result=await call('adminExportSeasonHistory',Object.assign({},filters,{expectedRevision:list.revision}));
          if(!result.complete||result.orders.length!==result.totalCount)throw Error('SEASON_ARCHIVE_INTEGRITY_FAILED');
          if(type==='csv') { const url=URL.createObjectURL(new Blob([core.csv(result.orders)],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='三合院歷史訂單-'+new Date().toISOString().slice(0,10)+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000); }
          else { if(!popup||popup.closed)throw Error('POPUP_BLOCKED'); const season=list.seasons.find(s=>s.id===filters.seasonId); popup.document.open();popup.document.write(printDocument(result,`${season?season.name:'全部已封存產季'} · ${filters.start||'不限起日'} ～ ${filters.end||'不限迄日'}${filters.query?' · 搜尋：'+filters.query:''}`));popup.document.close(); }
          feedback(`已準備完整 ${result.totalCount} 筆${type==='csv'?' CSV':'列印內容；請在新視窗按「列印／另存 PDF」'}。`);
        } catch(error) { if(popup&&!popup.closed)popup.close();throw error; }
      }
      root.addEventListener('change',event=>{
        if(!event.target.matches('[data-pick-season]')||busy)return;
        const s=list.seasons.find(x=>x.id===event.target.value);if(!s)return;
        for(const k of ['id','name','start','end'])q(`[data-season-form] [name="${k}"]`).value=s[k];
        preview=null;q('[data-preview]').replaceChildren();
      },{signal:listeners.signal});
      root.addEventListener('submit',event=>{
        event.preventDefault();if(busy)return;
        const target=event.target;
        if(target.matches('[data-season-form]')) {
          const data=Object.fromEntries(new FormData(target));data.basis='expectedShippingDate';
          try{core.normalizeSeason(data);}catch(error){feedback(message(error),true);return;}
          void run(async()=>{await call('adminSaveSeason',{season:data,expectedRevision:list.revision});list=await call('adminReadSeasons');showPreview(await call('adminPreviewSeasonArchive',{seasonId:data.id,expectedRevision:list.revision}));feedback('已檢查完成，訂單尚未移動。');});
        } else if(target.matches('[data-history-form]')) { filters=Object.fromEntries(new FormData(target));void run(()=>search()); }
      }, {signal:listeners.signal});
      root.addEventListener('click',event=>{
        const b=event.target.closest('button');if(!b||!root.contains(b)||b.disabled||busy)return;
        if(b.hasAttribute('data-reload'))void run(reload);
        else if(b.dataset.page)void run(()=>search(Number(b.dataset.page)));
        else if(b.dataset.export){let popup;if(b.dataset.export==='pdf'){popup=window.open('about:blank','_blank');if(!popup){feedback('請允許開啟列印視窗後再試。',true);return;}popup.opener=null;popup.document.body.textContent='正在準備全部查詢結果…';}void run(()=>exportAll(b.dataset.export,popup));}
        else if(b.dataset.detail){const o=history.orders.find(x=>x.orderNo===b.dataset.detail);q('[data-detail-content]').innerHTML=`<dl>${core.columns.filter(c=>o[c[0]]!==undefined&&o[c[0]]!=='').map(c=>`<dt>${escape(c[1])}</dt><dd>${escape(o[c[0]])}</dd>`).join('')}</dl>`;q('[data-detail-dialog]').showModal();}
        else if(b.hasAttribute('data-close-detail'))q('[data-detail-dialog]').close();
        else if(b.hasAttribute('data-archive')&&preview&&allowExecution&&list.executionEnabled){if(!window.confirm(`確認封存「${preview.season.name}」的 ${preview.eligible.length} 筆訂單？未完成訂單會保留。`))return;mutation=mutation?.previewHash===preview.previewHash?mutation:{operationId:newId('op_'),seasonId:preview.season.id,previewHash:preview.previewHash,expectedRevision:list.revision};void run(async()=>{await call('adminArchiveSeason',mutation);mutation=null;await reload();feedback('產季已封存。');});}
        else if(b.dataset.restore&&allowExecution&&list.executionEnabled){if(!window.confirm('解除封存後，這批訂單將回到作業區，付款與出貨狀態不變。確定繼續？'))return;mutation=mutation?.archiveId===b.dataset.restore?mutation:{operationId:newId('op_'),archiveId:b.dataset.restore,expectedRevision:list.revision};void run(async()=>{await call('adminRestoreSeason',mutation);mutation=null;await reload();feedback('已解除封存。');});}
      }, {signal:listeners.signal});
      root.className='season-panel';root.innerHTML='<p data-feedback class="season-message" role="status">正在讀取…</p><button type="button" data-reload>重試</button>';
      void run(reload);
      return {reload(){return run(reload);},clear(){epoch++;listeners.abort();busy=false;list=null;preview=null;history=null;mutation=null;root.innerHTML='<p>登入已變更，請重新開啟產季頁。</p>';}};
    }
  });
})();
