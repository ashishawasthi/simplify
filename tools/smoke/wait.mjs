// Smoke scenes for Wait (js/tools/wait.js) — node tools/smoke.mjs wait
//
// The real tool in real Chrome. What the browser would really do — keep the
// screen awake, buzz, chime, and tell update.js the app is busy — is played
// by stand-ins (FAKES) that write down what they were asked, and Date.now()
// can be moved on (skew) so a scene walks through minutes in a moment.
// Scene code is written as real functions and sent to the page as source,
// as in app.mjs.

const inPage = (fn) => `(${fn})()`; // an expect: its value, awaited
const run = (fn) => `await (${fn})();`; // a setup: run it to the end

const HELPERS = `
  window.shown = (sel) => { const el = document.querySelector(sel); return !!el && el.getClientRects().length > 0; };
  window.pause = (ms) => new Promise((r) => setTimeout(r, ms));
  window.$w = (sel) => document.querySelector("#tool-wait " + sel);
  window.$$w = (sel) => [...document.querySelectorAll("#tool-wait " + sel)];
  window.saved = () => JSON.parse(localStorage.getItem("simplify-wait-v1") ?? "null");
  window.wordsNow = () => $w(".wait-words").textContent;
  window.liveNow = () => $w("[role=status]").textContent;
  window.tiny = (sel) => { const el = $w(sel); return !!el && el.getBoundingClientRect().width <= 1; };
`;

// the browser's side, written down: wakeLog (request / release / lost when
// the app went to the back), buzzes, sounds, busyLog (from the update.js
// stand-in below); skew moves Date.now() on; pageHidden plays the app
// going to the back
const FAKES = `
  const realNow = Date.now;
  window.skew = 0;
  Date.now = () => realNow.call(Date) + window.skew;

  window.wakeLog = [];
  const locks = [];
  window.awake = () => locks.filter((l) => !l.released).length;
  const wakeLock = {
    async request(type) {
      wakeLog.push("request");
      const lock = new EventTarget();
      Object.assign(lock, { type, released: false });
      lock.release = async () => {
        if (!lock.released) { lock.released = true; wakeLog.push("release"); }
      };
      locks.push(lock);
      return lock;
    },
  };
  Object.defineProperty(Navigator.prototype, "wakeLock", { configurable: true, get: () => wakeLock });

  window.buzzes = [];
  Object.defineProperty(Navigator.prototype, "vibrate", {
    configurable: true, value(pattern) { buzzes.push(pattern); return true; },
  });

  window.sounds = { contexts: 0, notes: [] };
  const param = { setValueAtTime() {}, exponentialRampToValueAtTime() {} };
  window.AudioContext = class {
    constructor() { sounds.contexts++; Object.assign(this, { state: "suspended", currentTime: 0, sampleRate: 44100, destination: {} }); }
    resume() { this.state = "running"; return Promise.resolve(); }
    createBuffer() { return {}; }
    createBufferSource() { return { connect() {}, start() {} }; }
    createGain() { return { gain: param, connect() {} }; }
    createOscillator() {
      const osc = { type: "", frequency: { value: 0 }, connect() {}, stop() {}, start() { sounds.notes.push(osc.frequency.value); } };
      return osc;
    }
  };
  window.webkitAudioContext = undefined;

  window.pageHidden = false;
  Object.defineProperty(Document.prototype, "hidden", { configurable: true, get: () => window.pageHidden });
  window.toBack = (hidden) => {
    window.pageHidden = hidden;
    if (hidden) for (const l of locks) if (!l.released) { l.released = true; wakeLog.push("lost"); }
    document.dispatchEvent(new Event("visibilitychange"));
  };

  window.busyLog = [];
  window.busy = () => busyLog.filter((e) => e.startsWith("wait:")).at(-1) === "wait:true";
`;
const UPDATE_STUB = {
  "/js/update.js": `
    export function setBusy(id, busy) { window.busyLog.push(id + ":" + busy); }
    export function initUpdates() {}
  `,
};

// what screen readers heard from the tool's live line, in order
const LISTEN = run(() => {
  const live = $w("[role=status]");
  window.heard = live.textContent ? [live.textContent] : [];
  new MutationObserver(() => {
    if (live.textContent) heard.push(live.textContent);
  }).observe(live, { childList: true, characterData: true, subtree: true });
});

const seed = (state) => `localStorage.setItem("simplify-wait-v1", JSON.stringify(${state}));`;
const PICS = `[{ picture: "read", words: "Read" }, { picture: "music", words: "Music" }, { picture: "draw", words: "Draw" }]`;
const BASE = HELPERS + FAKES;

// the minute buttons are on show, nothing else of a wait is
const IDLE = inPage(() => !shown(".wait-face") && shown(".wait-pick") && shown(".wait-sound") &&
  !shown("#clear-all-wrap"));

export default [
  // ---------- idle ----------
  {
    name: "idle: five big minute buttons in order, named; no disc, no ✕; sound off; the title keeps focus",
    path: "/#wait",
    init: BASE,
    stubs: UPDATE_STUB,
    expect: inPage(() => {
      const buttons = $$w(".wait-min");
      return buttons.map((b) => b.getAttribute("aria-label")).join() === "1 minute,2 minutes,5 minutes,10 minutes,15 minutes" &&
        buttons.map((b) => b.querySelector(".wait-min-number").textContent).join() === "1,2,5,10,15" &&
        buttons.every((b) => b.getBoundingClientRect().height >= 96 && b.getBoundingClientRect().width >= 96) &&
        $w(".wait-pick").getAttribute("aria-label") === "How long to wait" &&
        !shown(".wait-face") && !shown("#clear-all-wrap") &&
        $w(".wait-sound").getAttribute("role") === "switch" && $w(".wait-sound").getAttribute("aria-checked") === "false" &&
        $w(".wait-sound-icon").textContent === "🔕" &&
        shown(".wait-while-add") && $w(".wait-while-add").textContent.includes("While I wait") &&
        $$w(".wait-pic").length === 0 && !shown(".wait-while-label") &&
        document.activeElement === document.getElementById("screen-title") &&
        !busy() && wakeLog.length === 0 && sounds.contexts === 0;
    }),
  },
  {
    name: "idle: junk saved state is forgiven — the buttons, no error",
    path: "/#wait",
    init: BASE + `localStorage.setItem("simplify-wait-v1", '{"endAt":"soon","total":-4,"pausedRemaining":{},"sound":1,"waitPics":"read"}');`,
    expect: IDLE + " && $w('.wait-sound').getAttribute('aria-checked') === 'false'",
  },

  // ---------- starting ----------
  {
    name: "a tap on 5 min: the full blue disc, '5 minutes', ✕, saved end time, busy, awake, focus on the disc",
    path: "/#wait",
    init: BASE,
    stubs: UPDATE_STUB,
    setup: LISTEN + run(() => {
      const five = $$w(".wait-min")[2];
      five.focus();
      five.click();
    }),
    expect: inPage(() => {
      const s = saved();
      return shown(".wait-disc.is-running") && !shown(".wait-pick") && !shown(".wait-sound") &&
        wordsNow() === "5 minutes" && shown("#clear-all-wrap") &&
        s?.total === 300000 && Math.abs(s.endAt - (Date.now() + 300000)) < 2000 && s.pausedRemaining === null &&
        $w(".wait-wedge").getAttribute("d").startsWith("M100 4A") &&
        $w(".wait-disc").getAttribute("aria-label") === "Pause the wait" &&
        document.activeElement === $w(".wait-disc") &&
        busy() && awake() === 1 && heard.join("|") === "5 minutes left" &&
        sounds.contexts === 0; // sound is off: no audio at all
    }),
  },
  {
    name: "#wait?m=2 starts a 2-minute wait at once (I need's Break)",
    path: "/#wait?m=2",
    init: BASE,
    stubs: UPDATE_STUB,
    expect: inPage(() => shown(".wait-disc.is-running") && wordsNow() === "2 minutes" && saved()?.total === 120000 &&
      shown("#clear-all-wrap") && busy() && awake() === 1 &&
      document.activeElement === document.getElementById("screen-title")),
  },
  {
    name: "#wait?m=99 is held to 60 minutes, m=0 to 1",
    path: "/#wait?m=99",
    init: BASE,
    setup: run(async () => {
      await pause(300); // saved (the save waits 200 ms)
      if (saved()?.total !== 3600000 || wordsNow() !== "60 minutes") throw new Error(`m=99: ${wordsNow()}`);
      location.hash = "#wait?m=0";
      await pause(100);
    }),
    expect: inPage(() => saved()?.total === 60000 && wordsNow() === "1 minute"),
  },
  {
    name: "#wait?m=soon starts nothing",
    path: "/#wait?m=soon",
    init: BASE,
    expect: IDLE + " && saved() === null",
  },
  {
    name: "I need's go('wait', { m: 2 }) starts it over whatever Wait was doing",
    path: "/#i-need",
    init: BASE + seed(`{ pausedRemaining: 500000, total: 600000 }`),
    stubs: {
      "/js/tools/i-need.js": `export function mount(block, shell) { window.iNeed = shell; return { show() {} }; }`,
    },
    setup: run(() => iNeed.go("wait", { m: 2 })),
    expect: inPage(() => location.hash === "#wait?m=2" && shown(".wait-disc.is-running") && wordsNow() === "2 minutes" &&
      saved()?.pausedRemaining === null),
  },
  {
    name: "a reload doesn't start #wait?m=2 again: the time left carries on",
    path: "/#wait?m=2",
    init: BASE,
    setup: run(async () => {
      await pause(400); // saved (the save waits 200 ms)
      if (!sessionStorage.getItem("firstEnd")) sessionStorage.setItem("firstEnd", String(saved().endAt));
      await pause(700);
      setTimeout(() => location.reload(), 50); // once this setup is over
    }),
    expect: inPage(() => performance.getEntriesByType("navigation")[0]?.type === "reload" &&
      shown(".wait-disc.is-running") && String(saved()?.endAt) === sessionStorage.getItem("firstEnd")),
  },

  // ---------- pausing ----------
  {
    name: "a tap on the disc pauses it: grey, ⏸ Paused, time kept, not busy, screen may sleep",
    path: "/#wait",
    init: BASE + seed(`{ endAt: Date.now() + 100000, total: 120000 }`),
    stubs: UPDATE_STUB,
    setup: LISTEN + run(async () => {
      await pause(200);
      $w(".wait-disc").click();
      await pause(300);
      window.skew = 30000; // a paused wait doesn't count time
      await pause(1200);
    }),
    expect: inPage(() => {
      const s = saved();
      const wedge = getComputedStyle($w(".wait-wedge")).fill;
      return shown(".wait-disc.is-paused") && shown(".wait-mark") && $w(".wait-mark-word").textContent === "Paused" &&
        wedge === "rgb(117, 117, 117)" && s?.endAt === null && s.pausedRemaining > 98000 && s.pausedRemaining <= 100000 &&
        wordsNow() === "2 minutes" && $w(".wait-disc").getAttribute("aria-label") === "Continue the wait" &&
        shown("#clear-all-wrap") && !busy() && awake() === 0 && wakeLog.includes("release") &&
        heard.at(-1) === "Paused";
    }),
  },
  {
    name: "a second tap goes on from the time that was left",
    path: "/#wait",
    init: BASE + seed(`{ pausedRemaining: 70000, total: 120000 }`),
    stubs: UPDATE_STUB,
    setup: LISTEN + run(async () => {
      if (!shown(".wait-disc.is-paused") || busy()) throw new Error("a saved pause did not open paused");
      window.skew = 600000; // ten minutes later
      $w(".wait-disc").click();
    }),
    expect: inPage(() => {
      const s = saved();
      return shown(".wait-disc.is-running") && s?.pausedRemaining === null &&
        Math.abs(s.endAt - (Date.now() + 70000)) < 1500 && wordsNow() === "2 minutes" &&
        $w(".wait-disc").getAttribute("aria-label") === "Pause the wait" && busy() && awake() === 1 &&
        heard.at(-1) === "2 minutes left";
    }),
  },

  // ---------- ✕ ----------
  {
    name: "✕ stops it; Put it back restores the time that was left (not the old end time)",
    path: "/#wait",
    init: BASE + seed(`{ endAt: Date.now() + 90000, total: 120000 }`),
    stubs: UPDATE_STUB,
    setup: run(async () => {
      await pause(200);
      document.getElementById("clear-all").click();
      if (document.getElementById("toast-text").textContent !== "Wait stopped") throw new Error("no toast");
      if (shown(".wait-face") || !shown(".wait-pick") || shown("#clear-all-wrap")) throw new Error("not stopped");
      if (busy() || awake() !== 0) throw new Error("still busy or awake");
      await pause(300);
      if (saved().endAt !== null) throw new Error("not saved stopped");
      window.skew = 20000; // the toast was up a while
      document.getElementById("toast-undo").click();
    }),
    expect: inPage(() => {
      const s = saved();
      return shown(".wait-disc.is-running") && Math.abs(s?.endAt - (Date.now() + 89500)) < 1500 &&
        s.total === 120000 && shown("#clear-all-wrap") && busy() && awake() === 1;
    }),
  },
  {
    name: "✕ on a paused wait, then Put it back: paused again, the same time left",
    path: "/#wait",
    init: BASE + seed(`{ pausedRemaining: 42000, total: 300000 }`),
    setup: run(() => {
      document.getElementById("clear-all").click();
      document.getElementById("toast-undo").click();
    }),
    expect: inPage(() => shown(".wait-disc.is-paused") && saved()?.pausedRemaining === 42000 &&
      wordsNow() === "50 seconds" && shown("#clear-all-wrap")),
  },

  // ---------- the end ----------
  {
    name: "the end, on screen, sound on: green ✔ Done, said once, one chime, a buzz; the buttons again; no ✕",
    path: "/#wait",
    init: BASE + seed(`{ endAt: Date.now() + 1800, total: 60000, sound: true }`),
    stubs: UPDATE_STUB,
    // two taps (pause, go on) — the taps that let sound start on an iPhone
    setup: LISTEN + run(() => {
      $w(".wait-disc").click();
      $w(".wait-disc").click();
    }),
    expect: inPage(() => shown(".wait-disc.is-done") && $w(".wait-mark-word").textContent === "Done" &&
      shown(".wait-icon-tick") && !shown(".wait-words") && shown(".wait-pick") && shown(".wait-sound") &&
      !shown("#clear-all-wrap") && heard.filter((h) => h === "Done").length === 1 && heard.at(-1) === "Done" &&
      $w(".wait-disc").getAttribute("aria-disabled") === "true" && $w(".wait-disc").getAttribute("aria-label") === "Done" &&
      sounds.contexts === 1 && sounds.notes.join() === "784,1568" && buzzes.join() === "200" &&
      !busy() && awake() === 0),
  },
  {
    name: "the end with sound off (the default): no audio at all, still a buzz; the disc does nothing when Done",
    path: "/#wait",
    init: BASE + seed(`{ endAt: Date.now() + 1500, total: 60000 }`),
    setup: run(async () => {
      $w(".wait-disc").click();
      $w(".wait-disc").click();
      await pause(2000);
      $w(".wait-disc").click(); // Done: nothing to pause
    }),
    expect: inPage(() => shown(".wait-disc.is-done") && sounds.contexts === 0 && buzzes.join() === "200" &&
      saved()?.pausedRemaining === null),
  },
  {
    name: "reopened after it ended: Done without chime or buzz; leaving puts Done away",
    path: "/#wait",
    init: BASE + seed(`{ endAt: Date.now() - 300000, total: 600000, sound: true }`),
    stubs: UPDATE_STUB,
    setup: LISTEN + run(async () => {
      await pause(300);
      if (!shown(".wait-disc.is-done")) throw new Error("no Done");
      if (buzzes.length || sounds.notes.length) throw new Error("it buzzed or chimed for an old end");
      if (!heard.includes("Done")) throw new Error("Done was not said");
      document.getElementById("to-menu").click();
      await pause(300);
      location.hash = "#wait";
      await pause(100);
    }),
    expect: IDLE + " && saved()?.endAt === null && saved().total === null && saved().sound === true",
  },
  {
    name: "a Done older than an hour opens on the buttons",
    path: "/#wait",
    init: BASE + seed(`{ endAt: Date.now() - 2 * 3600000, total: 300000 }`),
    expect: IDLE + " && saved()?.endAt === null",
  },

  // ---------- reopening ----------
  {
    name: "reopened while running: the right time left, and the disc's share of it",
    path: "/#wait",
    init: BASE + seed(`{ endAt: Date.now() + 150000, total: 300000 }`),
    stubs: UPDATE_STUB,
    expect: inPage(() => {
      // half left: the wedge from about 6 o'clock round to 12
      const [, x, y] = $w(".wait-wedge").getAttribute("d").match(/^M100 100L([\d.]+) ([\d.]+)A96 96 0 0 1 100 4Z$/) ?? [];
      return wordsNow() === "3 minutes" && Math.abs(x - 100) < 3 && Math.abs(y - 196) < 1 && busy() && awake() === 1;
    }),
  },
  {
    name: "leaving while it runs: not busy, may sleep; back again it carries on, busy and awake",
    path: "/#wait",
    init: BASE + seed(`{ endAt: Date.now() + 200000, total: 300000 }`),
    stubs: UPDATE_STUB,
    setup: run(async () => {
      await pause(200);
      document.getElementById("to-menu").click();
      await pause(300);
      if (busy() || awake() !== 0) throw new Error("still busy or awake on the menu");
      if (saved()?.endAt == null) throw new Error("leaving stopped the wait");
      location.hash = "#wait";
    }),
    expect: inPage(() => shown(".wait-disc.is-running") && wordsNow() === "4 minutes" && busy() && awake() === 1 &&
      wakeLog.filter((e) => e === "request").length === 2),
  },
  {
    name: "back to the front: the wake lock is asked for again, and the time catches up",
    path: "/#wait",
    init: BASE + seed(`{ endAt: Date.now() + 200000, total: 300000 }`),
    stubs: UPDATE_STUB,
    setup: run(async () => {
      await pause(200);
      toBack(true);
      window.skew = 100000;
      await pause(200);
      toBack(false);
    }),
    expect: inPage(() => wakeLog.join() === "request,lost,request" && awake() === 1 && wordsNow() === "2 minutes"),
  },

  // ---------- screen readers ----------
  {
    name: "screen readers: the time left at most once a minute, then Done once",
    path: "/#wait",
    init: BASE + seed(`{ endAt: Date.now() + 300000, total: 300000 }`),
    setup: LISTEN + run(async () => {
      await pause(400);
      for (const [skew, words] of [[61000, "4 minutes"], [71000, "4 minutes"], [250000, "50 seconds"], [260000, "40 seconds"]]) {
        window.skew = skew;
        await pause(900);
        if (wordsNow() !== words) throw new Error(`at +${skew / 1000} s: ${wordsNow()}`);
      }
      window.skew = 301000;
      await pause(900);
    }),
    expect: inPage(() => heard.join("|") === "5 minutes left|4 minutes left|50 seconds left|Done" &&
      shown(".wait-disc.is-done")),
  },

  // ---------- reduced motion, pictures only ----------
  {
    name: "reduced motion: no shrinking colour — the number big; the words line for screen readers only",
    path: "/#wait",
    media: [{ name: "prefers-reduced-motion", value: "reduce" }],
    init: BASE + seed(`{ endAt: Date.now() + 200000, total: 300000 }`),
    expect: inPage(() => getComputedStyle($w(".wait-wedge")).display === "none" &&
      $w(".wait-big-number").textContent === "4" && $w(".wait-big-number").getBoundingClientRect().height > 80 &&
      $w(".wait-big-unit").textContent === "minutes" && shown(".wait-big-unit") &&
      tiny(".wait-words") && wordsNow() === "4 minutes" && shown(".wait-disc.is-running")),
  },
  {
    name: "pictures only, waiting: Paused and the pictures' words step aside; the time left stays",
    path: "/#wait",
    init: BASE + `localStorage.setItem("simplify-device-v1", '{"picturesOnly":true}');` +
      seed(`{ pausedRemaining: 90000, total: 120000, waitPics: ${PICS} }`),
    expect: inPage(() => tiny(".wait-mark-word") && shown(".wait-icon-pause") && tiny(".wait-while-label") &&
      $$w(".wait-pic-words").every((w) => w.getBoundingClientRect().width <= 1) && $$w(".wait-pic img").length === 3 &&
      $w(".wait-words").getBoundingClientRect().width > 100 && wordsNow() === "2 minutes"),
  },
  {
    name: "pictures only, idle: the numbers stay, the sound's words go, the adult's ＋ keeps its words",
    path: "/#wait",
    init: BASE + `localStorage.setItem("simplify-device-v1", '{"picturesOnly":true}');` +
      seed(`{ waitPics: [{ picture: "read", words: "Read" }] }`),
    expect: inPage(() => $$w(".wait-min-number").every((n) => n.getBoundingClientRect().width > 10) &&
      tiny(".wait-sound-name") && tiny(".wait-sound-state") && shown(".wait-sound-icon") &&
      $w(".wait-while-add-words").getBoundingClientRect().width > 20 && tiny(".wait-pic-words") &&
      shown(".wait-pic-remove")),
  },

  // ---------- While I wait ----------
  {
    name: "While I wait: ＋ opens the picker; picked pictures join the strip, 3 at most, then ＋ goes",
    path: "/#wait",
    init: BASE,
    setup: run(async () => {
      for (const id of ["read", "music", "draw"]) {
        $w(".wait-while-add").click();
        await pause(50);
        if (document.querySelector(".pp-title").textContent !== "While I wait") throw new Error("the picker's title");
        document.querySelector(`.pp-pic[data-picture="${id}"]`).click();
        document.querySelector(".pp-done").click();
        await pause(100);
      }
    }),
    expect: inPage(() => {
      const pics = saved()?.waitPics ?? [];
      return pics.map((p) => `${p.picture}:${p.words}`).join() === "read:Read,music:Music,draw:Draw" &&
        $$w(".wait-pic").map((li) => li.textContent).join() === "Read✕,Music✕,Draw✕" &&
        $$w(".wait-pic-remove").map((b) => b.getAttribute("aria-label")).join() === "Remove: Read,Remove: Music,Remove: Draw" &&
        !shown(".wait-while-add") && shown(".wait-while-label") && !document.querySelector(".picture-picker").open;
    }),
  },
  {
    name: "While I wait: the picker closed with nothing changes nothing",
    path: "/#wait",
    init: BASE,
    setup: run(async () => {
      $w(".wait-while-add").click();
      await pause(50);
      document.querySelector(".pp-close").click();
      await pause(300);
    }),
    expect: inPage(() => $$w(".wait-pic").length === 0 && shown(".wait-while-add") && saved() === null),
  },
  {
    name: "While I wait: ✕ takes a picture off; Put it back returns it to its place",
    path: "/#wait",
    init: BASE + seed(`{ waitPics: ${PICS} }`),
    setup: run(async () => {
      $$w(".wait-pic-remove")[1].click();
      if (document.getElementById("toast-text").textContent !== "Music: removed") throw new Error("no toast");
      if ($$w(".wait-pic").map((li) => li.textContent).join() !== "Read✕,Draw✕") throw new Error("not removed");
      if (document.activeElement !== $w(".wait-while-add")) throw new Error("focus is not on ＋");
      await pause(300);
      if (saved().waitPics.length !== 2) throw new Error("not saved");
      document.getElementById("toast-undo").click();
    }),
    expect: inPage(() => $$w(".wait-pic").map((li) => li.textContent).join() === "Read✕,Music✕,Draw✕" &&
      saved()?.waitPics.map((p) => p.picture).join() === "read,music,draw" && !shown(".wait-while-add")),
  },
  {
    name: "While I wait, during a wait: the pictures to look at, nothing to change",
    path: "/#wait",
    init: BASE + seed(`{ endAt: Date.now() + 200000, total: 300000, waitPics: ${PICS} }`),
    expect: inPage(() => $$w(".wait-pic").length === 3 && $$w(".wait-pic-remove").length === 0 &&
      !shown(".wait-while-add") && shown(".wait-while-label") && !shown(".wait-sound") &&
      $$w(".wait-pic img").every((img) => img.complete && img.naturalWidth > 0)),
  },

  // ---------- sound ----------
  {
    name: "the sound switch: on, with a soft chime from that tap, saved; off again",
    path: "/#wait",
    init: BASE,
    setup: run(async () => {
      $w(".wait-sound").click();
      if ($w(".wait-sound").getAttribute("aria-checked") !== "true" || $w(".wait-sound-icon").textContent !== "🔔") {
        throw new Error("not on");
      }
      if (sounds.contexts !== 1 || sounds.notes.join() !== "784,1568") throw new Error(`sounds: ${JSON.stringify(sounds)}`);
      await pause(300);
      if (saved()?.sound !== true) throw new Error("not saved");
      $w(".wait-sound").click();
    }),
    expect: inPage(() => $w(".wait-sound").getAttribute("aria-checked") === "false" &&
      $w(".wait-sound-state").textContent === "off" && saved()?.sound === false && sounds.notes.length === 2),
  },
];
