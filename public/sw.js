// Service worker de MiTasaTop PWA.
// Estrategia CONSERVADORA a propósito: como el CRM maneja datos en vivo (leads, gestiones),
// NO cacheamos respuestas de la API ni el HTML — siempre se piden frescos a la red.
// Solo cacheamos los íconos y assets estáticos para que la app abra rápido y tenga su ícono offline.
const CACHE = 'mitasatop-v1';
const ASSETS = [
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/favicon.svg'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).catch(() => {}));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // Solo interceptamos GET del mismo origen y que sean assets estáticos conocidos.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  // Nunca cachear la API ni navegación (HTML): siempre red, para datos frescos.
  if (url.pathname.startsWith('/api/')) return;
  const esAsset = /\.(png|svg|css|js|woff2?|ttf|ico)$/.test(url.pathname);
  if (!esAsset) return; // el HTML y todo lo demás va directo a la red
  // Assets: cache-first con actualización en segundo plano.
  e.respondWith(
    caches.match(req).then((cached) => {
      const fetchProm = fetch(req).then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => cached);
      return cached || fetchProm;
    })
  );
});
