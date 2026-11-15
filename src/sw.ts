/// <reference lib="webworker" />
/**
 * Service worker. The build replaces __PRECACHE__ with every file in dist/
 * and __VERSION__ with a content hash, so a new deploy installs a fresh cache.
 * No imports: this file is transpiled on its own, not bundled.
 */
export {};
declare const self: ServiceWorkerGlobalScope;
declare const __PRECACHE__: string[];
declare const __VERSION__: string;

const CACHE = `climb15-${__VERSION__}`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(__PRECACHE__.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('climb15-') && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    // App shell: the cached "/" (single-page app with hash routes).
    event.respondWith(
      caches.match('/', { cacheName: CACHE, ignoreVary: true }).then((r) => r ?? fetch(req)),
    );
    return;
  }
  event.respondWith(
    caches.match(req, { cacheName: CACHE, ignoreSearch: true, ignoreVary: true }).then((r) => r ?? fetch(req)),
  );
});

// --- Daily reminder -------------------------------------------------------
// Pushes carry no payload (no encryption needed server-side); the message is fixed.

self.addEventListener('push', (event) => {
  let body = 'Time for your 15-minute climbing routine.';
  try {
    const data = event.data?.json() as { body?: string } | undefined;
    if (data?.body) body = data.body;
  } catch {
    /* no or non-JSON payload */
  }
  event.waitUntil(
    self.registration.showNotification('Climb 15', {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      tag: 'climb15-daily',
      data: { url: '/#/today' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data as { url?: string })?.url ?? '/#/today', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const client = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (client) {
        await client.focus();
        client.postMessage({ type: 'open-today' });
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});
