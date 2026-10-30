// Deliberately no fetch/cache handler: auth and order data always use the existing backend.
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
// Per-device unread notification count. Retain opaque event IDs after viewing
// so a delayed retry cannot turn a previously viewed order into a new badge.
// No order details or customer data are stored; the OS chooses the badge style.
const badgeCacheName = 'sanheyuan-home-badge-v2-' + self.registration.scope;
const badgeStateUrl = new URL('./__home_badge_state__', self.registration.scope).href;
let badgeWork = Promise.resolve();
function queueBadgeWork(work) {
  badgeWork = badgeWork.then(work).catch(() => {});
  return badgeWork;
}
async function readBadgeState(cache) {
  const response = await cache.match(badgeStateUrl);
  if (!response) return { version: 2, events: [] };
  const state = await response.json();
  if (state?.version !== 2 || !Array.isArray(state.events) ||
      !state.events.every(item => /^[a-f0-9]{64}$/.test(item?.id) &&
        Number.isFinite(item.receivedAt) && typeof item.unread === 'boolean') ||
      new Set(state.events.map(item => item.id)).size !== state.events.length) {
    throw new Error('BADGE_STATE_INVALID');
  }
  return state;
}
async function displayBadgeCount(state) {
  const count = state.events.filter(item => item.unread).length;
  if (count > 0) {
    if (typeof self.navigator?.setAppBadge === 'function') await self.navigator.setAppBadge(count);
  } else if (typeof self.navigator?.clearAppBadge === 'function') {
    await self.navigator.clearAppBadge();
  }
}
async function setNewOrderBadge(eventId, receivedAt) {
  // Malformed notifications remain visible but cannot be counted/deduplicated.
  if (!eventId) return;
  let state;
  try {
    const cache = await caches.open(badgeCacheName);
    state = await readBadgeState(cache);
    if (!state.events.some(item => item.id === eventId)) {
      state.events.push({ id: eventId, receivedAt, unread: true });
      await cache.put(badgeStateUrl, new Response(JSON.stringify(state)));
    }
  } catch (_) {
    // If storage is unavailable, use an unnumbered alert rather than inventing a count.
    if (typeof self.navigator?.setAppBadge === 'function') await self.navigator.setAppBadge();
    return;
  }
  await displayBadgeCount(state);
}
self.addEventListener('message', event => {
  if (event.data?.type !== 'sanheyuan-visible-orders-viewed') return;
  const source = event.source;
  const root = new URL(self.registration.scope);
  let url;
  try { url = new URL(source?.url); } catch (_) { return; }
  const eventIds = event.data.eventIds;
  if (source.type !== 'window' || source.visibilityState !== 'visible' ||
      url.origin !== root.origin || !url.pathname.startsWith(root.pathname) ||
      !Array.isArray(eventIds) || eventIds.length > 200 || !eventIds.length ||
      !eventIds.every(id => typeof id === 'string' && /^[a-f0-9]{64}$/.test(id))) return;
  event.waitUntil(queueBadgeWork(async () => {
    const cache = await caches.open(badgeCacheName);
    const state = await readBadgeState(cache);
    const visible = new Set(eventIds);
    let changed = false;
    for (const item of state.events) {
      // Only matching visible orders are acknowledged; unrelated notifications remain unread.
      if (item.unread && visible.has(item.id)) {
        item.unread = false;
        changed = true;
      }
    }
    if (changed) await cache.put(badgeStateUrl, new Response(JSON.stringify(state)));
    await displayBadgeCount(state);
  }));
});

self.addEventListener('push', event => {
  const receivedAt = Date.now();
  let eventId = '';
  let title = '三合院｜新訂單通知', body = '有新訂單待處理，請開啟後台查看。';
  try {
    const value = event.data.json();
    if (/^[a-f0-9]{64}$/.test(value.eventId)) eventId = value.eventId;
    if (typeof value.notification?.title === 'string' && value.notification.title.trim()) title = value.notification.title.slice(0,100);
    if (typeof value.notification?.body === 'string' && value.notification.body.trim()) body = value.notification.body.slice(0,500);
  } catch (_) {}
  const badge = queueBadgeWork(() => setNewOrderBadge(eventId, receivedAt));
  const display = self.registration.showNotification(title, {
    body,
    icon: new URL('notification-logo-192-v1.png', self.registration.scope).href,
    ...(eventId ? { tag: 'order-' + eventId } : {})
  });
  // Always keep the system notification; also inform an open backend without
  // polling orders or depending on a network request in the push handler.
  const foreground = self.clients.matchAll({type:'window',includeUncontrolled:true}).then(windows => {
    const root = new URL(self.registration.scope);
    for (const client of windows) {
      const url = new URL(client.url);
      if (client.visibilityState === 'visible' && url.origin === root.origin && url.pathname.startsWith(root.pathname)) {
        client.postMessage({type:'sanheyuan-order-push',eventId,title,body});
      }
    }
  });
  event.waitUntil(Promise.allSettled([display, foreground, badge]));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  // Ignore all payload URLs. Navigate through the normal authenticated entry point.
  const target = new URL('./', self.registration.scope).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      const url = new URL(client.url);
      if (url.origin === new URL(target).origin && url.pathname.startsWith(new URL(target).pathname)) {
        const navigated = await client.navigate(target);
        if (navigated) return navigated.focus();
      }
    }
    return self.clients.openWindow(target);
  })());
});
