// Smoke scenes for I need (#i-need) — node tools/smoke.mjs i-need
//
// Scene code is written as real functions and sent to the page as source, as
// in app.mjs; they can use only the page's globals and the HELPERS below.

const inPage = (fn) => `(${fn})()`;
const run = (fn) => `await (${fn})();`;

const HELPERS = `
  window.shown = (sel) => { const el = document.querySelector(sel); return !!el && el.getClientRects().length > 0; };
  window.pause = (ms) => new Promise((r) => setTimeout(r, ms));
  window.card = (id) => document.querySelector('#tool-i-need .need-card[data-card="' + id + '"]');
  window.cardOpen = () => document.querySelector(".card-sheet")?.open === true;
  window.cardWords = () => document.querySelector(".card-words")?.textContent;
  window.sheet = () => document.querySelector("#tool-i-need .hurts-sheet");
  window.spot = (region) => document.querySelector('#tool-i-need .hurts-spot[data-region="' + region + '"]');
  window.size = (id) => document.querySelector('#tool-i-need .hurts-size[data-size="' + id + '"]');
  window.named = (el) => el.getAttribute("aria-label") ?? el.textContent.trim();
  window.box = (el) => el.getBoundingClientRect();
  window.QUIET = 450; // the Hurts sheet lets taps go for 400 ms after its screen changes
`;

const device = (settings) => `localStorage.setItem("simplify-device-v1", ${JSON.stringify(JSON.stringify(settings))});`;
const cards = (list) => device({ tools: { "i-need": { cards: list } } });
const ALL = ["help", "break", "toilet", "water", "too-loud", "stop", "hurts", "want", "more-time", "dont-understand", "all-done"];

// a stand-in for the device's speech (headless Chrome has none): what it was asked to say
const SPEECH = `
  window.spoken = [];
  const synth = new EventTarget();
  Object.assign(synth, { paused: false, getVoices: () => [{ name: "SG", lang: "en-SG", localService: true }],
    speak(u) { spoken.push(u.text); setTimeout(() => u.onend?.(), 0); }, cancel() {}, resume() {} });
  Object.defineProperty(window, "speechSynthesis", { configurable: true, get: () => synth });
  window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
`;

const HOLD = run(async () => {
  const btn = document.querySelector("#tool-setup .hold-btn");
  const finger = { bubbles: true, pointerId: 7, button: 0, isPrimary: true, pointerType: "touch" };
  btn.dispatchEvent(new PointerEvent("pointerdown", finger));
  await pause(1700);
  btn.dispatchEvent(new PointerEvent("pointerup", finger));
  await pause(600);
});

// tap Hurts, then a region (or My back), then a size
const hurtsFlow = (region, much) => `
  card("hurts").click();
  await pause(QUIET);
  (${JSON.stringify(region)} === "back" ? document.querySelector("#tool-i-need .hurts-myback") : spot(${JSON.stringify(region)})).click();
  await pause(QUIET);
  size(${JSON.stringify(much)}).click();
`;

export default [
  // ---------- the grid ----------
  {
    name: "grid: the seven default cards in order, two columns on a phone, nothing after them",
    path: "/#i-need",
    init: HELPERS,
    expect: inPage(() => {
      const visible = [...document.querySelectorAll("#tool-i-need .need-slot")].filter((li) => li.getClientRects().length);
      const onCards = visible.filter((li) => !li.classList.contains("is-off")).map((li) => li.querySelector("button"));
      const [a, b, c] = onCards.map(box);
      return onCards.map((btn) => btn.dataset.card).join() === "help,break,toilet,water,too-loud,stop,hurts" &&
        onCards.map((btn) => btn.textContent).join() === "Help,Break,Toilet,Water,Too loud,Stop,Hurts" &&
        visible.length === 7 && a.top === b.top && c.top > a.top && c.left === a.left &&
        onCards.every((btn) => box(btn).height >= 96 && box(btn).width >= 96 && btn.querySelector("img")?.complete) &&
        box(card("hurts")).bottom <= innerHeight && // all seven on a phone's screen, no scrolling
        !shown("#clear-all-wrap") && !shown("#tool-i-need .need-none") &&
        document.activeElement === document.getElementById("screen-title");
    }),
  },
  {
    name: "grid: three columns on an iPad, all eleven cards on the screen",
    path: "/#i-need",
    viewport: { width: 768, height: 1024 },
    init: HELPERS + cards(ALL),
    expect: inPage(() => {
      const tops = new Set(["help", "break", "toilet"].map((id) => box(card(id)).top));
      return tops.size === 1 && box(card("water")).top > box(card("help")).top &&
        box(card("water")).left === box(card("help")).left && box(card("all-done")).bottom <= innerHeight;
    }),
  },
  {
    name: "grid: a phone on its side keeps two columns (no card changes place)",
    path: "/#i-need",
    viewport: { width: 812, height: 375 },
    init: HELPERS,
    expect: inPage(() => box(card("toilet")).left === box(card("help")).left && box(card("toilet")).top > box(card("help")).top),
  },
  {
    name: "grid: a card switched off leaves a gap — every other card stays where it was",
    path: "/#i-need",
    init: HELPERS,
    setup: run(async () => {
      window.before = Object.fromEntries(["help", "toilet", "too-loud", "stop", "hurts"].map((id) => [id, box(card(id)).toJSON()]));
      const { setDevice } = await import("/js/device.js");
      setDevice({ tools: { "i-need": { cards: ["help", "toilet", "too-loud", "stop", "hurts"] } } });
    }),
    expect: inPage(() => {
      const slot = (id) => card(id).parentElement;
      return Object.entries(before).every(([id, was]) => JSON.stringify(box(card(id)).toJSON()) === JSON.stringify(was)) &&
        getComputedStyle(slot("break")).visibility === "hidden" &&
        slot("water").inert && slot("break").inert && !slot("help").inert;
    }),
  },
  {
    name: "grid: every card switched off — a line for the adult, not a blank screen",
    path: "/#i-need",
    init: HELPERS + cards([]),
    expect: inPage(() => shown("#tool-i-need .need-none") && !shown("#tool-i-need .need-cards")),
  },
  {
    name: "grid: pictures only — the labels step aside, the buttons keep their names, the card keeps its words",
    path: "/#i-need",
    init: HELPERS + device({ picturesOnly: true }),
    setup: run(() => {
      const label = card("help").querySelector(".need-label");
      if (box(label).width > 1) throw new Error("the label still shows");
      if (card("help").textContent !== "Help") throw new Error("the button lost its name");
      if (box(card("help").querySelector("img")).width < 100) throw new Error("the picture did not grow");
      card("help").click();
    }),
    expect: inPage(() => cardOpen() && cardWords() === "I need help" && box(document.querySelector(".card-words")).width > 50),
  },

  // ---------- the cards ----------
  ...[
    ["help", "I need help"], ["break", "I need a break"], ["toilet", "I need the toilet"], ["water", "I need water"],
    ["too-loud", "It is too loud"], ["stop", "Stop, please"], ["more-time", "I need more time"],
    ["dont-understand", "I don't understand"], ["all-done", "I am all done"],
  ].map(([id, words]) => ({
    name: `card: ${id} → "${words}", with its picture`,
    path: "/#i-need",
    init: HELPERS + cards(ALL),
    setup: `card(${JSON.stringify(id)}).click();`,
    expect: `cardOpen() && cardWords() === ${JSON.stringify(words)} &&
      document.querySelector(".card-picture img")?.getAttribute("src") === "/img/pic/" + ${JSON.stringify(id)} + ".svg" &&
      (${JSON.stringify(id)} === "break") === document.querySelectorAll(".card-choice").length > 0`,
  })),
  {
    name: "Break: 2 minutes and 5 minutes on the card; 2 minutes opens Wait with m=2",
    path: "/#i-need",
    init: HELPERS,
    setup: run(async () => {
      card("break").click();
      const choices = [...document.querySelectorAll(".card-choice")];
      if (choices.map((c) => c.getAttribute("aria-label")).join() !== "2 minutes,5 minutes") throw new Error("choices");
      choices[0].click();
      await pause(100);
    }),
    expect: inPage(() => !cardOpen() && location.hash === "#wait?m=2" && shown("#tool-wait") && !shown("#tool-i-need")),
  },
  {
    name: "Speak reads the card's sentence — only when tapped",
    path: "/#i-need",
    init: HELPERS + SPEECH,
    setup: run(async () => {
      card("water").click();
      await pause(100);
      if (spoken.length) throw new Error("spoke by itself");
      document.querySelector('.card-btn[aria-label^="Speak"]').click();
    }),
    expect: inPage(() => spoken.join() === "I need water"),
  },

  // ---------- Hurts ----------
  {
    name: "Hurts: Where? — the whole body and My back on a phone's screen, every region a named button",
    path: "/#i-need",
    init: HELPERS,
    setup: run(() => card("hurts").click()),
    expect: inPage(() => {
      const s = sheet();
      const named = [...s.querySelectorAll(".hurts-spot:not([aria-hidden]), .hurts-myback")].map((b) =>
        b.getAttribute("aria-label") ?? b.textContent.trim());
      const spots = [...s.querySelectorAll(".hurts-spot")];
      const back = box(s.querySelector(".hurts-myback"));
      const map = box(s.querySelector(".hurts-map"));
      return s.open && s.querySelector(".hurts-title").textContent === "Where?" &&
        named.join("|") === "Head|Eyes|Ear|Mouth or teeth|Throat|Chest|Tummy|Arm|Hand|Leg|Foot|My back" &&
        spots.every((b) => b.tagName === "BUTTON" && box(b).width >= 44 && box(b).height >= 44) &&
        back.bottom <= innerHeight && map.bottom <= back.top && map.height >= 560 && back.height >= 80 &&
        document.activeElement === s.querySelector(".hurts-title") && shown("#tool-i-need .hurts-close") &&
        !shown("#tool-i-need .hurts-back");
    }),
  },
  {
    name: "Hurts: a finger on a region lights it up; letting go puts it out",
    path: "/#i-need",
    init: HELPERS,
    setup: run(async () => {
      card("hurts").click();
      const finger = { bubbles: true, pointerId: 5, pointerType: "touch" };
      spot("arm").dispatchEvent(new PointerEvent("pointerdown", finger));
      const lit = [...sheet().querySelectorAll(".need-body .is-lit")].map((el) => el.dataset.part).join();
      if (lit !== "arm-left,arm-right") throw new Error(`lit: ${lit}`);
      spot("arm").dispatchEvent(new PointerEvent("pointerup", finger));
    }),
    expect: inPage(() => !sheet().querySelector(".is-lit")),
  },
  {
    name: "Hurts: tummy, a lot → \"It hurts here: tummy. A lot.\", the tummy in red; the grid after it",
    path: "/#i-need",
    init: HELPERS,
    setup: hurtsFlow("tummy", "lot") + run(async () => {
      await pause(50);
      if (sheet().open) throw new Error("the sheet is still open under the card");
      const red = [...document.querySelectorAll('.card-picture [fill="#d32f2f"]')].map((el) => el.dataset.region).join();
      if (red !== "tummy") throw new Error(`in red: ${red}`);
      document.querySelector('.card-btn[aria-label="Close the card"]').click();
    }),
    expect: inPage(() => !cardOpen() && !sheet().open && shown("#tool-i-need .need-cards") && location.hash === "#i-need"),
  },
  {
    name: "Hurts: How much? shows the choice; three growing circles, named",
    path: "/#i-need",
    init: HELPERS,
    setup: run(async () => {
      card("hurts").click();
      await pause(QUIET);
      spot("hand").click();
    }),
    expect: inPage(() => {
      const s = sheet();
      const dots = [...s.querySelectorAll(".hurts-dot")].map((d) => box(d).width);
      return s.querySelector(".hurts-title").textContent === "How much?" &&
        s.querySelector(".hurts-chosen-name").textContent === "Hand" &&
        s.querySelectorAll('.hurts-chosen-picture [data-region="hand"][fill="#d32f2f"]').length === 2 &&
        [...s.querySelectorAll(".hurts-size")].map((b) => b.textContent).join() === "A little,A lot,Very bad" &&
        dots[0] < dots[1] && dots[1] < dots[2] && [...s.querySelectorAll(".hurts-size")].every((b) => box(b).height >= 96) &&
        shown("#tool-i-need .hurts-back") && !shown("#tool-i-need .hurts-close") && !shown("#tool-i-need .hurts-where");
    }),
  },
  {
    name: "Hurts: a face region's card shows the head close up — the ear in red",
    path: "/#i-need",
    init: HELPERS,
    setup: hurtsFlow("ear", "very"),
    expect: inPage(() => cardWords() === "It hurts here: ear. Very bad." &&
      document.querySelector(".card-picture svg").getAttribute("viewBox") === "22 0 156 150" &&
      document.querySelectorAll('.card-picture [data-region="ear"][fill="#d32f2f"]').length === 2),
  },
  {
    name: "Hurts: My back → a figure seen from behind, the back in red",
    path: "/#i-need",
    init: HELPERS,
    setup: hurtsFlow("back", "little"),
    expect: inPage(() => cardWords() === "It hurts here: my back. A little." &&
      document.querySelector(".card-picture svg").classList.contains("is-back") &&
      [...document.querySelectorAll('.card-picture [fill="#d32f2f"]')].map((el) => el.dataset.part).join() === "chest,tummy"),
  },
  {
    name: "Hurts: ◀ goes back to Where?; ✕ closes it, back to the grid",
    path: "/#i-need",
    init: HELPERS,
    setup: run(async () => {
      card("hurts").click();
      await pause(QUIET);
      spot("leg").click();
      await pause(QUIET);
      sheet().querySelector(".hurts-back").click();
      if (sheet().querySelector(".hurts-title").textContent !== "Where?" || !shown("#tool-i-need .hurts-where")) {
        throw new Error("◀ did not go back to Where?");
      }
      await pause(QUIET);
      sheet().querySelector(".hurts-close").click();
    }),
    expect: inPage(() => !sheet().open && !cardOpen() && shown("#tool-i-need .need-cards")),
  },
  {
    name: "Hurts: a double tap can't answer both questions",
    path: "/#i-need",
    init: HELPERS,
    setup: run(async () => {
      card("hurts").click();
      await pause(QUIET);
      spot("tummy").click();
      size("very").click(); // the second tap of a double tap, a moment later
      await pause(100);
    }),
    expect: inPage(() => sheet().open && !cardOpen() && sheet().querySelector(".hurts-title").textContent === "How much?"),
  },
  {
    name: "Hurts: Esc (the phone's Back) closes it; so does leaving the screen",
    path: "/#i-need",
    init: HELPERS,
    setup: run(async () => {
      card("hurts").click();
      if (sheet().requestClose) sheet().requestClose(); // what Esc and Back do
      else sheet().close();
      await pause(50);
      if (sheet().open) throw new Error("Esc left it open");
      card("hurts").click();
      location.hash = "#wait";
      await pause(100);
    }),
    expect: inPage(() => !sheet().open && shown("#tool-wait") && !document.querySelector("dialog[open]")),
  },
  {
    name: "Hurts: the body is big on an iPad too",
    path: "/#i-need",
    viewport: { width: 768, height: 1024 },
    init: HELPERS,
    setup: run(() => card("hurts").click()),
    expect: inPage(() => box(sheet().querySelector(".hurts-map")).height >= 760 &&
      box(sheet().querySelector(".hurts-myback")).bottom <= innerHeight &&
      [...sheet().querySelectorAll(".hurts-spot")].every((b) => box(b).height >= 60)),
  },
  {
    name: "Hurts: pictures only — no words on the sheet, every button still named",
    path: "/#i-need",
    init: HELPERS + device({ picturesOnly: true }),
    setup: run(async () => {
      card("hurts").click();
      if (box(sheet().querySelector(".hurts-title .pic-words")).width > 1) throw new Error("Where? shows");
      if (box(sheet().querySelector(".hurts-myback .pic-words")).width > 1) throw new Error("My back shows");
      await pause(QUIET);
      spot("head").click();
    }),
    expect: inPage(() => [...sheet().querySelectorAll(".hurts-size-words")].every((w) => box(w).width <= 1) &&
      [...sheet().querySelectorAll(".hurts-size")].map((b) => b.textContent).join() === "A little,A lot,Very bad" &&
      shown("#tool-i-need .hurts-chosen-picture svg")),
  },
  {
    name: "Hurts: the keyboard reaches each region once (the other side of a pair is for fingers only)",
    path: "/#i-need",
    init: HELPERS,
    setup: run(() => {
      card("hurts").click();
      const reachable = [...sheet().querySelectorAll(".hurts-spot, .hurts-myback")].filter((b) => b.tabIndex >= 0);
      if (reachable.length !== 12) throw new Error(`${reachable.length} reachable`);
    }),
    expect: "true",
  },

  {
    name: "reduced motion: nothing in I need moves — the whole Hurts flow still works",
    path: "/#i-need",
    media: [{ name: "prefers-reduced-motion", value: "reduce" }],
    init: HELPERS,
    setup: hurtsFlow("chest", "little"),
    expect: inPage(() => cardWords() === "It hurts here: chest. A little." &&
      [...document.querySelectorAll("#tool-i-need, #tool-i-need *")].every((el) => {
        const cs = getComputedStyle(el);
        return cs.animationName === "none" && ["0s", ""].includes(cs.transitionDuration.split(",")[0].trim());
      })),
  },

  // ---------- I want ----------
  {
    name: "I want: a picture from the picker → \"I want: <its words>\" with the picture",
    path: "/#i-need",
    init: HELPERS + cards(ALL),
    setup: run(async () => {
      card("want").click();
      await pause(50);
      if (document.querySelector(".pp-title").textContent !== "I want") throw new Error("title");
      document.querySelector('.pp-pic[data-picture="snack"]').click();
      document.querySelector(".pp-done").click();
      await pause(50);
    }),
    expect: inPage(() => cardOpen() && cardWords() === "I want: Snack" &&
      document.querySelector(".card-picture img")?.getAttribute("src") === "/img/pic/snack.svg"),
  },
  {
    name: "I want: words typed — shown as text, never markup",
    path: "/#i-need",
    init: HELPERS + cards(ALL),
    setup: run(async () => {
      card("want").click();
      await pause(50);
      const words = document.querySelector(".pp-words");
      words.value = "<b>kaya</b> toast";
      document.querySelector(".pp-done").click();
      await pause(50);
    }),
    expect: inPage(() => cardOpen() && cardWords() === "I want: <b>kaya</b> toast" && !document.querySelector(".card-words b") &&
      !shown(".card-picture")),
  },
  {
    name: "I want: pictures only — no words box; ✕ gives no card",
    path: "/#i-need",
    init: HELPERS + device({ picturesOnly: true, tools: { "i-need": { cards: ALL } } }),
    setup: run(async () => {
      card("want").click();
      await pause(50);
      if (shown(".pp-words")) throw new Error("a words box on a pictures-only device");
      document.querySelector(".pp-close").click();
      await pause(100);
    }),
    expect: inPage(() => !cardOpen() && !document.querySelector("dialog[open]")),
  },

  // ---------- nothing kept ----------
  {
    name: "nothing is saved: after cards, Hurts and I want, storage is as it was (and holds no I need key)",
    path: "/#i-need",
    init: HELPERS + cards(ALL),
    setup: run(async () => {
      await pause(400); // the money tools write their own keys at boot
      window.before = JSON.stringify({ ...localStorage });
    }) + hurtsFlow("foot", "lot") + run(async () => {
      document.querySelector('.card-btn[aria-label="Close the card"]').click();
      card("toilet").click();
      await pause(400); // longer than storage.js waits before writing
    }),
    expect: inPage(() => JSON.stringify({ ...localStorage }) === before &&
      !Object.keys(localStorage).some((k) => k.includes("i-need")) && sessionStorage.length === 0),
  },

  // ---------- the set-up page ----------
  {
    name: "set-up: a switch per card, in grid order, the defaults on; Water off leaves its gap; Put it back",
    path: "/#setup",
    init: HELPERS,
    setup: HOLD + run(async () => {
      const rows = [...document.querySelectorAll('#tool-setup .need-setup .setup-switch')];
      const names = rows.map((r) => r.querySelector(".setup-switch-name").firstChild.textContent).join();
      if (names !== "Help,Break,Toilet,Water,Too loud,Stop,Hurts,I want,More time,Don't understand,All done") throw new Error(names);
      const states = rows.map((r) => r.getAttribute("aria-checked")).join();
      if (states !== "true,true,true,true,true,true,true,false,false,false,false") throw new Error(states);
      const water = rows[3];
      if (!water.querySelector(".need-says").textContent.includes("I need water")) throw new Error("says");
      water.click();
      if (document.getElementById("toast-text").textContent !== "Water: off") throw new Error("toast");
      const saved = JSON.parse(localStorage.getItem("simplify-device-v1")).tools["i-need"].cards.join();
      if (saved !== "help,break,toilet,too-loud,stop,hurts") throw new Error(saved);
      document.getElementById("toast-undo").click();
      if (water.getAttribute("aria-checked") !== "true") throw new Error("Put it back");
      water.click();
      rows[10].click(); // All done on
      location.hash = "#i-need";
      await pause(100);
    }),
    expect: inPage(() => shown('#tool-i-need .need-card[data-card="all-done"]') &&
      getComputedStyle(card("water").parentElement).visibility === "hidden" &&
      getComputedStyle(card("want").parentElement).visibility === "hidden"),
  },
];
