// Changez v1 en v2 pour forcer la mise à jour immédiate des fichiers corrigés
// Changement de la version pour forcer la mise à jour des caches des utilisateurs
const CACHE_NAME = "titan-os-v5";

const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./training.html",
  "./social.html",
  "./adventure.html",
  "./talents.html",
  "./stats.html",
  "./profile.html",
  "./activities.html",
  "./sport_details.html",
  "./css/style.css",
  "./js/main.js",
  "./js/data.js",
  "./js/items.js",
  "./js/social.js",
  "./js/chat.js",
  "./images/logo.png"
];

// Installation du Service Worker
self.addEventListener("install", (e) => {
  // Force l'activation immédiate du nouveau SW sans attendre la fermeture des onglets
  self.skipWaiting();

  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// Activation et nettoyage des vieux caches (Supprime la v1)
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  // Prend le contrôle des pages immédiatement pour que la mise à jour soit visible tout de suite
  return self.clients.claim();
});

// Interception des requêtes
self.addEventListener("fetch", (e) => {
  e.respondWith(
    // Stratégie : Cache d'abord, puis Réseau si absent
    caches.match(e.request).then((response) => {
      return response || fetch(e.request);
    })
  );
});
