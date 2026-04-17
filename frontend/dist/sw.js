// Service Worker — IESEF Nómina Docente
// Estrategia: cache-first para assets estáticos, network-only para API (datos sensibles)

const CACHE_NAME = 'iesef-nomina-v1';

const STATIC_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/pwa-192.png',
  '/pwa-512.png',
  '/favicon.svg',
];

// ── Install: pre-cachear el shell de la app ──────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_SHELL))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: limpiar caches viejos ─────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Datos de la API: SIEMPRE red (nunca cachear datos de nómina / checadas)
  if (url.pathname.startsWith('/api/') ||
      url.pathname.startsWith('/quincenas') ||
      url.pathname.startsWith('/docentes') ||
      url.pathname.startsWith('/auth') ||
      url.pathname.startsWith('/deploy')) {
    return; // dejar pasar sin intervención
  }

  // Assets estáticos: stale-while-revalidate
  // Sirve desde caché inmediatamente y actualiza en segundo plano
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(event.request).then((cached) => {
        const networkFetch = fetch(event.request)
          .then((response) => {
            if (response.ok && response.type !== 'opaque') {
              cache.put(event.request, response.clone());
            }
            return response;
          })
          .catch(() => {
            // Sin red: devolver caché o página principal como fallback
            return cached || cache.match('/index.html');
          });

        return cached || networkFetch;
      });
    })
  );
});
