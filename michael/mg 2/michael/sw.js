/* Guarda solo la estructura del panel (pantallas, estilos, tipografías e íconos) para que abra rápido.
   Nunca guarda datos: las llamadas al puente siempre van a la red. */
var VERSION = 'mgm-v1';
var ARCHIVOS = ['./', 'index.html', 'michael.js', 'michael.css', 'michael.webmanifest', '../app.css', '../img/logo-mark.png', '../img/logo-full.png',
  '../icons/icon-192.png', '../icons/icon-512.png', '../icons/apple-touch-icon.png',
  '../fonts/manrope-latin-500-normal.woff2', '../fonts/manrope-latin-700-normal.woff2', '../fonts/manrope-latin-800-normal.woff2',
  '../fonts/inter-latin-400-normal.woff2', '../fonts/inter-latin-500-normal.woff2', '../fonts/inter-latin-600-normal.woff2'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(ARCHIVOS); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // el puente y todo lo externo va directo a la red
  e.respondWith(
    fetch(req).then(function (r) {
      var copia = r.clone(); caches.open(VERSION).then(function (c) { c.put(req, copia); }); return r;
    }).catch(function () { return caches.match(req).then(function (r) { return r || caches.match('index.html'); }); })
  );
});
