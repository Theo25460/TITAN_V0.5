const CACHE_NAME = 'titan-os-v100-grand-public';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './dynamic-page',
  './dynamic-page.html',
  './sports',
  './sports.html',
  './training',
  './guide',
  './stats',
  './adventure',
  './disciplines',
  './health',
  './journal',
  './talents',
  './trophies',
  './boutique',
  './sport_details',
  './onboarding',
  './changelog',
  './partenariats',
  './legal_hub',
  './legal_mentions',
  './legal_privacy',
  './legal_cgu',
  './activities',
  './notifications',
  './login',
  './profile',
  './social',
  './chat',
  './service',
  './404.html',
  './network-error.html',
  './guide.html',
  './onboarding.html',
  './service.html',
  './activities.html',
  './notifications.html',
  './login.html',
  './profile.html',
  './social.html',
  './chat.html',
  './changelog.html',
  './partenariats.html',
  './training.html',
  './adventure.html',
  './boutique.html',
  './stats.html',
  './disciplines.html',
  './health.html',
  './journal.html',
  './talents.html',
  './trophies.html',
  './sport_details.html',
  './legal_hub.html',
  './legal_mentions.html',
  './legal_privacy.html',
  './legal_cgu.html',
  './css/style.css',
  './css/dynamic-page.css',
  './css/titan-v100.css',
  './js/config.js',
  './js/content.js',
  './js/data.js',
  './js/sport-discovery.js',
  './js/state.js',
  './js/homepage-dynamic.js',
  './js/dynamic-page.js',
  './js/titan_features.js',
  './js/ui.js',
  './js/main.js',
  './js/social.js',
  './js/chat.js',
  './js/consent.js',
  './js/pwa.js',
  './js/titan-v100.js',
  './manifest.json',
  './favicon.ico',
  './robots.txt',
  './sitemap.xml',
  './image/logo.png',
  './image/logo-192.png',
  './image/logo-512.png',
  './image/og-titan-os.png',
  './image/shop/titan-plus-v89.webp',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      const results = await Promise.allSettled(
        ASSETS_TO_CACHE.map((asset) => cache.add(asset))
      );
      const failures = results.filter((result) => result.status === 'rejected').length;
      if (failures > 0) console.warn(`[TITAN SW] Precache partiel: ${failures} ressource(s) indisponible(s).`);
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
  event.waitUntil(
    caches.keys().then((cacheNames) => Promise.all(
      cacheNames.map((cache) => cache !== CACHE_NAME ? caches.delete(cache) : null)
    ))
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  const request = event.request;
  const acceptsHtml = request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html');
  const legacyArtwork = request.destination === 'image'
    && /\/image\/(?:avatar|boss|mob)\/[^/?#]+\.(?:png|jpe?g)(?:[?#]|$)/i.test(request.url);

  if (legacyArtwork) {
    event.respondWith((async () => {
      const modernUrl = new URL(request.url);
      modernUrl.pathname = modernUrl.pathname.replace(/\.(?:png|jpe?g)$/i, '.webp');
      const modernRequest = new Request(modernUrl.toString(), request);
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request) || await cache.match(modernRequest);
      try {
        const original = await fetch(request);
        if (original.ok) {
          await cache.put(request, original.clone());
          return original;
        }
        const modern = await fetch(modernRequest);
        if (modern.ok) {
          await Promise.all([
            cache.put(request, modern.clone()),
            cache.put(modernRequest, modern.clone()),
          ]);
          return modern;
        }
        return cached || modern;
      } catch {
        return cached || caches.match('./image/logo-192.png');
      }
    })());
    return;
  }

  if (acceptsHtml) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseToCache));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('./network-error.html') || caches.match('./404.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
      .then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') return response;
        const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseToCache));
        return response;
      })
        .catch(() => cached);
      return cached || network;
    })
  );
});

