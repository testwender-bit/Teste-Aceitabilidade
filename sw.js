/* ============================================================
   Service Worker — PWA Aceitabilidade Lucas do Rio Verde
   Cache offline-first do "app shell".
   Para atualizar o app após mudar arquivos: troque VERSAO.
   ============================================================ */
var VERSAO = 'lrv-aceit-v1.3';
var ARQS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './brasao.png',
  './favicon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(VERSAO).then(function (c) {
      return Promise.all(ARQS.map(function (u) {
        var req;
        try { req = new Request(u, { cache: 'reload' }); }
        catch (err) { req = new Request(u); }
        return c.add(req).catch(function () { /* ignora arquivo faltante */ });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (chaves) {
      return Promise.all(chaves.map(function (k) {
        if (k !== VERSAO) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return; // não intercepta POST da sincronização

  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== location.origin) return; // deixa Apps Script/planilha de fora

  var aceita = req.headers.get('accept') || '';
  var navegacao = req.mode === 'navigate' || aceita.indexOf('text/html') >= 0;

  if (navegacao) {
    // Rede primeiro (mantém o app atualizado); offline serve o cache.
    e.respondWith(
      fetch(req).then(function (res) {
        var copia = res.clone();
        caches.open(VERSAO).then(function (c) { c.put('./index.html', copia); });
        return res;
      }).catch(function () {
        return caches.match('./index.html').then(function (hit) {
          return hit || caches.match('./');
        });
      })
    );
    return;
  }

  // Demais recursos: cache primeiro, atualizando em segundo plano.
  e.respondWith(
    caches.match(req).then(function (hit) {
      var rede = fetch(req).then(function (res) {
        if (res && res.status === 200) {
          var copia = res.clone();
          caches.open(VERSAO).then(function (c) { c.put(req, copia); });
        }
        return res;
      }).catch(function () { return hit; });
      return hit || rede;
    })
  );
});
