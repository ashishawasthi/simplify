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
  "/audio/voice/03898eee657d.mp3", "/audio/voice/04a2ceb1705c.mp3", "/audio/voice/06e2661e416f.mp3", "/audio/voice/0dd78877e506.mp3",
  "/audio/voice/0e24f14ff130.mp3", "/audio/voice/12ab9950764d.mp3", "/audio/voice/17c85edfa02b.mp3", "/audio/voice/183b3ed813df.mp3",
  "/audio/voice/19a481a79318.mp3", "/audio/voice/19fa2dd40672.mp3", "/audio/voice/1aefae33290c.mp3", "/audio/voice/1cddd0afe302.mp3",
  "/audio/voice/1f6f1fddd069.mp3", "/audio/voice/262be96c0597.mp3", "/audio/voice/28263fc43ed7.mp3", "/audio/voice/2abb5aac92cc.mp3",
  "/audio/voice/322649b142c1.mp3", "/audio/voice/32e0a4c90312.mp3", "/audio/voice/337c8a691d05.mp3", "/audio/voice/33c4e7710d07.mp3",
  "/audio/voice/349039f6c188.mp3", "/audio/voice/362145a9fd8b.mp3", "/audio/voice/362da94019a8.mp3", "/audio/voice/36b422156e73.mp3",
  "/audio/voice/3accd8a470e3.mp3", "/audio/voice/3b9cf0276364.mp3", "/audio/voice/3d4b7fc6e187.mp3", "/audio/voice/3f88050afd62.mp3",
  "/audio/voice/40de32ac9800.mp3", "/audio/voice/40de8d11eea7.mp3", "/audio/voice/416b6ba6e39a.mp3", "/audio/voice/490a8bac60f9.mp3",
  "/audio/voice/49128bdf1609.mp3", "/audio/voice/4c8cfae425f5.mp3", "/audio/voice/4cf1f7accf92.mp3", "/audio/voice/4f90cf0d4405.mp3",
  "/audio/voice/51474ac2c10b.mp3", "/audio/voice/5176a29c7c69.mp3", "/audio/voice/52e792d2d949.mp3", "/audio/voice/537cfc04dc49.mp3",
  "/audio/voice/58e944abdd6e.mp3", "/audio/voice/5bd4756baeb9.mp3", "/audio/voice/5e44747a9f47.mp3", "/audio/voice/665712a38762.mp3",
  "/audio/voice/66876af86b1b.mp3", "/audio/voice/67108c32e28a.mp3", "/audio/voice/6a184c97bcb1.mp3", "/audio/voice/6ccbdefa19e7.mp3",
  "/audio/voice/6d651cfea7b2.mp3", "/audio/voice/6fca03c6e564.mp3", "/audio/voice/736ebbdc0ac7.mp3", "/audio/voice/77f82fa9ce3b.mp3",
  "/audio/voice/798eb7f1a199.mp3", "/audio/voice/79b8044de3c1.mp3", "/audio/voice/79c4578b1485.mp3", "/audio/voice/79e34ac95b16.mp3",
  "/audio/voice/7a263cc4fa69.mp3", "/audio/voice/7a884844467b.mp3", "/audio/voice/7bcf1bddbdab.mp3", "/audio/voice/7c7dc7ef1e6e.mp3",
  "/audio/voice/811ddc7cc768.mp3", "/audio/voice/834cc2898c44.mp3", "/audio/voice/851f4fa82d65.mp3", "/audio/voice/87c312ccc3c0.mp3",
  "/audio/voice/8cfa9ee25be6.mp3", "/audio/voice/8f1f8515a977.mp3", "/audio/voice/8faddae6bd8c.mp3", "/audio/voice/9083b23076cb.mp3",
  "/audio/voice/91b0a38c6a5e.mp3", "/audio/voice/9396d8469c6a.mp3", "/audio/voice/93b5ec7041b2.mp3", "/audio/voice/9458b026c9bc.mp3",
  "/audio/voice/94edc5a079aa.mp3", "/audio/voice/95dc162bc80a.mp3", "/audio/voice/963f359c9a46.mp3", "/audio/voice/966d9817e279.mp3",
  "/audio/voice/968db1f198cc.mp3", "/audio/voice/96cd43da5b4c.mp3", "/audio/voice/9873e9f15f6d.mp3", "/audio/voice/98f4e9aa7367.mp3",
  "/audio/voice/9a52b89a6718.mp3", "/audio/voice/9c53b093f6b1.mp3", "/audio/voice/9fcd0bbc9253.mp3", "/audio/voice/a135f4a69ef4.mp3",
  "/audio/voice/a205c0f7423d.mp3", "/audio/voice/a3127d16fa2d.mp3", "/audio/voice/a453c6a5b9a5.mp3", "/audio/voice/a4f0f7fdc581.mp3",
  "/audio/voice/a58a1dfdbc82.mp3", "/audio/voice/a58d7e9e6472.mp3", "/audio/voice/a792e6131132.mp3", "/audio/voice/a7bedd344eba.mp3",
  "/audio/voice/a91fac138163.mp3", "/audio/voice/ace412072d19.mp3", "/audio/voice/ad3caf77f215.mp3", "/audio/voice/afb225e7ca99.mp3",
  "/audio/voice/afdc5dfc5b89.mp3", "/audio/voice/b149d54f38c3.mp3", "/audio/voice/b25b6776b215.mp3", "/audio/voice/b411bc5ef10a.mp3",
  "/audio/voice/b44d890268df.mp3", "/audio/voice/b4bfab372862.mp3", "/audio/voice/b57023fcf01a.mp3", "/audio/voice/b8950a7900b1.mp3",
  "/audio/voice/b9845e13bf36.mp3", "/audio/voice/ba391c9957f7.mp3", "/audio/voice/ba80d4c4274c.mp3", "/audio/voice/bc17ab319d2d.mp3",
  "/audio/voice/c48445bc6729.mp3", "/audio/voice/c51e21e51d39.mp3", "/audio/voice/c546b3f2e482.mp3", "/audio/voice/c66be0fb904f.mp3",
  "/audio/voice/c6fdedadaac9.mp3", "/audio/voice/ca1b32891d91.mp3", "/audio/voice/ca1dcea6aff7.mp3", "/audio/voice/cb65bdf0a7d7.mp3",
  "/audio/voice/ce6d6d82af66.mp3", "/audio/voice/d3dad71aa56c.mp3", "/audio/voice/d43a1d6c8c14.mp3", "/audio/voice/da9b95f0eff4.mp3",
  "/audio/voice/df73f1a2bba3.mp3", "/audio/voice/e19398cd7f11.mp3", "/audio/voice/e1a09ab0db3d.mp3", "/audio/voice/e4090a116643.mp3",
  "/audio/voice/e70ab80b38b1.mp3", "/audio/voice/e75d129c45a1.mp3", "/audio/voice/e85f941155d9.mp3", "/audio/voice/e9f983a4df45.mp3",
  "/audio/voice/ee3dfc18bee2.mp3", "/audio/voice/eeb5ce5daf0d.mp3", "/audio/voice/efd52aa61666.mp3", "/audio/voice/f2dd6306e002.mp3",
  "/audio/voice/f457ec1d65f8.mp3", "/audio/voice/f548975ae9c2.mp3", "/audio/voice/f64f769d02ce.mp3", "/audio/voice/f8063b050f01.mp3",
  "/audio/voice/fc85c5115880.mp3",
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
