// Offline support for the app's own files only. Your records are never cached
// or sent anywhere by this service worker - they live in IndexedDB.
// Bump CACHE whenever any file changes so phones pick up the new version.
const CACHE = 'taxtrack-v2';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/assets.js', 'js/calc.js', 'js/cca.js', 'js/charts.js', 'js/db.js', 'js/export.js', 'js/forms.js', 'js/lock.js', 'js/pdf.js',
  'js/reference.js', 'js/store.js', 'js/tax-rates.js', 'js/ui.js', 'js/util.js', 'js/views.js', 'js/views2.js',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// Network first (so updates arrive), falling back to the cache when offline.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
});
