// Versioned precache, cache-first. Bump CACHE on every deploy so the next
// launch picks up new files; firebase.json serves this file with no-cache.
// js/update.js reloads an open page into the new version once it takes over.
// Pages are listed by their clean URLs ("/", "/guide", "/guide/speak"), never
// as ".html": Hosting cleanUrls 301s the .html forms, and a cached redirected
// response breaks offline navigations. Every file under public/ belongs here
// (bar the few tools/test-assets.mjs names, which no device needs), and
// `node tools/test-assets.mjs` checks both ways.
const CACHE = "simplify-v35";
const ASSETS = [
  "/",
  "/guide",
  "/guide/menu",
  "/guide/can-i-buy",
  "/guide/change",
  "/guide/next-dollar",
  "/guide/next-note",
  "/guide/make-amount",
  "/guide/shopping-list",
  "/guide/notes-and-coins",
  "/guide/speak",
  "/guide/home-screen",
  "/guide/updates",
  "/guide/no-microphone",
  "/guide/privacy",
  "/css/guide.css",
  "/js/guide-links.js",
  "/img/guide/screen-menu.png",
  "/img/guide/screen-money.png",
  "/img/guide/mic-on-keyboard.png",
  "/img/guide/screen-yes.png",
  "/img/guide/screen-no.png",
  "/img/guide/screen-picker.png",
  "/img/guide/screen-show-me.png",
  "/img/guide/screen-change.png",
  "/img/guide/screen-next-dollar.png",
  "/img/guide/screen-next-note.png",
  "/img/guide/screen-make-amount.png",
  "/img/guide/screen-shopping-list.png",
  "/css/styles.css",
  "/js/app.js",
  "/js/answers.js",
  "/js/money.js",
  "/js/money-field.js",
  "/js/speak.js",
  "/js/currency-data.js",
  "/js/note-picker.js",
  "/js/show-money.js",
  "/js/items.js",
  "/js/result.js",
  "/js/storage.js",
  "/js/update.js",
  "/js/toast.js",
  "/js/device.js",
  "/js/tools.js",
  "/js/money-tool.js",
  "/js/setup.js",
  "/js/class-setup.js",
  "/js/show-card.js",
  "/js/say-aloud.js",
  "/js/picture-picker.js",
  "/js/pictures.js",
  "/js/tools/my-class.js",
  "/js/tools/now-next.js",
  "/js/tools/wait.js",
  "/js/tools/steps.js",
  "/js/tools/i-need.js",
  "/js/tools/show-card.js",
  "/css/tools/my-class.css",
  "/css/tools/now-next.css",
  "/css/tools/wait.css",
  "/css/tools/steps.css",
  "/css/tools/i-need.css",
  "/css/tools/show-card.css",
  "/css/tools/setup.css",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/img/icons/icon-192.png",
  "/img/icons/icon-512.png",
  "/img/icons/icon-maskable-512.png",
  "/img/icons/apple-touch-icon.png",
  // the pictures (js/pictures.js): a card, a picker or a step needs them offline
  "/img/pic/all-done.svg", "/img/pic/bell.svg", "/img/pic/break.svg", "/img/pic/brush-teeth.svg",
  "/img/pic/bus-stop.svg", "/img/pic/bus.svg", "/img/pic/cannot-talk.svg", "/img/pic/car.svg",
  "/img/pic/card-reader.svg", "/img/pic/carry-tray.svg", "/img/pic/changed.svg", "/img/pic/check-amount.svg",
  "/img/pic/clean-up.svg", "/img/pic/computer.svg", "/img/pic/cook.svg", "/img/pic/doctor.svg",
  "/img/pic/dont-understand.svg", "/img/pic/draw.svg", "/img/pic/dry-hands.svg", "/img/pic/eat.svg",
  "/img/pic/exercise.svg", "/img/pic/family.svg", "/img/pic/game.svg", "/img/pic/get-dressed.svg",
  "/img/pic/haircut.svg", "/img/pic/hawker-stall.svg", "/img/pic/help.svg", "/img/pic/home.svg",
  "/img/pic/homework.svg", "/img/pic/hurts.svg", "/img/pic/kopi.svg", "/img/pic/library.svg", "/img/pic/lift.svg",
  "/img/pic/menu-i-need.svg", "/img/pic/menu-my-day.svg", "/img/pic/menu-now-next.svg", "/img/pic/menu-show-card.svg",
  "/img/pic/menu-steps.svg", "/img/pic/menu-talk.svg", "/img/pic/more-time.svg", "/img/pic/mrt-train.svg",
  "/img/pic/music.svg", "/img/pic/no.svg", "/img/pic/pack-bag.svg", "/img/pic/park.svg", "/img/pic/pay-qr.svg",
  "/img/pic/phone.svg", "/img/pic/play.svg", "/img/pic/playground.svg", "/img/pic/please.svg",
  "/img/pic/quiet-time.svg", "/img/pic/read.svg", "/img/pic/receipt.svg", "/img/pic/recess.svg",
  "/img/pic/rub-hands.svg", "/img/pic/school.svg", "/img/pic/seat.svg", "/img/pic/shop.svg", "/img/pic/shower.svg",
  "/img/pic/sleep.svg", "/img/pic/snack.svg", "/img/pic/soap.svg", "/img/pic/space.svg", "/img/pic/stop.svg",
  "/img/pic/swim.svg", "/img/pic/tablet.svg", "/img/pic/tap-water.svg", "/img/pic/taxi.svg", "/img/pic/thank-you.svg",
  "/img/pic/therapy.svg", "/img/pic/toilet.svg", "/img/pic/too-loud.svg", "/img/pic/travel-card.svg",
  "/img/pic/tray-return.svg", "/img/pic/tray.svg", "/img/pic/tv.svg", "/img/pic/walk.svg", "/img/pic/want.svg",
  "/img/pic/wash-hands.svg", "/img/pic/water.svg", "/img/pic/wipe-table.svg", "/img/pic/yes.svg",
];

// One asset, checked before it is kept.
//
// "no-cache" makes the browser ask the server about every file, sending the
// ETag of the copy in its own HTTP cache. Hosting answers an unchanged image
// (the guide's screenshots, the pictures, the icons: max-age in
// firebase.json) with a bodiless 304, and that copy is used — most of the
// ~2 MB a release used to cost each device with "reload". HTML, JS, CSS and
// the manifest are served no-cache, and Hosting sends those in full every
// time, ETag or not: a few tens of KB compressed. It is just as safe as
// "reload": the question still goes to the server (the CDN, which Hosting
// clears on every release), so no copy is used without the server
// confirming it is current — unlike addAll()'s default fetch, which could
// bake a stale file from the browser's cache in for good.
//
// A failed or redirected response is refused rather than cached: a typo in
// ASSETS would otherwise be kept as a 404 page, and a redirect breaks
// offline navigations. The install then fails as a whole, and the version
// already installed carries on until a fixed one is deployed.
async function fetchAsset(url) {
  const r = await fetch(url, { cache: "no-cache" });
  if (!r.ok || r.redirected) throw new Error(`${url}: ${r.status}${r.redirected ? " (redirected)" : ""}`);
  return r;
}

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(ASSETS.map((url) => fetchAsset(url).then((r) => c.put(url, r)))))
      .then(() => self.skipWaiting())
  );
});

// The caches this worker made for earlier versions. Any other cache — a tool
// keeping pictures of its own — is not the worker's to delete or serve from.
const OLD_VERSION = /^(afford|simplify)-v\d+$/;

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && OLD_VERSION.test(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  // Not this worker's to answer, so the browser fetches them as if it
  // weren't here: other sites (My class reads its page and pictures from
  // Google's servers, and js/class-data.js keeps its own copy), the coach
  // app (/coach/, never cached for learners) and Firebase's reserved /__/.
  const { origin, pathname } = new URL(e.request.url);
  if (origin !== self.location.origin) return;
  if (pathname === "/coach" || pathname.startsWith("/coach/") || pathname.startsWith("/__/")) return;
  e.respondWith(
    caches.open(CACHE)
      .then((c) => c.match(e.request, { ignoreSearch: true }))
      .then((hit) => hit || fetch(e.request))
  );
});
