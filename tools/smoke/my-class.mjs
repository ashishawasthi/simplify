// Smoke scenes for My class: the tile on the menu, the reader
// (js/tools/my-class.js, class-markdown.js, class-data.js) and the set-up
// page's class section (js/class-setup.js) — node tools/smoke.mjs my-class
//
// Nothing here reaches the internet. A scene either seeds the device's saved
// copy of the class (localStorage "simplify-class-v1", and Cache Storage for
// its files) and has no server at all — on 127.0.0.1 class-data.js asks
// nobody unless told to — or turns on the emulator flag and stands in for
// the emulators with a fetch() of its own (NET below), which answers the
// class's document and makes its pictures (a JPEG drawn on a canvas) and
// videos (a 1.7 KB H.264 clip) — and with an EventSource of its own for the
// Realtime Database's push signal (streams, push() and signalNow below).

const inPage = (fn) => `(${fn})()`;
const run = (fn) => `await (${fn})();`;

const CODE = "K7M3RQP9T";
const YT = "dQw4w9WgXcQ";

const HELPERS = `
  window.shown = (sel) => { const el = document.querySelector(sel); return !!el && el.getClientRects().length > 0; };
  window.pause = (ms) => new Promise((r) => setTimeout(r, ms));
  window.text = (sel) => document.querySelector(sel)?.textContent.trim() ?? null;
  window.until = async (fn, ms = 4000) => {
    for (const end = Date.now() + ms; Date.now() < end; await pause(50)) if (fn()) return;
    throw new Error("never: " + fn);
  };
  window.device = () => JSON.parse(localStorage.getItem("simplify-device-v1") ?? "{}");
  window.tap = async (sel) => {
    const el = typeof sel === "string" ? document.querySelector(sel) : sel;
    if (!el) throw new Error("nothing to tap: " + sel);
    el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    el.click();
    await pause(500); // longer than the reader's double-tap guard
  };
  // a JPEG drawn here, and a tiny H.264 clip, for the class's files
  window.jpeg = () => new Promise((resolve) => {
    const c = document.createElement("canvas");
    c.width = 800;
    c.height = 600;
    const g = c.getContext("2d");
    g.fillStyle = "#e3f2fd";
    g.fillRect(0, 0, 800, 600);
    g.fillStyle = "#1565c0";
    g.beginPath();
    g.arc(400, 300, 180, 0, 2 * Math.PI);
    g.fill();
    c.toBlob(resolve, "image/jpeg", 0.85);
  });
  window.mp4 = () => new Blob([Uint8Array.from(atob(TINY_MP4), (c) => c.charCodeAt(0))], { type: "video/mp4" });
`;

// 160 × 90, half a second of blue (ffmpeg, libx264 baseline)
const TINY_MP4 = "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";

const device = (settings) =>
  `localStorage.setItem("simplify-device-v1", ${JSON.stringify(JSON.stringify({
    hidden: [], picturesOnly: false, speak: true, classCode: null, className: null, tools: {}, ...settings,
  }))});`;
const FOLLOWS = device({ classCode: CODE, className: "3 Kindness" });

// the device's saved copy of the class, read this long ago
const PUBLISHED = new Date(Date.now() - 3600e3).toISOString(); // an hour before the run, the same on every load
const saved = (markdown, { ago = 60 * 1000, name = "3 Kindness", pageId = "p1" } = {}) => `
  localStorage.setItem("simplify-class-v1", JSON.stringify({
    code: ${JSON.stringify(CODE)}, name: ${JSON.stringify(name)}, checkedAt: Date.now() - ${ago},
    latest: ${markdown == null ? "null" : `{ pageId: ${JSON.stringify(pageId)}, title: "A page",
      markdown: ${JSON.stringify(markdown)}, publishedAt: ${JSON.stringify(PUBLISHED)} }`},
  }));`;

// the class's document, as Firestore's REST API sends it
const DOC_AT = "2026-09-22T00:05:00Z";
const doc = (markdown, { name = "3 Kindness", pageId = "p9" } = {}) => ({
  name: `projects/simplify-special/databases/(default)/documents/classes/${CODE}`,
  fields: {
    name: { stringValue: name },
    institution: { stringValue: "awwa-school-napiri" },
    status: { stringValue: "active" },
    latest: markdown == null ? { nullValue: null } : { mapValue: { fields: {
      pageId: { stringValue: pageId },
      title: { stringValue: "A page" },
      markdown: { stringValue: markdown },
      publishedAt: { timestampValue: DOC_AT },
      publishedBy: { stringValue: "coach1" },
    } } },
  },
});

// The emulators, stood in for: class documents by code (none → 403, as the
// rules answer), files made up on the spot. asked: every URL requested.
// The push signal: signalNow is what the database holds for the class — by
// default the one for the class's document (none for no document) — sent
// as each stream opens; push(signal) changes it and sends it on every open
// stream. streams: every EventSource the page opened.
const PUBLISHED_SIGNAL = `{ at: Date.parse(${JSON.stringify(PUBLISHED)}), force: false }`;
const NET = ({ docs = {}, delay = 0, signal } = {}) => `
  localStorage.setItem("simplify-class-emulator", "on");
  window.asked = [];
  window.classDocs = ${JSON.stringify(docs)};
  window.signalNow = ${signal ?? (docs[CODE] ? `{ at: Date.parse(${JSON.stringify(DOC_AT)}), force: false }` : "null")};
  window.streams = [];
  window.EventSource = class {
    static CLOSED = 2;
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.listeners = {};
      streams.push(this);
      setTimeout(() => {
        if (this.readyState === 2) return;
        this.readyState = 1;
        this.send({ path: "/", data: window.signalNow });
      }, 50);
    }
    addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
    send(event) { for (const fn of this.listeners.put ?? []) fn({ data: JSON.stringify(event) }); }
    close() { this.readyState = 2; }
  };
  window.push = (signal) => {
    window.signalNow = signal;
    for (const s of streams) if (s.readyState === 1) s.send({ path: "/", data: signal });
  };
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, options) => {
    const url = String(input?.url ?? input);
    const isPage = url.startsWith("http://127.0.0.1:8085/");
    if (!isPage && !url.startsWith("http://127.0.0.1:9199/")) return realFetch(input, options);
    window.asked.push(url);
    await pause(${delay});
    if (isPage) {
      const found = window.classDocs[url.split("/").pop()];
      return found ? new Response(JSON.stringify(found), { status: 200, headers: { "content-type": "application/json" } })
        : new Response('{"error":{"code":403,"status":"PERMISSION_DENIED"}}', { status: 403 });
    }
    const path = decodeURIComponent(url.split("/o/")[1].split("?")[0]);
    return new Response(path.endsWith(".mp4") ? mp4() : await jpeg());
  };
`;

// a YouTube player is never loaded here: its address is written down instead
const NO_YOUTUBE = `
  Object.defineProperty(HTMLIFrameElement.prototype, "src", {
    configurable: true,
    get() { return this.dataset.wouldLoad ?? ""; },
    set(value) { this.dataset.wouldLoad = value; },
  });
`;

// Press and hold "Hold to open set-up" the way a finger does (as in app.mjs)
const HOLD = run(async () => {
  const btn = document.querySelector("#tool-setup .hold-btn");
  const finger = { bubbles: true, pointerId: 7, button: 0, isPrimary: true, pointerType: "touch" };
  btn.dispatchEvent(new PointerEvent("pointerdown", finger));
  await pause(1700);
  btn.dispatchEvent(new PointerEvent("pointerup", finger));
  await pause(600);
  if (!shown("#tool-setup .setup-settings")) throw new Error("the hold did not open the settings");
});

const type = (value) => run(new Function(`return async () => {
  const input = document.getElementById("class-code-input");
  input.focus();
  input.value = ${JSON.stringify(value)};
  input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
  await pause(50);
}`)());

const PAGE = `# Going to the dentist
I sit in the **big** chair.
---
## The waiting room
I wait for my name. The dentist calls my name. I walk in with my mum or my dad. I sit on a chair and look at a book. It can take a long time, and that is OK. I can bring my own book too.
---
1. Open *wide*
2. Rinse
---
[Clinic map](https://www.example.com/map)`;

const MEDIA_PAGE = `# Washing hands
![A sink](pictures/p1.jpg)
![Washing hands](videos/v1.mp4)`;

const NOT_FOUND = "Can't find this class. Check the code, or try again with the internet.";

// values the scenes' page code compares with
const GLOBALS = `window.PAGE_TEXT = ${JSON.stringify(PAGE)}; window.NOT_FOUND = ${JSON.stringify(NOT_FOUND)};`;

const scenes = [
  // ---------- the menu ----------
  {
    name: "menu: the My class tile comes first, with the class's name under it",
    path: "/",
    init: HELPERS + FOLLOWS,
    expect: inPage(() => {
      const first = [...document.querySelectorAll("#menu li[data-tool]")].find((li) => li.getClientRects().length);
      return first?.dataset.tool === "my-class" &&
        text('#menu li[data-tool="my-class"] .my-class-tile-text') === "My class3 Kindness" &&
        shown('#menu li[data-tool="my-class"] .my-class-tile-name') &&
        shown('#menu li[data-tool="my-class"] .tool-icon img');
    }),
  },
  {
    name: "menu: a device with no class has no tile, and keeps no class's copy",
    path: "/",
    init: HELPERS + saved("# Old page"),
    expect: inPage(() => !shown('#menu li[data-tool="my-class"]') && localStorage.getItem("simplify-class-v1") === null),
  },

  // ---------- the reader ----------
  {
    name: "reader: the saved page opens with no internet, first screen, where-you-are and when",
    path: "/#my-class",
    init: HELPERS + FOLLOWS + saved(PAGE),
    expect: inPage(() => document.title === "My class — Simplify" &&
      text("#tool-my-class .mc-screen h2.cm-h1") === "Going to the dentist" &&
      document.querySelector("#tool-my-class .mc-screen strong")?.textContent === "big" &&
      document.querySelector("#tool-my-class .mc-back").disabled &&
      text("#tool-my-class .mc-next") === "Next▶︎" &&
      document.querySelectorAll("#tool-my-class .mc-dot").length === 4 &&
      document.querySelector("#tool-my-class .mc-dot").classList.contains("is-here") &&
      document.querySelector("#tool-my-class .mc-screen").getAttribute("aria-label") === "Screen 1 of 4" &&
      /^3 Kindness · Updated (today|\w{3}) \d/.test(text("#tool-my-class .mc-meta")) &&
      !shown("#tool-my-class .mc-note") && !shown("#clear-all-wrap") && !shown("#result")),
  },
  {
    name: "reader: Next and Back, one screen at a time; All done on the last goes back to the menu",
    path: "/",
    init: HELPERS + FOLLOWS + saved(PAGE),
    setup: run(async () => {
      await tap('#menu a[href="#my-class"]');
      await tap("#tool-my-class .mc-next");
      if (text("#tool-my-class .mc-screen h3") !== "The waiting room") throw new Error("not screen 2");
      if (document.activeElement !== document.querySelector("#tool-my-class .mc-screen")) throw new Error("focus");
      await tap("#tool-my-class .mc-back");
      if (text("#tool-my-class .mc-screen h2") !== "Going to the dentist") throw new Error("not back on 1");
      await tap("#tool-my-class .mc-next");
      await tap("#tool-my-class .mc-next");
      const items = [...document.querySelectorAll("#tool-my-class .mc-screen ol li")].map((li) => li.textContent);
      if (items.join("|") !== "Open wide|Rinse") throw new Error(items.join("|"));
      await tap("#tool-my-class .mc-next");
      const link = document.querySelector("#tool-my-class .cm-link");
      if (link?.href !== "https://www.example.com/map" || link.target !== "_blank" || link.rel !== "noopener noreferrer" ||
        text("#tool-my-class .cm-link-host") !== "example.com") throw new Error("the link button");
      if (text("#tool-my-class .mc-next") !== "All done✔" ||
        !document.querySelector("#tool-my-class .mc-next").classList.contains("is-done")) throw new Error("no All done");
      await tap("#tool-my-class .mc-next");
    }),
    expect: inPage(() => shown("#menu") && location.hash === ""),
  },
  {
    name: "reader: Back and Next stay in the same place on a short screen and a long one",
    path: "/#my-class",
    init: HELPERS + FOLLOWS + saved(PAGE),
    setup: run(async () => {
      const where = () => {
        const r = document.querySelector("#tool-my-class .mc-next").getBoundingClientRect();
        return `${Math.round(r.top)},${Math.round(r.left)},${Math.round(r.width)}`;
      };
      window.before = where();
      await tap("#tool-my-class .mc-next");
      window.after = where();
      const nav = document.querySelector("#tool-my-class .mc-nav").getBoundingClientRect();
      window.pinned = Math.abs(nav.bottom - innerHeight) < 2;
    }),
    expect: "window.before === window.after && window.pinned",
  },
  {
    name: "reader: a double tap on Next moves one screen, not two",
    path: "/#my-class",
    init: HELPERS + FOLLOWS + saved(PAGE),
    setup: run(async () => {
      const next = document.querySelector("#tool-my-class .mc-next");
      next.click();
      next.click();
      await pause(100);
    }),
    expect: inPage(() => text("#tool-my-class .mc-screen h3") === "The waiting room"),
  },
  {
    name: "reader: Back to it and a reload keep the screen; a new visit starts at the first",
    path: "/",
    init: HELPERS + FOLLOWS + saved(PAGE),
    setup: run(async () => {
      await tap('#menu a[href="#my-class"]');
      await tap("#tool-my-class .mc-next");
      await tap("#tool-my-class .mc-next");
      location.reload();
    }),
    expect: inPage(() => document.querySelector("#tool-my-class .mc-screen")?.getAttribute("aria-label") === "Screen 3 of 4"),
  },
  {
    name: "reader: nothing published yet is a calm line, no buttons",
    path: "/#my-class",
    init: HELPERS + FOLLOWS + saved(null),
    expect: inPage(() => text("#tool-my-class .mc-note-words") === "Nothing from your coach yet" &&
      !shown("#tool-my-class .mc-nav") && !shown("#tool-my-class .mc-screen") && text("#tool-my-class .mc-meta") === "3 Kindness"),
  },
  {
    name: "reader: opened on a device with no class, it says so",
    path: "/#my-class",
    init: HELPERS,
    expect: inPage(() => text("#tool-my-class .mc-note-words") === "No class on this device yet" &&
      shown("#tool-my-class .mc-note-more") && !shown("#tool-my-class .mc-nav")),
  },
  {
    name: "reader: pictures and videos from the device's copy, as blob: URLs; a video never plays by itself",
    path: "/",
    init: HELPERS + `window.TINY_MP4 = ${JSON.stringify(TINY_MP4)};` + FOLLOWS + saved(MEDIA_PAGE),
    setup: run(async () => {
      const cache = await caches.open("simplify-class-media");
      const key = (kind, id) => new URL(`/class-media/K7M3RQP9T/${kind}/${id}`, location.href).href;
      await cache.put(key("picture", "p1"), new Response(await jpeg(), { headers: { "content-type": "image/jpeg" } }));
      await cache.put(key("video", "v1"), new Response(mp4(), { headers: { "content-type": "video/mp4" } }));
      location.hash = "#my-class";
      await until(() => document.querySelector("#tool-my-class video")?.readyState >= 1);
      const video = document.querySelector("#tool-my-class video");
      window.untouched = video.paused && !video.autoplay && video.controls && video.playsInline &&
        video.preload === "metadata" && video.getAttribute("aria-label") === "Washing hands" &&
        shown("#tool-my-class .cm-video-play") &&
        document.querySelector("#tool-my-class .cm-video-play").getAttribute("aria-label") === "Play: Washing hands";
      // the clip is half a second long: note that it played, and that ▶ stepped aside for it
      video.addEventListener("play", () => {
        window.played = true;
        window.playHidden = !shown("#tool-my-class .cm-video-play");
      }, { once: true });
      await tap("#tool-my-class .cm-video-play");
    }),
    expect: inPage(() => {
      const img = document.querySelector("#tool-my-class img.cm-picture");
      const video = document.querySelector("#tool-my-class video");
      return window.untouched && img?.src.startsWith("blob:") && img.complete && img.naturalWidth === 800 &&
        img.alt === "A sink" && video?.src.startsWith("blob:") && window.played && window.playHidden;
    }),
  },
  {
    name: "reader: with no copy and no internet, a picture waits in a quiet frame that says so",
    path: "/#my-class",
    init: HELPERS + FOLLOWS + saved(MEDIA_PAGE),
    expect: inPage(() => text("#tool-my-class .mc-block.is-offline .mc-file-note") === "Needs the internet" &&
      document.querySelector("#tool-my-class .mc-file-frame").getAttribute("aria-label") === "A sink" &&
      getComputedStyle(document.querySelector("#tool-my-class .mc-file-note")).color === "rgb(68, 68, 68)"),
  },
  {
    name: "reader: online, it reads the class and fetches its files (stand-in emulators)",
    path: "/#my-class",
    init: HELPERS + `window.TINY_MP4 = ${JSON.stringify(TINY_MP4)};` + FOLLOWS + NET({ docs: { [CODE]: doc(MEDIA_PAGE) } }),
    expect: inPage(async () => {
      const img = document.querySelector("#tool-my-class img.cm-picture");
      const cache = await caches.open("simplify-class-media");
      const keys = (await cache.keys()).map((r) => new URL(r.url).pathname).sort().join();
      return text("#tool-my-class .mc-screen h2") === "Washing hands" && img?.src.startsWith("blob:") && img.naturalWidth === 800 &&
        document.querySelector("#tool-my-class video")?.src.startsWith("blob:") &&
        asked.includes("http://127.0.0.1:8085/v1/projects/simplify-special/databases/(default)/documents/classes/K7M3RQP9T") &&
        asked.includes("http://127.0.0.1:9199/v0/b/simplify-special.firebasestorage.app/o/classes%2FK7M3RQP9T%2Fpictures%2Fp1.jpg?alt=media") &&
        asked.includes("http://127.0.0.1:9199/v0/b/simplify-special.firebasestorage.app/o/classes%2FK7M3RQP9T%2Fvideos%2Fv1.mp4?alt=media") &&
        JSON.parse(localStorage.getItem("simplify-class-v1")).latest.pageId === "p9" &&
        keys === "/class-media/K7M3RQP9T/picture/p1,/class-media/K7M3RQP9T/video/v1";
    }),
  },
  {
    name: "reader: a new page shows at once, from its first screen, even while reading",
    path: "/#my-class",
    init: HELPERS + `window.TINY_MP4 = ${JSON.stringify(TINY_MP4)};` + FOLLOWS + saved(PAGE, { ago: 20 * 60 * 1000 }) +
      NET({ docs: { [CODE]: doc("# A new page\nNew words.") }, delay: 1500, signal: PUBLISHED_SIGNAL }),
    setup: run(async () => {
      // reading — on the second screen — while the new page is on its way
      await tap("#tool-my-class .mc-next");
      if (text("#tool-my-class .mc-screen h3") !== "The waiting room") throw new Error("the new page came too soon to test");
    }),
    expect: inPage(() => text("#tool-my-class .mc-screen h2") === "A new page" &&
      document.querySelector("#tool-my-class .mc-back").disabled && asked.length === 1),
  },
  {
    name: "reader: untouched, it takes the page that arrives as it opens",
    path: "/#my-class",
    init: HELPERS + FOLLOWS + saved(PAGE, { ago: 20 * 60 * 1000 }) + NET({ docs: { [CODE]: doc("# A new page") }, delay: 300 }),
    expect: inPage(() => text("#tool-my-class .mc-screen h2") === "A new page" && asked.length === 1),
  },
  {
    name: "reader: a class taken away shows nothing at once",
    path: "/#my-class",
    init: HELPERS + FOLLOWS + saved(PAGE, { ago: 20 * 60 * 1000 }) + NET({ docs: {}, delay: 1500, signal: PUBLISHED_SIGNAL }),
    setup: run(async () => {
      await tap("#tool-my-class .mc-next");
      if (text("#tool-my-class .mc-screen h3") !== "The waiting room") throw new Error("taken away too soon to test");
    }),
    expect: inPage(() => text("#tool-my-class .mc-note-words") === "Nothing from your coach yet"),
  },

  // ---------- the push signal (class-live.js) ----------
  {
    name: "push: one stream to the class's signal, and nothing asked while it matches the saved page",
    path: "/",
    init: HELPERS + FOLLOWS + saved(PAGE) + NET({ docs: { [CODE]: doc("# Pushed page") }, signal: PUBLISHED_SIGNAL }),
    setup: run(() => pause(400)),
    expect: inPage(() => streams.length === 1 &&
      streams[0].url === "http://127.0.0.1:9000/signals/K7M3RQP9T.json?ns=simplify-special-default-rtdb" &&
      asked.length === 0),
  },
  {
    name: "push: on the menu, a new page is fetched at once, and My class stays shut",
    path: "/",
    init: HELPERS + FOLLOWS + saved(PAGE) + NET({ docs: { [CODE]: doc("# Pushed page") }, signal: PUBLISHED_SIGNAL }),
    setup: run(async () => {
      await pause(300);
      push({ at: Date.parse("2026-09-22T00:05:00Z"), force: false });
      await pause(600);
    }),
    expect: inPage(() => asked.length === 1 && shown("#menu") && location.hash === "" &&
      JSON.parse(localStorage.getItem("simplify-class-v1")).latest.pageId === "p9"),
  },
  {
    name: "push: a page shown now opens My class at once, from another tool",
    path: "/#time-sums",
    init: HELPERS + FOLLOWS + saved(PAGE) + NET({ docs: { [CODE]: doc("# Pushed page") }, signal: PUBLISHED_SIGNAL }),
    setup: run(async () => {
      await pause(300);
      if (!shown("#tool-time-sums")) throw new Error("not on Time sums");
      push({ at: Date.parse("2026-09-22T00:05:00Z"), force: true });
    }),
    expect: inPage(() => location.hash === "#my-class" && text("#tool-my-class .mc-screen h2") === "Pushed page"),
  },
  {
    name: "push: a page shown now before the app opened doesn't open My class (it waits there)",
    path: "/",
    init: HELPERS + FOLLOWS + saved(PAGE) +
      NET({ docs: { [CODE]: doc("# Pushed page") }, signal: `{ at: Date.parse(${JSON.stringify(DOC_AT)}), force: true }` }),
    setup: run(() => pause(1200)),
    expect: inPage(() => shown("#menu") && location.hash === "" && asked.length === 1 &&
      JSON.parse(localStorage.getItem("simplify-class-v1")).latest.pageId === "p9"),
  },
  {
    name: "push: the stream closes in the background; back within 5 minutes, a page shown now opens",
    path: "/",
    init: HELPERS + FOLLOWS + saved(PAGE) + NET({ docs: { [CODE]: doc("# Pushed page") }, signal: PUBLISHED_SIGNAL }),
    setup: run(async () => {
      await pause(300);
      let hidden = true;
      Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
      document.dispatchEvent(new Event("visibilitychange"));
      if (streams[0].readyState !== 2) throw new Error("the stream stayed open in the background");
      // pushed while the app was away, a minute ago
      const at = Date.now() - 60 * 1000;
      classDocs.K7M3RQP9T.fields.latest.mapValue.fields.publishedAt.timestampValue = new Date(at).toISOString();
      signalNow = { at, force: true };
      hidden = false;
      document.dispatchEvent(new Event("visibilitychange"));
    }),
    expect: inPage(() => streams.length === 2 && location.hash === "#my-class" &&
      text("#tool-my-class .mc-screen h2") === "Pushed page"),
  },
  {
    name: "push: back after more than 5 minutes, a page shown then just waits in My class",
    path: "/",
    init: HELPERS + FOLLOWS + saved(PAGE) + NET({ docs: { [CODE]: doc("# Pushed page") }, signal: PUBLISHED_SIGNAL }),
    setup: run(async () => {
      await pause(300);
      let hidden = true;
      Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
      document.dispatchEvent(new Event("visibilitychange"));
      signalNow = { at: Date.parse("2026-09-22T00:05:00Z"), force: true }; // days ago
      hidden = false;
      document.dispatchEvent(new Event("visibilitychange"));
      await pause(800);
    }),
    expect: inPage(() => streams.length === 2 && shown("#menu") && location.hash === "" &&
      JSON.parse(localStorage.getItem("simplify-class-v1")).latest.pageId === "p9"),
  },
  {
    name: "push: a device with no class opens no stream",
    path: "/",
    init: HELPERS + NET({ docs: { [CODE]: doc("# Pushed page") } }),
    setup: run(() => pause(400)),
    expect: inPage(() => streams.length === 0 && asked.length === 0),
  },
  {
    name: "push: on a guide page, a page shown now opens My class in the app",
    path: "/guide/menu",
    init: HELPERS + FOLLOWS + saved(PAGE) + NET({ docs: { [CODE]: doc("# Pushed page") }, signal: PUBLISHED_SIGNAL }),
    setup: run(async () => {
      await until(() => streams.length === 1 && streams[0].readyState === 1);
      push({ at: Date.parse("2026-09-22T00:05:00Z"), force: true });
    }),
    expect: inPage(() => location.pathname === "/" && location.hash === "#my-class" &&
      text("#tool-my-class .mc-screen h2") === "Pushed page"),
  },

  // ---------- YouTube ----------
  {
    name: "YouTube: a card, nothing from YouTube until it is tapped, then the privacy-enhanced player",
    path: "/#my-class",
    init: HELPERS + NO_YOUTUBE + FOLLOWS + saved(`[How to brush teeth](https://youtu.be/${YT})`),
    setup: run(async () => {
      await until(() => shown("#tool-my-class .cm-youtube-card"));
      const loaded = performance.getEntriesByType("resource").some((e) => /youtube/.test(e.name));
      if (document.querySelector("iframe") || loaded) throw new Error("YouTube before a tap");
      if (text("#tool-my-class .cm-youtube-words") !== "How to brush teeth" ||
        text("#tool-my-class .cm-youtube-note") !== "Watch on YouTube (needs the internet)") throw new Error("card words");
      await tap("#tool-my-class .cm-youtube-card");
    }),
    expect: inPage(() => {
      const frame = document.querySelector("#tool-my-class .cm-youtube-frame iframe");
      return frame?.dataset.wouldLoad === "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&playsinline=1" &&
        frame.getAttribute("referrerpolicy") === "strict-origin-when-cross-origin" &&
        frame.getAttribute("allow") === "encrypted-media; picture-in-picture; fullscreen" &&
        frame.hasAttribute("allowfullscreen") && frame.title === "How to brush teeth" &&
        !shown("#tool-my-class .cm-youtube-card");
    }),
  },
  {
    name: "YouTube with no internet: the card says so, calmly, and loads nothing",
    path: "/#my-class",
    init: HELPERS + NO_YOUTUBE + FOLLOWS + saved(`https://www.youtube.com/watch?v=${YT}`) +
      'Object.defineProperty(Navigator.prototype, "onLine", { configurable: true, get: () => false });',
    setup: run(async () => {
      await until(() => shown("#tool-my-class .cm-youtube-card"));
      await tap("#tool-my-class .cm-youtube-card");
    }),
    expect: inPage(() => !document.querySelector("iframe") &&
      text("#tool-my-class .cm-youtube-words") === "Video" &&
      text("#tool-my-class .cm-youtube-note") === "No internet now. Try again with the internet." &&
      document.querySelector("#tool-my-class .cm-youtube-card").classList.contains("is-offline")),
  },

  // ---------- a page is never HTML ----------
  {
    name: "a page can't make HTML, run a script or link anywhere but https",
    path: "/#my-class",
    init: HELPERS + FOLLOWS + saved(`<img src=x onerror="window.pwned=1"> <script>window.pwned=2</script>
[click](javascript:window.pwned=3)
[plain](http://example.com)
![x](https://evil.example/x.jpg)
<iframe src="https://evil.example"></iframe>
**<b>bold</b>**`),
    expect: inPage(() => {
      const screen = document.querySelector("#tool-my-class .mc-screen");
      return !window.pwned && screen.querySelectorAll("img, script, iframe, a, b").length === 0 &&
        screen.querySelector("p").textContent.startsWith("<img src=x onerror=") &&
        [...screen.querySelectorAll("p")].map((p) => p.textContent).includes("click") &&
        screen.querySelector("strong")?.textContent === "<b>bold</b>";
    }),
  },

  // ---------- the set-up page's class section ----------
  {
    name: "set-up: a typed code is tidied and looked up at once; Yes follows the class, with Put it back",
    path: "/#setup",
    init: HELPERS + NET({ docs: { [CODE]: doc(PAGE) } }),
    setup: HOLD + type("k7m 3rq-p9t") + run(async () => {
      const input = document.getElementById("class-code-input");
      if (input.value !== "K7M-3RQ-P9T") throw new Error(`tidied to ${input.value}`);
      await until(() => shown("#class-setup-slot .cs-ask"));
      if (text("#class-setup-slot .cs-question") !== "Is this your class?" ||
        text("#class-setup-slot .cs-ask .cs-name") !== "3 Kindness" ||
        text("#class-setup-slot .cs-ask .cs-code") !== "Code: K7M-3RQ-P9T") throw new Error("the question");
      await tap("#class-setup-slot .cs-yes");
      const d = device();
      if (d.classCode !== "K7M3RQP9T" || d.className !== "3 Kindness") throw new Error(JSON.stringify(d));
      if (JSON.parse(localStorage.getItem("simplify-class-v1")).latest.markdown !== window.PAGE_TEXT) throw new Error("page not kept");
      if (text("#toast-text") !== "My class: 3 Kindness") throw new Error(text("#toast-text"));
      if (!shown("#class-setup-slot .cs-current") || text("#class-setup-slot .cs-current .cs-name") !== "3 Kindness" ||
        !shown("#class-setup-slot .cs-open")) throw new Error("not the current class");
      document.getElementById("toast-undo").click();
      await pause(100);
    }),
    expect: inPage(() => device().classCode === null && shown("#class-setup-slot .cs-find") &&
      !shown("#class-setup-slot .cs-current")),
  },
  {
    name: "set-up: a pasted link works as well as a typed code",
    path: "/#setup",
    init: HELPERS + NET({ docs: { [CODE]: doc(PAGE) } }),
    setup: HOLD + type("https://simplify.whiz.coach/#join=K7M3RQP9T"),
    expect: inPage(() => document.getElementById("class-code-input").value === "K7M-3RQ-P9T" &&
      shown("#class-setup-slot .cs-ask")),
  },
  {
    name: "set-up: a class's QR code (#join=) asks at once; Yes, then Open My class shows its page",
    path: `/#join=${CODE}`,
    init: HELPERS + NET({ docs: { [CODE]: doc(PAGE) } }),
    setup: run(async () => {
      await until(() => shown("#class-setup-slot .cs-ask"));
      if (shown("#tool-setup .hold-btn") || shown("#setup-menu-h")) throw new Error("not the class section alone");
      await tap("#class-setup-slot .cs-yes");
      await tap("#class-setup-slot .cs-open");
    }),
    expect: inPage(() => location.hash === "#my-class" && text("#tool-my-class .mc-screen h2") === "Going to the dentist"),
  },
  {
    name: "set-up: after Open My class, All done goes to the menu, not back to set-up",
    path: `/#join=${CODE}`,
    init: HELPERS + NET({ docs: { [CODE]: doc(PAGE) } }),
    setup: run(async () => {
      await until(() => shown("#class-setup-slot .cs-ask"));
      await tap("#class-setup-slot .cs-yes");
      await tap("#class-setup-slot .cs-open");
      await until(() => text("#tool-my-class .mc-screen h2") === "Going to the dentist");
      for (let i = 0; i < 20 && text("#tool-my-class .mc-next") !== "All done✔"; i++) {
        await tap("#tool-my-class .mc-next");
        await new Promise((r) => setTimeout(r, 500)); // past the double-tap guard
      }
      await tap("#tool-my-class .mc-next");
    }),
    expect: inPage(() => !document.getElementById("menu").hidden && location.hash === "" &&
      document.getElementById("tool-setup").hidden),
  },
  {
    name: "set-up: No to the question leaves the device as it was",
    path: `/#join=${CODE}`,
    init: HELPERS + NET({ docs: { [CODE]: doc(PAGE) } }),
    setup: run(async () => {
      await until(() => shown("#class-setup-slot .cs-ask"));
      await tap("#class-setup-slot .cs-no");
    }),
    expect: inPage(() => device().classCode == null && shown("#class-setup-slot .cs-find") &&
      document.getElementById("class-code-input").value === "K7M-3RQ-P9T" &&
      localStorage.getItem("simplify-class-v1") === null),
  },
  {
    name: "set-up: #join with no internet (here, no server to ask) is the calm line",
    path: `/#join=${CODE}`,
    init: HELPERS,
    expect: inPage(() => text("#class-setup-slot .cs-status") === window.NOT_FOUND &&
      getComputedStyle(document.querySelector("#class-setup-slot .cs-status")).color === "rgb(26, 26, 26)" &&
      shown("#class-setup-slot .cs-retry") && device().classCode == null),
  },
  {
    name: "set-up: a code no class has is the same calm line; too many characters, a hint",
    path: "/#setup",
    init: HELPERS + NET({ docs: {} }),
    setup: HOLD + type("ABCDEFGHJ") + run(async () => {
      await until(() => text("#class-setup-slot .cs-status") === window.NOT_FOUND);
      if (!asked[0]?.endsWith("/classes/ABCDEFGHJ")) throw new Error(asked.join());
    }) + type("ABCDEFGHJK"),
    expect: inPage(() => text("#class-setup-slot .cs-status") === "A class code has 9 letters and numbers." &&
      !shown("#class-setup-slot .cs-ask")),
  },
  {
    name: "set-up: the class it follows, then Leave and Put it back",
    path: "/#setup",
    init: HELPERS + FOLLOWS + saved(PAGE),
    setup: HOLD + run(async () => {
      if (text("#class-setup-slot .cs-current .cs-name") !== "3 Kindness" ||
        text("#class-setup-slot .cs-current .cs-code") !== "Code: K7M-3RQ-P9T" || shown("#class-setup-slot .cs-open")) {
        throw new Error("the current class");
      }
      await tap("#class-setup-slot .cs-leave");
      if (device().classCode !== null || text("#toast-text") !== "Left 3 Kindness" || !shown("#class-setup-slot .cs-find")) {
        throw new Error("did not leave");
      }
      if (document.activeElement?.id !== "setup-class-h") throw new Error("focus should wait on the heading");
      if (!document.querySelector('#menu li[data-tool="my-class"]').hidden) throw new Error("tile still there");
      document.getElementById("toast-undo").click();
      await pause(100);
    }),
    expect: inPage(() => device().classCode === "K7M3RQP9T" && device().className === "3 Kindness" &&
      shown("#class-setup-slot .cs-current") && !document.querySelector('#menu li[data-tool="my-class"]').hidden),
  },
  {
    name: "set-up: Change keeps the class until another is chosen",
    path: "/#setup",
    init: HELPERS + FOLLOWS + saved(PAGE) + NET({ docs: { ABCDEFGHJ: doc("# Other", { name: "5 Courage" }) } }),
    setup: HOLD + run(async () => {
      await tap("#class-setup-slot .cs-change");
      if (!shown("#class-setup-slot .cs-keep") || text("#class-setup-slot .cs-keep") !== "Keep 3 Kindness") throw new Error("keep");
      if (device().classCode !== "K7M3RQP9T") throw new Error("left too soon");
    }) + type("abcdefghj") + run(async () => {
      await until(() => text("#class-setup-slot .cs-ask .cs-name") === "5 Courage");
      await tap("#class-setup-slot .cs-yes");
    }),
    expect: inPage(() => device().classCode === "ABCDEFGHJ" && device().className === "5 Courage" &&
      text('#menu li[data-tool="my-class"] .my-class-tile-name') === "5 Courage"),
  },
  {
    name: "set-up: #join for the class it already follows: no question, just Open My class",
    path: `/#join=${CODE}`,
    init: HELPERS + FOLLOWS + saved(PAGE) + NET({ docs: { [CODE]: doc(PAGE) }, signal: PUBLISHED_SIGNAL }),
    expect: inPage(() => shown("#class-setup-slot .cs-current") && shown("#class-setup-slot .cs-open") &&
      !shown("#class-setup-slot .cs-ask") && asked.length === 0),
  },
  {
    name: "set-up: the class section keeps the page's one h2 per section",
    path: "/#setup",
    init: HELPERS,
    setup: HOLD,
    expect: inPage(() => [...document.querySelectorAll("#class-setup-slot > h2")].map((h) => h.textContent.trim()).join() === "My class" &&
      document.querySelectorAll("#class-setup-slot h2").length === 1 && shown("#class-setup-slot .cs-find")),
  },

  // ---------- device settings, sizes ----------
  {
    name: "pictures only: the reader's words step aside, the coach's page and every button's name stay",
    path: "/#my-class",
    init: HELPERS + device({ classCode: CODE, className: "3 Kindness", picturesOnly: true }) + saved(PAGE),
    expect: inPage(() => {
      const nextWords = document.querySelector("#tool-my-class .mc-next .pic-words");
      return nextWords.getBoundingClientRect().width <= 1 && nextWords.textContent === "Next" &&
        document.querySelector("#tool-my-class .mc-screen .cm-p").getBoundingClientRect().width > 100 &&
        shown("#tool-my-class .mc-next .mc-btn-icon");
    }),
  },
  {
    name: "iPad: the reader at 768 × 1024, Back and Next at the bottom",
    path: "/#my-class",
    viewport: { width: 768, height: 1024 },
    init: HELPERS + FOLLOWS + saved(PAGE),
    expect: inPage(() => {
      const nav = document.querySelector("#tool-my-class .mc-nav").getBoundingClientRect();
      const next = document.querySelector("#tool-my-class .mc-next").getBoundingClientRect();
      return Math.abs(nav.bottom - innerHeight) < 2 && next.height >= 72 && nav.width <= 520;
    }),
  },
];

export default scenes.map((scene) => ({ ...scene, init: GLOBALS + (scene.init ?? "") }));
