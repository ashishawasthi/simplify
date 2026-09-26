// Video 2 for learners: set-up and more. What an adult sets up (the held
// button, tools on and off, tucked tools), joining a class and reading its
// page, and the tools the basics video leaves out.

import { CLASS, CODE, HELPERS, fill } from "../../tools/guide-scenes.mjs";

const money = (tool, box) => `#tool-${tool} [data-box="${box}"] input`;
const lastPrice = (tool) => `#tool-${tool} [data-list] li:last-child .amount-field input`;
const lastName = (tool) => `#tool-${tool} [data-list] li:last-child .name-field`;
const addItem = (tool) => `#tool-${tool} [data-add-item]`;
// give an element found by its words an id, so a step can tap it
const tag = (sel, words, id) => `[...document.querySelectorAll(${JSON.stringify(sel)})]
  .find((el) => el.textContent.includes(${JSON.stringify(words)})).id = ${JSON.stringify(id)};`;

// the class's QR code opens #join=<code>; Google's server is stood in for, as
// in the class-join guide scene
const JOIN = `
  localStorage.setItem("simplify-class-emulator", "on");
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, options) => {
    const url = String(input?.url ?? input);
    if (!url.startsWith("http://127.0.0.1:8085/")) return realFetch(input, options);
    return new Response(JSON.stringify({ fields: {
      name: { stringValue: "3 Kindness" }, status: { stringValue: "active" }, latest: { nullValue: null },
    } }), { status: 200, headers: { "content-type": "application/json" } });
  };
  location.hash = "#join=${CODE}";
  await pause(800);
`;

export default {
  helpers: HELPERS,
  intro: {
    title: "Set up, and more",
    line: "For adults, and for My class",
    logo: "/img/icons/icon-512.png",
    icons: ["/img/pic/school.svg", "/img/pic/clock.svg", "/img/pic/shop.svg", "/img/pic/menu-talk.svg"],
    say: "Simplify. Set-up, My class, and more tools.",
  },
  chapters: [
    {
      title: "Set up", line: "For adults", icon: "⚙️", color: "#455a64", say: "Set-up, for adults.",
      shots: [
        {
          title: "Open set-up", icon: "⚙️", line: "Press and hold, so only an adult opens it.",
          shot: { path: "/#setup", expect: `!!document.querySelector('#tool-setup .hold-btn')`,
            steps: [{ wait: 300 }, { hold: "#tool-setup .hold-btn", ms: 1700, after: 900 }] },
        },
        {
          title: "Show on the menu", icon: "🏠", line: "Switch off the tools a learner does not need.",
          shot: { path: "/#setup", expect: `!!document.querySelector('#tool-setup .hold-btn')`,
            prep: `await hold();`,
            steps: [
              { js: tag("#tool-setup .setup-switch", "Next note", "sw-next-note") },
              { scroll: "#sw-next-note", after: 700 },
              { tap: "#sw-next-note", after: 1100 },
            ] },
        },
        {
          title: "Tucked away", icon: "➕", line: "Switched-off tools wait under the plus.",
          shot: { path: "/", prep: `deviceSettings({ hidden: ["next-dollar", "next-note"] }); await pause(300);`,
            expect: `!!document.getElementById('tuck-money')`,
            steps: [{ wait: 400 }, { tap: "#tuck-money", after: 1200 }] },
        },
      ],
    },
    {
      title: "My class", icon: "/img/pic/school.svg", color: "#ef6c00",
      shots: [
        {
          title: "Join a class", icon: "📷", line: "Scan the class's QR code, then tap Yes.",
          shot: { path: "/", prep: JOIN, expect: `document.querySelector('#tool-setup .cs-question')?.getClientRects().length > 0`,
            steps: [{ wait: 600 }, { tap: "#tool-setup .cs-yes", after: 1300 }] },
        },
        {
          title: "Your coach's page", icon: "/img/pic/school.svg", line: "My class shows the page, one screen at a time.",
          shot: { path: "/", prep: CLASS, expect: `document.querySelector('#menu li[data-tool="my-class"]')?.getClientRects().length > 0`,
            steps: [
              { wait: 400 },
              { tap: `#menu li[data-tool="my-class"] a`, after: 1000 },
              { tap: "#tool-my-class .mc-next", after: 900 },
            ] },
        },
      ],
    },
    {
      title: "More money tools", icon: "💰", color: "#2e7d32",
      shots: [
        {
          title: "Count your notes", icon: "💵", line: "Tap the notes and coins you have.",
          shot: { path: "/#can-i-buy", expect: `!!document.querySelector('#tool-can-i-buy [data-picker-for="money"]')`,
            steps: [
              { tap: `#tool-can-i-buy [data-picker-for="money"]`, after: 600 },
              { tap: `#picker [aria-label^="Add 10 dollars"]`, after: 350 },
              { tap: `#picker [aria-label^="Add 5 dollars"]`, after: 350 },
              { tap: `#picker [aria-label^="Add 2 dollars"]`, after: 700 },
            ] },
        },
        {
          title: "Show me", icon: "🛒", line: "Not enough? It shows what is missing.",
          shot: { path: "/#can-i-buy", prep: fill("can-i-buy", { money: "5" }, ["6.30"]),
            expect: `document.getElementById('result-headline')?.textContent === 'Cannot buy'`,
            steps: [{ wait: 500 }, { tap: "#result-action", after: 1300 }] },
        },
        {
          title: "Shopping list", icon: "📝", line: "Things and prices, inside your budget.",
          shot: { path: "/#shopping-list", expect: `!!document.querySelector('${money("shopping-list", "money")}')`,
            steps: [
              { type: money("shopping-list", "money"), text: "5" },
              { type: lastName("shopping-list"), text: "Milk" },
              { type: lastPrice("shopping-list"), text: "1.50" },
              { js: "document.activeElement.blur()", after: 300 },
              { focus: "#result", zoom: 1.2, after: 900 },
            ] },
        },
        {
          title: "Next note", icon: "💵", line: "Which note to pay with.",
          shot: { path: "/#next-note", expect: `!!document.querySelector('${lastPrice("next-note")}')`,
            steps: [
              { type: lastPrice("next-note"), text: "3.50" },
              { js: "document.activeElement.blur()", after: 300 },
              { focus: "#result", zoom: 1.2, after: 900 },
            ] },
        },
      ],
    },
    {
      title: "Time", icon: "/img/pic/clock.svg", color: "#1565c0",
      shots: [
        {
          title: "Time sums", icon: "/img/pic/clock.svg", line: "How long until, or what time after.",
          shot: { path: "/#time-sums", expect: `!!document.getElementById('ts-from')`,
            steps: [
              { js: `const set = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); };
                set("ts-from", "14:10");`, after: 500 },
              { js: `const el = document.getElementById("ts-until"); el.value = "15:30"; el.dispatchEvent(new Event("input", { bubbles: true }));`, after: 500 },
              { focus: "#result", zoom: 1.2, after: 900 },
            ] },
        },
      ],
    },
  ],
  end: {
    title: "More help",
    line: "Tap ℹ️ How to use, at the bottom of the menu",
    logo: "/img/icons/icon-512.png",
    say: "For more help, tap How to use.",
  },
};
