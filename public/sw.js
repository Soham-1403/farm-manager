const CACHE = 'farm-manager-v4';
const APP_SHELL = new URL('./', self.registration.scope).href;
self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  const response = await fetch(APP_SHELL);
  const html = await response.clone().text();
  await cache.put(APP_SHELL, response);
  const assets = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map(match => new URL(match[1], APP_SHELL).href).filter(url => new URL(url).origin === location.origin);
  await cache.addAll([...new Set([new URL('manifest.webmanifest', APP_SHELL).href, new URL('icon.svg', APP_SHELL).href, ...assets])]);
  await self.skipWaiting();
})()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  await Promise.all((await caches.keys()).filter(key => key !== CACHE).map(key => caches.delete(key)));
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const sameOrigin = new URL(event.request.url).origin === location.origin;
  if (sameOrigin && event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(async response => {
      if (response.ok) await (await caches.open(CACHE)).put(APP_SHELL, response.clone());
      return response;
    }).catch(() => caches.match(APP_SHELL)));
    return;
  }
  if (!sameOrigin) return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    const copy = response.clone();
    if (sameOrigin && response.ok) caches.open(CACHE).then(cache => cache.put(event.request, copy));
    return response;
  }).catch(() => Promise.reject(new Error('Offline')))));
});
