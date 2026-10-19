/* Direct carrier UI. Credentials and carrier calls stay on the authenticated backend. */
(() => {
  "use strict";
  const messages = {
    BLACKCAT_EZCAT_WAITING: "已改用 ezcat，請匯出 CSV 並匯回新單號；這裡先不要重新取號。",
    BLACKCAT_EZCAT_TRANSFERRED: "已改用 ezcat，這次舊 PDF 停止開啟，舊單請勿貼箱。",
    BLACKCAT_EZCAT_BUSY: "背景還在處理，請稍後重新讀取結果，再改用 ezcat。",
    BLACKCAT_EZCAT_UNKNOWN: "還不能確認是否已取得完整單號，請先核對建單結果，再改用 ezcat。",
    BLACKCAT_EZCAT_SUPERSEDED: "這批有訂單已進行其他列印，請先讀取最新紀錄，不能轉交舊批次。",
    BLACKCAT_EZCAT_HANDOFF_REQUIRED: "請先在黑貓列印結果選「改用 ezcat 處理」，再匯出 CSV。",
    BLACKCAT_CONFIRMED_NOT_CREATED: "已向黑貓確認，這些訂單還沒有單號。現在可以重新勾選列印，系統不會自動送出。",
    BLACKCAT_RESOLUTION_CONFLICT: "已有人完成這次確認，請重新讀取結果，不要重複輸入。",
    BLACKCAT_RESOLUTION_NOT_ALLOWED: "現在不能手動確認這次結果，請先重新讀取列印紀錄。",
    BLACKCAT_RESOLUTION_HAS_NUMBERS: "這次已有部分單號，不能選擇「全部未建單」。請向黑貓核對全部包裹並補齊單號與 PDF 檔案編號。",
    BLACKCAT_RESOLUTION_NUMBERS_INVALID: "單號對應不完整、重複或已被使用，請逐件核對黑貓資料。",
    BLACKCAT_RESOLUTION_EVIDENCE_REQUIRED: "請填寫核對窗口、日期與案件編號或核對依據（5–500 字）。",
    BLACKCAT_RESOLUTION_FILE_REQUIRED: "請向黑貓取得這次宅配單的檔案編號（FileNo）。",
    BLACKCAT_MANIFEST_REFRESH_PENDING: "單號已存好，但出貨總表還沒更新。請按「繼續剛才的列印」，等清單更新好再開啟 PDF，單號不會變。",
    BLACKCAT_PDF_NOT_READY: "單號已保留，宅配單檔案還沒準備好。請按「繼續剛才的列印」，單號不會變。",
    ADMIN_SESSION_REQUIRED: "登入已過期，請重新登入。",
    BLACKCAT_NOT_CONFIGURED: "宅配單功能還沒設定好，請找協助設定系統的人處理。不用重新勾選訂單。",
    BLACKCAT_FOLDER_NOT_PRIVATE: "宅配單的存放位置需要檢查，請找協助設定系統的人處理。",
    BLACKCAT_DATE_INVALID: "請確認日期：出貨日不可過去，配達日須在出貨後 1–7 天，兩者皆不能選星期日；其他休假日以黑貓回覆為準。",
    BLACKCAT_PDF_OPEN_BLOCKED: "PDF 已下載，但未能自動開啟。請允許開啟分頁後再按「列印宅配單」，單號不變。",
    BLACKCAT_DOWNLOAD_UNCONFIRMED: "已取得單號，宅配單尚未下載完成。請再按「列印宅配單」，會繼續剛才的列印，單號不會變。",
    BLACKCAT_LABEL_CHANGED: "已取得單號，但託運資料已變更。舊單請勿貼箱，請關閉視窗後重新勾選訂單補印，重新取得單號。",
    BLACKCAT_ORDER_CHANGED: "訂單資料已變更，請重新讀取清單後核對。",
    BLACKCAT_ORDER_INVALID: "部分訂單資料需要修正，請重新讀取清單。",
    BLACKCAT_ORDER_NUMBER_INVALID: "這筆訂單編號無法用於宅配單，請找管理員檢查編號，再重新整理訂單；目前尚未取號。",
    BLACKCAT_ORDER_BUSY: "這些訂單正在處理，請到「尚未完成的列印」查看，不要重複勾選。",
    BLACKCAT_REPRINT_REQUIRED: "這筆訂單已有單號或匯出紀錄，請明確選擇補印（重新取號）。",
    BLACKCAT_REPRINT_NOT_REQUIRED: "這筆訂單尚未建單，請選擇首次建單。",
    BLACKCAT_PARCEL_LIMIT: "每次最多建立 100 件包裹，請減少選擇數量。",
    BLACKCAT_BUSY: "系統還在忙，請稍候再查看剛才的列印結果，不用重新勾選訂單。",
    BLACKCAT_CONFIG_CHANGED: "列印時使用的設定被改過，請找協助設定系統的人確認，不要重新勾選補印。",
    BLACKCAT_SEND_OUTCOME_UNKNOWN: "還不確定黑貓有沒有給單號。請先找人向黑貓確認，不要再按列印或補印，以免重複取號。",
    BLACKCAT_PARTIAL_OR_INVALID_RESULT: "黑貓回覆的單號資料不完整。已收到的資料會保留，請找人向黑貓確認，不要重新列印。",
    BLACKCAT_SYNC_PENDING: "已有單號，但還沒存進訂單。請按「繼續剛才的列印」，完成後才能開啟 PDF；先不要貼單。",
    BLACKCAT_SNAPSHOT_PENDING: "單號已存進訂單，但出貨總表還沒更新。請按「繼續剛才的列印」，完成後才能開啟 PDF；先不要貼單。",
    BLACKCAT_PDF_SUPERSEDED: "這份 PDF 的單號已被取代或訂單已取消，請到「最近列印紀錄」開啟最新的宅配單。",
    BLACKCAT_PDF_DOWNLOAD_FAILED: "已取得單號，PDF 尚未下載成功。重試只會下載本次 PDF。",
    BLACKCAT_FINISH_PENDING: "已有單號，但宅配單還沒完成。請按「繼續剛才的列印」，單號不會變。",
    BLACKCAT_SENDER_ADDRESS_INVALID: "黑貓無法辨識寄件地址，請找協助設定系統的人檢查。",
    BLACKCAT_NAME_INVALID: "收件姓名須在 30 字內",
    BLACKCAT_ADDRESS_INVALID: "收件地址不完整或超過 120 字",
    BLACKCAT_PHONE_INVALID: "電話格式不正確",
    BLACKCAT_MEMO_TOO_LONG: "託運備註超過 100 字",
    BLACKCAT_COD_REQUIRES_REVIEW: "代收金額需核對（目前直串支援 0–20,000 元）",
    PACKAGE_SIZE_UNDETERMINED: "無法確定包裹尺寸，請先核對商品包裝",
    PRODUCT_NOTE_UNAVAILABLE: "無法辨識商品明細",
    ORDER_CANCELLED: "訂單已取消",
    BLACKCAT_STORAGE_UNAVAILABLE: "這個瀏覽器無法記住剛才的操作，這次還沒送出。請找協助設定系統的人，檢查瀏覽器是否允許儲存資料。",
  };
  const states = { ezcat: "已改用 ezcat 處理", needs_reprint: "已取號，資料已變更，需補印", queued: "等待處理", preparing: "正在檢查資料", sending: "正在向黑貓建單", accepted: "已取得單號", finishing: "正在儲存單號、準備宅配單", ready: "單號已存好，宅配單可以開啟", attention: "已有單號，宅配單還沒完成", rejected: "尚未建單成功", unknown: "下載列印單中，請先不要重印" };
  const activeStates = ["queued", "preparing", "sending", "accepted", "finishing"];
  let view = { epoch: 0, busy: false, date: "", candidates: [], config: null, batches: [], batch: null, selected: new Map() };
  let previousFocus = null;
  let issuedSelection = null;
  const downloadFlights = new Map();
  let pdfWindow = null;
  const pdfUrls = new Map();
  const openedPdfs = new Set();
  function pdfOpened(batchId) {
    if (openedPdfs.has(batchId)) return true;
    try { return sessionStorage.getItem(`${key()}:pdf-opened:${batchId}`) === "1"; } catch (_) { return false; }
  }
  function rememberPdfOpened(batchId) {
    openedPdfs.add(batchId);
    try { sessionStorage.setItem(`${key()}:pdf-opened:${batchId}`, "1"); } catch (_) { /* Keep the current page locked even if storage becomes unavailable. */ }
  }
  const byId = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const explain = (code) => messages[code] || (/^E\d{3}$/.test(code || "") ? `黑貓拒絕本次資料（${code}），請把這個代碼交給協助處理的人，先向黑貓確認原因。` : "剛才的列印還沒完成，請繼續查看結果，不要重新勾選補印。");
  const key = () => `blackcat-pending-v1:${GAS_ORDERS_API_URL}`;
  function pending(value) {
    try {
      if (value === undefined) return JSON.parse(sessionStorage.getItem(key()) || "null");
      if (value === null) sessionStorage.removeItem(key());
      else sessionStorage.setItem(key(), JSON.stringify(value));
      return value;
    } catch (_) { throw new Error("BLACKCAT_STORAGE_UNAVAILABLE"); }
  }
  function token() { return String(sessionStorage.getItem(ADMIN_LINE_SESSION_TOKEN_KEY) || "").trim(); }
  async function api(action, data) {
    const adminSessionToken = token();
    if (!adminSessionToken) throw new Error("ADMIN_SESSION_REQUIRED");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
    const options = { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, signal: controller.signal, body: JSON.stringify({ action, adminSessionToken, ...data }) };
    const isRead = ["adminReadShippingManifest", "adminReadEzcatExportCandidates", "adminReadBlackCatCandidates", "adminReadBlackCatBatch"].includes(action);
    if (isRead && window.ORDER_SYSTEM_CONFIG?.features?.adminDirectResponse === true &&
        !window.AdminDirectResponse?.enabledFor?.(action)) throw Error("SHIPPING_READ_SERVICE_NOT_READY");
    const response = isRead && window.AdminDirectResponse?.enabledFor?.(action)
      ? await window.AdminDirectResponse.request(options, 30000)
      : await fetch(GAS_ORDERS_API_URL, options);
    let result;
    try { result = await response.json(); }
    catch (_) { throw new Error(response.status === 401 ? "ADMIN_SESSION_REQUIRED" : response.status === 403 ? "BLACKCAT_ACCESS_DENIED" : "BLACKCAT_SERVICE_UNAVAILABLE"); }
    if (response.status === 401) throw new Error("ADMIN_SESSION_REQUIRED");
    if (response.status === 403) throw new Error("BLACKCAT_ACCESS_DENIED");
    if (!response.ok || result?.ok !== true || result.action !== action) throw new Error(result?.errorCode || (isRead ? result?.error || "SHIPPING_READ_RESPONSE_INVALID" : "BLACKCAT_NETWORK_UNCONFIRMED"));
    return result;
    } finally { clearTimeout(timeout); }
  }
  function feedback(text, error = false, retryMode = null) {
    view.accessIssue = null;
    view.pdfRetry = retryMode ? { mode: retryMode, batchId: view.batch?.batchId } : null;
    const node = byId("blackcatFeedback");
    node.textContent = text;
    node.classList.toggle("is-error", error);
    node.setAttribute("role", error ? "alert" : "status");
    node.setAttribute("aria-live", error ? "assertive" : "polite");
    if (retryMode) {
      node.innerHTML = `<strong class="bc-failure-title">⚠ 宅配單${retryMode === "open" ? "開啟" : "下載"}失敗</strong><p>${esc(text)}</p><strong>下一步：按下方按鈕重試，成功後會自動開啟 PDF。</strong><div class="bc-actions"><button type="button" id="blackcatRetryPdf" class="bc-retry">再試一次</button>${handoffButton(view.batch, "blackcatRetryHandoff")}</div>`;
      if (byId("blackcatRetryHandoff")) byId("blackcatRetryHandoff").onclick = () => confirmHandoff(view.batch);
      if (byId("blackcatHandoff")) byId("blackcatHandoff").hidden = true;
      const retry = view.pdfRetry;
      byId("blackcatRetryPdf").onclick = () => {
        if (view.busy || downloadFlights.size || view.batch?.batchId !== retry.batchId || (!view.batch.pdfReady && retry.mode !== "process")) return;
        if (retry.mode === "process") return resumeBatch(retry.batchId);
        if (retry.mode === "open") return reopenPdf(retry.batchId);
        preparePdfWindow();
        download(retry.batchId).catch(() => {}); // download renders its own actionable error.
      };
    }
    if (error) byId("blackcatModal").querySelector(".modal-body").scrollTop = 0;
  }
  function pdfFailure(mode, blocked = false) {
    feedback(`單號已保留，不會重新取號。${blocked ? "瀏覽器未能開啟 PDF 分頁，請先允許開啟分頁。" : "這次未能完成取得 PDF，請直接重試。"}\n不需要重新勾選訂單或補印。`, true, mode);
  }
  function accessProblem(code) {
    if (code === "SHIPPING_READ_SERVICE_NOT_READY")
      return { title: "出貨清單服務需要檢查", step: "請找協助設定系統的人處理，再按「重新讀取訂單」。不用修改訂單，也不用補印。", retryLabel: "重新讀取訂單" };
    if (/^SHIPPING_READ_/.test(code))
      return { title: code === "SHIPPING_READ_TIMEOUT" ? "讀取出貨清單等太久了" : code === "SHIPPING_READ_BUSY" ? "系統正在忙，請稍後再試" : "出貨清單暫時讀取失敗", step: "請確認網路正常，再按「重新讀取訂單」。這只會重新讀取資料，不會建單或更換單號。若仍失敗，請把這個畫面交給協助設定系統的人。", retryLabel: "重新讀取訂單" };
    if (["ADMIN_SESSION_REQUIRED", "ADMIN_SESSION_VALIDATION_FAILED", "ADMIN_AUTH_RESTART_REQUIRED"].includes(code))
      return { title: "請重新登入 LINE", step: "請用平常管理訂單的 LINE 帳號重新登入，再回來繼續剛才的列印。不用重新勾選訂單，也不用補印。", login: true };
    if (["BLACKCAT_ACCESS_DENIED", "ADMIN_ACCESS_DENIED"].includes(code))
      return { title: "目前無法使用宅配單功能", step: "請先確認登入的是平常管理訂單的 LINE 帳號。如果仍不能使用，請把這個畫面交給協助設定系統的人處理。處理好後再按下方按鈕，不用重新勾選訂單。" };
    if (["BLACKCAT_SERVICE_UNAVAILABLE", "ADMIN_SERVICE_UNAVAILABLE"].includes(code))
      return { title: "系統暫時連不上", step: "請先確認網路正常，再按下方按鈕試一次。如果還是不行，請把這個畫面交給協助設定系統的人處理，不用重新勾選訂單。" };
    if (code === "BLACKCAT_NOT_CONFIGURED")
      return { title: "宅配單功能還沒設定好", step: "這不是訂單填錯。請找協助設定系統的人，檢查黑貓帳號、寄件資料及宅配單存放位置。處理好後，再按下方按鈕。" };
    if (code === "BLACKCAT_CONFIG_CHANGED")
      return { title: "列印途中，系統設定被改過", step: "請先找協助設定系統的人，確認剛才使用的黑貓帳號、寄件資料及宅配單存放位置。處理好後再繼續，不要重新勾選補印。" };
    if (["BLACKCAT_FOLDER_NOT_PRIVATE", "BLACKCAT_FOLDER_UNAVAILABLE", "BLACKCAT_FILE_UNAVAILABLE", "BLACKCAT_FILE_LOCATION_INVALID"].includes(code))
      return { title: "目前無法讀取或存放宅配單", step: "請找協助設定系統的人，檢查宅配單檔案和資料夾是否還在、系統是否可以使用。不要把資料夾改成公開分享。處理好後再按下方按鈕，不用補印。" };
    if (/^BLACKCAT_MANIFEST_HTTP_[45]\d{2}$/.test(code) || code === "BLACKCAT_MANIFEST_RESPONSE_INVALID")
      return { title: "出貨清單連線異常", step: "系統沒有收到正確的出貨清單。請按下方「重新讀取訂單」；如果仍失敗，請把這個畫面交給協助設定系統的人。", retryLabel: "重新讀取訂單" };
    if (["BLACKCAT_MANIFEST_SCOPE_UNAVAILABLE", "BLACKCAT_MANIFEST_SCOPE_CHANGED"].includes(code))
      return { title: "還沒讀到完整的訂單清單", step: "請確認出貨總表的日期和搜尋內容，再按「重新整理訂單」。清單讀取失敗時，不會改選整天的訂單。" };
    if (["BLACKCAT_JOURNAL_INVALID", "BLACKCAT_JOURNAL_WRITE_UNCONFIRMED", "BLACKCAT_DUPLICATE_ARTIFACT", "BLACKCAT_OPERATION_FAILED", "BLACKCAT_PREPARATION_FAILED", "BLACKCAT_ENDPOINT_FORBIDDEN", "BLACKCAT_SENDER_ADDRESS_INVALID"].includes(code))
      return { title: "系統需要檢查，請先暫停列印", step: "請把這個畫面交給協助設定系統的人，確認剛才的列印紀錄。還沒確認前，不要重新勾選、補印或刪除紀錄。處理好後再按下方按鈕。" };
    return null;
  }
  function showAccessProblem(code, retry) {
    const issue = accessProblem(code);
    if (!issue) return false;
    feedback("", true);
    view.accessIssue = code;
    const node = byId("blackcatFeedback");
    node.innerHTML = `<strong class="bc-failure-title">⚠ ${esc(issue.title)}</strong><p>${esc(issue.step)}</p><p>剛才已存好的訂單選擇和單號會保留；再試一次不會換新單號。</p><div class="bc-detail">協助處理時可提供這個代碼：${esc(code)}</div><div class="bc-actions">${issue.login ? '<button type="button" id="blackcatLogin" class="bc-retry">重新登入</button>' : ''}<button type="button" id="blackcatAccessRetry">${esc(issue.retryLabel || "處理好了，再試一次")}</button></div>`;
    byId("blackcatAccessRetry").onclick = () => {
      if (view.busy || view.loading || downloadFlights.size) return;
      view.accessIssue = null;
      return retry();
    };
    if (issue.login) byId("blackcatLogin").onclick = () => {
      if (view.busy || downloadFlights.size) return;
      close();
      if (typeof setAdminAuthRetryButtonMode === "function") setAdminAuthRetryButtonMode(false);
      if (typeof showAdminAuthOverlay === "function") showAdminAuthOverlay("請重新登入 LINE，再回來繼續剛才的列印。已取得的單號會保留，不用重新勾選或補印。", true);
    };
    updateSummary();
    return true;
  }
  function mount() {
    if (byId("blackcatModal")) return;
    const style = document.createElement("style");
    style.textContent = `#blackcatModal .modal{width:min(980px,96vw);max-width:980px;max-height:92vh;display:flex;flex-direction:column}#blackcatModal .modal-body{overflow:auto}#blackcatModal h3{margin:0 0 10px}#blackcatModal button,#blackcatModal input,#blackcatModal select{font:inherit}#blackcatModal button{cursor:pointer;padding:9px 12px;border-radius:8px;border:1px solid #cbd5d0;background:#fff}#blackcatModal button:disabled{opacity:.5;cursor:default}#blackcatModal .bc-primary{background:#246741;color:white;border-color:#246741}#blackcatModal .bc-controls{display:flex;gap:12px;flex-wrap:wrap;margin:14px 0}#blackcatModal label{display:flex;gap:6px;align-items:center;white-space:nowrap}#blackcatModal input,#blackcatModal select{padding:7px;border:1px solid #b9c9bf;border-radius:6px;max-width:100%;width:auto;min-width:0}#blackcatModal .bc-order,#blackcatModal .bc-batch{padding:12px 0;border-top:1px solid #dce4df}#blackcatModal .bc-row{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}#blackcatModal .bc-detail{font-size:14px;line-height:1.7;overflow-wrap:anywhere;color:#42554a}#blackcatModal .bc-error,#blackcatModal .is-error{color:#a02e28}#blackcatModal .bc-summary{padding:12px;background:#edf6ef;border-radius:8px;white-space:pre-line}#blackcatModal .bc-actions{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}#blackcatModal .modal-header{display:flex;justify-content:space-between;padding:16px}#blackcatModal .modal-body{padding:0 16px 16px}#blackcatModal input[type=checkbox]{width:18px;height:18px;flex:0 0 18px;accent-color:#246741}#blackcatModal .bc-check{white-space:normal;cursor:pointer}#blackcatModal .bc-reprint{padding:12px;margin-top:12px;background:#fff4d7;border:1px solid #d9b56c;border-radius:8px}#blackcatModal .bc-reprint label{white-space:normal;align-items:flex-start}#blackcatModal .bc-status{font-size:13px;color:#627469}#blackcatModal .bc-defaults{padding:12px;background:#f2f6f3;border-radius:8px}#blackcatModal [hidden]{display:none!important}@media(max-width:520px){#blackcatModal .modal{width:100%;max-height:96vh}#blackcatModal .bc-controls label{width:100%;justify-content:space-between}}`;
    style.textContent += `#blackcatFeedback.is-error{background:#fff1f0;border:2px solid #c0392b;border-left-width:7px;color:#78261e;padding:18px;line-height:1.7;margin-bottom:16px}#blackcatFeedback .bc-failure-title{display:block;font-size:22px;line-height:1.4}#blackcatFeedback p{margin:10px 0}#blackcatFeedback .bc-retry{background:#a82b20;border-color:#a82b20;color:#fff;font-weight:700;min-height:46px}#blackcatFeedback .bc-actions{margin-bottom:0}`;
    style.textContent += `#blackcatIssuedDialog{position:fixed;inset:0;margin:auto;max-height:calc(100dvh - 40px);overflow:auto;width:min(460px,calc(100vw - 40px));box-sizing:border-box;border:1px solid #d9b56c;border-radius:12px;padding:22px;color:#263d30;background:#fff;box-shadow:0 16px 60px #0003}#blackcatIssuedDialog::backdrop{background:#0006}#blackcatIssuedDialog p{white-space:pre-line;line-height:1.7;overflow-wrap:anywhere}#blackcatIssuedDialog h3{margin:0 0 12px}#blackcatIssuedDialog button{font:inherit;padding:10px 14px;border:1px solid #bccabf;border-radius:8px;background:#fff;cursor:pointer}#blackcatIssuedConfirm{background:#246741!important;color:#fff}#blackcatIssuedDialog .bc-confirm-actions{display:flex;justify-content:flex-end;gap:10px}`;
    style.textContent += `
#blackcatCandidates{display:grid;gap:12px;margin:12px 0 16px}
#blackcatModal .bc-order-card{padding:16px;border:1px solid #cfddd3;border-radius:12px;background:#fff;min-width:0}
#blackcatModal .bc-order-card.bc-issued{background:#fffaf0;border-color:#e5c886}
#blackcatModal .bc-order-card:has(input:checked){border-color:#397650;box-shadow:inset 0 0 0 1px #397650;background:#f4faf5}
#blackcatModal .bc-card-heading{align-items:flex-start;gap:10px;margin-bottom:12px}
#blackcatModal .bc-card-heading .bc-check{flex:1;min-width:0;align-items:flex-start;gap:10px}
#blackcatModal .bc-card-heading input{margin:3px 0 0}
#blackcatModal .bc-card-name{display:block;font-size:17px;line-height:1.4;overflow-wrap:anywhere}
#blackcatModal .bc-card-id{display:block;font-size:13px;line-height:1.6;color:#526557;overflow-wrap:anywhere}
#blackcatModal .bc-order-card .bc-status{padding:4px 8px;border-radius:6px;background:#e9f2eb;color:#30563d;font-weight:700;max-width:100%;overflow-wrap:anywhere}
#blackcatModal .bc-issued .bc-status{background:#f9ebc8;color:#78500d}
#blackcatModal .bc-card-body{display:grid;gap:8px;padding-left:28px}
#blackcatModal .bc-card-field{display:grid;grid-template-columns:70px minmax(0,1fr);gap:8px;line-height:1.65;font-size:14px;color:#344d3e}
#blackcatModal .bc-card-field>span:first-child{color:#617166}
#blackcatModal .bc-card-field>span:last-child{overflow-wrap:anywhere;white-space:pre-line}
#blackcatModal .bc-card-facts{display:flex;flex-wrap:wrap;gap:6px 18px;padding:8px 0;border-top:1px solid #dfe8e1;border-bottom:1px solid #dfe8e1;font-size:14px;color:#344d3e}
#blackcatModal .bc-card-tracking{padding:9px 12px;border-radius:8px;background:#edf2ed;font-size:14px;line-height:1.7;overflow-wrap:anywhere}
#blackcatModal .bc-card-tracking strong{display:block;letter-spacing:.03em}
#blackcatModal .bc-card-warning{color:#9b391b;background:#fff0dd}
#blackcatModal .bc-order-card .bc-error{margin-top:10px;padding:10px;border-radius:8px;background:#fff0ed;line-height:1.6}
@media(max-width:520px){#blackcatModal .bc-order-card{padding:12px}#blackcatModal .bc-card-body{padding-left:0}#blackcatModal .bc-card-heading .bc-status{margin-left:28px}#blackcatModal .bc-card-heading{flex-direction:column}#blackcatModal .bc-card-field{grid-template-columns:60px minmax(0,1fr)}}
`;
    style.textContent += `
#blackcatModal .bc-shipping-info{margin:14px 0 12px;padding:16px;border:1px solid #dce6df;border-radius:12px;background:#f5f8f5}
#blackcatModal .bc-section-title{margin:0;font-size:15px;font-weight:700;color:#2d4937}
#blackcatModal .bc-date-grid{display:grid;grid-template-columns:1fr 1fr .65fr;gap:16px;margin:12px 0}
#blackcatModal .bc-date-grid>div{display:grid;gap:5px;min-width:0}
#blackcatModal .bc-date-label{font-size:13px;color:#617166}
#blackcatModal .bc-date-grid strong{font-size:21px;line-height:1.3;color:#243e2e;font-variant-numeric:tabular-nums}
#blackcatModal .bc-info-note{margin:0;font-size:12px;line-height:1.7;color:#65756a}
#blackcatModal .bc-scope{display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:6px 16px;margin:0 0 6px;font-size:14px;line-height:1.6;color:#344d3e}
#blackcatModal .bc-scope strong{font-size:15px}
#blackcatModal .bc-scope-filter{margin:0;color:#617166;font-size:13px;line-height:1.6;overflow-wrap:anywhere}
#blackcatModal .bc-sender-details{margin:12px 0 18px;border-bottom:1px solid #e2e9e4;padding-bottom:12px}
#blackcatModal .bc-sender-details summary{cursor:pointer;color:#54695b;font-size:13px;font-weight:600}
#blackcatModal .bc-sender-details .bc-detail{margin:10px 0 0;white-space:pre-line}
#blackcatModal .bc-selection-toolbar{align-items:center;padding-top:4px}
#blackcatModal:has(#blackcatSelection:not([hidden])) #blackcatFeedback:not(.is-error){background:transparent;padding:0;margin:0 0 10px;color:#54695b;font-size:14px;line-height:1.7}
@media(max-width:520px){#blackcatModal .bc-shipping-info{padding:12px}#blackcatModal .bc-date-grid{grid-template-columns:1fr 1fr;gap:12px}#blackcatModal .bc-date-grid strong{font-size:18px}#blackcatModal .bc-date-grid>div:last-child{grid-column:1/-1;display:flex;align-items:baseline;gap:10px}#blackcatModal .bc-date-grid>div:last-child strong{font-size:15px}}
`;
    style.textContent += `
#blackcatModal .bc-ezcat-result-card{margin:14px 0;padding:18px;border:1px solid #d3e2d8;border-radius:12px;background:#fff}
#blackcatModal .bc-ezcat-result-card>strong{font-size:18px;color:#263e2f}
#blackcatModal .bc-label-heading{margin:18px 0 6px;font-size:14px;color:#526557}
#blackcatModal .bc-label-numbers{display:grid;gap:8px}
#blackcatModal .bc-label-numbers strong{font-size:26px;line-height:1.4;letter-spacing:.04em;color:#205b37;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
#blackcatModal .bc-ezcat-result-card .bc-detail{margin:6px 0 14px}
#blackcatModal .bc-old-label-warning{margin:0;font-weight:700;font-size:16px;color:#8b4217}
#blackcatModal .bc-ezcat-explanation{margin:14px 0;color:#617166;font-size:13px}
#blackcatModal .bc-ezcat-explanation summary{cursor:pointer}
@media(max-width:520px){#blackcatModal .bc-ezcat-result-card{padding:14px}#blackcatModal .bc-label-numbers strong{font-size:23px}}
#blackcatImportDialog .bc-ezcat-result-card{margin:14px 0;padding:18px;border:1px solid #d3e2d8;border-radius:12px;background:#fff}
#blackcatImportDialog .bc-ezcat-result-card>strong{font-size:18px;color:#263e2f}
#blackcatImportDialog .bc-label-heading{margin:18px 0 6px;font-size:14px;color:#526557}
#blackcatImportDialog .bc-label-numbers{display:grid;gap:8px}
#blackcatImportDialog .bc-label-numbers strong{font-size:26px;line-height:1.4;letter-spacing:.04em;color:#205b37;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
#blackcatImportDialog .bc-ezcat-result-card .bc-detail{margin:6px 0 14px}
#blackcatImportDialog .bc-old-label-warning{margin:0;font-weight:700;font-size:16px;color:#8b4217}
#blackcatImportDialog .bc-ezcat-explanation{margin:14px 0;color:#617166;font-size:13px}
#blackcatImportDialog .bc-ezcat-explanation summary{cursor:pointer}
@media(max-width:520px){#blackcatImportDialog .bc-ezcat-result-card{padding:14px}#blackcatImportDialog .bc-label-numbers strong{font-size:23px}}
`;
    style.textContent += `#blackcatImportDialog{position:fixed;inset:0;margin:auto;width:min(620px,calc(100vw - 32px));max-height:90dvh;overflow:auto;box-sizing:border-box;border:1px solid #d3e2d8;border-radius:18px;padding:20px;color:#263e2f;background:white;box-shadow:0 16px 60px #0003}#blackcatImportDialog::backdrop{background:#0006}#blackcatImportDialog .bc-import-header{display:flex;align-items:center;justify-content:space-between;gap:12px}#blackcatImportDialog h3{margin:0;font-size:20px}#blackcatImportDialog button{font:inherit;padding:10px 14px;border:1px solid #bccabf;border-radius:8px;background:white;cursor:pointer}#blackcatImportDialog .bc-card-id{font-size:13px;color:#526557;overflow-wrap:anywhere}#blackcatImportDialog .bc-detail{font-size:14px;line-height:1.7;color:#42554a}#blackcatImportDialog .bc-ezcat-explanation p{line-height:1.7}`;
    document.head.appendChild(style);
    const modal = document.createElement("div"); modal.id = "blackcatModal"; modal.className = "modal-overlay";
    modal.innerHTML = `<div class="modal modal-container" role="dialog" aria-modal="true" aria-labelledby="blackcatTitle"><div class="modal-header"><h3 id="blackcatTitle">列印宅配單</h3><button type="button" id="blackcatClose" aria-label="關閉黑貓建單">關閉</button></div><div class="modal-body"><div id="blackcatFeedback" class="bc-summary" role="status" aria-live="polite"></div><div id="blackcatSelection"><section class="bc-shipping-info" aria-labelledby="blackcatShippingInfoTitle"><h4 class="bc-section-title" id="blackcatShippingInfoTitle">本次出貨資訊</h4><div class="bc-date-grid"><div><span class="bc-date-label">出貨日</span><strong id="blackcatShipmentDate"></strong></div><div><span class="bc-date-label">希望配達日</span><strong id="blackcatDeliveryDate"></strong></div><div><span class="bc-date-label">溫層</span><strong>常溫</strong></div></div><p class="bc-info-note">系統自動帶入，遇週日順延。</p></section><div id="blackcatSender"></div><div class="bc-actions bc-selection-toolbar"><button type="button" id="blackcatSelectNew">全選未建單</button><button type="button" id="blackcatClearSelection">全部取消</button><button type="button" id="blackcatReload">重新整理訂單</button></div><div id="blackcatCandidates"></div><div id="blackcatSummary" class="bc-summary"></div><div class="bc-actions"><button type="button" id="blackcatSubmit" class="bc-primary">列印宅配單</button></div></div><div id="blackcatResult" hidden></div><div class="bc-actions"><button type="button" id="blackcatRecover" hidden>查詢本次結果</button></div><section id="blackcatUnfinished" hidden></section><details><summary>最近列印紀錄</summary><div id="blackcatHistory"></div></details></div></div>`;
    document.body.appendChild(modal);
    const issuedDialog = document.createElement("dialog");
    issuedDialog.id = "blackcatIssuedDialog";
    issuedDialog.setAttribute("aria-labelledby", "blackcatIssuedTitle");
    issuedDialog.setAttribute("aria-describedby", "blackcatIssuedText");
    issuedDialog.innerHTML = '<h3 id="blackcatIssuedTitle">這筆訂單已建單／曾匯出</h3><p id="blackcatIssuedText"></p><div class="bc-confirm-actions"><button type="button" id="blackcatIssuedCancel" autofocus>取消</button><button type="button" id="blackcatIssuedConfirm">確認選取</button></div>';
    document.body.appendChild(issuedDialog);
    byId("blackcatIssuedCancel").onclick = () => issuedDialog.close();
    byId("blackcatIssuedConfirm").onclick = () => {
      const selection = issuedSelection;
      if (selection && selection.epoch === view.epoch && selection.node.isConnected && !selection.node.disabled) {
        selection.node.checked = true;
        view.selected.set(selection.c.orderNo, "reprint");
        updateSummary();
      }
      issuedDialog.close();
    };
    issuedDialog.onclose = () => { issuedSelection?.node?.focus(); issuedSelection = null; };
    byId("blackcatClose").onclick = close;
    byId("blackcatSubmit").onclick = () => submit();
    byId("blackcatReload").onclick = () => loadCandidates(true);
    byId("blackcatSelectNew").onclick = () => {
      byId("blackcatCandidates").querySelectorAll("[data-bc-selection]").forEach((n) => { n.checked = !n.disabled && !view.candidates[Number(n.dataset.bcSelection)].hasHistory; n.onchange(); });
    };
    byId("blackcatClearSelection").onclick = () => {
      byId("blackcatCandidates").querySelectorAll("[data-bc-selection]").forEach((n) => { n.checked = false; n.onchange(); });
    };
    byId("blackcatRecover").onclick = () => {
      if (view.busy || downloadFlights.size) return;
      try { if (pending()) { preparePdfWindow(); recover(); } else if (view.batch) resumeBatch(view.batch.batchId); }
      catch (e) { feedback(explain(e.message), true); }
    };
    document.addEventListener("keydown", (event) => {
      if (issuedDialog.open || byId("blackcatImportDialog")?.open) return;
      if (event.key === "Escape" && modal.classList.contains("open")) { event.preventDefault(); close(); }
    });
    modal.addEventListener("keydown", (event) => {
      if (event.key === "Tab") {
        const nodes = [...modal.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), summary')].filter((n) => n.getClientRects().length);
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    });
  }
  function close() {
    view.epoch += 1;
    byId("blackcatModal").classList.remove("open");
    document.body.style.overflow = "";
    previousFocus?.focus();
  }
  async function open() {
    if (window.ORDER_SYSTEM_CONFIG?.features?.blackcatDirectShipping !== true) { setEzcatExportFeedback("宅配單功能尚未開放，請繼續使用原本的 CSV 匯出。", true); return; }
    const { startDate, endDate } = getShippingManifestDateRange();
    if (!startDate || startDate !== endDate) { setEzcatExportFeedback("黑貓建單請先選擇單一出貨日期。", true); return; }
    mount(); previousFocus = document.activeElement; view.epoch += 1; view.date = startDate; view.busy = false; view.loading = false;
    byId("blackcatRecover").disabled = false;
    byId("blackcatModal").classList.add("open"); document.body.style.overflow = "hidden"; byId("blackcatClose").focus();
    await loadCandidates();
    try { if (pending() && !view.accessIssue) { byId("blackcatRecover").hidden = false; feedback("剛才的宅配單還沒完成。請按「繼續剛才的列印」，已取得的單號不會變，不用重新勾選。"); byId("blackcatSubmit").disabled = true; } }
    catch (e) { feedback(explain(e.message), true); byId("blackcatSubmit").disabled = true; }
  }
  async function loadCandidates(preserveSelection = false) {
    if (view.busy || view.loading || downloadFlights.size) return;
    const epoch = ++view.epoch;
    const previousCandidates = new Map((preserveSelection ? view.candidates : []).map((c) => [c.orderNo, c]));
    const previousSelected = new Map(preserveSelection ? view.selected : []);
    view.loading = true; view.selected.clear(); view.candidates = []; view.config = null;
    byId("blackcatCandidates").innerHTML = "";
    byId("blackcatSender").textContent = "尚未確認目前篩選範圍與寄件設定。";
    byId("blackcatShipmentDate").textContent = "待確認";
    byId("blackcatDeliveryDate").textContent = "待確認";
    byId("blackcatSelection").hidden = false; byId("blackcatResult").hidden = true;
    byId("blackcatSubmit").disabled = true; feedback("正在讀取訂單、建單紀錄與寄件設定…"); updateSummary();
    try {
      if (typeof getBlackCatManifestScope !== "function") throw new Error("BLACKCAT_MANIFEST_SCOPE_UNAVAILABLE");
      const scope = await getBlackCatManifestScope(view.date);
      const result = await api("adminReadBlackCatCandidates", { date: view.date });
      if (epoch !== view.epoch) return;
      // Intersect with the full filtered manifest; an empty result must remain empty.
      const byOrder = new Map(result.candidates.map(c => [c.orderNo, c]));
      const scoped = [...new Set(scope.orderNos)].map(id => byOrder.get(id)).filter(Boolean);
      view.candidates = [...scoped.filter(c => !c.hasHistory), ...scoped.filter(c => c.hasHistory)];
      view.config = result.config; view.batches = [...new Map([...(result.unfinishedBatches || []), ...result.recentBatches].map(b => [b.batchId, b])).values()]; view.selected.clear();
      view.defaults = result.defaults;
      byId("blackcatShipmentDate").textContent = view.defaults.shipmentDate;
      byId("blackcatDeliveryDate").textContent = view.defaults.deliveryDate;
      byId("blackcatSender").innerHTML = `<div class="bc-scope"><strong>選擇訂單 · ${view.candidates.length} 筆</strong><span>訂單出貨日期：${esc(view.date)}</span></div><p class="bc-scope-filter">沿用出貨總表篩選：${esc(scope.summary)}</p><details class="bc-sender-details"><summary>寄件資料與列印設定 · ${view.config.environment === "production" ? "正式站" : view.config.environment === "test" ? "測試站" : "未設定站台"}</summary><p class="bc-detail">寄件人：${esc(view.config.senderName || "未設定")}　${esc(view.config.senderPhone || "")}<br>寄件地址：${esc(view.config.senderAddress || "未設定")}<br>紙張：A4 二聯<br>同一筆訂單有多件包裹時，代收金額只列在第一件。</p></details>`;
      const list = byId("blackcatCandidates");
      list.innerHTML = view.candidates.length ? view.candidates.map((c, i) => {
        const blocked = c.errors.length || c.pendingBatchId || (!c.hasHistory && c.alreadyShipped);
        const prior = previousCandidates.get(c.orderNo);
        const checked = !blocked && (preserveSelection && prior
          ? previousSelected.has(c.orderNo) && prior.hasHistory === c.hasHistory && prior.fingerprint === c.fingerprint && prior.trackingFingerprint === c.trackingFingerprint
          : !c.hasHistory);
        if (checked) view.selected.set(c.orderNo, c.hasHistory ? "reprint" : "initial");
        return `<div class="bc-order bc-order-card${c.hasHistory ? " bc-issued" : ""}"><div class="bc-row bc-card-heading"><label class="bc-check"><input type="checkbox" data-bc-selection="${i}" aria-label="勾選 ${esc(c.recipientName)} ${esc(c.orderNo)}" ${blocked ? "disabled" : ""} ${checked ? "checked" : ""}><span><strong class="bc-card-name">${esc(c.recipientName)}</strong><span class="bc-card-id">${esc(c.orderNo)}</span></span></label><span class="bc-status">${c.manualPending ? "已改用 ezcat・待匯回新號" : c.manualSource ? "ezcat 單號已匯回" : c.needsReprint ? "已取號・資料已變更，需補印" : c.pendingBatchId ? "列印尚未完成" : c.hasHistory ? "已建單／曾匯出" : preserveSelection && !prior ? "新增訂單・未建單" : "未建單"}</span></div><div class="bc-card-body"><div class="bc-card-field"><span>電話</span><span>${esc(c.recipientPhone)}</span></div><div class="bc-card-field"><span>收件地址</span><span>${esc(c.recipientAddress)}</span></div>${c.note ? `<div class="bc-card-field"><span>商品備註</span><span>${esc(c.note)}</span></div>` : ""}<div class="bc-card-facts"><span>${c.packageSpecs.length} 件包裹（${esc(c.packageSpecs.map((x) => x === "2" ? "90 cm" : "120 cm").join("、"))}）</span><span>代收 $${Number(c.codAmount || 0).toLocaleString()}</span><span>配達${({ 1: "13 時前", 2: "14–18 時", 4: "不指定" })[c.deliveryTimeSlot] || "待確認"}</span></div>${c.trackingNumbers.length ? `<div class="bc-card-tracking${c.needsReprint ? " bc-card-warning" : ""}">${c.needsReprint ? "舊單請勿貼箱，需補印" : "現有單號"}<strong>${esc(c.trackingNumbers.join("、"))}</strong></div>` : c.hasHistory ? '<div class="bc-card-tracking bc-card-warning">曾匯出 CSV，請先核對 ezcat 是否已建單。</div>' : ""}</div>${blocked ? `<div class="bc-error">${c.pendingBatchId ? "這筆還沒完成，請到「尚未完成的列印」查看。" : c.errors.length ? c.errors.map((e) => esc(messages[e] || e)).join("、") : "已寄出且無單號，請先核對歷史資料。"}</div>` : ""}</div>`;
      }).join("") : '<p class="bc-detail">目前出貨總表篩選條件沒有符合的訂單。</p>';
      list.querySelectorAll("[data-bc-selection]").forEach((node) => { node.onchange = () => {
        const c = view.candidates[Number(node.dataset.bcSelection)];
        if (node.checked && c.hasHistory && !view.selected.has(c.orderNo)) {
          const history = c.trackingNumbers.length
            ? `這筆訂單已建單。\n現有單號：${c.trackingNumbers.join("、")}`
            : "這筆訂單曾匯出 CSV，請先核對 ezcat 是否已建單。";
          const changed = c.needsReprint ? "\n託運資料已變更，舊單請勿貼箱，需要補印。" : "";
          byId("blackcatIssuedTitle").textContent = "這筆訂單已建單／曾匯出";
          byId("blackcatIssuedConfirm").textContent = "確認補印";
          node.checked = false;
          issuedSelection = { c, node, epoch: view.epoch };
          byId("blackcatIssuedText").textContent = `${c.recipientName}｜${c.orderNo}\n\n${history}${changed}\n\n確認要作廢舊訂單，取得新單號嗎？`;
          byId("blackcatIssuedDialog").showModal();
          return;
        }
        if (node.checked) view.selected.set(c.orderNo, c.hasHistory ? "reprint" : "initial"); else view.selected.delete(c.orderNo);
        updateSummary();
      }; });
      renderHistory(); updateSummary();
      feedback(view.config.ready ? "勾選本次要出貨的訂單，即可取號並下載 PDF；已建單的訂單預設不勾選。" : "宅配單功能還沒設定好，目前不會送出。請找協助設定系統的人處理。", !view.config.ready);
      byId("blackcatRecover").hidden = !pending();
      if (!view.config.ready) showAccessProblem("BLACKCAT_NOT_CONFIGURED", () => loadCandidates(true));
    } catch (e) {
      if (epoch === view.epoch) {
        // Keep selection intent across failed reads. Retry intersects it with fresh
        // scoped candidates and fingerprints before it can become printable again.
        view.candidates = [...previousCandidates.values()];
        view.selected = previousSelected;
        if (!showAccessProblem(e.message, () => loadCandidates(true))) feedback(explain(e.message), true);
      }
    }
    finally { if (epoch === view.epoch) { view.loading = false; updateSummary(); } }
  }
  function updateSummary() {
    const chosen = view.candidates.filter((c) => view.selected.has(c.orderNo));
    const parcels = chosen.reduce((n, c) => n + c.packageSpecs.length, 0), amount = chosen.reduce((n, c) => n + Number(c.codAmount || 0), 0);
    const reprints = chosen.filter((c) => view.selected.get(c.orderNo) === "reprint").length;
    byId("blackcatSummary").textContent = `${chosen.length} 筆訂單，共 ${parcels} 件包裹｜代收合計 $${amount.toLocaleString()}${reprints ? `\n其中 ${reprints} 筆補印，成功取得新單號後，舊單號才標記已取代。` : ""}`;
    let hasPending = true, pendingWork = null; try { pendingWork = pending(); hasPending = !!pendingWork; } catch (_) { /* fail closed */ }
    const otherPending = hasPending && pendingWork?.batchId !== view.batch?.batchId;
    byId("blackcatSubmit").disabled = view.busy || view.loading || !!view.accessIssue || !view.config?.ready || !chosen.length || parcels > 100 || hasPending;
    byId("blackcatSubmit").textContent = view.busy || downloadFlights.size ? "宅配單生成中…" : "列印宅配單";
    const working = view.busy || view.loading || !!view.ezcatBusy || downloadFlights.size > 0;
    const blocked = !!view.accessIssue;
    const retryingPdf = view.pdfRetry?.batchId === view.batch?.batchId && !!view.pdfRetry;
    if (byId("blackcatRetryPdf")) byId("blackcatRetryPdf").disabled = working || otherPending || (!view.batch?.pdfReady && view.pdfRetry?.mode !== "process");
    if (byId("blackcatDownloadHelp")) byId("blackcatDownloadHelp").hidden = blocked || retryingPdf || !(view.batch?.pdfReady || activeStates.includes(view.batch?.state));
    byId("blackcatHistory").querySelectorAll("[data-bc-history]").forEach((button) => { button.disabled = working; });
    ["blackcatReload", "blackcatSelectNew", "blackcatClearSelection"].forEach((id) => { byId(id).disabled = working; });
    if (byId("blackcatDownload")) { byId("blackcatDownload").disabled = blocked || working || otherPending || !view.batch?.pdfReady || pdfOpened(view.batch?.batchId); byId("blackcatDownload").textContent = working || activeStates.includes(view.batch?.state) ? "宅配單生成中…" : "列印宅配單"; }
    const resumable = !!view.batch && (view.batch.retryable || activeStates.includes(view.batch.state));
    const reviewing = view.batch?.state === "unknown" && !otherPending && !pendingWork?.resolution && !byId("blackcatResult").hidden;
    byId("blackcatRecover").hidden = blocked || retryingPdf || reviewing || ((!hasPending && !resumable) || (!otherPending && !byId("blackcatResult").hidden && (!!view.batch?.pdfReady || (working && activeStates.includes(view.batch?.state)))));
    byId("blackcatRecover").disabled = working;
    byId("blackcatUnfinished")?.querySelectorAll("button").forEach(button => { button.disabled = working; });
    byId("blackcatResolution")?.querySelectorAll("input,select,textarea,button").forEach(node => { node.disabled = working || otherPending || !!pendingWork?.resolution; });
    if (byId("blackcatOpenPdf")) {
      byId("blackcatOpenPdf").hidden = !view.batch?.pdfReady || (!pdfOpened(view.batch.batchId) && !view.batch.downloadOfferedAt);
      byId("blackcatOpenPdf").disabled = blocked || working || otherPending;
      byId("blackcatOpenPdf").textContent = working ? "PDF 開啟中…" : "開啟 PDF";
    }
    if (byId("blackcatHandoffSubmit")) byId("blackcatHandoffSubmit").disabled = working || otherPending || !!pendingWork?.handoff;
    ["blackcatHandoffStart", "blackcatRetryHandoff", "blackcatHandoffCancel", "blackcatEzcatExport", "blackcatEzcatImport", "blackcatEzcatRefresh", "blackcatEzcatFile"].forEach(id => { if (byId(id)) byId(id).disabled = working || otherPending || blocked; });
    if (byId("blackcatDownloadNote")) {
      byId("blackcatDownloadNote").hidden = blocked || retryingPdf || !view.batch?.pdfReady || pdfOpened(view.batch?.batchId);
      byId("blackcatDownloadNote").textContent = "下載或開啟未成功，再按「列印宅配單」即可，單號不變。";
    }
    byId("blackcatRecover").textContent = working ? "宅配單生成中…" : "繼續剛才的列印";
  }
  function renderHistory() {
    const unfinished = view.batches.filter(b => !["ready", "rejected", "needs_reprint", "ezcat"].includes(b.state));
    const pendingNode = byId("blackcatUnfinished");
    pendingNode.hidden = !unfinished.length;
    pendingNode.innerHTML = '<h3>尚未完成的列印</h3><p class="bc-detail">還沒完成的宅配單會留在這裡，換電腦也能繼續。已取得的單號不會變。</p>' + unfinished.map((b, i) => `<div class="bc-batch bc-row"><div class="bc-detail"><strong>${esc(states[b.state] || b.state)}</strong>${b.state === "unknown" ? "<br>尚未確認是否取得單號，請找協助處理的人向黑貓確認。" : ""}<br>${esc(b.shipmentDate)}｜${b.orderCount} 筆／${b.packageCount} 件<br>${esc(b.orders.map(o => o.recipientName).join("、"))}</div>${view.batch?.batchId === b.batchId && !byId("blackcatResult").hidden ? '<span class="bc-status">目前查看</span>' : `<button type="button" data-bc-resume="${i}">${b.state === "unknown" ? "核對建單結果" : "繼續剛才的列印"}</button>`}</div>`).join("");
    pendingNode.querySelectorAll("[data-bc-resume]").forEach(button => { button.onclick = () => {
      const b = unfinished[Number(button.dataset.bcResume)];
      if (b.state === "unknown") readHistoryBatch(b.batchId); else resumeBatch(b.batchId);
    }; });
    const history = view.batches.filter(b => ["ready", "rejected", "needs_reprint", "ezcat"].includes(b.state)).slice(0, 20);
    const node = byId("blackcatHistory");
    node.innerHTML = history.length ? history.map((b, i) => `<div class="bc-batch bc-row"><div class="bc-detail">${esc(b.shipmentDate)}｜${b.orderCount} 筆／${b.packageCount} 件<br>${esc(b.downloadError === "BLACKCAT_LABEL_CHANGED" ? "已取號，資料已變更，需補印" : b.downloadError === "BLACKCAT_PDF_SUPERSEDED" ? "舊 PDF 已停止下載" : states[b.state] || b.state)}</div><button type="button" data-bc-history="${i}">${b.state === "ezcat" ? "查看 ezcat 進度" : b.state === "rejected" ? "查看結案" : "開啟 PDF"}</button></div>`).join("") : '<p class="bc-detail">尚無 API 建單紀錄。</p>';
    node.querySelectorAll("[data-bc-history]").forEach((button) => { button.onclick = () => {
      if (view.busy || downloadFlights.size) return;
      const b = history[Number(button.dataset.bcHistory)];
      readHistoryBatch(b.batchId, !["rejected", "ezcat"].includes(b.state));
    }; });
  }
  async function readHistoryBatch(batchId, autoOpen = false) {
    if (view.busy || downloadFlights.size) return;
    const epoch = ++view.epoch;
    let openAfterRead = false;
    if (autoOpen) preparePdfWindow();
    view.busy = true;
    updateSummary();
    feedback(autoOpen ? "正在開啟這次的宅配單…" : "正在讀取列印紀錄…");
    byId("blackcatModal").querySelector(".modal-body").scrollTop = 0;
    try {
      // Viewing history is read-only. Never replace a pending request or retry state.
      const result = await api("adminReadBlackCatBatch", { batchId });
      if (epoch !== view.epoch) return;
      showBatch(result.batch);
      const work = pending();
      if (work && work.batchId !== batchId) {
        feedback("已顯示這次的結果。你還有另一次列印沒完成，請先按「繼續剛才的列印」，單號不會變。", true);
      } else if (autoOpen && result.batch.pdfReady) {
        openAfterRead = true;
      } else if (work?.batchId === batchId && work.downloadPending && result.batch.pdfReady) {
        feedback("這些訂單已有單號，但宅配單還沒下載或開啟成功。請按「列印宅配單」重試，會沿用原單號。", true);
      } else if (autoOpen && !view.accessIssue && result.batch.state !== "unknown" && !result.batch.downloadError && !result.batch.pdfReady) {
        feedback("這次的宅配單還沒準備好，請照上方提示處理後再開啟。", true);
      }
    } catch (e) { if (epoch === view.epoch && !showAccessProblem(e.message, () => readHistoryBatch(batchId, autoOpen))) feedback("讀取結果未完成，請再按「開啟 PDF」重試。", true); }
    finally {
      if (autoOpen && !openAfterRead) closePdfPlaceholder();
      if (epoch === view.epoch) { view.busy = false; updateSummary(); }
    }
    if (openAfterRead && epoch === view.epoch) await reopenPdf(batchId);
  }

  async function resumeBatch(batchId) {
    if (view.busy || downloadFlights.size) return;
    try {
      const work = pending();
      if (work && work.batchId !== batchId) { feedback("你還有另一次列印沒完成，請先按「繼續剛才的列印」，不要重新勾選訂單。", true); return; }
      if (!work) pending({ batchId });
      preparePdfWindow();
      await recover();
    } catch (e) { closePdfPlaceholder(); feedback(explain(e.message), true); }
  }
  function renderResolution(batch) {
    byId("blackcatResult").insertAdjacentHTML("beforeend", `<details id="blackcatResolution" class="bc-reprint"><summary>請協助處理的人確認結果</summary><p>請先向黑貓逐件核對。這裡不會重新建單；請勿猜測單號或將結果不明當成失敗。</p><label>核對結果 <select id="blackcatResolutionOutcome"><option value="created">黑貓確認已建單</option><option value="not_created">黑貓確認全部未建單</option></select></label><div id="blackcatResolutionNumbers"><p>請填入黑貓確認的完整資料；每件包裹都必須對應。</p>${(batch.reviewParcels || []).map((p, i) => `<div class="bc-order"><strong>${esc(p.orderNo)}｜第 ${p.parcelIndex + 1} 件</strong><div class="bc-detail">提供給黑貓的包裹編號（OrderId）：${esc(p.id)}</div><label>託運單號 <input data-bc-review="${i}" aria-label="${esc(p.orderNo)} 第 ${p.parcelIndex + 1} 件單號" inputmode="numeric" maxlength="12" value="${esc(p.number)}"></label></div>`).join("")}<label>PDF 檔案編號（FileNo）<input id="blackcatResolutionFile" maxlength="200" value="${esc(batch.reviewFileNo || "")}"></label></div><p id="blackcatResolutionAbsent" hidden>確認後，這些訂單可以重新勾選列印，但不會自動送出。只要已有任何單號，就不能選這個選項。</p><label style="display:block;white-space:normal">核對依據（窗口、日期、案件編號或確認內容）<textarea id="blackcatResolutionEvidence" rows="3" maxlength="500" style="display:block;width:100%;box-sizing:border-box;font:inherit"></textarea></label><label class="bc-check"><input id="blackcatResolutionConfirmed" type="checkbox">我已向黑貓確認這次所有包裹，確認上述資料正確。</label><div class="bc-actions"><button type="button" id="blackcatResolve">儲存核對結果</button></div><p id="blackcatResolutionError" class="bc-error" role="alert"></p></details>`);
    byId("blackcatResolutionOutcome").onchange = () => {
      const absent = byId("blackcatResolutionOutcome").value === "not_created";
      byId("blackcatResolutionNumbers").hidden = absent; byId("blackcatResolutionAbsent").hidden = !absent;
      byId("blackcatResolutionConfirmed").checked = false;
    };
    byId("blackcatResolve").onclick = async () => {
      if (view.busy || downloadFlights.size || view.batch?.batchId !== batch.batchId) return;
      try {
        const work = pending();
        if (work && work.batchId !== batch.batchId) throw new Error("BLACKCAT_ORDER_BUSY");
        const evidence = byId("blackcatResolutionEvidence").value.trim();
        if (!byId("blackcatResolutionConfirmed").checked || evidence.length < 5) {
          byId("blackcatResolutionError").textContent = "請填寫核對依據，並勾選已向黑貓核對全部包裹。"; return;
        }
        const outcome = byId("blackcatResolutionOutcome").value;
        const fileNo = outcome === "created" ? byId("blackcatResolutionFile").value.trim() : "";
        const parcels = outcome === "created" ? (batch.reviewParcels || []).map((p, i) => ({ id: p.id, number: byId("blackcatResolution").querySelector(`[data-bc-review="${i}"]`).value.trim() })) : [];
        if (outcome === "created" && (!fileNo || parcels.some(p => !/^\d{12}$/.test(p.number)))) {
          byId("blackcatResolutionError").textContent = "請填寫每件 12 碼單號與 PDF 檔案編號。"; return;
        }
        pending({ batchId: batch.batchId, resolution: { batchId: batch.batchId, resolutionKey: crypto.randomUUID(), outcome, confirmed: true, evidence, fileNo, parcels } });
        if (outcome === "created") preparePdfWindow();
        await recover();
      } catch (e) { feedback(explain(e.message), true); }
    };
  }

  function importedLabelCard(o, numbers) {
    return `<div class="bc-ezcat-result-card"><strong>${esc(o.recipientName)}</strong><div class="bc-card-id">${esc(o.orderNo)}</div><p class="bc-label-heading">已更新宅配單號</p><div class="bc-label-numbers">${numbers.map(n => `<strong>${esc(n)}</strong>`).join("")}</div><p class="bc-detail">請確認紙上的單號相同。</p><p class="bc-old-label-warning">舊單請作廢</p></div>`;
  }
  function showImportedLabels(orders) {
    const updated = (Array.isArray(orders) ? orders : []).filter(o => o.orderNo && Array.isArray(o.trackingNumbers) && o.trackingNumbers.length && o.trackingNumbers.every(n => /^\d{12}$/.test(n)));
    if (!updated.length) return;
    mount();
    let dialog = byId("blackcatImportDialog");
    if (!dialog) {
      dialog = document.createElement("dialog"); dialog.id = "blackcatImportDialog";
      dialog.setAttribute("aria-labelledby", "blackcatImportTitle");
      document.body.appendChild(dialog);
    }
    const focusBefore = document.activeElement;
    dialog.innerHTML = '<div class="bc-import-header"><h3 id="blackcatImportTitle">新單號已更新</h3><button type="button" id="blackcatImportClose" autofocus>關閉</button></div>' + updated.map(o => importedLabelCard(o, o.trackingNumbers)).join("") + '<details class="bc-ezcat-explanation"><summary>其他說明</summary><p>請使用 ezcat 列印的新宅配單。舊單請勿貼箱；系統不會通知黑貓取消舊託運資料。</p></details>';
    byId("blackcatImportClose").onclick = () => dialog.close();
    dialog.onclose = () => focusBefore?.focus();
    if (!dialog.open) dialog.showModal();
    byId("blackcatImportClose").focus();
  }
  function handoffButton(batch, id = "blackcatHandoffStart") {
    return batch?.canHandoff ? `<button type="button" id="${id}">改用 ezcat 手動匯出列印</button>` : "";
  }
  function confirmHandoff(batch) {
    if (view.busy || view.ezcatBusy || downloadFlights.size || view.batch?.batchId !== batch.batchId) return;
    const host = byId("blackcatHandoff");
    host.hidden = false;
    host.innerHTML = `<p>這次 ${batch.orderCount} 筆訂單改用 ezcat 列印，舊單請作廢。</p><div class="bc-actions"><button type="button" id="blackcatHandoffSubmit" class="bc-primary">確認並下載 CSV</button><button type="button" id="blackcatHandoffCancel">取消</button></div><details><summary>其他說明</summary><p class="bc-detail">確認後停止這次的背景處理與舊 PDF。系統不會通知黑貓取消舊託運資料。</p></details>`;
    byId("blackcatHandoffCancel").onclick = () => { renderHandoff(batch); updateSummary(); };
    byId("blackcatHandoffSubmit").onclick = async () => {
      if (view.busy || view.ezcatBusy || downloadFlights.size) return;
      try {
        const work = pending();
        if (work && work.batchId !== batch.batchId) throw new Error("BLACKCAT_ORDER_BUSY");
        pending({ batchId: batch.batchId, handoff: { batchId: batch.batchId, handoffKey: crypto.randomUUID(), confirmed: true } });
        await recover();
        if (view.batch?.batchId === batch.batchId && view.batch.state === "ezcat" && byId("blackcatModal").classList.contains("open")) await exportHandoffCsv(batch.batchId);
      } catch (e) { feedback(explain(e.message), true); }
    };
    byId("blackcatHandoffSubmit").focus();
    updateSummary();
  }
  function handoffPendingOrders(batch) {
    return batch.orders.filter(o => o.manualLabel && !o.manualLabel.currentNumbers?.length);
  }
  async function exportHandoffCsv(batchId) {
    if (view.busy || view.ezcatBusy || downloadFlights.size) return;
    view.ezcatBusy = true; const epoch = view.epoch; updateSummary();
    feedback("正在準備這次訂單的 CSV，請稍候…");
    try {
      const { batch } = await api("adminReadBlackCatBatch", { batchId });
      if (batch.state !== "ezcat") throw new Error("BLACKCAT_EZCAT_SUPERSEDED");
      const orders = handoffPendingOrders(batch);
      if (!orders.length) { if (epoch === view.epoch) showBatch(batch); return; }
      const range = { startDate: batch.sourceDate, endDate: batch.sourceDate };
      const candidates = (await api("adminReadEzcatExportCandidates", range)).candidates;
      const selections = orders.map(o => {
        const c = candidates.find(c => c.orderNo === o.orderNo);
        if (!c || c.errors?.length) throw new Error("ORDER_NOT_EXPORTABLE");
        return { orderNo: o.orderNo, mode: c.requiresReexportApproval ? "reexport" : "initial", reason: c.requiresReexportApproval ? "rebuild_tracking" : "" };
      });
      if (epoch !== view.epoch) return;
      const savedKey = `${key()}:ezcat-csv:${batchId}`;
      let saved; try { saved = JSON.parse(sessionStorage.getItem(savedKey) || "null"); } catch (_) { /* Revalidate below. */ }
      const signature = JSON.stringify(orders.map(o => { const c = candidates.find(c => c.orderNo === o.orderNo); return [o.orderNo,c.fingerprint]; }));
      let file;
      if (saved?.signature === signature && orders.every(o => candidates.find(c => c.orderNo === o.orderNo).lastExportBatchId === saved.batchId)) {
        file = await api("adminDownloadEzcatExportBatch", { batchId: saved.batchId });
      } else {
        file = await api("adminCreateEzcatExportBatch", { ...range, selections });
      }
      if (!file.csvBase64 || !file.batch?.fileName) throw new Error("EZCAT_EXPORT_CREATE_FAILED");
      try { sessionStorage.setItem(savedKey, JSON.stringify({ signature, batchId: file.batch.batchId })); } catch (_) { /* CSV can still be delivered; metadata is revalidated next time. */ }
      if (epoch !== view.epoch) return;
      downloadEzcatBase64File(file.csvBase64, file.batch.fileName, file.mimeType || "text/csv");
      const latest = await api("adminReadBlackCatBatch", { batchId });
      if (epoch !== view.epoch) return;
      showBatch(latest.batch);
      feedback("CSV 已下載。請到 ezcat 匯入並列印，再回這裡按「匯入新單號」。");
    } catch (e) {
      if (epoch === view.epoch && !showAccessProblem(e.message, () => exportHandoffCsv(batchId))) feedback("CSV 尚未下載完成。請按「下載 CSV」再試一次；不用重新選訂單。" + (e.message === "ORDER_NOT_EXPORTABLE" ? " 訂單資料不完整，請先到訂單作業修正。" : ""), true);
    } finally { view.ezcatBusy = false; if (epoch === view.epoch) updateSummary(); }
  }
  function parseHandoffImport(fileName, size, buffer, batch) {
    if (!/\.csv$/i.test(fileName) || size > 5 * 1024 * 1024) throw new Error("FILE_INVALID");
    const rows = parseShippingTrackingCsv(decodeShippingTrackingCsv(buffer).text);
    const headers = (rows[0] || []).map(s => String(s).replace(/^\uFEFF/, "").trim());
    const oi = headers.indexOf("訂單編號"), ti = headers.indexOf("託運單號");
    if (oi < 0 || ti < 0) throw new Error("FILE_INVALID");
    const allowed = new Set(handoffPendingOrders(batch).map(o => o.orderNo)), grouped = new Map();
    for (const row of rows.slice(1)) {
      const orderNo = String(row[oi] || "").trim();
      if (!allowed.has(orderNo)) continue;
      const number = normalizeShippingTrackingNumber(row[ti]);
      if (!/^\d{12}$/.test(number)) throw new Error("FILE_INVALID");
      if (!grouped.has(orderNo)) grouped.set(orderNo, new Set());
      grouped.get(orderNo).add(number);
    }
    if (!grouped.size) throw new Error("FILE_NO_MATCH");
    return [...grouped].map(([orderNo,numbers]) => ({ orderNo, trackingNos: [...numbers] }));
  }
  async function importHandoffFile(batchId, file) {
    if (!file || view.busy || view.ezcatBusy || downloadFlights.size) return;
    view.ezcatBusy = true; const epoch = view.epoch; updateSummary(); feedback("正在核對並更新這次訂單的單號…");
    let written = false;
    try {
      const { batch } = await api("adminReadBlackCatBatch", { batchId });
      if (batch.state !== "ezcat") throw new Error("BLACKCAT_EZCAT_SUPERSEDED");
      if (!handoffPendingOrders(batch).length) { if (epoch === view.epoch) showBatch(batch); return; }
      const entries = parseHandoffImport(file.name, file.size, await file.arrayBuffer(), batch);
      if (epoch !== view.epoch) return;
      const result = await api("adminImportTrackingNumbers", { entries }); written = true;
      if (typeof refreshAdminOrdersAfterBatch === "function" && await refreshAdminOrdersAfterBatch() === false) throw new Error("MANIFEST_SYNC");
      if (typeof loadCompleteShippingManifestOrders === "function" && await loadCompleteShippingManifestOrders() === false) throw new Error("MANIFEST_SYNC");
      const latest = await api("adminReadBlackCatBatch", { batchId });
      if (epoch !== view.epoch) return;
      showBatch(latest.batch);
      if (result.conflicts?.length || result.unmatched?.length) {
        const details = (result.conflicts || []).map(c => `${c.orderNo}：${typeof formatShippingTrackingConflictReason === "function" ? formatShippingTrackingConflictReason(c.reason) : explain(c.reason)}`).join("；");
        feedback(`部分訂單尚未更新。已成功的單號顯示在下方；請核對剩下的訂單後重新匯入。${details}`, true);
      }
    } catch (e) {
      if (epoch === view.epoch && byId("blackcatEzcatRefresh")) byId("blackcatEzcatRefresh").hidden = false;
      if (epoch === view.epoch && !showAccessProblem(e.message, () => importHandoffFile(batchId, file))) feedback(written ? "單號已送出更新，但畫面還沒同步。請按「重新查看單號」，確認後再貼單。" : e.message === "FILE_NO_MATCH" ? "這份檔案沒有這次待更新的訂單。請選擇 ezcat 剛匯出的貨態檔。" : e.message === "FILE_INVALID" || /ENCODING|HEADER/.test(e.message) ? "檔案格式不對。請選擇 5MB 以下、包含「訂單編號、託運單號」的 ezcat 貨態 CSV。" : "還沒確認新單號是否更新。請按「重新查看單號」；未完成的訂單可再匯入同一份檔案。", true);
    } finally { view.ezcatBusy = false; if (epoch === view.epoch) updateSummary(); }
  }
  function renderHandoff(batch) {
    if (batch.state === "ezcat") {
      const remaining = handoffPendingOrders(batch), completed = batch.orders.every(o => o.manualLabel?.currentNumbers?.length);
      byId("blackcatResult").innerHTML = (remaining.length ? `<section class="bc-summary"><strong>到 ezcat 匯入 CSV 並列印</strong><p>印好後，把 ezcat 的貨態檔匯回這裡，就會顯示要貼的新單號。</p><div class="bc-actions"><button type="button" id="blackcatEzcatExport">下載 CSV</button><button type="button" class="bc-primary" id="blackcatEzcatImport">匯入新單號</button><button type="button" id="blackcatEzcatRefresh" hidden>重新查看單號</button></div><input type="file" id="blackcatEzcatFile" accept=".csv,text/csv" hidden></section>` : "") + batch.orders.map(o => {
        const numbers = o.manualLabel?.currentNumbers || [];
        return numbers.length ? importedLabelCard(o,numbers) : `<div class="bc-ezcat-result-card"><strong>${esc(o.recipientName)}</strong><div class="bc-card-id">${esc(o.orderNo)}</div><p class="bc-detail">${o.manualLabel ? "等待匯入新單號" : "已有較新的操作，請查看出貨總表。"}</p><p class="bc-old-label-warning">舊單請作廢</p></div>`;
      }).join("") + '<details class="bc-ezcat-explanation"><summary>其他說明</summary><p>舊 PDF 已停止使用，系統不會通知黑貓取消舊託運資料。貨態檔中的其他訂單不會在這裡更新。</p></details>';
      if (remaining.length) {
        byId("blackcatEzcatExport").onclick = () => exportHandoffCsv(batch.batchId);
        byId("blackcatEzcatImport").onclick = () => byId("blackcatEzcatFile").click();
        byId("blackcatEzcatFile").onchange = event => { const file = event.target.files?.[0]; event.target.value = ""; importHandoffFile(batch.batchId,file); };
        byId("blackcatEzcatRefresh").onclick = () => readHistoryBatch(batch.batchId);
      }
      feedback(completed ? "新單號已更新" : "沿用這次訂單，不用重新選擇。");
      return;
    }
    if (!batch.canHandoff) return;
    const old = byId("blackcatHandoff"); if (old) old.remove();
    byId("blackcatResult").insertAdjacentHTML("beforeend", `<section id="blackcatHandoff" class="bc-actions">${handoffButton(batch)}</section>`);
    byId("blackcatHandoffStart").onclick = () => confirmHandoff(batch);
  }

  async function submit() {
    if (view.busy || view.loading || view.accessIssue || downloadFlights.size) return;
    try {
      if (pending()) return recover();
      const { shipmentDate, deliveryDate, thermosphere } = view.defaults || {};
      if (!shipmentDate || !deliveryDate) { feedback("日期尚未載入，請更新清單。", true); return; }
      const selections = view.candidates.filter((c) => view.selected.has(c.orderNo)).map((c) => ({ orderNo: c.orderNo, mode: view.selected.get(c.orderNo), fingerprint: c.fingerprint, trackingFingerprint: c.trackingFingerprint }));
      if (!selections.length) return;
      const requestKey = crypto.randomUUID();
      const body = { requestKey, date: view.date, shipmentDate, deliveryDate, thermosphere, selections };
      preparePdfWindow();
      pending({ body }); // persist BEFORE any mutation, so a lost response reuses the same key
      await recover();
    } catch (e) { closePdfPlaceholder(); feedback(explain(e.message), true); }
  }
  async function recover() {
    if (view.busy) return;
    const epoch = ++view.epoch; view.busy = true; byId("blackcatSubmit").disabled = true; byId("blackcatRecover").disabled = true; updateSummary();
    try {
      let work = pending(); if (!work) return;
      if (work.handoff) {
        feedback("正在改用 ezcat，請稍候。重按只會確認同一次轉交，不會重新取號。");
        await api("adminHandoffBlackCatToEzcat", work.handoff);
        work = { batchId: work.batchId }; pending(work);
      }
      if (work.resolution) {
        feedback("正在儲存確認結果，請稍候。重按不會重複儲存，也不會重新取號。");
        await api("adminResolveBlackCatBatch", work.resolution);
        work = { batchId: work.batchId }; pending(work);
      }
      if (!work.batchId) {
        feedback("正在處理本次訂單，請稍候。重按不會重新取號；可以關閉視窗，回來查詢本次結果。");
        const response = await api("adminCreateBlackCatBatch", work.body);
        work = { batchId: response.batch.batchId }; pending(work);
      }
      if (epoch !== view.epoch) return;
      let result = await api("adminReadBlackCatBatch", { batchId: work.batchId });
      showBatch(result.batch);
      if (activeStates.includes(result.batch.state) || result.batch.retryable) {
        const beforeProcessUpdatedAt = result.batch.updatedAt;
        // Only the backend can claim a queued job. A lost processing response is never a reason to create another job.
        let processError = null;
        api("adminProcessBlackCatBatch", { batchId: work.batchId }).catch(e => { processError = e; });
        for (let count = 0; count < 100 && epoch === view.epoch; count += 1) {
          await new Promise((resolve) => setTimeout(resolve, 2500));
          if (processError && accessProblem(processError.message)) throw processError;
          result = await api("adminReadBlackCatBatch", { batchId: work.batchId });
          if (epoch !== view.epoch) return;
          showBatch(result.batch);
          if (!activeStates.includes(result.batch.state) && (result.batch.state !== "attention" || result.batch.updatedAt !== beforeProcessUpdatedAt)) break;
        }
      }
      if (epoch !== view.epoch) return;
      if (["ready", "needs_reprint", "ezcat"].includes(result.batch.state) && typeof refreshAdminOrdersAfterBatch === "function") {
        try {
          await refreshPdfOrderViews();
        } catch (error) { view.batch.pdfReady = false; view.batch.retryable = true; throw manifestRefreshFailure(error); }
      }
      if (epoch !== view.epoch) return;
      if (result.batch.state === "ready" && result.batch.pdfReady && (!result.batch.downloadOfferedAt || work.downloadPending)) await download(result.batch.batchId);
      if (["ready", "rejected", "needs_reprint", "ezcat"].includes(result.batch.state)) pending(null);
    } catch (e) {
      if (epoch !== view.epoch) return;
      if (["BLACKCAT_EZCAT_BUSY", "BLACKCAT_EZCAT_UNKNOWN", "BLACKCAT_EZCAT_SUPERSEDED", "BLACKCAT_ORDER_CHANGED", "REQUEST_INVALID"].includes(e.message) && pending()?.handoff) pending({ batchId: pending().batchId });
      if (e.message === "BLACKCAT_RESOLUTION_CONFLICT" && pending()?.batchId) {
        const work = pending(); pending({ batchId: work.batchId });
        try { const latest = await api("adminReadBlackCatBatch", { batchId: work.batchId }); showBatch(latest.batch); } catch (_) { /* Keep recovery available. */ }
      }
      if (!view.pdfRetry && !showAccessProblem(e.message, () => recover())) feedback(explain(e.message), true);
      if (["BLACKCAT_RESOLUTION_HAS_NUMBERS", "BLACKCAT_RESOLUTION_NUMBERS_INVALID", "BLACKCAT_RESOLUTION_EVIDENCE_REQUIRED", "BLACKCAT_RESOLUTION_FILE_REQUIRED", "BLACKCAT_RESOLUTION_NOT_ALLOWED", "REQUEST_INVALID"].includes(e.message) && pending()?.resolution) pending({ batchId: pending().batchId });
      // These errors occur before a job can be created. Unknown errors retain the request key.
      const unfinished = pending();
      if ((!unfinished?.batchId && ["BLACKCAT_DATE_INVALID", "BLACKCAT_ORDER_INVALID", "BLACKCAT_ORDER_CHANGED", "BLACKCAT_ORDER_BUSY", "BLACKCAT_REPRINT_REQUIRED", "BLACKCAT_REPRINT_NOT_REQUIRED", "BLACKCAT_PARCEL_LIMIT", "REQUEST_INVALID", "EXISTING_TRACKING_VALUE_INVALID"].includes(e.message)) || ["BLACKCAT_PDF_SUPERSEDED", "BLACKCAT_LABEL_CHANGED"].includes(e.message)) pending(null);
    } finally {
      if (epoch === view.epoch) {
        view.busy = false; byId("blackcatRecover").disabled = false; byId("blackcatRecover").hidden = !pending();
        updateSummary();
        closePdfPlaceholder();
      }
    }
  }
  function showBatch(batch) {
    if (batch.state === "ezcat" && pending()?.batchId === batch.batchId) pending(null);
    view.batch = batch; byId("blackcatSelection").hidden = true; byId("blackcatResult").hidden = false;
    view.batches = [batch, ...view.batches.filter((b) => b.batchId !== batch.batchId)];
    renderHistory();
    const invalid = batch.downloadError || (batch.orders.some((o) => o.needsReprint) ? "BLACKCAT_LABEL_CHANGED" : "");
    feedback(`${invalid === "BLACKCAT_LABEL_CHANGED" ? "已取號，資料已變更，需補印" : invalid === "BLACKCAT_PDF_SUPERSEDED" ? "舊 PDF 已停止下載" : states[batch.state] || batch.state}｜${batch.orderCount} 筆訂單、${batch.packageCount} 件包裹${invalid || batch.error ? `\n${explain(invalid || batch.error)}` : ""}`, !!invalid || ["unknown", "rejected", "attention", "needs_reprint"].includes(batch.state));
    byId("blackcatResult").innerHTML = `<p class="bc-detail">只處理下列訂單；其他訂單單號不變。</p>` + batch.orders.map((o) => `<div class="bc-order"><strong>${esc(o.recipientName)}｜${esc(o.orderNo)}</strong><div class="bc-detail">${o.trackingNumbers.length ? `<strong>${o.needsReprint || o.superseded ? "舊單請勿貼箱：" : o.syncState === "done" ? "目前應貼單號：" : "已有單號，還沒確認存入訂單："}${esc(o.trackingNumbers.join("、"))}</strong>` : "尚未取得可確認的單號"}${o.mode === "reprint" && o.trackingNumbers.length ? `<br>補印已重新取號。舊號 ${esc(o.replacedNumbers.join("、") || "無已回填單號")} 請勿再貼。` : ""}<br>${o.needsReprint ? explain("BLACKCAT_LABEL_CHANGED") : o.syncState === "done" ? "單號已存進訂單" : "單號還沒存進訂單"}${o.error ? `<br>${esc(explain(o.error))}` : ""}</div></div>`).join("") + `<div id="blackcatDownloadHelp" class="bc-actions" ${batch.pdfReady || activeStates.includes(batch.state) ? "" : "hidden"}><button type="button" class="bc-primary" id="blackcatDownload">列印宅配單</button><button type="button" id="blackcatOpenPdf" hidden>開啟 PDF</button></div><p id="blackcatDownloadNote" class="bc-detail" ${batch.pdfReady ? "" : "hidden"}>下載或開啟未成功，再按「列印宅配單」即可，單號不變。</p>`;
    byId("blackcatDownload").onclick = () => {
      if (view.busy || downloadFlights.size || !batch.pdfReady || pdfOpened(batch.batchId)) return;
      preparePdfWindow();
      download(batch.batchId).catch(() => {});
    };
    byId("blackcatOpenPdf").onclick = () => reopenPdf(batch.batchId);
    if (batch.resolution) byId("blackcatResult").insertAdjacentHTML("beforeend", `<p class="bc-detail">核對紀錄：${esc(batch.resolution.actor)}｜${esc(batch.resolution.outcome === "created" ? "已確認有單號，繼續使用原單號" : "已確認沒有單號，可以重新勾選列印")}<br>${esc(batch.resolution.evidence)}</p>`);
    if (batch.state === "unknown") renderResolution(batch);
    renderHandoff(batch);
    if (batch.state === "attention" && batch.canHandoff && batch.retryable && !batch.pdfReady && !accessProblem(batch.error)) {
      feedback("單號已保留。可以再試一次，或改用 ezcat 手動匯出列印。", true, "process");
    }
    if (accessProblem(invalid || batch.error)) showAccessProblem(invalid || batch.error, () => resumeBatch(batch.batchId));
    updateSummary();
  }
  function preparePdfWindow() {
    if (pdfWindow && !pdfWindow.closed) return;
    try {
      pdfWindow = window.open("about:blank", "_blank");
      if (pdfWindow) {
        pdfWindow.opener = null;
        pdfWindow.document.title = "宅配單生成中…";
        pdfWindow.document.body.textContent = "宅配單生成中… 完成後會自動顯示 PDF，請勿重複建單。";
      }
    } catch (_) { pdfWindow = null; }
  }
  function manifestRefreshFailure(error) {
    if (error && accessProblem(error.message)) return error;
    if (typeof shippingManifestRemoteError !== "undefined" && accessProblem(shippingManifestRemoteError)) return new Error(shippingManifestRemoteError);
    if ((typeof token === "function" && !token()) ||
        (typeof shippingManifestRemoteError !== "undefined" && shippingManifestRemoteError === "ADMIN_SESSION_REQUIRED"))
      return new Error("ADMIN_SESSION_REQUIRED");
    return new Error("BLACKCAT_MANIFEST_REFRESH_PENDING");
  }
  async function refreshPdfOrderViews() {
    // These read separate authoritative endpoints and can render in either
    // order. Wait for BOTH before the final server-side PDF authorization;
    // settling failures too prevents a late read from racing the next retry.
    const readers = [];
    if (typeof refreshAdminOrdersAfterBatch === "function") readers.push(() => refreshAdminOrdersAfterBatch());
    if (typeof loadCompleteShippingManifestOrders === "function") readers.push(() => loadCompleteShippingManifestOrders());
    const results = await Promise.allSettled(readers.map(read => Promise.resolve().then(read)));
    const failure = results.find(r => r.status === "rejected" && accessProblem(r.reason?.message)) ||
      results.find(r => r.status === "rejected" || r.value === false);
    if (failure) throw manifestRefreshFailure(failure.reason);
  }
  function closePdfPlaceholder() {
    try { if (pdfWindow && !pdfWindow.closed) pdfWindow.close(); } catch (_) { /* Browser may deny access. */ }
    pdfWindow = null;
  }
  function openPdf(result, batchId) {
    const bytes = Uint8Array.from(atob(result.pdfBase64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    // Keep opened PDF URLs alive for viewing/printing until this page is closed.
    pdfUrls.set(url, batchId);
    let opened = false;
    try {
      if (pdfWindow && !pdfWindow.closed) { pdfWindow.location.replace(url); opened = true; }
    } catch (_) { /* A blocked preview does not invalidate downloaded labels. */ }
    pdfWindow = null;
    if (!opened) throw new Error("BLACKCAT_PDF_OPEN_BLOCKED");
    rememberPdfOpened(batchId);
  }

  async function reopenPdf(batchId) {
    if (view.busy || downloadFlights.size || view.batch?.batchId !== batchId || !view.batch.pdfReady) return;
    const epoch = view.epoch;
    view.busy = true;
    preparePdfWindow();
    feedback("正在重新開啟本次 PDF，請稍候。單號不變。");
    updateSummary();
    try {
      // Refresh the displayed manifest too: a ready PDF must not race a stale order view.
      await refreshPdfOrderViews();
      if (epoch !== view.epoch) return;
      // Always revalidate current addresses/numbers; never open a cached stale label.
      const result = await api("adminDownloadBlackCatPdf", { batchId });
      if (epoch !== view.epoch) return;
      openPdf(result, batchId);
      if (pending()?.batchId === batchId && pending()?.downloadPending) pending(null);
      feedback("已開啟本次 PDF，單號不變，沒有重新建單或下載檔案。");
    } catch (e) {
      if (epoch !== view.epoch) return;
      if (["BLACKCAT_LABEL_CHANGED", "BLACKCAT_PDF_SUPERSEDED"].includes(e.message)) {
        view.batch.pdfReady = false;
        view.batch.downloadError = e.message;
        byId("blackcatDownloadHelp").hidden = true;
      }
      if (showAccessProblem(e.message, () => reopenPdf(batchId))) {
        // Keep the original batch and any pending download marker.
      } else if (e.message === "BLACKCAT_MANIFEST_REFRESH_PENDING") {
        view.batch.pdfReady = false; view.batch.retryable = true;
        if (!pending()) pending({ batchId });
        feedback(explain(e.message), true);
      } else if (["BLACKCAT_LABEL_CHANGED", "BLACKCAT_PDF_SUPERSEDED", "ADMIN_SESSION_REQUIRED"].includes(e.message)) feedback(explain(e.message), true);
      else pdfFailure("open", e.message === "BLACKCAT_PDF_OPEN_BLOCKED");
    } finally {
      closePdfPlaceholder();
      if (epoch === view.epoch) { view.busy = false; updateSummary(); }
    }
  }

  function download(batchId) {
    if (pdfOpened(batchId)) { closePdfPlaceholder(); return Promise.resolve(); }
    if (downloadFlights.has(batchId)) return downloadFlights.get(batchId);
    const task = (async () => {
      const button = byId("blackcatDownload"); if (button) { button.disabled = true; button.textContent = "宅配單生成中…"; }
      pending({ batchId, downloadPending: true });
      feedback("正在準備宅配單，請稍候。再下載一次也不會換號。");
      try {
        const result = await api("adminDownloadBlackCatPdf", { batchId });
        await downloadEzcatBase64File(result.pdfBase64, result.fileName, "application/pdf");
        openPdf(result, batchId);
        if (pending()?.batchId === batchId) pending(null);
        byId("blackcatRecover").hidden = !pending();
        if (view.batch?.batchId === batchId) feedback("PDF 已下載並開啟，請核對收件人與目前應貼單號。");
      } catch (e) {
        if (showAccessProblem(e.message, () => { preparePdfWindow(); return download(batchId).catch(() => {}); })) throw e;
        if (["BLACKCAT_LABEL_CHANGED", "BLACKCAT_PDF_SUPERSEDED"].includes(e.message)) {
          pending(null);
          if (byId("blackcatDownloadHelp")) byId("blackcatDownloadHelp").hidden = true;
          try {
            const latest = await api("adminReadBlackCatBatch", { batchId });
            if (view.batch?.batchId === batchId) showBatch(latest.batch);
            if (typeof loadCompleteShippingManifestOrders === "function") await loadCompleteShippingManifestOrders();
          } catch (_) { /* Keep the download blocked even if refreshing fails. */ }
        } else {
          if (byId("blackcatDownloadHelp")) byId("blackcatDownloadHelp").hidden = false;
          const code = e.message === "BLACKCAT_PDF_OPEN_BLOCKED" ? e.message : "BLACKCAT_DOWNLOAD_UNCONFIRMED";
          pdfFailure("download", e.message === "BLACKCAT_PDF_OPEN_BLOCKED");
          throw new Error(code);
        }
        throw e;
      } finally { closePdfPlaceholder(); }
    })();
    downloadFlights.set(batchId, task);
    updateSummary();
    const finish = () => { downloadFlights.delete(batchId); updateSummary(); };
    task.then(finish, finish);
    return task;
  }

  window.openBlackCatShippingModal = open;
  window.showBlackCatImportedLabels = showImportedLabels;
})();
