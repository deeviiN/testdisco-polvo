// Push notification handlers, injetados no service worker gerado pelo Workbox.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = { title: "Nova notificação", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Agendamento Escolar";
  const options = {
    body: data.body || "",
    icon: "/app-icon-octopus-192.png",
    badge: "/app-icon-octopus-192.png",
    tag: data.tag || "push-generic",
    data: { url: data.url || "/" },
    requireInteraction: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of all) {
        try {
          if (c.url.includes(targetUrl)) {
            await c.focus();
            return;
          }
        } catch (_) {}
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })()
  );
});
