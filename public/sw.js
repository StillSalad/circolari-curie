// Service worker: app offline, ultime circolari in cache, notifiche push.
const VERSION = 'cc-v3';
const SHELL = ['/', '/index.html', '/styles.css', '/app.js', '/match.js', '/manifest.webmanifest',
  '/icons/icon-192.png', '/icons/badge-96.png', '/img/logo-navy.png', '/img/logo-white.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  // Circolari: prima la rete, se offline l'ultima copia salvata
  if (url.pathname === '/api/circolari') {
    e.respondWith(fetch(e.request).then((res) => {
      const copy = res.clone();
      if (res.ok) caches.open(VERSION).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request)));
    return;
  }
  if (url.pathname.startsWith('/api/')) return;

  // App: dalla cache, aggiornata in background
  e.respondWith(caches.match(e.request, { ignoreSearch: url.pathname === '/' }).then((cached) => {
    const net = fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => cached);
    return cached || net;
  }));
});

self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data.json(); } catch { data = { title: 'Nuova circolare', body: e.data?.text() || '' }; }
  e.waitUntil(self.registration.showNotification(data.title || 'Nuova circolare', {
    body: data.body || '',
    tag: data.tag,
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    data: { url: data.url || '/' },
    requireInteraction: data.level === 'urgente',
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL(e.notification.data?.url || '/', location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
    for (const w of wins) {
      if ('focus' in w) { w.postMessage({ type: 'open', url: target }); return w.focus(); }
    }
    return self.clients.openWindow(target);
  }));
});
