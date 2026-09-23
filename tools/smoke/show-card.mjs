// Smoke scenes for Show a card (#show-card, js/tools/show-card.js) and its
// section on the set-up page — node tools/smoke.mjs show-card
//
// Scene code is written as real functions and sent to the page as source, as
// in app.mjs: it runs there, with the page's globals and the helpers below.

const inPage = (fn) => `(${fn})()`;
const run = (fn) => `await (${fn})();`;

// card(id), sw(id): a card on the screen, its switch on the set-up page
// seen(el): on screen and not made invisible (a switched-off card keeps its box)
// toast(): the toast's words, or null; saved(): this tool's settings as stored
// lines(): the lines under the open card's words; LABELS: the cards' labels, in order
const HELPERS = `
  window.shown = (sel) => { const el = document.querySelector(sel); return !!el && el.getClientRects().length > 0; };
  window.seen = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility === "visible";
  window.pause = (ms) => new Promise((r) => setTimeout(r, ms));
  window.card = (id) => document.querySelector('#tool-show-card .sc-card[data-card="' + id + '"]');
  window.sw = (id) => document.querySelector('#tool-setup .setup-switch[data-card="' + id + '"]');
  window.toast = () => shown("#toast") ? document.getElementById("toast-text").textContent : null;
  window.saved = () => JSON.parse(localStorage.getItem("simplify-device-v1") ?? "{}").tools?.["show-card"] ?? null;
  window.lines = () => [...document.querySelectorAll(".card-sheet .card-lines p")].map((p) => p.textContent);
  window.sheet = () => document.querySelector(".card-sheet");
  window.LABELS = "Seat, please|My stop|I cannot talk|Be patient with me|Give us space|Thank you";
`;

// A stand-in for the device's speech (headless Chrome has no voices) that
// writes down what it was asked to say — said(): without the cancels.
const fakeSpeech = `
  window.spoken = [];
  window.said = () => window.spoken.filter((s) => s !== "cancel");
  const synth = new EventTarget();
  Object.assign(synth, {
    paused: false,
    getVoices: () => [{ name: "Singapore", lang: "en-SG", localService: true }],
    speak(u) { window.spoken.push({ text: u.text, lang: u.lang }); setTimeout(() => u.onend?.(), 0); },
    cancel() { window.spoken.push("cancel"); },
    resume() {},
  });
  Object.defineProperty(window, "speechSynthesis", { configurable: true, get: () => synth });
  window.SpeechSynthesisUtterance = class {
    constructor(text) { this.text = text; this.lang = ""; this.voice = null; this.rate = 1; }
  };
`;

// this device's settings before the app starts: the whole device, or only
// this tool's own (the set-up page's section)
const device = (settings) => `localStorage.setItem("simplify-device-v1", ${JSON.stringify(JSON.stringify(settings))});`;
const cardSettings = (settings, rest = {}) => device({ ...rest, tools: { "show-card": settings } });

// Press and hold "Hold to open set-up" as a finger does, then lift it; the
// settings ignore a tap for a moment after the lift, so wait that out.
const HOLD = run(async () => {
  const btn = document.querySelector("#tool-setup .hold-btn");
  const finger = { bubbles: true, pointerId: 7, button: 0, isPrimary: true, pointerType: "touch" };
  btn.dispatchEvent(new PointerEvent("pointerdown", finger));
  await pause(1700);
  btn.dispatchEvent(new PointerEvent("pointerup", finger));
  await pause(600);
  if (!shown("#tool-setup .sc-setup")) throw new Error("the hold did not open the settings, or no Show a card section");
});

const IPAD = { width: 768, height: 1024 };

export default [
  // ---------- the screen ----------
  {
    name: "six cards in their places: two columns, a picture and a label each, all on one phone screen",
    path: "/#show-card",
    init: HELPERS,
    expect: inPage(() => {
      const cards = [...document.querySelectorAll("#tool-show-card .sc-card")];
      const box = cards.map((c) => c.getBoundingClientRect());
      const left = (b) => Math.round(b.left);
      return cards.map((c) => c.textContent.trim()).join("|") === LABELS &&
        cards.every((c) => c.querySelector("img")?.complete && c.querySelector("img").naturalWidth > 0 &&
          c.querySelector("img").alt === "" && c.type === "button") &&
        box.every((b) => b.height >= 150 && b.width >= 140) &&
        left(box[0]) === left(box[2]) && left(box[2]) === left(box[4]) && left(box[1]) === left(box[5]) &&
        left(box[0]) < left(box[1]) && Math.round(box[0].top) === Math.round(box[1].top) &&
        box[2].top > box[0].bottom && box[4].top > box[2].bottom && box[5].bottom <= innerHeight &&
        document.querySelector("#tool-show-card .sc-cards").getAttribute("role") === "list" &&
        !shown("#tool-show-card .sc-none") && !shown("#clear-all-wrap") && !shown("#result") &&
        document.activeElement === document.getElementById("screen-title");
    }),
  },
  {
    name: "a tap: the card over the whole screen — LTA's words, its picture, Turn around, Speak; nothing said",
    path: "/#show-card",
    init: HELPERS + fakeSpeech,
    setup: run(async () => {
      card("seat").click();
      await pause(100);
    }),
    expect: inPage(() => {
      const img = sheet().querySelector(".card-picture img");
      const words = sheet().querySelector(".card-words");
      const r = sheet().getBoundingClientRect();
      return sheet().open && words.textContent === "May I have a seat please?" && lines().length === 0 &&
        parseFloat(getComputedStyle(words).fontSize) >= 48 && img?.getAttribute("src") === "/img/pic/seat.svg" &&
        r.width === innerWidth && r.height === innerHeight &&
        shown('.card-btn[aria-label^="Turn around"]') && shown('.card-btn[aria-label^="Speak"]') &&
        said().length === 0;
    }),
  },
  {
    name: "Speak says the card — its words and its line — only when tapped",
    path: "/#show-card",
    init: HELPERS + fakeSpeech + cardSettings({ stop: "Bishan Interchange" }),
    setup: run(async () => {
      card("bell").click();
      await pause(300);
      if (said().length) throw new Error("it spoke before Speak was tapped");
      document.querySelector('.card-btn[aria-label^="Speak"]').click();
    }),
    expect: inPage(() => said().map((s) => s.text).join(" | ") ===
        "Please alert me when I am approaching my stop. | My stop: Bishan Interchange" &&
      lines().join() === "My stop: Bishan Interchange"),
  },
  {
    name: "My stop with no stop set up: LTA's words alone, no empty line",
    path: "/#show-card",
    init: HELPERS,
    setup: run(() => card("bell").click()),
    expect: inPage(() => sheet().open &&
      sheet().querySelector(".card-words").textContent === "Please alert me when I am approaching my stop." &&
      lines().length === 0 && sheet().querySelector(".card-picture img")?.getAttribute("src") === "/img/pic/bell.svg"),
  },
  {
    name: "Be patient with me: no second line unless one is chosen",
    path: "/#show-card",
    init: HELPERS,
    setup: run(() => card("please").click()),
    expect: inPage(() => sheet().querySelector(".card-words").textContent === "Please be patient with me." &&
      lines().length === 0 && !/autis|disab/i.test(sheet().textContent)),
  },
  {
    name: "Be patient with me, with the line the student chose",
    path: "/#show-card",
    init: HELPERS + cardSettings({ disclose: "autistic" }),
    setup: run(() => card("please").click()),
    expect: inPage(() => sheet().querySelector(".card-words").textContent === "Please be patient with me." &&
      lines().join() === "I am autistic."),
  },
  {
    name: "the other cards say their words exactly",
    path: "/#show-card",
    init: HELPERS + cardSettings({ stop: "Bishan", disclose: "hidden-disability" }),
    setup: run(async () => {
      window.got = [];
      for (const id of ["cannot-talk", "space", "thank-you"]) {
        card(id).click();
        await pause(50);
        got.push(`${sheet().querySelector(".card-words").textContent} [${lines().join()}]`);
        document.querySelector('.card-btn[aria-label="Close the card"]').click();
        await pause(50);
      }
    }),
    expect: inPage(() => got.join(" | ") === "I cannot talk now. I can point or type. [] | " +
      "My child is overwhelmed. Please give us some space. We are OK. [] | " +
      "Your care is greatly appreciated. Thank you! []" && !sheet().open),
  },
  {
    name: "Turn around turns the card for the person opposite; ✕ closes it, back on the card that opened it",
    path: "/#show-card",
    init: HELPERS,
    setup: run(async () => {
      const btn = card("cannot-talk");
      btn.focus(); // as a tap does on Android
      btn.click();
      await pause(50);
      document.querySelector('.card-btn[aria-label^="Turn around"]').click();
      const turned = getComputedStyle(document.querySelector(".card-body")).transform;
      if (!turned.startsWith("matrix(-1")) throw new Error(`the card did not turn: ${turned}`);
      document.querySelector('.card-btn[aria-label="Close the card"]').click();
      await pause(50);
    }),
    expect: inPage(() => !sheet().open && document.activeElement === card("cannot-talk") && shown("#tool-show-card")),
  },
  {
    name: "a card switched off leaves a gap: the others keep their places, it can't be reached — live",
    path: "/#show-card",
    init: HELPERS,
    setup: run(async () => {
      const where = () => Object.fromEntries([...document.querySelectorAll("#tool-show-card .sc-card")]
        .map((c) => [c.dataset.card, JSON.stringify(c.getBoundingClientRect())]));
      const before = where();
      const { setToolSettings } = await import("/js/device.js");
      setToolSettings("show-card", { hidden: ["seat", "please"] }); // as the set-up page does
      await pause(50);
      const after = where();
      const moved = Object.keys(before).filter((id) => before[id] !== after[id]);
      if (moved.length) throw new Error(`moved: ${moved.join()}`);
      card("seat").focus();
      window.focusedHidden = document.activeElement === card("seat");
    }),
    expect: inPage(() => !seen(card("seat")) && !seen(card("please")) && seen(card("bell")) &&
      seen(card("thank-you")) && card("seat").closest("li").inert && !window.focusedHidden &&
      !shown("#tool-show-card .sc-none")),
  },
  {
    name: "every card switched off: a line for the adult, not an empty screen",
    path: "/#show-card",
    init: HELPERS + cardSettings({ hidden: ["seat", "bell", "cannot-talk", "please", "space", "thank-you"] }),
    expect: inPage(() => !shown("#tool-show-card .sc-cards") && shown("#tool-show-card .sc-none")),
  },
  {
    name: "settings that are junk fall back: all six cards, no stop line, no second line",
    path: "/#show-card",
    init: HELPERS + `localStorage.setItem("simplify-device-v1",
      '{"tools":{"show-card":{"hidden":"seat","stop":{"x":1},"disclose":"__proto__","log":["seat"]}}}');`,
    setup: run(async () => {
      window.got = [];
      for (const id of ["bell", "please"]) {
        card(id).click();
        await pause(50);
        got.push(lines().length);
      }
    }),
    expect: inPage(() => [...document.querySelectorAll("#tool-show-card .sc-card")].every(seen) &&
      got.join() === "0,0"),
  },
  {
    name: "a stop name is shown as text, never as markup",
    path: "/#show-card",
    init: HELPERS + cardSettings({ stop: '<img src=x onerror="window.pwned=1">' }),
    setup: run(async () => {
      card("bell").click();
      await pause(100);
    }),
    expect: inPage(() => lines().join() === 'My stop: <img src=x onerror="window.pwned=1">' &&
      !document.querySelector(".card-sheet .card-lines img") && !window.pwned),
  },
  {
    name: "pictures only: labels step aside (still the cards' names), pictures grow; the card keeps its words",
    path: "/#show-card",
    init: HELPERS + device({ picturesOnly: true }),
    setup: run(async () => {
      const label = card("cannot-talk").querySelector(".sc-card-label");
      if (label.getBoundingClientRect().width > 1) throw new Error("the label still shows");
      if (label.textContent !== "I cannot talk" || getComputedStyle(label).display === "none") {
        throw new Error("the label is gone for screen readers too");
      }
      if (card("cannot-talk").querySelector("img").getBoundingClientRect().width < 100) throw new Error("small picture");
      card("cannot-talk").click();
      await pause(100);
    }),
    expect: inPage(() => {
      const words = sheet().querySelector(".card-words");
      return words.textContent === "I cannot talk now. I can point or type." &&
        words.getBoundingClientRect().width > 100 && parseFloat(getComputedStyle(words).fontSize) >= 40;
    }),
  },
  {
    name: "a phone on its side: the list still two columns; the card's picture beside its words, all of them fitting",
    path: "/#show-card",
    viewport: { width: 812, height: 375 },
    init: HELPERS + cardSettings({ stop: "Toa Payoh Interchange" }),
    setup: run(async () => {
      const [a, b] = [card("seat"), card("bell")].map((c) => c.getBoundingClientRect());
      if (Math.round(a.top) !== Math.round(b.top) || card("cannot-talk").getBoundingClientRect().top <= a.bottom) {
        throw new Error("not two columns");
      }
      card("bell").click();
      await pause(100);
    }),
    expect: inPage(() => {
      const box = document.querySelector(".card-text-box");
      const text = document.querySelector(".card-text");
      return getComputedStyle(document.querySelector(".card-body")).flexDirection === "row" &&
        text.scrollWidth <= box.clientWidth && text.offsetHeight <= box.clientHeight &&
        lines().join() === "My stop: Toa Payoh Interchange";
    }),
  },
  {
    name: "iPad: the same two columns, bigger pictures; the parent's card fills the screen",
    path: "/#show-card",
    viewport: IPAD,
    init: HELPERS,
    setup: run(async () => {
      const [a, b] = [card("seat"), card("bell")].map((c) => c.getBoundingClientRect());
      if (Math.round(a.top) !== Math.round(b.top)) throw new Error("not side by side");
      if (card("seat").querySelector("img").getBoundingClientRect().width < 110) throw new Error("small pictures");
      if (card("thank-you").getBoundingClientRect().bottom > innerHeight) throw new Error("not all on screen");
      card("space").click();
      await pause(100);
    }),
    expect: inPage(() => sheet().open && sheet().getBoundingClientRect().width === innerWidth &&
      parseFloat(getComputedStyle(sheet().querySelector(".card-words")).fontSize) >= 60),
  },
  {
    name: "reduced motion: the cards open and turn around just the same",
    path: "/#show-card",
    media: [{ name: "prefers-reduced-motion", value: "reduce" }],
    init: HELPERS,
    setup: run(async () => {
      card("thank-you").click();
      await pause(50);
      document.querySelector('.card-btn[aria-label^="Turn around"]').click();
    }),
    expect: inPage(() => sheet().open && sheet().classList.contains("is-turned") &&
      getComputedStyle(card("thank-you")).transitionDuration === "0s"),
  },

  // ---------- its section on the set-up page ----------
  {
    name: "set-up: a switch per card, in the cards' order, each with what it says; all on at first",
    path: "/#setup",
    init: HELPERS,
    setup: HOLD,
    expect: inPage(() => {
      const heading = document.getElementById("setup-show-card-h");
      const switches = [...document.querySelectorAll("#tool-setup .sc-setup .setup-switch")];
      const says = switches.map((s) => s.querySelector(".sc-says").textContent);
      return heading?.textContent.trim() === "Show a card" && heading.querySelector("img") &&
        switches.map((s) => s.querySelector(".setup-switch-name").firstChild.textContent).join("|") === LABELS &&
        switches.every((s) => s.getAttribute("aria-checked") === "true" && s.getAttribute("role") === "switch" &&
          s.querySelector(".tool-icon img")?.complete && s.getBoundingClientRect().height >= 72) &&
        says[0] === "“May I have a seat please?”" &&
        says[4] === "“My child is overwhelmed. Please give us some space. We are OK.”" &&
        document.getElementById("sc-stop").value === "" &&
        document.querySelector('#tool-setup input[name="sc-disclose"]:checked')?.value === "none";
    }),
  },
  {
    name: "set-up: switching a card off saves it for this device, Put it back undoes it; the screen keeps a gap",
    path: "/#setup",
    init: HELPERS,
    setup: HOLD + run(async () => {
      sw("space").click();
      if (sw("space").getAttribute("aria-checked") !== "false") throw new Error("the switch did not turn off");
      if (toast() !== "Give us space: off") throw new Error(`toast: ${toast()}`);
      if (JSON.stringify(saved()) !== '{"hidden":["space"],"stop":"","disclose":"none"}') {
        throw new Error(`saved: ${JSON.stringify(saved())}`);
      }
      document.getElementById("toast-undo").click();
      if (sw("space").getAttribute("aria-checked") !== "true" || saved().hidden.length) throw new Error("undo");
      sw("seat").click();
      location.hash = "#show-card";
      await pause(100);
    }),
    expect: inPage(() => shown("#tool-show-card") && !seen(card("seat")) && seen(card("space")) &&
      seen(card("bell")) && Math.round(card("bell").getBoundingClientRect().left) >
        Math.round(document.querySelector("#tool-show-card .sc-cards").getBoundingClientRect().left) + 100),
  },
  {
    name: "set-up: the stop's name — kept as typed, tidied when left, offered back — then on the card",
    path: "/#setup",
    init: HELPERS,
    setup: HOLD + run(async () => {
      const box = document.getElementById("sc-stop");
      box.focus();
      document.execCommand("insertText", false, "Bishan ");
      if (box.value !== "Bishan ") throw new Error(`the space went while typing: "${box.value}"`);
      if (saved()?.stop !== "Bishan") throw new Error(`not kept as typed: ${JSON.stringify(saved())}`);
      document.execCommand("insertText", false, " Interchange ");
      box.blur(); // a change: the toast offers it back
      if (box.value !== "Bishan Interchange") throw new Error(`not tidied: "${box.value}"`);
      if (toast() !== "Stop name: Bishan Interchange") throw new Error(`toast: ${toast()}`);
      if (!sw("bell").querySelector(".sc-says").textContent.endsWith("My stop: Bishan Interchange”")) {
        throw new Error("the switch doesn't say it");
      }
      document.getElementById("toast-undo").click();
      if (saved().stop !== "" || box.value !== "") throw new Error("Put it back did not empty it");
      box.focus();
      document.execCommand("insertText", false, "Yishun Int");
      box.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); // Enter: done
      if (document.activeElement === box) throw new Error("Enter left the keyboard up");
      if (toast() !== "Stop name: Yishun Int") throw new Error(`toast after Enter: ${toast()}`);
      location.hash = "#show-card";
      await pause(100);
      card("bell").click();
    }),
    expect: inPage(() => sheet().open && lines().join() === "My stop: Yishun Int"),
  },
  {
    name: "set-up: the second line — none at first; a choice is saved, offered back, and shows on the card",
    path: "/#setup",
    init: HELPERS,
    setup: HOLD + run(async () => {
      const radios = [...document.querySelectorAll('#tool-setup input[name="sc-disclose"]')];
      const state = () => radios.map((r) => `${r.value}:${r.checked}`).join();
      if (state() !== "none:true,hidden-disability:false,autistic:false") throw new Error(state());
      if (radios.some((r) => r.closest("label").getBoundingClientRect().height < 56)) throw new Error("small rows");
      radios[2].click();
      if (saved()?.disclose !== "autistic" || toast() !== "Second line: I am autistic.") {
        throw new Error(`${JSON.stringify(saved())} / ${toast()}`);
      }
      if (!sw("please").querySelector(".sc-says").textContent.includes("I am autistic.")) throw new Error("switch");
      document.getElementById("toast-undo").click();
      if (saved().disclose !== "none" || state() !== "none:true,hidden-disability:false,autistic:false") {
        throw new Error(`after Put it back: ${state()}`);
      }
      radios[1].click();
      radios[0].click();
      if (toast() !== "No second line") throw new Error(`toast: ${toast()}`);
      radios[1].click();
      location.hash = "#show-card";
      await pause(100);
      card("please").click();
    }),
    expect: inPage(() => sheet().open && lines().join() === "I have a hidden disability."),
  },
  {
    name: "set-up: a change made on the set-up page in another tab shows at once",
    path: "/#setup",
    init: HELPERS,
    setup: HOLD + run(async () => {
      const next = { hidden: ["thank-you"], stop: "Bedok", disclose: "autistic" };
      localStorage.setItem("simplify-device-v1", JSON.stringify({ tools: { "show-card": next } }));
      dispatchEvent(new StorageEvent("storage", { key: "simplify-device-v1" }));
      await pause(50);
    }),
    expect: inPage(() => sw("thank-you").getAttribute("aria-checked") === "false" &&
      document.getElementById("sc-stop").value === "Bedok" &&
      document.querySelector('#tool-setup input[name="sc-disclose"]:checked')?.value === "autistic"),
  },
];
