// Versioned precache, cache-first. Bump CACHE on every deploy so the next
// launch picks up new files; firebase.json serves this file with no-cache.
// js/update.js reloads an open page into the new version once it takes over.
// Pages are listed by their clean URLs ("/", "/guide", "/guide/speak"), never
// as ".html": Hosting cleanUrls 301s the .html forms, and a cached redirected
// response breaks offline navigations. Every file under public/ belongs here
// (bar the few tools/test-assets.mjs names, which no device needs), and
// `node tools/test-assets.mjs` checks both ways.
const CACHE = "simplify-v38";
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
  "/guide/now-next",
  "/guide/wait",
  "/guide/steps",
  "/guide/i-need",
  "/guide/show-card",
  "/guide/my-class",
  "/guide/set-up",
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
  "/img/guide/screen-menu-more.png",
  "/img/guide/screen-menu-class.png",
  "/img/guide/screen-now-next.png",
  "/img/guide/screen-my-day.png",
  "/img/guide/screen-wait-pick.png",
  "/img/guide/screen-wait.png",
  "/img/guide/screen-steps.png",
  "/img/guide/screen-steps-step.png",
  "/img/guide/screen-i-need.png",
  "/img/guide/screen-i-need-card.png",
  "/img/guide/screen-i-need-hurts.png",
  "/img/guide/screen-show-card.png",
  "/img/guide/screen-show-card-stop.png",
  "/img/guide/screen-my-class.png",
  "/img/guide/screen-class-join.png",
  "/img/guide/screen-setup-hold.png",
  "/img/guide/screen-setup.png",
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
  "/js/class-data.js",
  "/js/class-markdown.js",
  "/js/show-card.js",
  "/js/say-aloud.js",
  "/js/voice-clips.js",
  "/js/picture-picker.js",
  "/js/pictures.js",
  "/js/tools/my-class.js",
  "/js/tools/now-next.js",
  "/js/tools/now-next-list.js",
  "/js/tools/wait.js",
  "/js/tools/wait-time.js",
  "/js/tools/steps.js",
  "/js/tools/steps-decks.js",
  "/js/tools/i-need.js",
  "/js/tools/i-need-cards.js",
  "/js/tools/i-need-body.js",
  "/js/tools/i-need-hurts.js",
  "/js/tools/show-card.js",
  "/js/tools/show-card-cards.js",
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
  "/img/pic/all-done.svg", "/img/pic/bank-card.svg", "/img/pic/bell.svg", "/img/pic/break.svg", "/img/pic/brush-teeth.svg",
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
  "/img/pic/reader-tick.svg", "/img/pic/rub-hands.svg", "/img/pic/school.svg", "/img/pic/seat.svg", "/img/pic/shop.svg", "/img/pic/shower.svg",
  "/img/pic/sleep.svg", "/img/pic/snack.svg", "/img/pic/soap.svg", "/img/pic/space.svg", "/img/pic/stop.svg",
  "/img/pic/swim.svg", "/img/pic/tablet.svg", "/img/pic/tap-off.svg", "/img/pic/tap-water.svg", "/img/pic/taxi.svg", "/img/pic/thank-you.svg",
  "/img/pic/therapy.svg", "/img/pic/toilet.svg", "/img/pic/too-loud.svg", "/img/pic/travel-card.svg",
  "/img/pic/tray-return.svg", "/img/pic/tray-return-halal.svg", "/img/pic/tray.svg", "/img/pic/tv.svg", "/img/pic/walk.svg", "/img/pic/want.svg",
  "/img/pic/wash-hands.svg", "/img/pic/water.svg", "/img/pic/wipe-table.svg", "/img/pic/yes.svg",
  // >>> the recorded voice (js/voice-clips.js), written by node tools/make-voice.mjs — don't edit by hand
  "/audio/voice/004f3b977d68.mp3", "/audio/voice/05bb71da7137.mp3", "/audio/voice/0794673a5c1f.mp3", "/audio/voice/07cbdbc7b536.mp3",
  "/audio/voice/08c7142d237a.mp3", "/audio/voice/097cc762d6bd.mp3", "/audio/voice/0a2962132efb.mp3", "/audio/voice/0a45f1246a08.mp3",
  "/audio/voice/0b745abf1d65.mp3", "/audio/voice/0c3005b3db07.mp3", "/audio/voice/0e047797747c.mp3", "/audio/voice/0ea45f0ff78a.mp3",
  "/audio/voice/0f50d8654543.mp3", "/audio/voice/108738be273c.mp3", "/audio/voice/1138c8057d5a.mp3", "/audio/voice/122dab5f9e0b.mp3",
  "/audio/voice/12316f5b416c.mp3", "/audio/voice/1274f88ef3f8.mp3", "/audio/voice/133931ff4ed6.mp3", "/audio/voice/1534521bd2fa.mp3",
  "/audio/voice/1dbdb8933f64.mp3", "/audio/voice/1efc493cfce2.mp3", "/audio/voice/2801047d20b2.mp3", "/audio/voice/2d9803e62db6.mp3",
  "/audio/voice/2ff5256dd840.mp3", "/audio/voice/324368aad9e0.mp3", "/audio/voice/34f0024b86bc.mp3", "/audio/voice/36560c79f875.mp3",
  "/audio/voice/376aee1c344a.mp3", "/audio/voice/378712141dde.mp3", "/audio/voice/383b266d2fd2.mp3", "/audio/voice/389d817acfb4.mp3",
  "/audio/voice/38cac73e4796.mp3", "/audio/voice/3989dc5eb2f3.mp3", "/audio/voice/39a6770bec0e.mp3", "/audio/voice/3baf795f70fd.mp3",
  "/audio/voice/3cbaa591193c.mp3", "/audio/voice/3e9ba71a87ee.mp3", "/audio/voice/417d47ec9331.mp3", "/audio/voice/4374c19d96f5.mp3",
  "/audio/voice/47f5181eb715.mp3", "/audio/voice/56b5eddbf411.mp3", "/audio/voice/57ae3f4a0828.mp3", "/audio/voice/5971f710baa6.mp3",
  "/audio/voice/5984aac9720d.mp3", "/audio/voice/5b1e3f004746.mp3", "/audio/voice/5bcac99c47e7.mp3", "/audio/voice/5c6cb2452dd9.mp3",
  "/audio/voice/5f7d62dbd3ac.mp3", "/audio/voice/5fc4846b4c38.mp3", "/audio/voice/5fe226f62e30.mp3", "/audio/voice/64f89ab8ce59.mp3",
  "/audio/voice/6525ac7640fa.mp3", "/audio/voice/670a7a3277bf.mp3", "/audio/voice/6a0ba597a32b.mp3", "/audio/voice/6b8e821e992d.mp3",
  "/audio/voice/783800c0bf94.mp3", "/audio/voice/784b2130194a.mp3", "/audio/voice/787cd902239d.mp3", "/audio/voice/78b7a3a69cb9.mp3",
  "/audio/voice/7c18a1d0984a.mp3", "/audio/voice/7c785fe4101d.mp3", "/audio/voice/7cd00d960fdc.mp3", "/audio/voice/7d6cc0a96472.mp3",
  "/audio/voice/7dabe498242d.mp3", "/audio/voice/7e902805abe5.mp3", "/audio/voice/827257871ffb.mp3", "/audio/voice/8283ece8cbfa.mp3",
  "/audio/voice/82c89f881cf8.mp3", "/audio/voice/863934e79e28.mp3", "/audio/voice/8842a9b2d789.mp3", "/audio/voice/898723383be0.mp3",
  "/audio/voice/8a0658defd49.mp3", "/audio/voice/8c563d33bda5.mp3", "/audio/voice/8ed86ad7d214.mp3", "/audio/voice/8f0ad659ff10.mp3",
  "/audio/voice/90918f56de38.mp3", "/audio/voice/90a2e7549141.mp3", "/audio/voice/90b3defe2a0a.mp3", "/audio/voice/95704f4c64ac.mp3",
  "/audio/voice/98d2ad6cce0f.mp3", "/audio/voice/9aea918ee445.mp3", "/audio/voice/9b49b8b119ec.mp3", "/audio/voice/9b99e9599349.mp3",
  "/audio/voice/9ce59ab70c50.mp3", "/audio/voice/9d9dfce34e67.mp3", "/audio/voice/9df3ddcf86e2.mp3", "/audio/voice/9e5e40948d67.mp3",
  "/audio/voice/a0ea42e984e2.mp3", "/audio/voice/ad482229c533.mp3", "/audio/voice/ad5809e32c7c.mp3", "/audio/voice/adb1a127bbbe.mp3",
  "/audio/voice/adf9c64283ea.mp3", "/audio/voice/b36e862010cf.mp3", "/audio/voice/b460b8f6ae02.mp3", "/audio/voice/b706a54de37e.mp3",
  "/audio/voice/b847232d35e0.mp3", "/audio/voice/b885e83187c1.mp3", "/audio/voice/b91a5fac2a3b.mp3", "/audio/voice/b9a16159e68a.mp3",
  "/audio/voice/b9c03eb62016.mp3", "/audio/voice/ba0628a19293.mp3", "/audio/voice/bd4a56ed300a.mp3", "/audio/voice/bf0454eb46c8.mp3",
  "/audio/voice/c1090a52c797.mp3", "/audio/voice/c14cb007b93f.mp3", "/audio/voice/c29dd90875d3.mp3", "/audio/voice/c48889131bd5.mp3",
  "/audio/voice/c4be29b8499b.mp3", "/audio/voice/c60bbf35290a.mp3", "/audio/voice/c7aeff943696.mp3", "/audio/voice/cab73fc083ad.mp3",
  "/audio/voice/cd33530d58a9.mp3", "/audio/voice/ce305ad139da.mp3", "/audio/voice/d452010d83de.mp3", "/audio/voice/d6ffec37cc6f.mp3",
  "/audio/voice/d73efe0987a7.mp3", "/audio/voice/d957a32091bd.mp3", "/audio/voice/dacf85a283ba.mp3", "/audio/voice/dbc295eff251.mp3",
  "/audio/voice/dd74792aedfa.mp3", "/audio/voice/dfda585dc3be.mp3", "/audio/voice/e0d6223ba794.mp3", "/audio/voice/e5d60a4b7c97.mp3",
  "/audio/voice/ec574d305922.mp3", "/audio/voice/edffd01012c5.mp3", "/audio/voice/f144cbf086ad.mp3", "/audio/voice/f227e87dd675.mp3",
  "/audio/voice/f65d69256597.mp3", "/audio/voice/f7bbef7ba762.mp3", "/audio/voice/f85f3d5ad9f9.mp3", "/audio/voice/fbc9321a5cd8.mp3",
  "/audio/voice/fc4cea36e8ec.mp3", "/audio/voice/fd2f3fff8e07.mp3", "/audio/voice/fd6245dad242.mp3", "/audio/voice/fe4e61ec7d87.mp3",
  "/audio/voice/fe5887199f83.mp3",
  // <<< the recorded voice
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
      .then((hit) => (hit ? ranged(e.request, hit) : fetch(e.request)))
  );
});

// An <audio> element asks for its clip (the recorded voice) a byte range at a
// time, and Safari plays nothing unless the answer is that range: cut the
// cached file to the range asked for. Any other request gets the file whole.
async function ranged(request, hit) {
  const m = /^bytes=(\d*)-(\d*)$/.exec((request.headers.get("range") ?? "").trim());
  if (!m || (m[1] === "" && m[2] === "") || hit.status !== 200) return hit;
  const body = await hit.arrayBuffer();
  const size = body.byteLength;
  // "bytes=100-" to the end, "bytes=-100" the last 100
  const start = m[1] === "" ? Math.max(0, size - Number(m[2])) : Number(m[1]);
  const end = m[1] !== "" && m[2] !== "" ? Math.min(Number(m[2]), size - 1) : size - 1;
  if (start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  const headers = new Headers(hit.headers);
  headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
  headers.set("Content-Length", String(end - start + 1));
  return new Response(body.slice(start, end + 1), { status: 206, statusText: "Partial Content", headers });
}
