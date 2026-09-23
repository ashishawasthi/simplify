// Versioned precache, cache-first. Bump CACHE on every deploy so the next
// launch picks up new files; firebase.json serves this file with no-cache.
// js/update.js reloads an open page into the new version once it takes over.
// Pages are listed by their clean URLs ("/", "/guide", "/guide/speak"), never
// as ".html": Hosting cleanUrls 301s the .html forms, and a cached redirected
// response breaks offline navigations.
const CACHE = "afford-v32";
const ASSETS = [
  "/",
  "/guide",
  "/guide/can-i-buy",
  "/guide/notes-and-coins",
  "/guide/speak",
  "/guide/home-screen",
  "/guide/updates",
  "/guide/no-microphone",
  "/guide/privacy",
  "/css/guide.css",
  "/js/guide-links.js",
  "/img/guide/screen-money.png",
  "/img/guide/mic-on-keyboard.png",
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
  "/js/update.js",
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
