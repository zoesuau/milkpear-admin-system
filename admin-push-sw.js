// Deliberately no fetch/cache handler: auth and order data always use the existing backend.
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('push', event => {
  let eventId = '';
  let title = '三合院｜新訂單通知', body = '有新訂單待處理，請開啟後台查看。';
  try {
    const value = event.data.json();
    if (/^[a-f0-9]{64}$/.test(value.eventId)) eventId = value.eventId;
    if (typeof value.notification?.title === 'string' && value.notification.title.trim()) title = value.notification.title.slice(0,100);
    if (typeof value.notification?.body === 'string' && value.notification.body.trim()) body = value.notification.body.slice(0,500);
  } catch (_) {}
  const display = self.registration.showNotification(title, {
    body,
    icon: new URL('push-icon-192.png', self.registration.scope).href,
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
  event.waitUntil(Promise.allSettled([display, foreground]));
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
