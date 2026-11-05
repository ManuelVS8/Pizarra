/* Pizarra Siurot: funcionamiento sin conexión.
   No hay que tocar este archivo al actualizar: con internet siempre se descarga
   lo último de GitHub y la copia guardada solo se usa sin conexión. */
const APP_CACHE = 'pizarra-app';
const EXT_CACHE = 'pizarra-externos'; // fuentes y lector de PDF (no cambian con cada versión)
const APP_FILES = ['./pizarra.html', './manifest.webmanifest', './icono-192.png', './icono-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(APP_CACHE).then(c => Promise.allSettled(APP_FILES.map(u => c.add(new Request(u, { cache: 'reload' }))))));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== APP_CACHE && k !== EXT_CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });

async function networkFirst(req) {
  const cache = await caches.open(APP_CACHE);
  try {
    const res = await Promise.race([fetch(req, { cache: 'no-cache' }), new Promise((_, rej) => setTimeout(() => rej(new Error('lenta')), 4000))]);
    if (res && res.ok) cache.put(req.mode === 'navigate' ? './pizarra.html' : req, res.clone());
    return res;
  } catch (err) {
    return (await cache.match(req, { ignoreSearch: true })) || (await cache.match('./pizarra.html')) || Response.error();
  }
}
async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
  return res;
}
async function staleWhileRevalidate(req, name, fresh) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  const net = fetch(req, fresh ? { cache: 'no-cache' } : undefined).then(res => { if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()); return res; }).catch(() => hit);
  return hit || net;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (req.mode === 'navigate' || url.pathname.endsWith('.html')) e.respondWith(networkFirst(req));
    else if (url.pathname.endsWith('sw.js')) return;
    else if (url.pathname.includes('/pdfjs/')) e.respondWith(cacheFirst(req, EXT_CACHE));
    else e.respondWith(staleWhileRevalidate(req, APP_CACHE, true));
    return;
  }
  if (url.hostname === 'fonts.googleapis.com') { e.respondWith(staleWhileRevalidate(req, EXT_CACHE)); return; }
  if (url.hostname === 'fonts.gstatic.com' || (url.hostname === 'cdn.jsdelivr.net' && url.pathname.includes('/pdfjs-dist@'))) { e.respondWith(cacheFirst(req, EXT_CACHE)); return; }
});
