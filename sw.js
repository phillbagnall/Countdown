/*
 * Service worker: makes the app work with no signal.
 *
 * The app shell is cached on install and served cache-first, so a game can
 * start on the Tube. Trivia API calls are never cached — they go straight to
 * the network, and questions.js falls back to the bundled bank if they fail.
 */
var CACHE = 'millionaire-v3';

var SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/fallback-questions.js',
  './js/stats.js',
  './js/questions.js',
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

  // Never cache question sources — always want fresh questions.
  if (url.hostname.indexOf('opentdb.com') !== -1 ||
      url.hostname.indexOf('the-trivia-api.com') !== -1) {
    return;
  }

  // Only handle our own files.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then(function (cached) {
      if (cached) {
        // Refresh in the background so an update lands next launch.
        fetch(request).then(function (response) {
          if (response && response.ok) {
            caches.open(CACHE).then(function (c) { c.put(request, response); });
          }
        }).catch(function () { /* offline — the cached copy is fine */ });
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
