// Versioned precache, cache-first; firebase.json serves this file with
// no-cache, so the browser sees a new version as soon as it is deployed.
// js/update.js reloads an open page into the new version once it takes over.
//
// ASSETS (written by node tools/stamp.mjs, checked by tools/test-assets.mjs)
// lists every file under public/ bar the coach app and the few stamp.mjs
// names that no device needs, each with its revision: the first 8 hex digits
// of the SHA-256 of its bytes. Pages are listed by their clean URLs ("/",
// "/guide", "/guide/speak"), never as ".html": Hosting cleanUrls 301s the
// .html forms, and a cached redirected response breaks offline navigations.
// >>> every file the learner app keeps offline, and its revision: written by node tools/stamp.mjs — don't edit by hand
const ASSETS = {
  "/": "81f4cd97",
  "/audio/voice/03898eee657d.mp3": "be6c0e1e",
  "/audio/voice/04a2ceb1705c.mp3": "b98fa54a",
  "/audio/voice/06e2661e416f.mp3": "f1523be3",
  "/audio/voice/0dd78877e506.mp3": "36bfda3c",
  "/audio/voice/0e24f14ff130.mp3": "034fca2d",
  "/audio/voice/12ab9950764d.mp3": "e504f74c",
  "/audio/voice/17c85edfa02b.mp3": "3aca490e",
  "/audio/voice/183b3ed813df.mp3": "e6180e94",
  "/audio/voice/19a481a79318.mp3": "55af8c0d",
  "/audio/voice/19fa2dd40672.mp3": "2f9821b7",
  "/audio/voice/1aefae33290c.mp3": "1d04af96",
  "/audio/voice/1cddd0afe302.mp3": "087dae30",
  "/audio/voice/1f6f1fddd069.mp3": "c1fb9967",
  "/audio/voice/262be96c0597.mp3": "c7c9fc55",
  "/audio/voice/28263fc43ed7.mp3": "e2d1afc0",
  "/audio/voice/2abb5aac92cc.mp3": "a7ea19cd",
  "/audio/voice/322649b142c1.mp3": "cc4240a8",
  "/audio/voice/32e0a4c90312.mp3": "7b303616",
  "/audio/voice/337c8a691d05.mp3": "582a3cae",
  "/audio/voice/33c4e7710d07.mp3": "001f075f",
  "/audio/voice/349039f6c188.mp3": "295143ad",
  "/audio/voice/362145a9fd8b.mp3": "03632985",
  "/audio/voice/362da94019a8.mp3": "ec5997f6",
  "/audio/voice/36b422156e73.mp3": "380d5bbe",
  "/audio/voice/3accd8a470e3.mp3": "a5cc4072",
  "/audio/voice/3b9cf0276364.mp3": "f0c80b89",
  "/audio/voice/3d4b7fc6e187.mp3": "ea1dd804",
  "/audio/voice/3f88050afd62.mp3": "3499c12e",
  "/audio/voice/40de32ac9800.mp3": "81bc5b9e",
  "/audio/voice/40de8d11eea7.mp3": "75214c39",
  "/audio/voice/416b6ba6e39a.mp3": "b7ba3361",
  "/audio/voice/490a8bac60f9.mp3": "6be8bd69",
  "/audio/voice/49128bdf1609.mp3": "16a196b3",
  "/audio/voice/4c8cfae425f5.mp3": "2d2cd26e",
  "/audio/voice/4cf1f7accf92.mp3": "72ad86dd",
  "/audio/voice/4f90cf0d4405.mp3": "c763965a",
  "/audio/voice/51474ac2c10b.mp3": "a36b2e27",
  "/audio/voice/5176a29c7c69.mp3": "16ee89da",
  "/audio/voice/52e792d2d949.mp3": "e17f7dc9",
  "/audio/voice/537cfc04dc49.mp3": "4dc2384b",
  "/audio/voice/58e944abdd6e.mp3": "69d2aaed",
  "/audio/voice/5bd4756baeb9.mp3": "876d771c",
  "/audio/voice/5e44747a9f47.mp3": "c2894a2e",
  "/audio/voice/665712a38762.mp3": "9058acf5",
  "/audio/voice/66876af86b1b.mp3": "f8bf9d67",
  "/audio/voice/67108c32e28a.mp3": "67bee319",
  "/audio/voice/6a184c97bcb1.mp3": "22c40e53",
  "/audio/voice/6ccbdefa19e7.mp3": "18e2f49b",
  "/audio/voice/6d651cfea7b2.mp3": "dbac4f01",
  "/audio/voice/6fca03c6e564.mp3": "8d072b9f",
  "/audio/voice/736ebbdc0ac7.mp3": "b1084fef",
  "/audio/voice/77f82fa9ce3b.mp3": "76f82d28",
  "/audio/voice/798eb7f1a199.mp3": "7ae22a18",
  "/audio/voice/79b8044de3c1.mp3": "ae3d8896",
  "/audio/voice/79c4578b1485.mp3": "e3a491df",
  "/audio/voice/79e34ac95b16.mp3": "f9da051a",
  "/audio/voice/7a263cc4fa69.mp3": "1d656550",
  "/audio/voice/7a884844467b.mp3": "525e7f5f",
  "/audio/voice/7bcf1bddbdab.mp3": "45c7d255",
  "/audio/voice/7c7dc7ef1e6e.mp3": "eb61025a",
  "/audio/voice/811ddc7cc768.mp3": "7aad25af",
  "/audio/voice/834cc2898c44.mp3": "c91bcad2",
  "/audio/voice/851f4fa82d65.mp3": "3b06d42d",
  "/audio/voice/87c312ccc3c0.mp3": "b9facdfa",
  "/audio/voice/8cfa9ee25be6.mp3": "7ba66d3e",
  "/audio/voice/8f1f8515a977.mp3": "b3115db5",
  "/audio/voice/8faddae6bd8c.mp3": "e3eb8e93",
  "/audio/voice/9083b23076cb.mp3": "33d4802c",
  "/audio/voice/91b0a38c6a5e.mp3": "d55749d7",
  "/audio/voice/9396d8469c6a.mp3": "7ec2bf91",
  "/audio/voice/93b5ec7041b2.mp3": "6aafa619",
  "/audio/voice/9458b026c9bc.mp3": "8d348492",
  "/audio/voice/94edc5a079aa.mp3": "8c53207c",
  "/audio/voice/95dc162bc80a.mp3": "342d83c9",
  "/audio/voice/963f359c9a46.mp3": "23f25e09",
  "/audio/voice/966d9817e279.mp3": "037dce78",
  "/audio/voice/968db1f198cc.mp3": "d662709b",
  "/audio/voice/96cd43da5b4c.mp3": "5da5fcef",
  "/audio/voice/9873e9f15f6d.mp3": "0b87f384",
  "/audio/voice/98f4e9aa7367.mp3": "cca7800a",
  "/audio/voice/9a52b89a6718.mp3": "391edaf6",
  "/audio/voice/9c53b093f6b1.mp3": "70a092ba",
  "/audio/voice/9fcd0bbc9253.mp3": "0e8ae1dc",
  "/audio/voice/a135f4a69ef4.mp3": "103b976a",
  "/audio/voice/a205c0f7423d.mp3": "120a8e4e",
  "/audio/voice/a3127d16fa2d.mp3": "4357ded7",
  "/audio/voice/a453c6a5b9a5.mp3": "949e81b0",
  "/audio/voice/a4f0f7fdc581.mp3": "65ade02d",
  "/audio/voice/a58a1dfdbc82.mp3": "71a7d1be",
  "/audio/voice/a58d7e9e6472.mp3": "9b11068e",
  "/audio/voice/a792e6131132.mp3": "cb196939",
  "/audio/voice/a7bedd344eba.mp3": "7ad5d40d",
  "/audio/voice/a91fac138163.mp3": "879a8941",
  "/audio/voice/ace412072d19.mp3": "1ade03f4",
  "/audio/voice/ad3caf77f215.mp3": "eaa8ce2f",
  "/audio/voice/afb225e7ca99.mp3": "5665f3bb",
  "/audio/voice/afdc5dfc5b89.mp3": "9989ac52",
  "/audio/voice/b149d54f38c3.mp3": "081cbc36",
  "/audio/voice/b25b6776b215.mp3": "f803a69c",
  "/audio/voice/b411bc5ef10a.mp3": "13e10ae3",
  "/audio/voice/b44d890268df.mp3": "dbea51b9",
  "/audio/voice/b4bfab372862.mp3": "d0991b9b",
  "/audio/voice/b57023fcf01a.mp3": "e61abedc",
  "/audio/voice/b8950a7900b1.mp3": "62f44c96",
  "/audio/voice/b9845e13bf36.mp3": "a9994b6f",
  "/audio/voice/ba391c9957f7.mp3": "996842ce",
  "/audio/voice/ba80d4c4274c.mp3": "fcc1d157",
  "/audio/voice/bc17ab319d2d.mp3": "4f16c38a",
  "/audio/voice/c48445bc6729.mp3": "4b478d0b",
  "/audio/voice/c51e21e51d39.mp3": "ddd8c570",
  "/audio/voice/c546b3f2e482.mp3": "2af31414",
  "/audio/voice/c66be0fb904f.mp3": "4cb96755",
  "/audio/voice/c6fdedadaac9.mp3": "2ba957c6",
  "/audio/voice/ca1b32891d91.mp3": "599aabce",
  "/audio/voice/ca1dcea6aff7.mp3": "3b466387",
  "/audio/voice/cb65bdf0a7d7.mp3": "2fdb27b4",
  "/audio/voice/ce6d6d82af66.mp3": "e4eb136c",
  "/audio/voice/d3dad71aa56c.mp3": "28bd7981",
  "/audio/voice/d43a1d6c8c14.mp3": "01e217b4",
  "/audio/voice/da9b95f0eff4.mp3": "ee662db4",
  "/audio/voice/df73f1a2bba3.mp3": "82c8a236",
  "/audio/voice/e19398cd7f11.mp3": "3a136d2b",
  "/audio/voice/e1a09ab0db3d.mp3": "3b97da07",
  "/audio/voice/e4090a116643.mp3": "68f37d6a",
  "/audio/voice/e70ab80b38b1.mp3": "f06d1584",
  "/audio/voice/e75d129c45a1.mp3": "d51cf745",
  "/audio/voice/e85f941155d9.mp3": "b6b683c5",
  "/audio/voice/e9f983a4df45.mp3": "ae550569",
  "/audio/voice/ee3dfc18bee2.mp3": "79fba0bd",
  "/audio/voice/eeb5ce5daf0d.mp3": "9f8c51ed",
  "/audio/voice/efd52aa61666.mp3": "f904eb72",
  "/audio/voice/f2dd6306e002.mp3": "685271c4",
  "/audio/voice/f457ec1d65f8.mp3": "a1fad93b",
  "/audio/voice/f548975ae9c2.mp3": "9d3ffb83",
  "/audio/voice/f64f769d02ce.mp3": "22043990",
  "/audio/voice/f8063b050f01.mp3": "82579c58",
  "/audio/voice/fc85c5115880.mp3": "d9389eea",
  "/css/guide.css": "c489e9be",
  "/css/styles.css": "f86f2d14",
  "/css/tools/i-need.css": "5906f62a",
  "/css/tools/my-class.css": "e408ee21",
  "/css/tools/now-next.css": "78ea49e1",
  "/css/tools/setup.css": "62126c5c",
  "/css/tools/show-card.css": "c185d27d",
  "/css/tools/steps.css": "387cde7e",
  "/css/tools/wait.css": "02b61b9c",
  "/favicon.svg": "c92ae452",
  "/guide": "807d7e3c",
  "/guide/can-i-buy": "d2c2cde7",
  "/guide/change": "45609b45",
  "/guide/home-screen": "fcfbe3f1",
  "/guide/i-need": "4ec7b60d",
  "/guide/make-amount": "92cc85e2",
  "/guide/menu": "c8d9f15a",
  "/guide/my-class": "39fd9a3b",
  "/guide/next-dollar": "5ac1c041",
  "/guide/next-note": "70740afe",
  "/guide/no-microphone": "9d2f81f2",
  "/guide/notes-and-coins": "fe561999",
  "/guide/now-next": "62625b2d",
  "/guide/privacy": "e350ba49",
  "/guide/set-up": "e3e2f6ed",
  "/guide/shopping-list": "c0cf5327",
  "/guide/show-card": "a686f441",
  "/guide/speak": "d5462270",
  "/guide/steps": "223cff3d",
  "/guide/updates": "bc03ee26",
  "/guide/wait": "ccb95642",
  "/img/guide/mic-on-keyboard.png": "92e9a1f2",
  "/img/guide/screen-change.png": "2f066628",
  "/img/guide/screen-class-join.png": "4c8f3fc2",
  "/img/guide/screen-i-need-card.png": "e3d8cbb8",
  "/img/guide/screen-i-need-hurts.png": "64ccc5d3",
  "/img/guide/screen-i-need.png": "3b1582d6",
  "/img/guide/screen-make-amount.png": "88203f1e",
  "/img/guide/screen-menu-class.png": "b33d3410",
  "/img/guide/screen-menu-more.png": "34904079",
  "/img/guide/screen-menu.png": "f1f376d0",
  "/img/guide/screen-money.png": "ea2ba0bc",
  "/img/guide/screen-my-class.png": "596397f3",
  "/img/guide/screen-my-day.png": "1e05ec55",
  "/img/guide/screen-next-dollar.png": "057c9425",
  "/img/guide/screen-next-note.png": "574e3ace",
  "/img/guide/screen-no.png": "b468cdf2",
  "/img/guide/screen-now-next.png": "12e2b635",
  "/img/guide/screen-picker.png": "067b5a08",
  "/img/guide/screen-setup-hold.png": "f0c48e49",
  "/img/guide/screen-setup.png": "15639dd9",
  "/img/guide/screen-shopping-list.png": "5877379e",
  "/img/guide/screen-show-card-stop.png": "8132c065",
  "/img/guide/screen-show-card.png": "e2fcd72a",
  "/img/guide/screen-show-me.png": "26f0d592",
  "/img/guide/screen-steps-step.png": "85786da0",
  "/img/guide/screen-steps.png": "62edf0f1",
  "/img/guide/screen-wait-pick.png": "4bf3b7db",
  "/img/guide/screen-wait.png": "45bfae3c",
  "/img/guide/screen-yes.png": "9ab646a5",
  "/img/icons/apple-touch-icon.png": "fda710f9",
  "/img/icons/icon-192.png": "d8ca6d66",
  "/img/icons/icon-512.png": "fa2aef97",
  "/img/icons/icon-maskable-512.png": "e3ea5b2a",
  "/img/pic/all-done.svg": "2c7179e1",
  "/img/pic/bank-card.svg": "445c172e",
  "/img/pic/bell.svg": "b1881707",
  "/img/pic/break.svg": "8ea90056",
  "/img/pic/brush-teeth.svg": "12da956a",
  "/img/pic/bus-stop.svg": "a1d53833",
  "/img/pic/bus.svg": "67d439ac",
  "/img/pic/cannot-talk.svg": "3f2a6e1d",
  "/img/pic/car.svg": "b5f818a1",
  "/img/pic/card-reader.svg": "6efad6ca",
  "/img/pic/carry-tray.svg": "dda8b000",
  "/img/pic/changed.svg": "c57f31d9",
  "/img/pic/check-amount.svg": "b425c614",
  "/img/pic/clean-up.svg": "0ce164e3",
  "/img/pic/computer.svg": "d054e25b",
  "/img/pic/cook.svg": "f6b8eebc",
  "/img/pic/doctor.svg": "e9e5abbc",
  "/img/pic/dont-understand.svg": "71c1619b",
  "/img/pic/draw.svg": "0b2fa936",
  "/img/pic/dry-hands.svg": "59d82217",
  "/img/pic/eat.svg": "e4f6b9fc",
  "/img/pic/exercise.svg": "9ad0d769",
  "/img/pic/family.svg": "0edfd619",
  "/img/pic/game.svg": "c7ff8ccd",
  "/img/pic/get-dressed.svg": "f814432a",
  "/img/pic/haircut.svg": "5bda6fd8",
  "/img/pic/hawker-stall.svg": "05abdcf6",
  "/img/pic/help.svg": "ad9baf8a",
  "/img/pic/home.svg": "fece5f0e",
  "/img/pic/homework.svg": "7705d172",
  "/img/pic/hurts.svg": "66c72da0",
  "/img/pic/kopi.svg": "6f4e312c",
  "/img/pic/library.svg": "0fc3e6bb",
  "/img/pic/lift.svg": "98a83dab",
  "/img/pic/menu-i-need.svg": "9f5eb7c4",
  "/img/pic/menu-my-day.svg": "0cf9f71d",
  "/img/pic/menu-now-next.svg": "8fa5eb90",
  "/img/pic/menu-show-card.svg": "c8f3bea1",
  "/img/pic/menu-steps.svg": "1e024dcf",
  "/img/pic/menu-talk.svg": "3b09840b",
  "/img/pic/more-time.svg": "ebbc0fb0",
  "/img/pic/mrt-train.svg": "b8e7ea11",
  "/img/pic/music.svg": "2d62dea3",
  "/img/pic/no.svg": "06b94a90",
  "/img/pic/pack-bag.svg": "1a461d92",
  "/img/pic/park.svg": "5213c40a",
  "/img/pic/pay-qr.svg": "0be4a6b5",
  "/img/pic/phone.svg": "3cb2d14a",
  "/img/pic/play.svg": "7f8f7ff7",
  "/img/pic/playground.svg": "166b6864",
  "/img/pic/please.svg": "c1c2ae49",
  "/img/pic/quiet-time.svg": "421b480f",
  "/img/pic/read.svg": "dcb25f4d",
  "/img/pic/reader-tick.svg": "4d032c75",
  "/img/pic/receipt.svg": "df13f8b4",
  "/img/pic/recess.svg": "7e7884cb",
  "/img/pic/rub-hands.svg": "f7b70c06",
  "/img/pic/school.svg": "a0332398",
  "/img/pic/seat.svg": "710b8569",
  "/img/pic/shop.svg": "b25210b9",
  "/img/pic/shower.svg": "149fb3fc",
  "/img/pic/sleep.svg": "b2bcc98e",
  "/img/pic/snack.svg": "9d2e77eb",
  "/img/pic/soap.svg": "54c2f6a6",
  "/img/pic/space.svg": "4a47f943",
  "/img/pic/stop.svg": "0cfead59",
  "/img/pic/swim.svg": "946812ef",
  "/img/pic/tablet.svg": "2a866219",
  "/img/pic/tap-off.svg": "8e4fc0c3",
  "/img/pic/tap-water.svg": "7367b8ca",
  "/img/pic/taxi.svg": "b3a97290",
  "/img/pic/thank-you.svg": "2d611f8a",
  "/img/pic/therapy.svg": "2b4a4170",
  "/img/pic/toilet.svg": "5468c1b5",
  "/img/pic/too-loud.svg": "14f70eed",
  "/img/pic/travel-card.svg": "b109edb0",
  "/img/pic/tray-return-halal.svg": "96b81927",
  "/img/pic/tray-return.svg": "d6edeb5a",
  "/img/pic/tray.svg": "5767fc80",
  "/img/pic/tv.svg": "ad9a2e93",
  "/img/pic/walk.svg": "90027a3c",
  "/img/pic/want.svg": "aae7b28c",
  "/img/pic/wash-hands.svg": "11785545",
  "/img/pic/water.svg": "1deb8c04",
  "/img/pic/wipe-table.svg": "4aaab9ef",
  "/img/pic/yes.svg": "3d0c9a3a",
  "/js/answers.js": "cbeff1be",
  "/js/app.js": "acfd488a",
  "/js/class-data.js": "61d4fd50",
  "/js/class-markdown.js": "9d769d26",
  "/js/class-setup.js": "302bff1b",
  "/js/currency-data.js": "3b13d979",
  "/js/device.js": "3b0f2d98",
  "/js/guide-links.js": "57b5d095",
  "/js/items.js": "81565878",
  "/js/money-field.js": "e4fc9e90",
  "/js/money-tool.js": "39501364",
  "/js/money.js": "dd8ca90e",
  "/js/note-picker.js": "a4b85f80",
  "/js/picture-picker.js": "c4671d01",
  "/js/pictures.js": "f2bf77bd",
  "/js/result.js": "0a59b43b",
  "/js/say-aloud.js": "31ae324c",
  "/js/setup.js": "d6681efb",
  "/js/show-card.js": "ac2abd3f",
  "/js/show-money.js": "1b5dc7a5",
  "/js/speak.js": "b98916e3",
  "/js/storage.js": "78584de4",
  "/js/toast.js": "cd305cae",
  "/js/tools.js": "3812283b",
  "/js/tools/i-need-body.js": "fed1ec04",
  "/js/tools/i-need-cards.js": "0b55b3de",
  "/js/tools/i-need-hurts.js": "6c68f6e2",
  "/js/tools/i-need.js": "d2541a99",
  "/js/tools/my-class.js": "9621ce52",
  "/js/tools/now-next-list.js": "69b26811",
  "/js/tools/now-next.js": "2753c710",
  "/js/tools/show-card-cards.js": "d0e41417",
  "/js/tools/show-card.js": "582427f8",
  "/js/tools/steps-decks.js": "991887dd",
  "/js/tools/steps.js": "394b8676",
  "/js/tools/wait-time.js": "3f9c505c",
  "/js/tools/wait.js": "73bffd82",
  "/js/update.js": "510a8f06",
  "/js/voice-clips.js": "7991f0cf",
  "/manifest.webmanifest": "df0c81c4",
};
// <<< every file the learner app keeps offline

// The cache is named after the revisions, so any changed file is a new
// version by itself: there is no number to bump by hand.
const CACHE = `simplify-${fnv1a(JSON.stringify(ASSETS))}`;

// The caches this worker made, for this version and earlier ones (named
// simplify-v<N> before revisions, afford-v<N> before that). Any other cache —
// a tool keeping pictures of its own — is not the worker's to delete or
// serve from.
const MINE = /^(afford|simplify)-v\d+$|^simplify-[0-9a-f]{8}$/;

function fnv1a(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, "0");
}

async function revision(bytes) {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(hash.slice(0, 4), (b) => b.toString(16).padStart(2, "0")).join("");
}

const isRevision = async (response, rev) =>
  response.status === 200 && (await revision(await response.clone().arrayBuffer())) === rev;

// The install asks the network only for what changed. Every file whose bytes
// already match its revision somewhere on the device — in the version running
// now, or in what an interrupted install of this version got through — is
// copied from there, so a release that changes one script costs a slow
// phone that one script, and an install cut short picks up where it stopped.
// Whatever is kept, from the device or the network, has exactly the bytes
// this version was stamped with: a stale copy (a CDN edge not yet cleared, the
// browser's own HTTP cache) is never baked in.
self.addEventListener("install", (e) => {
  e.waitUntil(install().then(() => self.skipWaiting()));
});

async function install() {
  const cache = await caches.open(CACHE);
  const earlier = await Promise.all(
    (await caches.keys()).filter((k) => k !== CACHE && MINE.test(k)).map((k) => caches.open(k)),
  );
  // every file is seen through before the install gives up, so each one that
  // could be fetched is kept for the next attempt
  const outcomes = await Promise.allSettled(Object.entries(ASSETS).map(async ([url, rev]) => {
    const here = await cache.match(url);
    if (here && (await isRevision(here, rev))) return;
    for (const c of earlier) {
      const hit = await c.match(url);
      if (hit && (await isRevision(hit, rev))) return cache.put(url, hit);
    }
    return cache.put(url, await fetchAsset(url, rev));
  }));
  const failed = outcomes.find((o) => o.status === "rejected");
  if (failed) throw failed.reason;
}

// One file from the network, checked before it is kept.
//
// "no-cache" makes the browser ask the server, sending the ETag of the copy
// in its own HTTP cache. Hosting answers an unchanged image with a bodiless
// 304 and that copy is used; HTML, JS, CSS and the manifest come in full.
// Either way the question goes to the server (the CDN, which Hosting clears
// on every release), and the answer must still hash to the file's revision.
//
// A failed, redirected or different response is refused rather than cached:
// a 404 page, a redirect (it breaks offline navigations), or a copy from
// another release. The install then fails as a whole, the version already
// installed carries on, and the next update check tries again — fetching only
// what this attempt did not already keep.
async function fetchAsset(url, rev) {
  const r = await fetch(url, { cache: "no-cache" });
  if (!r.ok || r.redirected) throw new Error(`${url}: ${r.status}${r.redirected ? " (redirected)" : ""}`);
  if (!(await isRevision(r, rev))) throw new Error(`${url}: not revision ${rev} — a stale copy, or run node tools/stamp.mjs`);
  return r;
}

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && MINE.test(k)).map((k) => caches.delete(k))))
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
