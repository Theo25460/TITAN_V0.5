const CACHE_NAME = 'titan-os-v102-experience-final1';
const ASSETS_TO_CACHE = ["./css/training.css?v=102.0", "./css/journal.css?v=102.0", "./js/training-page.js?v=102.0", "./js/journal-page.js?v=102.0", "./js/vendor/supabase-2.111.0.js", "./css/icons.css?v=102.0", "./css/fonts/remixicon.woff2", "./css/fonts/manrope-latin-0.woff2","./css/fonts/manrope-latin-1.woff2", "./aujourdhui", "./bilan", "./css/home.css?v=102.0", "./css/today.css?v=102.0", "./css/report.css?v=102.0", "./css/fonts.css", "./js/home.js?v=102.0", "./js/today-page.js?v=102.0", "./js/weekly-plan.js?v=102.0", "./js/session-tools.js?v=102.0", "./js/session-export.js?v=102.0", "./js/routine-library.js?v=102.0", "./js/report-page.js?v=102.0", "./", "./training", "./journal", "./stats", "./profile", "./network-error.html", "./css/style.css?v=102.0", "./css/design-system.css?v=102.0", "./css/tracking.css?v=102.0", "./js/config.js?v=102.0", "./js/data.js?v=102.0", "./js/ui.js?v=102.0", "./js/state.js?v=102.0", "./js/main.js?v=102.0", "./js/titan_features.js?v=102.0", "./js/training-store.js?v=102.0", "./js/titan-v100.js?v=102.0", "./js/sport-discovery.js?v=102.0", "./js/progress-page.js?v=102.0", "./js/journal-actions.js?v=102.0", "./js/pending-ui.js?v=102.0", "./js/pwa.js?v=102.0", "./js/training-draft.js?v=102.0", "./image/logo-192.png", "./manifest.json"];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      const results = await Promise.allSettled(
        ASSETS_TO_CACHE.map((asset) => cache.add(asset))
      );
      const failures = results.filter((result) => result.status === 'rejected').length;
      if (failures > 0) { const pages=await self.clients.matchAll();pages.forEach(page=>page.postMessage({type:'OFFLINE_CACHE_PARTIAL',failures})); }
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
      cacheNames.map((cache) => cache.startsWith('titan-os-') && cache !== CACHE_NAME ? caches.delete(cache) : null)
    ))
  );
});

self.addEventListener('fetch', (event) => {
  if (new URL(event.request.url).pathname.startsWith('/.netlify/functions/') || event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
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
        .catch(async () => { const cached=await caches.match(request);if(cached)return cached;const url=new URL(request.url);const normalized=url.pathname.replace(/\.html$/,'');const route=await caches.match(normalized);return route || await caches.match('./network-error.html') || await caches.match('./404.html'); })
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
