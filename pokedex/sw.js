/*
 * Service worker: app shell offline, sprites cached opportunistically.
 *
 * Same cache-first-with-background-refresh strategy as the root app's
 * sw.js. Two differences: the app shell list includes data/pokemon.json,
 * and sprite images from the PokeAPI sprite CDN (a different origin) are
 * cached too - but only the ones actually viewed, never pre-fetched.
 */
var CACHE = 'pokedex-v1';
var SPRITE_HOST = 'raw.githubusercontent.com';

var SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './data/pokemon.json',
  './js/dataset.js',
  './js/progress.js',
  './js/browse.js',
  './js/flashcards.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE)
      .then(function (cache) { return cache.addAll(SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (key) {
          return key === CACHE ? null : caches.delete(key);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;

  var url = new URL(request.url);

  // Only handle our own files and the sprite CDN - everything else
  // (analytics, whatever) goes straight to the network untouched.
  var isOwnOrigin = url.origin === self.location.origin;
  var isSpriteHost = url.hostname === SPRITE_HOST;
  if (!isOwnOrigin && !isSpriteHost) return;

  event.respondWith(
    caches.match(request).then(function (cached) {
      if (cached) {
        // Refresh in the background so an update lands next launch.
        fetch(request).then(function (response) {
          if (response && response.ok) {
            caches.open(CACHE).then(function (c) { c.put(request, response); });
          }
        }).catch(function () { /* offline - the cached copy is fine */ });
        return cached;
      }

      return fetch(request).then(function (response) {
        if (response && response.ok) {
          var copy = response.clone();
          caches.open(CACHE).then(function (c) { c.put(request, copy); });
        }
        return response;
      }).catch(function () {
        // A navigation with nothing cached: fall back to the app shell.
        if (request.mode === 'navigate') return caches.match('./index.html');
        throw new Error('offline');
      });
    })
  );
});
