/* Service worker: il sito si apre anche senza rete. Alza VERSIONE a ogni modifica. */
var VERSIONE = 'casa-v9';
var FILE = ['./', 'index.html', 'css/app.css', 'js/vendor/qrcode.js', 'js/vendor/jsQR.js', 'js/core.js', 'js/store.js', 'js/native.js', 'js/album.js', 'js/app.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'fonts/bricolage-grotesque-latin-500-normal.woff2', 'fonts/bricolage-grotesque-latin-700-normal.woff2',
  'fonts/bricolage-grotesque-latin-800-normal.woff2', 'fonts/atkinson-hyperlegible-latin-400-normal.woff2', 'fonts/atkinson-hyperlegible-latin-700-normal.woff2'];
self.addEventListener('install', function (e) { e.waitUntil(caches.open(VERSIONE).then(function (c) { return c.addAll(FILE); }).then(function () { return self.skipWaiting(); })); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== VERSIONE; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // lo script Google passa sempre dalla rete
  // rete prima (così gli aggiornamenti arrivano subito), cache se offline
  e.respondWith(fetch(e.request).then(function (r) {
    var copia = r.clone(); caches.open(VERSIONE).then(function (c) { c.put(e.request, copia); }); return r;
  }).catch(function () { return caches.match(e.request, { ignoreSearch: true }).then(function (r) { return r || caches.match('index.html'); }); }));
});
