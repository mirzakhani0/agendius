const CACHE_NAME = 'agenda-v2';
const ASSETS = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/app.js',
  '/js/modules/constants.js',
  '/js/modules/state.js',
  '/js/modules/sheets.js',
  '/js/modules/utils.js',
  '/js/modules/pomodoro.js',
  '/js/modules/notifications.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.url.includes('script.google.com')) return;
  e.respondWith(
    caches.match(e.request).then((res) => res || fetch(e.request).then((response) => {
      return caches.open(CACHE_NAME).then((cache) => {
        cache.put(e.request, response.clone());
        return response;
      });
    }).catch(() => caches.match('/index.html')))
  );
});
