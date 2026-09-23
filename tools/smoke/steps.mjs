// Smoke scenes for Steps (public/js/tools/steps.js) — node tools/smoke.mjs steps
//
// Scene code is written as real functions, so Node checks their syntax when
// it loads this file, and sent to the page as source (as in app.mjs): it runs
// there, with the page's globals and the helpers below. A check that fails
// throws with what it found, so the run says why.

const inPage = (fn) => `(${fn})()`; // an expect: its value, awaited
const run = (fn) => `await (${fn})();`; // a setup: run it to the end

const HELPERS = `
  window.shown = (sel) => { const el = document.querySelector(sel); return !!el && el.getClientRects().length > 0; };
  window.pause = (ms) => new Promise((r) => setTimeout(r, ms));
  window.q = (sel) => document.querySelector("#tool-steps " + sel);
  // the words on screen as they are read: a line break is a space
  window.words = () => [...q(".steps-words").childNodes]
    .map((n) => (n.nodeName === "BR" ? " " : n.textContent)).join("");
  // the dots: x done, O the step on screen, . still to come
  window.dots = () => [...document.querySelectorAll("#tool-steps .steps-dot")]
    .map((d) => (d.classList.contains("is-now") ? "O" : d.classList.contains("is-done") ? "x" : ".")).join("");
  window.away = (el) => getComputedStyle(el).visibility === "hidden";
  // the picture on screen is this file, loaded and drawn
  window.pictureIs = (file) => {
    const img = q(".steps-picture img");
    return img.getAttribute("src") === "/img/pic/" + file + ".svg" && img.complete && img.naturalWidth > 0;
  };
  window.saved = () => JSON.parse(localStorage.getItem("simplify-steps-v1") ?? "null");
  // Next, then long enough that the next tap isn't taken for a double tap
  window.tapNext = async () => { q(".steps-next").click(); await pause(400); };
  // a control's name as a screen reader gets it here: its words, without the aria-hidden glyphs
  window.nameOf = (el) => el.getAttribute("aria-label") ?? [...el.childNodes]
    .filter((n) => !(n.nodeType === 1 && n.getAttribute("aria-hidden") === "true"))
    .map((n) => n.textContent).join("").trim();
  window.fail = (what, got) => { throw new Error(what + ": " + JSON.stringify(got)); };
  window.reloaded = () => performance.getEntriesByType("navigation")[0]?.type === "reload";
`;

// Saved state for a scene, written once per tab: a reload must find what the
// app saved, not the seed again.
const once = (key, value) => `
  if (!sessionStorage.getItem("seeded ${key}")) {
    localStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(JSON.stringify(value))});
    sessionStorage.setItem("seeded ${key}", "1");
  }
`;
// Progress as the app saves it: each deck's step, and when it was last
// touched — `ago` ms before the page loads (a deck left alone 30 minutes
// starts again), stamped in the page, so a slow run can't age it.
const progress = (at, ago = 0) => `
  if (!sessionStorage.getItem("seeded simplify-steps-v1")) {
    const at = ${JSON.stringify(at)}, when = Date.now() - ${ago};
    localStorage.setItem("simplify-steps-v1",
      JSON.stringify({ at, touched: Object.fromEntries(Object.keys(at).map((id) => [id, when])) }));
    sessionStorage.setItem("seeded simplify-steps-v1", "1");
  }
`;
const MIN = 60 * 1000;
const device = (settings) => once("simplify-device-v1", settings);
const FEWER = (...ids) => device({ tools: { steps: { fewer: ids } } });
const PICTURES_ONLY = device({ picturesOnly: true });

// Press and hold "Hold to open set-up" the way a finger does (as in app.mjs).
const HOLD = run(async () => {
  const btn = document.querySelector("#tool-setup .hold-btn");
  const finger = { bubbles: true, pointerId: 7, button: 0, isPrimary: true, pointerType: "touch" };
  btn.dispatchEvent(new PointerEvent("pointerdown", finger));
  await pause(1700);
  btn.dispatchEvent(new PointerEvent("pointerup", finger));
  await pause(600);
  if (!shown("#tool-setup .setup-settings")) throw new Error("the hold did not open the settings");
});

// Every screen of every deck, from All done back to the first step (Back has
// no double-tap guard, so this needs no pauses): where Next (or Choose
// another), Back and the words sit on each, and whether all of it is on
// screen without scrolling.
const WALK_ALL = run(async () => {
  const rect = (el) => {
    const b = el.getBoundingClientRect();
    return [b.left, b.top, b.width, b.height].map(Math.round).join();
  };
  window.walked = [];
  for (const [id, count] of [["wash-hands", 7], ["return-tray", 7], ["pay-card", 6]]) {
    location.hash = `#steps?deck=${id}`;
    await pause(150);
    q(".steps-next").click(); // the deck's last step (the seed) → All done
    for (let i = 0; i <= count; i++) {
      const done = shown("#tool-steps .steps-another");
      const nav = q(".steps-nav").getBoundingClientRect();
      walked.push({
        id, words: words(), done,
        main: rect(done ? q(".steps-another") : q(".steps-next")),
        back: rect(q(".steps-back")),
        box: rect(q(".steps-words-box")),
        fits: nav.bottom <= innerHeight && scrollY === 0,
        overflow: q(".steps-words-box").scrollHeight > q(".steps-words-box").clientHeight + 1,
      });
      q(".steps-back").click();
    }
  }
});
const AT_LAST_STEPS = progress({ "wash-hands": 6, "return-tray": 6, "pay-card": 5 });
const WALKED_STILL = inPage(() => {
  if (walked.length !== 8 + 8 + 7) fail("screens walked", walked.length);
  const [first] = walked;
  // pictures only: the words' room is empty but on the Can I buy? step, which
  // takes its room from the picture — only the buttons have to stay put
  const words = !document.documentElement.hasAttribute("data-pictures-only");
  for (const w of walked) {
    if (w.main !== first.main) fail(`Next / Choose another moved on "${w.words}"`, [w.main, first.main]);
    if (w.back !== first.back) fail(`Back moved on "${w.words}"`, [w.back, first.back]);
    if (words && w.box !== first.box) fail(`the words' room moved or grew on "${w.words}"`, [w.box, first.box]);
    if (!w.fits) fail(`the buttons are off the screen on "${w.words}"`, w);
    if (w.overflow) fail(`the words overflow on "${w.words}"`, w);
  }
  if (walked.filter((w) => w.done).length !== 3) fail("All done screens", walked.filter((w) => w.done).length);
  return true;
});

const IPAD = { width: 768, height: 1024 };
const SMALL = { width: 360, height: 640 };
const TINY = { width: 320, height: 568 };

export default [
  // ---------- the chooser ----------
  {
    name: "chooser: a big button per deck, its picture and name; no ✕",
    path: "/",
    init: HELPERS,
    setup: run(async () => {
      document.querySelector('#menu a[href="#steps"]').click();
      await pause(100);
    }),
    expect: inPage(() => {
      const buttons = [...document.querySelectorAll("#tool-steps .steps-choose")];
      if (buttons.map(nameOf).join("|") !== "Wash hands|Return the tray|Pay by card") fail("names", buttons.map(nameOf));
      if (buttons.map((b) => b.dataset.deck).join() !== "wash-hands,return-tray,pay-card") fail("decks", "");
      if (buttons.some((b) => b.getBoundingClientRect().height < 96)) fail("a button under 96px", "");
      if (!buttons.every((b) => { const img = b.querySelector("img"); return img.complete && img.naturalWidth > 0 && img.alt === ""; })) {
        fail("pictures", buttons.map((b) => b.querySelector("img").getAttribute("src")));
      }
      return location.hash === "#steps" && shown("#tool-steps .steps-chooser") && !shown("#tool-steps .steps-deck") &&
        !shown("#clear-all-wrap") && document.getElementById("screen-title").textContent === "Steps" &&
        document.activeElement === document.getElementById("screen-title");
    }),
  },
  {
    name: "chooser → a deck: its own address, the first step, Back out of sight, no ✕",
    path: "/#steps",
    init: HELPERS,
    setup: run(async () => {
      q('.steps-choose[data-deck="wash-hands"]').click();
      await pause(100);
    }),
    expect: inPage(() => location.hash === "#steps?deck=wash-hands" && shown("#tool-steps .steps-deck") &&
      !shown("#tool-steps .steps-chooser") && words() === "Turn on the tap" && pictureIs("tap-water") &&
      dots() === "O......" && away(q(".steps-back")) && shown("#tool-steps .steps-next") &&
      !shown("#tool-steps .steps-another") && !shown("#tool-steps .steps-open") && !shown("#clear-all-wrap") &&
      q(".steps-progress .visually-hidden").textContent === "Wash hands: step 1 of 7" &&
      q(".steps-deck").getAttribute("aria-label") === "Wash hands" &&
      document.activeElement === document.getElementById("screen-title")),
  },
  {
    name: "an address that isn't a deck (#steps?deck=toString, =nope) shows the chooser",
    path: "/#steps?deck=toString",
    init: HELPERS,
    setup: run(async () => {
      if (!shown("#tool-steps .steps-chooser")) throw new Error("toString did not show the chooser");
      location.hash = "#steps?deck=nope";
      await pause(100);
    }),
    expect: inPage(() => shown("#tool-steps .steps-chooser") && !shown("#tool-steps .steps-deck")),
  },

  // ---------- Next and Back ----------
  {
    name: "Next: the next step, read out, saved; the ✕ appears, and Back",
    path: "/#steps?deck=wash-hands",
    init: HELPERS,
    setup: run(() => tapNext()),
    expect: inPage(() => words() === "Wet your hands" && pictureIs("wash-hands") && dots() === "xO....." &&
      q('[role="status"]').textContent === "Step 2 of 7: Wet your hands" && shown("#clear-all-wrap") &&
      !away(q(".steps-back")) && saved()?.at["wash-hands"] === 1),
  },
  {
    name: "a quick second tap on Next is the same tap, not a skipped step",
    path: "/#steps?deck=wash-hands",
    init: HELPERS,
    setup: run(async () => {
      q(".steps-next").click();
      q(".steps-next").click();
      await pause(50);
      window.afterDouble = words();
      await pause(400);
      q(".steps-next").click();
    }),
    expect: inPage(() => afterDouble === "Wet your hands" && words() === "Put on soap"),
  },
  {
    name: "Back: the step before, read out; on the second step focus moves to Next and the ✕ goes",
    path: "/#steps?deck=return-tray",
    init: HELPERS + progress({ "return-tray": 2 }),
    setup: run(async () => {
      if (words() !== "Carry the tray with two hands") fail("start", words());
      q(".steps-back").click();
      if (words() !== "Put tissues and bones on the tray") fail("one back", words());
      await pause(200);
      if (q('[role="status"]').textContent !== "Step 2 of 7: Put tissues and bones on the tray") {
        fail("read out", q('[role="status"]').textContent);
      }
      q(".steps-back").focus();
      q(".steps-back").click();
    }),
    expect: inPage(() => words() === "Finish your food" && dots() === "O......" && away(q(".steps-back")) &&
      document.activeElement === q(".steps-next") && !shown("#clear-all-wrap") &&
      q('[role="status"]').textContent === "Step 1 of 7: Finish your food"),
  },
  {
    name: "Next and Back stay put on every screen of every deck, all on screen (phone)",
    path: "/#steps",
    init: HELPERS + AT_LAST_STEPS,
    setup: WALK_ALL,
    expect: WALKED_STILL,
  },
  {
    name: "Next and Back stay put on every screen of every deck, all on screen (iPad)",
    path: "/#steps",
    viewport: IPAD,
    init: HELPERS + AT_LAST_STEPS,
    setup: WALK_ALL,
    expect: WALKED_STILL,
  },
  {
    name: "Next and Back stay put on every screen, all on screen (a 360 × 640 phone)",
    path: "/#steps",
    viewport: SMALL,
    init: HELPERS + AT_LAST_STEPS,
    setup: WALK_ALL,
    expect: WALKED_STILL,
  },
  {
    name: "Next and Back stay put, the words fit their room (a 320 × 568 phone)",
    path: "/#steps",
    viewport: TINY,
    init: HELPERS + AT_LAST_STEPS,
    setup: WALK_ALL,
    expect: WALKED_STILL,
  },
  {
    name: "Next and Back stay put on every screen (pictures only, 360 × 640)",
    path: "/#steps",
    viewport: SMALL,
    init: HELPERS + AT_LAST_STEPS + PICTURES_ONLY,
    setup: WALK_ALL,
    expect: WALKED_STILL,
  },

  // ---------- All done ----------
  {
    name: "All done: the ✔ and the end line, Choose another in Next's place; a tap right away is ignored",
    path: "/",
    init: HELPERS,
    setup: run(async () => {
      document.querySelector('#menu a[href="#steps"]').click();
      await pause(100);
      q('.steps-choose[data-deck="pay-card"]').click();
      await pause(100);
      for (let i = 0; i < 6; i++) {
        q(".steps-next").focus();
        await tapNext();
      }
      if (words() !== "All done. You paid.") fail("words", words());
      if (!pictureIs("all-done")) fail("picture", q(".steps-picture img").getAttribute("src"));
      if (dots() !== "xxxxxx") fail("dots", dots());
      if (getComputedStyle(q(".steps-words")).color !== "rgb(27, 94, 32)") fail("colour", getComputedStyle(q(".steps-words")).color);
      if (shown("#tool-steps .steps-next") || away(q(".steps-back"))) fail("Next gone, Back there", "");
      if (document.activeElement !== q(".steps-another")) fail("focus", document.activeElement?.className);
      if (nameOf(q(".steps-another")) !== "Choose another") fail("name", nameOf(q(".steps-another")));
      if (q('[role="status"]').textContent !== "All done. You paid.") fail("read out", q('[role="status"]').textContent);
      q(".steps-another").click(); // 400 ms after All done came up: meant for Next
      await pause(50);
      if (!shown("#tool-steps .steps-deck")) fail("left the deck on a tap meant for Next", location.hash);
      await pause(500);
      q(".steps-another").click();
      await pause(300);
    }),
    // back the way it came: the chooser's own step, not a new one after the deck
    expect: inPage(() => location.hash === "#steps" && shown("#tool-steps .steps-chooser") &&
      navigation.currentEntry.index === 1),
  },
  {
    name: "Choose another from a deck opened by a shared link: the chooser, as a new step",
    path: "/#steps?deck=pay-card",
    init: HELPERS + progress({ "pay-card": 5 }),
    setup: run(async () => {
      await tapNext();
      await pause(500);
      q(".steps-another").click();
      await pause(300);
    }),
    expect: inPage(() => location.hash === "#steps" && shown("#tool-steps .steps-chooser") &&
      navigation.currentEntry.index === 1),
  },
  {
    name: "Back from All done: the last step again, Next back in its place",
    path: "/#steps?deck=wash-hands",
    init: HELPERS + progress({ "wash-hands": 6 }),
    setup: run(async () => {
      await tapNext();
      if (!shown("#tool-steps .steps-another")) fail("not All done", words());
      q(".steps-back").click();
    }),
    expect: inPage(() => words() === "Dry your hands" && dots() === "xxxxxxO" && shown("#tool-steps .steps-next") &&
      !shown("#tool-steps .steps-another")),
  },
  {
    name: "a deck left on All done starts again when it is opened anew",
    path: "/#steps",
    init: HELPERS + progress({ "wash-hands": 7 }),
    setup: run(async () => {
      q('.steps-choose[data-deck="wash-hands"]').click();
      await pause(400);
    }),
    expect: inPage(() => words() === "Turn on the tap" && dots() === "O......" && saved()?.at["wash-hands"] === 0 &&
      !shown("#clear-all-wrap")),
  },

  // ---------- saved progress ----------
  {
    name: "a reload finds the same step",
    path: "/#steps?deck=return-tray",
    init: HELPERS,
    setup: run(async () => {
      for (let i = 0; i < 3; i++) await tapNext();
      setTimeout(() => location.reload(), 50); // once this setup is over
    }),
    expect: inPage(() => reloaded() && words() === "Find the tray return" && dots() === "xxxO..." &&
      shown("#clear-all-wrap")),
  },
  {
    name: "a reload on All done stays on All done",
    path: "/#steps?deck=wash-hands",
    init: HELPERS + progress({ "wash-hands": 6 }),
    setup: run(async () => {
      await tapNext();
      setTimeout(() => location.reload(), 50);
    }),
    expect: inPage(() => reloaded() && words() === "All done. Your hands are clean." &&
      shown("#tool-steps .steps-another")),
  },
  {
    name: "the steps' own pictures load: tap off, the halal side, the reader's tick",
    path: "/#steps?deck=wash-hands",
    init: HELPERS + progress({ "wash-hands": 5, "return-tray": 4, "pay-card": 3 }),
    setup: run(async () => {
      await pause(200);
      if (!pictureIs("tap-off")) fail("Turn off the tap", q(".steps-picture img").getAttribute("src"));
      location.hash = "#steps?deck=return-tray";
      await pause(300);
      if (words() !== "Halal tray? Use the halal side" || !pictureIs("tray-return-halal")) fail("halal", words());
      location.hash = "#steps?deck=pay-card";
      await pause(300);
    }),
    expect: inPage(() => words() === "Wait for the beep or the green tick" && pictureIs("reader-tick")),
  },
  {
    name: "a shared iPad: decks left alone for 30 minutes open at step 1, the time saved again",
    path: "/#steps?deck=wash-hands",
    init: HELPERS + progress({ "wash-hands": 3, "return-tray": 2 }, 31 * MIN),
    setup: run(async () => {
      await pause(300); // saving waits 200 ms
      if (words() !== "Turn on the tap" || dots() !== "O......") fail("wash-hands", [words(), dots()]);
      if (shown("#clear-all-wrap")) fail("the ✕ on step 1", true);
      const s = saved();
      if (s?.at["wash-hands"] !== 0 || !(Date.now() - s.touched["wash-hands"] < 60000)) fail("saved", s);
      location.hash = "#steps?deck=return-tray";
      await pause(300);
    }),
    expect: inPage(() => words() === "Finish your food" && dots() === "O......" && saved()?.at["return-tray"] === 0),
  },
  {
    name: "a deck left alone for 29 minutes keeps its step",
    path: "/#steps?deck=wash-hands",
    init: HELPERS + progress({ "wash-hands": 3 }, 29 * MIN),
    expect: inPage(() => words() === "Rub for 20 seconds" && dots() === "xxxO..." && shown("#clear-all-wrap")),
  },
  {
    name: "progress saved with no time (an older version): step 1",
    path: "/#steps?deck=wash-hands",
    init: HELPERS + once("simplify-steps-v1", { at: { "wash-hands": 3 } }),
    setup: run(() => pause(300)),
    expect: inPage(() => words() === "Turn on the tap" && saved()?.at["wash-hands"] === 0 &&
      typeof saved()?.touched["wash-hands"] === "number"),
  },
  {
    name: "the iPad woken with a deck on screen: after 5 minutes the same step, after 31 step 1",
    path: "/#steps?deck=wash-hands",
    init: HELPERS + progress({ "wash-hands": 3 }),
    setup: run(async () => {
      const real = Date.now.bind(Date);
      const wake = async (minutes) => {
        Date.now = () => real() + minutes * 60000;
        document.dispatchEvent(new Event("visibilitychange"));
        await pause(150);
      };
      await wake(5);
      if (words() !== "Rub for 20 seconds") fail("after 5 minutes", words());
      await wake(31);
      Date.now = real;
      await pause(300);
    }),
    expect: inPage(() => words() === "Turn on the tap" && dots() === "O......" && !shown("#clear-all-wrap") &&
      saved()?.at["wash-hands"] === 0),
  },
  {
    name: "🏠 and back into the deck from the chooser: the same step",
    path: "/",
    init: HELPERS,
    setup: run(async () => {
      document.querySelector('#menu a[href="#steps"]').click();
      await pause(100);
      q('.steps-choose[data-deck="wash-hands"]').click();
      await pause(100);
      await tapNext();
      await tapNext();
      document.getElementById("to-menu").click();
      await pause(300);
      if (!shown("#menu")) fail("not at the menu", location.hash);
      document.querySelector('#menu a[href="#steps"]').click();
      await pause(100);
      q('.steps-choose[data-deck="wash-hands"]').click();
      await pause(100);
    }),
    expect: inPage(() => words() === "Put on soap" && dots() === "xxO...."),
  },
  {
    name: "the phone's Back: from a deck to the chooser; Forward: the deck, same step",
    path: "/",
    init: HELPERS,
    setup: run(async () => {
      document.querySelector('#menu a[href="#steps"]').click();
      await pause(100);
      q('.steps-choose[data-deck="return-tray"]').click();
      await pause(100);
      await tapNext();
      history.back();
      await pause(300);
      if (location.hash !== "#steps" || !shown("#tool-steps .steps-chooser")) fail("Back", location.hash);
      history.forward();
      await pause(300);
    }),
    expect: inPage(() => location.hash === "#steps?deck=return-tray" && words() === "Put tissues and bones on the tray"),
  },
  {
    name: "saved progress that is junk: every deck at its first step, no error",
    path: "/#steps?deck=pay-card",
    init: HELPERS + `localStorage.setItem("simplify-steps-v1",
      '{"at":{"wash-hands":"x","pay-card":-4,"return-tray":99,"__proto__":{"a":1}},"extra":true}');`,
    setup: run(async () => {
      if (words() !== "Can I buy it?") fail("pay-card", words());
      location.hash = "#steps?deck=return-tray";
      await pause(100);
      if (words() !== "Finish your food") fail("return-tray (done, opened anew)", words());
      location.hash = "#steps?deck=wash-hands";
      await pause(100);
    }),
    expect: inPage(() => words() === "Turn on the tap"),
  },

  // ---------- the header ✕ ----------
  {
    name: "✕ starts the deck again; Put it back returns to the same step",
    path: "/#steps?deck=wash-hands",
    init: HELPERS + progress({ "wash-hands": 3 }),
    setup: run(async () => {
      if (!shown("#clear-all-wrap")) fail("no ✕ on step 4", "");
      document.getElementById("clear-all").click();
      if (words() !== "Turn on the tap") fail("not step 1", words());
      if (document.getElementById("toast-text").textContent !== "Back to step 1") {
        fail("toast", document.getElementById("toast-text").textContent);
      }
      if (shown("#clear-all-wrap")) fail("the ✕ stayed on step 1", "");
      await pause(300);
      if (saved()?.at["wash-hands"] !== 0) fail("saved", saved());
      document.getElementById("toast-undo").click();
    }),
    expect: inPage(() => words() === "Rub for 20 seconds" && dots() === "xxxO..." && shown("#clear-all-wrap") &&
      saved()?.at["wash-hands"] === 3),
  },
  {
    name: "the undo toast after ✕ doesn't lie over Next (a phone 800px tall or more)",
    path: "/#steps?deck=wash-hands",
    init: HELPERS + progress({ "wash-hands": 3 }),
    setup: run(() => document.getElementById("clear-all").click()),
    expect: inPage(() => shown("#toast") &&
      document.getElementById("toast").getBoundingClientRect().top >= q(".steps-next").getBoundingClientRect().bottom),
  },

  // ---------- Pay by card: Can I buy? ----------
  {
    name: "Pay by card: Can I buy? opens that tool; Back returns to the step, Choose another still to the chooser",
    path: "/",
    init: HELPERS,
    setup: run(async () => {
      document.querySelector('#menu a[href="#steps"]').click();
      await pause(100);
      q('.steps-choose[data-deck="pay-card"]').click();
      await pause(100);
      const open = q(".steps-open");
      if (!shown("#tool-steps .steps-open") || nameOf(open) !== "Can I buy?") fail("the button", nameOf(open));
      if (open.getBoundingClientRect().height < 56) fail("under 56px", open.getBoundingClientRect().height);
      open.click();
      await pause(200);
      if (location.hash !== "#can-i-buy" || !shown("#tool-can-i-buy")) fail("Can I buy? did not open", location.hash);
      history.back();
      await pause(300);
      if (words() !== "Can I buy it?" || dots() !== "O.....") fail("not the same step", [words(), dots()]);
      for (let i = 0; i < 6; i++) await tapNext();
      await pause(500);
      q(".steps-another").click();
      await pause(300);
    }),
    expect: inPage(() => location.hash === "#steps" && shown("#tool-steps .steps-chooser") &&
      navigation.currentEntry.index === 1),
  },

  // ---------- Fewer steps ----------
  {
    name: "Fewer steps: only the core steps — Pay by card starts at the price, with no Can I buy?",
    path: "/#steps?deck=pay-card",
    init: HELPERS + FEWER("pay-card", "wash-hands"),
    setup: run(async () => {
      if (words() !== "Look at the price on the screen" || dots() !== "O...") fail("first", [words(), dots()]);
      if (shown("#tool-steps .steps-open")) fail("Can I buy? shows", "");
      for (let i = 0; i < 3; i++) await tapNext();
    }),
    expect: inPage(() => words() === "Take your card back" && dots() === "xxxO" && pictureIs("bank-card")),
  },
  {
    name: "Fewer steps turned on mid-deck: the same place in the routine, one dot fewer",
    path: "/#steps?deck=wash-hands",
    init: HELPERS + progress({ "wash-hands": 5 }),
    setup: run(async () => {
      if (words() !== "Turn off the tap" || dots() !== "xxxxxO.") fail("before", [words(), dots()]);
      const { setToolSettings } = await import("/js/device.js");
      setToolSettings("steps", { fewer: ["wash-hands"] });
    }),
    expect: inPage(() => words() === "Dry your hands" && dots() === "xxxxxO" && shown("#clear-all-wrap")),
  },

  // ---------- pictures only ----------
  {
    name: "pictures only: no words on show, every control keeps its name, the picture takes the words' room",
    path: "/#steps?deck=wash-hands",
    init: HELPERS + PICTURES_ONLY + progress({ "wash-hands": 3 }),
    expect: inPage(() => {
      const hidden = (el) => el.getBoundingClientRect().width <= 1;
      if (!hidden(q(".steps-words")) || words() !== "Rub for 20 seconds") fail("words", words());
      if (nameOf(q(".steps-next")) !== "Next" || nameOf(q(".steps-back")) !== "Back") fail("names", "");
      if (!hidden(q(".steps-next .pic-words")) || hidden(q(".steps-next .steps-glyph"))) fail("Next shows ▶ only", "");
      const pic = q(".steps-picture").getBoundingClientRect().height;
      if (pic < 330) fail("picture height", pic);
      return pictureIs("rub-hands");
    }),
  },
  {
    name: "pictures only: the chooser's pictures, bigger, the names kept for screen readers",
    path: "/#steps",
    init: HELPERS + PICTURES_ONLY,
    expect: inPage(() => [...document.querySelectorAll("#tool-steps .steps-choose")].every((b) =>
      b.querySelector(".steps-choose-name").getBoundingClientRect().width <= 1 && nameOf(b).length > 0 &&
      b.querySelector("img").getBoundingClientRect().width === 88)),
  },
  {
    name: "pictures only: Can I buy? shows its 🛒, and Choose another its footprints",
    path: "/#steps?deck=pay-card",
    init: HELPERS + PICTURES_ONLY + progress({ "pay-card": 0 }),
    setup: run(async () => {
      const open = q(".steps-open");
      if (!shown("#tool-steps .steps-open") || open.querySelector(".steps-glyph").textContent !== "🛒" ||
        open.querySelector(".pic-words").getBoundingClientRect().width > 1 || nameOf(open) !== "Can I buy?") {
        fail("Can I buy?", nameOf(open));
      }
      for (let i = 0; i < 6; i++) await tapNext();
    }),
    expect: inPage(() => {
      const another = q(".steps-another");
      const img = another.querySelector("img");
      return shown("#tool-steps .steps-another") && img.complete && img.naturalWidth > 0 &&
        img.getAttribute("src") === "/img/pic/menu-steps.svg" && nameOf(another) === "Choose another";
    }),
  },

  // ---------- reduced motion ----------
  {
    name: "reduced motion: the same steps, nothing animated",
    path: "/#steps?deck=wash-hands",
    media: [{ name: "prefers-reduced-motion", value: "reduce" }],
    init: HELPERS,
    setup: run(() => tapNext()),
    expect: inPage(() => words() === "Wet your hands" && [".steps-next", ".steps-back", ".steps-picture img", ".steps-dot"]
      .every((sel) => {
        const style = getComputedStyle(q(sel));
        return style.transitionDuration === "0s" && style.animationName === "none";
      })),
  },

  // ---------- the set-up page ----------
  {
    name: "set-up: Fewer steps per deck, saved per device, Put it back; the deck follows",
    path: "/#setup",
    init: HELPERS,
    setup: HOLD + run(async () => {
      const heading = document.getElementById("setup-steps-h");
      if (!heading || heading.textContent.trim() !== "Steps") fail("section heading", heading?.textContent);
      const sw = (id) => document.querySelector(`#tool-setup .steps-setup .setup-switch[data-deck="${id}"]`);
      const all = [...document.querySelectorAll("#tool-setup .steps-setup .setup-switch")];
      if (all.map((s) => s.getAttribute("aria-label")).join("|") !==
        "Wash hands: fewer steps|Return the tray: fewer steps|Pay by card: fewer steps") fail("names", "");
      if (!all.every((s) => s.getAttribute("aria-checked") === "false" && s.getAttribute("role") === "switch")) {
        fail("not all off at first", all.map((s) => s.getAttribute("aria-checked")));
      }
      const leaves = document.getElementById(sw("wash-hands").getAttribute("aria-describedby"));
      if (leaves?.textContent !== "Leaves out: Turn off the tap") fail("described by", leaves?.textContent);
      sw("wash-hands").click();
      const stored = () => JSON.parse(localStorage.getItem("simplify-device-v1")).tools.steps;
      if (sw("wash-hands").getAttribute("aria-checked") !== "true") fail("did not switch on", "");
      if (stored().fewer.join() !== "wash-hands") fail("saved", stored());
      if (document.getElementById("toast-text").textContent !== "Wash hands: fewer steps") {
        fail("toast", document.getElementById("toast-text").textContent);
      }
      document.getElementById("toast-undo").click();
      if (sw("wash-hands").getAttribute("aria-checked") !== "false") fail("Put it back", "");
      if (JSON.stringify(stored()) !== "{}") fail("put back", stored());
      sw("pay-card").click();
      location.hash = "#steps?deck=pay-card";
      await pause(100);
    }),
    expect: inPage(() => words() === "Look at the price on the screen" && dots() === "O..."),
  },
];
