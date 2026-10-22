export function mountAdminPush({ container, api, requireLogin, platform = window }) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'btn-refresh-orders'; button.textContent = '手機通知';
  container.append(button);
  const dialog = document.createElement('dialog');
  dialog.className = 'admin-push-dialog';
  dialog.setAttribute('aria-labelledby', 'adminPushTitle');
  dialog.innerHTML = `<div class="push-heading"><h2 id="adminPushTitle" tabindex="-1" autofocus>新訂單手機通知</h2><button type="button" data-close-top aria-label="關閉通知設定">✕</button></div>
    <p>客戶表單下單與管理員在後台「新增訂單」，都會推播到管理員已開啟通知的裝置。客戶表單下單另保留 LINE 管理員群組通知。</p>
    <p>每位管理員在自己的手機開啟一次。通常約一分鐘內提醒；點通知進入後台查看。</p>
    <p class="push-hint">iPhone 請從主畫面圖示開啟（iOS 16.4 以上）。已加入的圖示若仍開啟一般瀏覽器，需重新加入主畫面。</p>
    <label>這台裝置的名稱<input id="adminPushLabel" maxlength="32" value="我的手機" autocomplete="off"></label>
    <div class="push-actions"><button type="button" data-enable disabled>開啟這台手機通知</button><button type="button" data-disable disabled>關閉這台手機通知</button></div>
    <p data-message role="status" aria-live="polite"></p>
    <div data-status></div>
    <h3>我的裝置</h3><div data-devices></div>
    <h3>最近發送紀錄</h3>
    <p class="push-hint">「服務已接受」不代表手機已顯示；鎖屏、專注模式與網路狀態仍需實際確認。</p>
    <ul data-events></ul>
    <div class="push-actions"><button type="button" data-refresh>重新查詢</button><button type="button" data-close>關閉</button></div>`;
  document.body.append(dialog);
  const el = selector => dialog.querySelector(selector);
  const enable = el('[data-enable]'), disable = el('[data-disable]'), refresh = el('[data-refresh]');
  let registration, config, busy = false;
  const message = text => { el('[data-message]').textContent = text; };
  const request = async (operation, data = {}) => {
    const result = await api(operation, data);
    if (result.error === 'ADMIN_SESSION_REQUIRED') {
      dialog.close(); requireLogin(); throw new Error('登入已過期，請重新登入。');
    }
    if (!result.ok) throw new Error(result.error === 'PUSH_DISABLED' ? '手機通知尚未啟用。' : '通知服務暫時無法連線，訂單仍可正常成立，請稍後重試。');
    return result;
  };
  function support() {
    if (!platform.isSecureContext || !platform.navigator.serviceWorker || !platform.PushManager || !platform.Notification) return '目前的瀏覽器不支援手機推播。';
    const ios = /iPhone|iPad|iPod/.test(platform.navigator.userAgent) || (platform.navigator.platform === 'MacIntel' && platform.navigator.maxTouchPoints > 1);
    if (ios && !platform.navigator.standalone && !platform.matchMedia('(display-mode: standalone)').matches) return '請先從主畫面的後台圖示開啟。若圖示仍開啟瀏覽器，請重新加入主畫面。';
    if (platform.Notification.permission === 'denied') return '通知權限已關閉，請到手機「設定 → 通知」開啟，再回來重試。';
    return '';
  }
  async function controls() {
    const problem = support();
    enable.disabled = busy || !!problem || !config || !registration;
    const sub = registration && await registration.pushManager.getSubscription();
    disable.disabled = busy || !sub;
    if (problem) message(problem);
  }
  const stateNames = { pending: '等待發送', sending: '發送中', accepted: '服務已接受', retry: '等待重試', failed: '發送失敗', expired: '裝置訂閱已失效', unknown: '結果不明，請核對手機', cancelled: '已停止發送' };
  async function renderStatus() {
    const status = await request('status');
    const section = el('[data-status]'); section.replaceChildren();
    const add = (text, warning = false) => { const p = document.createElement('p'); p.textContent = text; if (warning) p.className = 'push-warning'; section.append(p); };
    add(`已登記 ${status.counts.admins} 位管理員、${status.counts.devices} 台裝置（管理員名單共 ${status.expectedAdmins} 位）。`, status.counts.admins < status.expectedAdmins);
    if (status.counts.admins < 2) add('尚未達成兩位管理員收訊條件，請另一位管理員用自己的帳號與手機開啟通知。', true);
    if (status.sourcePending) add(`有 ${status.sourcePending} 筆通知尚未排入推播服務，等待補送。`, true);
    if (status.sourceError) add(`訂單端曾發生異常：${status.sourceError.code}（${new Date(status.sourceError.at).toLocaleString()}）。請確認排程與待送筆數。`, true);
    if (!status.lastPumpAt || Date.now() - status.lastPumpAt > 5 * 60000) add('補送排程尚無近期成功紀錄，需檢查排程是否運作。', true);
    const list = el('[data-events]'); list.replaceChildren();
    for (const record of status.recent) {
      const li = document.createElement('li');
      li.textContent = `${new Date(record.created_at).toLocaleString()} · 訂單 ${record.orderNo || record.id.slice(0, 8)}${record.label ? ' · ' + (record.is_mine ? '我的' : '其他管理員的') + record.label : ''} · ${stateNames[record.state] || '沒有可接收裝置'}${record.detail ? '（' + record.detail + '）' : ''}`;
      if (record.subscribed_admins < record.expected_admins) li.textContent += ' · 有管理員尚未登記裝置';
      if (!['accepted', 'pending', 'sending'].includes(record.state)) li.className = 'push-warning';
      list.append(li);
    }
    if (!status.recent.length) { const li = document.createElement('li'); li.textContent = '目前沒有發送紀錄。'; list.append(li); }
    const devices = el('[data-devices]'); devices.replaceChildren();
    for (const device of status.devices) {
      const row = document.createElement('p'); row.textContent = `${device.label} · ${device.active ? '已開啟' : '已停用'} `;
      if (device.active) {
        const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '停用';
        remove.addEventListener('click', () => perform(async () => { await request('unsubscribe', { id: device.id }); message('此裝置已停止接收通知。'); await renderStatus(); }));
        row.append(remove);
      }
      devices.append(row);
    }
  }
  async function perform(fn) {
    if (busy) return;
    busy = true; enable.disabled = disable.disabled = refresh.disabled = true;
    try { await fn(); } catch (error) { message(error.message || '操作未完成，請稍後重試。'); }
    finally { busy = false; refresh.disabled = false; await controls().catch(() => {}); }
  }
  button.addEventListener('click', () => {
    dialog.showModal();
    perform(async () => {
      message('正在查詢通知設定…');
      config = await request('config');
      if (!support()) registration = await platform.navigator.serviceWorker.register(new URL('./admin-push-sw.js', import.meta.url), { scope: './', updateViaCache: 'none' });
      if (registration) registration = await platform.navigator.serviceWorker.ready;
      await renderStatus(); message('每台手機都要按下開啟並允許通知。');
    });
  });
  enable.addEventListener('click', () => {
    if (busy || !registration || !config) return;
    // Keep this call directly inside the tap handler; iOS requires user activation.
    const permission = platform.Notification.requestPermission();
    perform(async () => {
      if (await permission !== 'granted') throw new Error('尚未允許通知，請檢查手機的通知設定。');
      const key = Uint8Array.from(atob(config.publicKey.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      await request('subscribe', { subscription: subscription.toJSON(), label: el('#adminPushLabel').value });
      message('已開啟這台手機通知。接下來需用測試訂單確認鎖屏收訊。'); await renderStatus();
    });
  });
  disable.addEventListener('click', () => perform(async () => {
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(subscription.endpoint));
      const id = [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join('');
      await request('unsubscribe', { id }); // Stop on server before discarding browser subscription.
      await subscription.unsubscribe();
    }
    message('已關閉這台手機通知。'); await renderStatus();
  }));
  refresh.addEventListener('click', () => perform(async () => { await renderStatus(); message('已更新發送紀錄。'); }));
  el('[data-close]').addEventListener('click', () => dialog.close());
  el('[data-close-top]').addEventListener('click', () => dialog.close());
  return { button, dialog };
}
