// Smoke scenes for Stop and check (#stop-check, js/tools/stop-check.js) —
// node tools/smoke.mjs stop-check
//
// Scene code is written as real functions and sent to the page as source, as
// in app.mjs: it runs there, with the page's globals and the helpers below.

const inPage = (fn) => `(${fn})()`;
const run = (fn) => `await (${fn})();`;

const HELPERS = `
  window.shown = (sel) => { const el = document.querySelector(sel); return !!el && el.getClientRects().length > 0; };
  window.pause = (ms) => new Promise((r) => setTimeout(r, ms));
  window.waitFor = async (fn, ms = 3000) => {
    const end = Date.now() + ms;
    for (;;) { try { const v = await fn(); if (v) return v; } catch {} if (Date.now() > end) throw new Error("waited too long: " + fn); await pause(25); }
  };
  window.ask = (id) => document.querySelector('#tool-stop-check .sk-ask[data-ask="' + id + '"]');
  window.lines = () => [...document.querySelectorAll(".card-sheet .card-lines p")].map((p) => p.textContent);
  window.fits = () => document.documentElement.scrollWidth <= innerWidth;
  window.LABELS = "A code (OTP)|Singpass or IC|My password|My card number|Send money|Tap a link|Photos of me|Meet up|Keep a secret|I won a prize";
`;

export default [
  {
    name: "ten asks, two columns, pictures and words; no ✕ (nothing is kept)",
    path: "/#stop-check",
    init: HELPERS,
    setup: run(() => waitFor(() => shown("#tool-stop-check .sk-ask"))),
    expect: inPage(() => {
      const asks = [...document.querySelectorAll("#tool-stop-check .sk-ask")];
      const lefts = new Set(asks.map((a) => Math.round(a.getBoundingClientRect().left)));
      return asks.map((a) => a.textContent).join("|") === LABELS && lefts.size === 2 &&
        asks.every((a) => a.querySelector("img")?.naturalWidth > 0) &&
        document.getElementById("screen-title").textContent === "Stop and check" &&
        !shown("#clear-all-wrap") && fits();
    }),
  },
  {
    name: "a tap: STOP over the whole screen, the rule for that ask, and 1799",
    path: "/#stop-check",
    init: HELPERS,
    setup: run(async () => {
      await waitFor(() => ask("money"));
      ask("money").click();
      await waitFor(() => shown(".card-sheet"));
    }),
    expect: inPage(() => document.querySelector(".card-sheet .card-words")?.textContent === "STOP. Show a trusted adult." &&
      lines().join("|") === "Do not send money or gift cards. Do not use PayNow for them.|No adult near? Call 1799, the ScamShield Helpline." &&
      document.querySelector(".card-sheet img")?.getAttribute("src") === "/img/pic/stop.svg"),
  },
  {
    name: "the card closes with ✕, back to the asks; 🏠 goes to the menu",
    path: "/#stop-check",
    init: HELPERS,
    setup: run(async () => {
      await waitFor(() => ask("code"));
      ask("code").click();
      await waitFor(() => shown(".card-sheet"));
      await pause(600); // a card that has just opened ignores taps for a moment
      document.querySelector('.card-sheet [aria-label="Close the card"]').click();
      await waitFor(() => !shown(".card-sheet") && shown("#tool-stop-check"));
      document.getElementById("to-menu").click();
    }),
    expect: inPage(() => shown("#menu") && shown('#menu h2[data-group="safe"]') && shown('#menu a[href="#stop-check"]')),
  },
  {
    name: "pictures only: the pictures, bigger; the card keeps its words (they are for an adult to read)",
    path: "/#stop-check",
    init: HELPERS + `localStorage.setItem("simplify-device-v1", JSON.stringify({ picturesOnly: true }));`,
    setup: run(async () => {
      await waitFor(() => ask("photos"));
      if (document.querySelector("#tool-stop-check .sk-ask-label").getBoundingClientRect().width > 1) throw new Error("the words still show");
      if (ask("photos").querySelector("img").getBoundingClientRect().width < 80) throw new Error("the picture didn't grow");
      ask("photos").click();
      await waitFor(() => shown(".card-sheet"));
    }),
    expect: inPage(() => shown(".card-sheet .card-words") && lines()[0] === "Never send photos of your body." && fits()),
  },
];
