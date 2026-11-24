const CACHE_NAME = 'tscloak-static-v1';
const APP_SHELL = ['/','/manifest.webmanifest','/assets/tscloak-icon.png','/assets/pwa-192x192.png','/assets/pwa-512x512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key.startsWith('tscloak-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Never cache API, authentication, OAuth/OIDC, or cross-origin responses.
  if (request.method !== 'GET' || url.origin !== self.location.origin ||
      /^\/(api|authentication|oauth|connect|authorize|token|userinfo|scim)(\/|$)/i.test(url.pathname)) {
    return;
  }

  // Keep navigations network-first. Only the public landing page is an offline fallback;
  // authenticated/admin pages and callback responses are never cached.
  if (request.mode === 'navigate') {
    if (url.pathname === '/') {
      event.respondWith(fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/', copy));
        }
        return response;
      }).catch(() => caches.match('/')));
    }
    return;
  }

  // Cache only static same-origin assets, never HTML or data responses.
  if (/\.(?:css|js|png|jpg|jpeg|webp|svg|woff2?)$/i.test(url.pathname)) {
    event.respondWith(caches.match(request).then((cached) => {
      const network = fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
      return cached || network;
    }));
  }
});
