// Service Worker BDK Commandes
const CACHE_NAME = 'bdk-v1';

// Ressources statiques à mettre en cache au premier chargement
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Supprime les anciens caches
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ne pas intercepter les requêtes Supabase ou API externes
  if (
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('supabase')
  ) {
    return;
  }

  // Stratégie Network First pour les pages
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match('/').then((res) => res || new Response('Hors ligne', { status: 503 }))
      )
    );
    return;
  }

  // Stratégie Cache First pour les assets statiques
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});
