// Deliberately no fetch/cache handler: auth and order data always use the existing backend.
self.addEventListener('push', event => {
  let eventId = '';
  try { const value = event.data.json().eventId; if (/^[a-f0-9]{64}$/.test(value)) eventId = value; } catch (_) {}
  event.waitUntil(self.registration.showNotification('三合院｜新訂單通知', {
    body: '有新訂單待處理，請開啟後台查看。',
    icon: new URL('push-icon-192.png', self.registration.scope).href,
    ...(eventId ? { tag: 'order-' + eventId } : {})
  }));
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
