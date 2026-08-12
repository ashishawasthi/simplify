// Versioned precache, cache-first. Bump CACHE on every deploy so the next
// launch picks up new files; firebase.json serves this file with no-cache.
// "/guide" (not "/guide.html"): Hosting cleanUrls 301s the .html form, and a
// cached redirected response breaks offline navigations.
const CACHE = "afford-v24";
const ASSETS = [
  "/",
  "/index.html",
  "/guide",
  "/img/guide/screen-money.png",
  "/img/guide/screen-speak.png",
  "/img/guide/screen-yes.png",
  "/img/guide/screen-no.png",
  "/img/guide/screen-picker.png",
  "/css/styles.css",
  "/js/app.js",
  "/js/money.js",
  "/js/speak.js",
  "/js/currency-data.js",
  "/js/note-picker.js",
  "/js/items.js",
  "/js/result.js",
  "/js/storage.js",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/img/icons/icon-192.png",
  "/img/icons/icon-512.png",
  "/img/icons/icon-maskable-512.png",
  "/img/icons/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // bypass the HTTP cache — a CDN edge can still be serving a stale
      // response for the previous deploy right after this one goes live,
      // and addAll()'s default fetch would happily bake that in forever.
      .then((c) => Promise.all(ASSETS.map((url) => fetch(url, { cache: "reload" }).then((r) => c.put(url, r)))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request))
  );
});
