// Smoke scenes for Time sums (#time-sums, js/tools/time-sums.js) —
// node tools/smoke.mjs time-sums
//
// Scene code is written as real functions and sent to the page as source, as
// in app.mjs: it runs there, with the page's globals and the helpers below.

const inPage = (fn) => `(${fn})()`;
const run = (fn) => `await (${fn})();`;

// set(id, "15:30"): a time box set as the device's picker sets it
// answer(): the answer panel's words; mode(): the question on show
const HELPERS = `
  window.shown = (sel) => { const el = document.querySelector(sel); return !!el && el.getClientRects().length > 0; };
  window.pause = (ms) => new Promise((r) => setTimeout(r, ms));
  window.waitFor = async (fn, ms = 3000) => {
    const end = Date.now() + ms;
    for (;;) { try { const v = await fn(); if (v) return v; } catch {} if (Date.now() > end) throw new Error("waited too long: " + fn); await pause(25); }
  };
  window.set = (id, value) => { const el = document.getElementById(id); el.value = value; el.dispatchEvent(new Event("input", { bubbles: true })); };
  window.answer = () => shown("#result") ? document.getElementById("result").innerText.replace(/\\s+/g, " ").trim() : "";
  window.mode = () => document.querySelector('#tool-time-sums .ts-mode[aria-pressed="true"]')?.dataset.mode;
  window.fits = () => document.documentElement.scrollWidth <= innerWidth;
  window.now = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
  window.hhmm = (m) => String(Math.floor(m / 60) % 24).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
`;

export default [
  {
    name: "how long until: from now, the answer as the time is set; nothing before",
    path: "/#time-sums",
    init: HELPERS,
    setup: run(async () => {
      await waitFor(() => shown("#ts-from"));
      if (mode() !== "until") throw new Error(`the question: ${mode()}`);
      if (answer()) throw new Error(`an answer before an Until time: ${answer()}`);
      if (Math.abs((() => { const [h, m] = document.getElementById("ts-from").value.split(":").map(Number); return h * 60 + m; })() - now()) > 1) {
        throw new Error("From is not now");
      }
      if (shown("#tool-time-sums .ts-now")) throw new Error("Now shows while From is now");
      set("ts-from", "14:10");
      set("ts-until", "15:30");
    }),
    expect: inPage(() => answer().includes("1 hour 20 minutes") && answer().includes("2:10 pm to 3:30 pm") &&
      shown("#tool-time-sums .ts-now") && shown("#clear-all-wrap") && fits()),
  },
  {
    name: "how long until a time already gone: tomorrow",
    path: "/#time-sums",
    init: HELPERS,
    setup: run(async () => {
      await waitFor(() => shown("#ts-from"));
      set("ts-from", "22:00");
      set("ts-until", "06:30");
    }),
    expect: inPage(() => answer().includes("8 hours 30 minutes") && answer().includes("10:00 pm to 6:30 am tomorrow")),
  },
  {
    name: "what time after: a quick amount, typed hours and minutes, past midnight; Now puts From back",
    path: "/#time-sums",
    init: HELPERS,
    setup: run(async () => {
      await waitFor(() => shown("#ts-from"));
      document.querySelector('#tool-time-sums .ts-mode[data-mode="after"]').click();
      await waitFor(() => shown("#ts-add-h") && !shown("#ts-until"));
      set("ts-from", "15:50");
      [...document.querySelectorAll("#tool-time-sums .ts-quick-btn")].find((b) => b.textContent === "15 min").click();
      await waitFor(() => answer().includes("4:05 pm") && answer().includes("15 minutes after 3:50 pm"));
      const [hours, minutes] = document.querySelectorAll("#tool-time-sums .ts-number input");
      hours.value = "8"; hours.dispatchEvent(new Event("input", { bubbles: true }));
      minutes.value = "20"; minutes.dispatchEvent(new Event("input", { bubbles: true }));
      await waitFor(() => answer().includes("12:10 am tomorrow"));
      document.querySelector("#tool-time-sums .ts-now").click();
    }),
    // From is the time now again (a minute may have turned meanwhile)
    expect: inPage(() => !shown("#tool-time-sums .ts-now") &&
      [hhmm(now()), hhmm(now() + 1)].includes(document.getElementById("ts-from").value)),
  },
  {
    name: "✕ clears it all, and Put it back brings it back; the question is kept for next time",
    path: "/#time-sums",
    init: HELPERS,
    setup: run(async () => {
      await waitFor(() => shown("#ts-from"));
      document.querySelector('#tool-time-sums .ts-mode[data-mode="after"]').click();
      [...document.querySelectorAll("#tool-time-sums .ts-quick-btn")].find((b) => b.textContent === "1 hour").click();
      await waitFor(() => answer());
      document.getElementById("clear-all").click();
      await waitFor(() => !answer() && shown("#toast"));
      document.getElementById("toast-undo").click();
      await waitFor(() => answer().includes("1 hour after"));
      location.hash = "";
      await waitFor(() => shown("#menu"));
      document.querySelector('#menu a[href="#time-sums"]').click();
      await waitFor(() => shown("#ts-from"));
    }),
    expect: inPage(() => mode() === "after" && answer().includes("1 hour after") &&
      JSON.parse(localStorage.getItem("simplify-time-sums-v1")).add === 60),
  },
  {
    name: "pictures only: the questions keep their pictures, the numbers stay",
    path: "/#time-sums",
    init: HELPERS + `localStorage.setItem("simplify-device-v1", JSON.stringify({ picturesOnly: true }));`,
    setup: run(async () => {
      await waitFor(() => shown("#ts-from"));
      document.querySelector('#tool-time-sums .ts-mode[data-mode="after"]').click();
    }),
    expect: inPage(() => document.querySelector("#tool-time-sums .ts-mode-words").getBoundingClientRect().width <= 1 && shown("#tool-time-sums .ts-mode img") &&
      shown("#tool-time-sums .ts-quick-btn") && fits()),
  },
  {
    name: "iPad: the two questions side by side, the boxes full width",
    path: "/#time-sums",
    viewport: { width: 820, height: 1180 },
    init: HELPERS,
    setup: run(() => waitFor(() => shown("#ts-from"))),
    expect: inPage(() => {
      const [a, b] = document.querySelectorAll("#tool-time-sums .ts-mode");
      return Math.abs(a.getBoundingClientRect().top - b.getBoundingClientRect().top) < 2 && fits();
    }),
  },
];
