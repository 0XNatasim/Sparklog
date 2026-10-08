// Push handlers, loaded into the Workbox-generated service worker via importScripts
// (see vite.config.js). Kept separate so the precache/offline logic stays generated.

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : "" }; }
  const title = data.title || "SparkLog";
  const tasks = [
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/pwa-192.png",
      badge: "/pwa-192.png",
      tag: data.tag,
      data: { url: data.url || "/" },
    }),
  ];
  // Number on the app icon (Android/desktop PWA, iOS 16.4+ installed app). The open app
  // keeps it in sync with the real unread count afterwards.
  if (typeof data.badge === "number" && self.navigator && "setAppBadge" in self.navigator) {
    tasks.push(self.navigator.setAppBadge(data.badge).catch(() => {}));
  }
  event.waitUntil(Promise.all(tasks));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) return client.focus();
      }
      return self.clients.openWindow(target);
    })
  );
});
