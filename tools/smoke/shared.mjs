// Smoke scenes for the parts the new tools share: say-aloud.js,
// show-card.js and picture-picker.js — node tools/smoke.mjs shared
//
// Each scene loads the app, then imports the part it tests straight into the
// page (the same module the tools get). Scene code is written as real
// functions and sent to the page as source, as in app.mjs.

const inPage = (fn) => `(${fn})()`;
const run = (fn) => `await (${fn})();`;

const HELPERS = `
  window.shown = (sel) => { const el = document.querySelector(sel); return !!el && el.getClientRects().length > 0; };
  window.pause = (ms) => new Promise((r) => setTimeout(r, ms));
`;

// A stand-in for the device's speech (headless Chrome has no voices), which
// writes down what it was asked to say (said(): the same, cancels left out).
// voices decides what the device has.
const fakeSpeech = (voices, { late = false } = {}) => `
  window.spoken = [];
  window.said = () => window.spoken.filter((s) => s !== "cancel");
  window.voiceList = ${late ? "[]" : JSON.stringify(voices)};
  window.lateVoices = ${JSON.stringify(voices)};
  const synth = new EventTarget();
  Object.assign(synth, {
    paused: false,
    getVoices: () => window.voiceList,
    speak(u) {
      window.spoken.push({ text: u.text, voice: u.voice?.name ?? null, lang: u.lang });
      setTimeout(() => u.onend?.(), 0);
    },
    cancel() { window.spoken.push("cancel"); },
    resume() {},
  });
  Object.defineProperty(window, "speechSynthesis", { configurable: true, get: () => synth });
  window.SpeechSynthesisUtterance = class {
    constructor(text) { this.text = text; this.lang = ""; this.voice = null; this.rate = 1; }
  };
  window.pageHidden = false;
  Object.defineProperty(Document.prototype, "hidden", { configurable: true, get: () => window.pageHidden });
`;

const VOICES = [
  { name: "US", lang: "en-US", localService: true },
  { name: "UK online", lang: "en-GB", localService: false },
  { name: "UK", lang: "en_GB", localService: true },
  { name: "Singapore", lang: "en-SG", localService: true },
];
const CHINESE = [
  { name: "Cantonese", lang: "zh-HK", localService: true },
  { name: "Taiwan", lang: "zh-TW", localService: true },
  { name: "Mandarin", lang: "zh-CN", localService: true },
];

const deviceSettings = (settings) =>
  `localStorage.setItem("simplify-device-v1", ${JSON.stringify(JSON.stringify(settings))});`;

export default [
  // ---------- say-aloud.js ----------
  {
    name: "say-aloud: a Singapore voice first",
    path: "/",
    init: HELPERS + fakeSpeech(VOICES),
    setup: run(async () => {
      const { canSpeak, say } = await import("/js/say-aloud.js");
      if (!canSpeak()) throw new Error("canSpeak() is false with speech there");
      await say("Help");
    }),
    expect: inPage(() => spoken.at(-1)?.text === "Help" && spoken.at(-1).voice === "Singapore" &&
      spoken.at(-1).lang === "en-SG" && spoken.at(-2) === "cancel"),
  },
  {
    name: "say-aloud: no Singapore voice — British, on-device before online",
    path: "/",
    init: HELPERS + fakeSpeech(VOICES.filter((v) => v.name !== "Singapore")),
    setup: run(async () => {
      const { say } = await import("/js/say-aloud.js");
      await say("Help");
    }),
    expect: inPage(() => spoken.at(-1)?.voice === "UK"),
  },
  {
    name: "say-aloud: voices that arrive late are used",
    path: "/",
    init: HELPERS + fakeSpeech(VOICES, { late: true }),
    setup: run(async () => {
      const { say } = await import("/js/say-aloud.js");
      window.voiceList = window.lateVoices;
      speechSynthesis.dispatchEvent(new Event("voiceschanged"));
      await say("Toilet");
    }),
    expect: inPage(() => spoken.at(-1)?.text === "Toilet" && spoken.at(-1).voice === "Singapore"),
  },
  {
    name: "say-aloud: goes quiet when the app goes to the background",
    path: "/",
    init: HELPERS + fakeSpeech(VOICES),
    setup: run(async () => {
      const { say } = await import("/js/say-aloud.js");
      say("Please give us space");
      window.pageHidden = true;
      document.dispatchEvent(new Event("visibilitychange"));
    }),
    expect: inPage(() => spoken.at(-2)?.text === "Please give us space" && spoken.at(-1) === "cancel"),
  },
  {
    name: "say-aloud: no speech on the device — canSpeak() false, say() does nothing",
    path: "/",
    init: HELPERS + `Object.defineProperty(window, "speechSynthesis", { configurable: true, get: () => undefined });`,
    setup: run(async () => {
      const { canSpeak, say } = await import("/js/say-aloud.js");
      if (canSpeak()) throw new Error("canSpeak() is true with no speech");
      await say("Help");
    }),
    expect: "true",
  },

  // ---------- show-card.js ----------
  {
    name: "show-card: the words fill the screen, as text — never markup",
    path: "/",
    init: HELPERS,
    setup: run(async () => {
      const { openCard, closeCard } = await import("/js/show-card.js");
      openCard({ words: "<b>Help</b> <img src=x onerror=alert(1)>" });
      const words = document.querySelector(".card-words");
      if (words.textContent !== "<b>Help</b> <img src=x onerror=alert(1)>") throw new Error("the words changed");
      if (document.querySelector(".card-sheet b, .card-sheet img")) throw new Error("the words became markup");
      closeCard();
      openCard({ words: "Help" });
    }),
    expect: inPage(() => {
      const sheet = document.querySelector(".card-sheet");
      const words = document.querySelector(".card-words");
      return sheet.open && parseFloat(getComputedStyle(words).fontSize) > 100 &&
        sheet.getAttribute("aria-label") === "Help" && !shown(".card-picture");
    }),
  },
  {
    name: "show-card: a word too long for the screen still fits on it",
    path: "/",
    init: HELPERS,
    setup: run(async () => {
      const { openCard } = await import("/js/show-card.js");
      openCard({ words: "Pneumonoultramicroscopicsilicovolcanoconiosis", lines: ["Thank you!"] });
    }),
    expect: inPage(() => {
      const box = document.querySelector(".card-text-box");
      const text = document.querySelector(".card-text");
      return text.scrollWidth <= box.clientWidth && text.offsetHeight <= box.clientHeight &&
        shown(".card-lines p");
    }),
  },
  {
    name: "show-card: Turn around turns the card, not the buttons — and back",
    path: "/",
    init: HELPERS,
    setup: run(async () => {
      const { openCard } = await import("/js/show-card.js");
      openCard({ words: "May I have a seat please?" });
      const turn = document.querySelector('.card-btn[aria-label^="Turn around"]');
      turn.click();
      const body = getComputedStyle(document.querySelector(".card-body")).transform;
      if (!body.startsWith("matrix(-1")) throw new Error(`the card did not turn: ${body}`);
      if (getComputedStyle(document.querySelector(".card-actions")).transform !== "none") {
        throw new Error("the buttons turned too");
      }
      if (turn.getAttribute("aria-pressed") !== "true") throw new Error("aria-pressed not true");
      turn.click();
    }),
    expect: inPage(() => !document.querySelector(".card-sheet").classList.contains("is-turned") &&
      document.querySelector('.card-btn[aria-label^="Turn around"]').getAttribute("aria-pressed") === "false"),
  },
  {
    name: "show-card: Speak says the card, one line after another",
    path: "/",
    init: HELPERS + fakeSpeech(VOICES),
    setup: run(async () => {
      const { openCard } = await import("/js/show-card.js");
      openCard({ words: "May I have a seat please?", lines: ["Thank you"] });
      document.querySelector('.card-btn[aria-label^="Speak"]').click();
    }),
    expect: inPage(() => said().map((s) => `${s.text} / ${s.voice}`).join(" | ") ===
      "May I have a seat please? / Singapore | Thank you / Singapore"),
  },
  {
    name: "show-card: a line in another language — marked with it, read by a voice for it (not Cantonese)",
    path: "/",
    init: HELPERS + fakeSpeech([...VOICES, ...CHINESE]),
    setup: run(async () => {
      const { openCard } = await import("/js/show-card.js");
      openCard({ words: "May I have a seat please?", lines: [{ text: "请给我一个座位", lang: "zh-SG" }, "Thank you"] });
      document.querySelector('.card-btn[aria-label^="Speak"]').click();
    }),
    expect: inPage(() => {
      const lines = [...document.querySelectorAll(".card-lines p")];
      return said().map((s) => `${s.text} / ${s.voice} / ${s.lang}`).join(" | ") ===
          "May I have a seat please? / Singapore / en-SG | 请给我一个座位 / Mandarin / zh-CN | Thank you / Singapore / en-SG" &&
        lines[0].lang === "zh-SG" && !lines[1].hasAttribute("lang") &&
        !document.querySelector(".card-words").hasAttribute("lang");
    }),
  },
  {
    name: "show-card: no voice on the device for a line's language — that line is left out, not misread",
    path: "/",
    init: HELPERS + fakeSpeech(VOICES),
    setup: run(async () => {
      const { openCard } = await import("/js/show-card.js");
      openCard({ words: "May I have a seat please?", lines: [{ text: "请给我一个座位", lang: "zh-SG" }, "Thank you"] });
      document.querySelector('.card-btn[aria-label^="Speak"]').click();
    }),
    expect: inPage(() => said().map((s) => s.text).join(" | ") === "May I have a seat please? | Thank you"),
  },
  {
    name: "show-card: a choice on the card closes it, then runs; the promise gives the choice",
    path: "/",
    init: HELPERS,
    setup: run(async () => {
      const { openCard } = await import("/js/show-card.js");
      window.order = [];
      const two = { picture: "more-time", number: "2", words: "minutes",
        onTap: () => order.push(`tapped, card open: ${document.querySelector(".card-sheet").open}`) };
      const card = openCard({ words: "Break", actions: [two, { picture: "more-time", number: "5", words: "minutes" }] });
      const buttons = [...document.querySelectorAll(".card-choice")];
      if (buttons.map((b) => b.getAttribute("aria-label")).join() !== "2 minutes,5 minutes") throw new Error("names");
      if (buttons.some((b) => b.getBoundingClientRect().height < 72)) throw new Error("under 72 px");
      if (!buttons[0].querySelector("img")?.complete) throw new Error("no picture");
      document.querySelector('.card-btn[aria-label^="Turn around"]').click();
      if (getComputedStyle(document.querySelector(".card-choices")).transform !== "none") {
        throw new Error("the choices turned with the card");
      }
      buttons[0].click();
      window.chosen = await card;
    }),
    expect: inPage(() => chosen?.number === "2" && order.join() === "tapped, card open: false" &&
      !document.querySelector(".card-sheet").open),
  },
  {
    name: "show-card: pictures only — a choice keeps its picture and number; words without a picture stay",
    path: "/",
    init: HELPERS + deviceSettings({ picturesOnly: true }),
    setup: run(async () => {
      const { openCard } = await import("/js/show-card.js");
      openCard({ words: "Break", actions: [{ picture: "more-time", number: "2", words: "minutes" }, { words: "Later" }] });
      await pause(50);
    }),
    expect: inPage(() => {
      const [withPicture, wordsOnly] = document.querySelectorAll(".card-choice");
      const width = (el) => el.getBoundingClientRect().width;
      return width(withPicture.querySelector(".card-choice-number")) > 1 &&
        width(withPicture.querySelector(".card-choice-words")) <= 1 &&
        width(wordsOnly.querySelector(".card-choice-words")) > 1 && !shown(".card-choices[hidden]");
    }),
  },
  {
    name: "show-card: a card without choices has no row for them",
    path: "/",
    init: HELPERS,
    setup: run(async () => {
      const { openCard } = await import("/js/show-card.js");
      openCard({ words: "Break", actions: [{ words: "Later" }] });
      openCard({ words: "Stop" });
    }),
    expect: inPage(() => document.querySelector(".card-sheet").open && !shown(".card-choices")),
  },
  {
    name: "show-card: no Speak button when the set-up page has turned it off",
    path: "/",
    init: HELPERS + fakeSpeech(VOICES) + deviceSettings({ speak: false }),
    setup: run(async () => {
      const { openCard } = await import("/js/show-card.js");
      openCard({ words: "Stop" });
    }),
    expect: inPage(() => document.querySelector(".card-sheet").open &&
      !shown('.card-btn[aria-label^="Speak"]') && shown('.card-btn[aria-label="Close the card"]')),
  },
  {
    name: "show-card: ✕ closes it, the promise settles, speech stops",
    path: "/",
    init: HELPERS + fakeSpeech(VOICES),
    setup: run(async () => {
      const { openCard } = await import("/js/show-card.js");
      const closed = openCard({ words: "All done" });
      document.querySelector('.card-btn[aria-label="Close the card"]').click();
      await closed;
      window.settled = true;
    }),
    expect: inPage(() => window.settled && !document.querySelector(".card-sheet").open &&
      spoken.at(-1) === "cancel"),
  },
  {
    name: "show-card: a new card replaces the one up; the old promise settles",
    path: "/",
    init: HELPERS,
    setup: run(async () => {
      const { openCard } = await import("/js/show-card.js");
      const first = openCard({ words: "Wait" });
      openCard({ words: "Go" });
      await first;
      await pause(50); // a late close event must not end the new card
    }),
    expect: inPage(() => document.querySelector(".card-sheet").open &&
      document.querySelector(".card-words").textContent === "Go"),
  },
  {
    name: "show-card: moving to another screen takes the card away",
    path: "/",
    init: HELPERS,
    setup: run(async () => {
      const { openCard } = await import("/js/show-card.js");
      openCard({ words: "Help" });
      location.hash = "#wait";
    }),
    expect: inPage(() => !document.querySelector(".card-sheet").open && shown("#tool-wait")),
  },
  {
    name: "show-card: a picture by its id, beside the words on a phone on its side",
    path: "/",
    viewport: { width: 812, height: 375 },
    init: HELPERS,
    setup: run(async () => {
      const { PICTURES } = await import("/js/pictures.js");
      const { openCard } = await import("/js/show-card.js");
      window.first = PICTURES[0];
      openCard({ picture: first.id, words: first.words });
    }),
    expect: inPage(() => {
      const img = document.querySelector(".card-picture img");
      return !!img && img.getAttribute("src") === `/img/pic/${first.file}` && img.complete &&
        img.naturalWidth > 0 && getComputedStyle(document.querySelector(".card-body")).flexDirection === "row";
    }),
  },

  // ---------- picture-picker.js ----------
  {
    name: "picture picker: a tap picks a picture and fills in its words; Done gives both",
    path: "/",
    init: HELPERS,
    setup: run(async () => {
      const { PICTURES } = await import("/js/pictures.js");
      const { pickPicture } = await import("/js/picture-picker.js");
      window.first = PICTURES[0];
      const picked = pickPicture({ title: "Now" });
      const btn = document.querySelector(`.pp-pic[data-picture="${first.id}"]`);
      btn.click();
      if (btn.getAttribute("aria-pressed") !== "true") throw new Error("not shown as picked");
      if (document.querySelector(".pp-words").value !== first.words) throw new Error("words not filled in");
      document.querySelector(".pp-done").click();
      window.result = await picked;
    }),
    expect: inPage(() => result?.picture === first.id && result.words === first.words &&
      !document.querySelector(".picture-picker").open &&
      document.querySelector(".pp-title").textContent === "Now"),
  },
  {
    name: "picture picker: words someone typed stay when a picture is tapped",
    path: "/",
    init: HELPERS,
    setup: run(async () => {
      const { PICTURES } = await import("/js/pictures.js");
      const { pickPicture } = await import("/js/picture-picker.js");
      window.first = PICTURES[0];
      const picked = pickPicture({ title: "Next" });
      const box = document.querySelector(".pp-words");
      box.value = "  My   bus ";
      box.dispatchEvent(new Event("input", { bubbles: true }));
      document.querySelector(`.pp-pic[data-picture="${PICTURES[1].id}"]`).click();
      document.querySelector(`.pp-pic[data-picture="${first.id}"]`).click();
      document.querySelector(".pp-done").click();
      window.result = await picked;
    }),
    expect: inPage(() => result?.picture === first.id && result.words === "My bus"),
  },
  {
    name: "picture picker: the picked one tapped again is un-picked, its words go too",
    path: "/",
    init: HELPERS,
    setup: run(async () => {
      const { PICTURES } = await import("/js/pictures.js");
      const { pickPicture } = await import("/js/picture-picker.js");
      const [first, second] = PICTURES;
      pickPicture({ current: { picture: first.id, words: first.words } });
      const btn = (p) => document.querySelector(`.pp-pic[data-picture="${p.id}"]`);
      if (btn(first).getAttribute("aria-pressed") !== "true") throw new Error("current not shown picked");
      btn(second).click(); // its words replace the picture's own words…
      if (document.querySelector(".pp-words").value !== second.words) throw new Error("words not swapped");
      btn(second).click(); // …and go with it
    }),
    expect: inPage(() => document.querySelector(".pp-words").value === "" &&
      !document.querySelector('.pp-pic[aria-pressed="true"]')),
  },
  {
    name: "picture picker: ✕, and Done with nothing, both give null",
    path: "/",
    init: HELPERS,
    setup: run(async () => {
      const { pickPicture } = await import("/js/picture-picker.js");
      const closed = pickPicture({ title: "Now" });
      document.querySelector(".pp-close").click();
      window.closedWith = await closed;
      const empty = pickPicture({ title: "Now" });
      document.querySelector(".pp-done").click();
      window.emptyWith = await empty;
      window.done = true;
    }),
    expect: inPage(() => window.done && closedWith === null && emptyWith === null &&
      !document.querySelector(".picture-picker").open),
  },
  {
    name: "picture picker: pictures only — no words box, the picture's own words",
    path: "/",
    init: HELPERS,
    setup: run(async () => {
      const { PICTURES } = await import("/js/pictures.js");
      const { pickPicture } = await import("/js/picture-picker.js");
      window.first = PICTURES[0];
      const picked = pickPicture({ title: "Now", allowWords: false });
      if (shown(".pp-words")) throw new Error("the words box shows");
      document.querySelector(`.pp-pic[data-picture="${first.id}"]`).click();
      document.querySelector(".pp-done").click();
      window.result = await picked;
    }),
    expect: inPage(() => result?.picture === first.id && result.words === first.words),
  },
  {
    name: "picture picker: every group has its pictures, each with its words",
    path: "/",
    init: HELPERS,
    setup: run(async () => {
      const { pickPicture } = await import("/js/picture-picker.js");
      pickPicture({ title: "Now" });
    }),
    expect: inPage(async () => {
      const { PICTURES, PICTURE_GROUPS } = await import("/js/pictures.js");
      const labels = [...document.querySelectorAll(".picture-picker .picker-group-label")].map((h) => h.textContent);
      const buttons = document.querySelectorAll(".pp-pic");
      return buttons.length === PICTURES.length &&
        PICTURE_GROUPS.every((g) => labels.includes(g.label)) &&
        [...buttons].every((b) => b.querySelector(".pp-pic-words").textContent.length > 0 && b.querySelector("img"));
    }),
  },
];
