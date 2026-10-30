// Acknowledgment uses only order IDs rendered on screen, never an all-orders load.
export async function orderPushEventIds(orderNo, cryptoApi = globalThis.crypto) {
  return Promise.all(['public-new-order:', 'admin-create-order:'].map(async prefix => {
    const digest = await cryptoApi.subtle.digest('SHA-256', new TextEncoder().encode(prefix + orderNo));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }));
}

export function visibleOrderNumbers(doc, platform, canView) {
  if (doc.visibilityState !== 'visible' || !canView() ||
      doc.querySelector('.modal-overlay.open, dialog[open]')) return [];
  const viewport = platform.visualViewport;
  const left = viewport?.offsetLeft || 0, top = viewport?.offsetTop || 0;
  const right = left + (viewport?.width || platform.innerWidth);
  const bottom = top + (viewport?.height || platform.innerHeight);
  const numbers = [];
  for (const card of doc.querySelectorAll('#cards-container > .card[data-order-no]')) {
    const orderNo = String(card.dataset.orderNo || '').trim();
    if (!orderNo || !card.isConnected || !card.getClientRects().length) continue;
    const style = platform.getComputedStyle(card);
    if (style.visibility !== 'visible' || style.display === 'none' || Number(style.opacity) === 0) continue;
    const rect = card.getBoundingClientRect();
    const x1 = Math.max(rect.left, left), y1 = Math.max(rect.top, top);
    const x2 = Math.min(rect.right, right), y2 = Math.min(rect.bottom, bottom);
    if (x2 - x1 < Math.min(24, rect.width) || y2 - y1 < Math.min(24, rect.height) || rect.width <= 0 || rect.height <= 0) continue;
    // Do not count a row covered by a menu, dialog, fixed header or other element.
    const hit = doc.elementFromPoint((x1 + x2) / 2, (y1 + y2) / 2);
    if (!hit || !card.contains(hit)) continue;
    numbers.push(orderNo);
  }
  return [...new Set(numbers)].sort();
}

export function mountOrderBadgeVisibility({platform = window, canView}) {
  const doc = platform.document, serviceWorker = platform.navigator.serviceWorker;
  if (!serviceWorker?.addEventListener || !platform.crypto?.subtle || !platform.MutationObserver) return;
  const hashes = new Map();
  let queued = false, stopped = false, lastSignature = '', lastController;
  const collect = () => visibleOrderNumbers(doc, platform, canView);
  async function scan() {
    queued = false;
    if (stopped) return;
    try {
      const controller = serviceWorker.controller, numbers = collect();
      const signature = JSON.stringify(numbers);
      if (!controller || !numbers.length) { lastSignature = ''; return; }
      if (signature === lastSignature && controller === lastController) return;
      const eventIds = (await Promise.all(numbers.map(orderNo => {
        if (!hashes.has(orderNo)) hashes.set(orderNo, orderPushEventIds(orderNo, platform.crypto).catch(error => { hashes.delete(orderNo); throw error; }));
        return hashes.get(orderNo);
      }))).flat();
      // Hashing is asynchronous: recheck visibility, filters and session before sending.
      if (stopped || controller !== serviceWorker.controller || JSON.stringify(collect()) !== signature) { schedule(); return; }
      controller.postMessage({type:'sanheyuan-visible-orders-viewed',eventIds});
      lastSignature = signature; lastController = controller;
    } catch (_) { /* Badging must never interrupt order operations. */ }
  }
  function schedule(force = false) {
    if (force) lastSignature = '';
    if (!queued && !stopped) { queued = true; platform.requestAnimationFrame(scan); }
  }
  const onLayout = () => schedule();
  const onResume = () => schedule(true);
  const onPush = event => { if (event.data?.type === 'sanheyuan-order-push') schedule(true); };
  const observer = new platform.MutationObserver(onLayout);
  observer.observe(doc.body, {subtree:true,childList:true,attributes:true,attributeFilter:['class','style','hidden','data-order-no']});
  doc.addEventListener('scroll', onLayout, {capture:true,passive:true});
  doc.addEventListener('visibilitychange', onResume);
  platform.addEventListener('resize', onLayout);
  platform.addEventListener('pageshow', onResume);
  platform.visualViewport?.addEventListener('resize', onLayout);
  platform.visualViewport?.addEventListener('scroll', onLayout);
  serviceWorker.addEventListener('controllerchange', onResume);
  serviceWorker.addEventListener('message', onPush);
  schedule();
  return {disconnect() {
    stopped = true; observer.disconnect();
    doc.removeEventListener('scroll', onLayout, true);
    doc.removeEventListener('visibilitychange', onResume);
    platform.removeEventListener('resize', onLayout);
    platform.removeEventListener('pageshow', onResume);
    platform.visualViewport?.removeEventListener('resize', onLayout);
    platform.visualViewport?.removeEventListener('scroll', onLayout);
    serviceWorker.removeEventListener('controllerchange', onResume);
    serviceWorker.removeEventListener('message', onPush);
  }};
}
