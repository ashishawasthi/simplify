// Video 1 for learners: the basics. The menu, then one tool of each kind,
// each used for real — typed into, tapped — with one short spoken line.
// Starting states reuse the guide scenes' helpers (tools/guide-scenes.mjs),
// so a change that breaks a scene there breaks it here too.

import { HELPERS } from "../../tools/guide-scenes.mjs";

const money = (tool, box) => `#tool-${tool} [data-box="${box}"] input`;
const lastPrice = (tool) => `#tool-${tool} [data-list] li:last-child .amount-field input`;
const addItem = (tool) => `#tool-${tool} [data-add-item]`;

// Now and next: four cards an adult added (as the guide scene makes them)
const MORNING_CARDS = `
  $("#tool-now-next .nn-add-first").click();
  await pickPicture("brush-teeth");
  $$("#tool-now-next .nn-view")[1].click();
  await pause(500);
  for (const id of ["bus", "school", "home"]) {
    $("#tool-now-next .nn-add").click();
    await pickPicture(id);
    await pause(300);
  }
  $$("#tool-now-next .nn-view")[0].click();
  await pause(500);
  scrollTo(0, 0);
`;

export default {
  helpers: HELPERS,
  intro: {
    title: "Simplify",
    line: "Small tools for daily life",
    logo: "/img/icons/icon-512.png",
    icons: ["/img/pic/shop.svg", "/img/pic/menu-now-next.svg", "/img/pic/menu-i-need.svg", "/img/pic/menu-safe.svg", "/img/pic/school.svg"],
    say: "Simplify. Small tools for daily life.",
  },
  chapters: [
    {
      shots: [{
        title: "The menu", icon: "🏠", line: "Tap a tool to open it.",
        shot: { path: "/", expect: `!document.getElementById('menu').hidden`,
          steps: [{ wait: 500 }, { tap: `#menu li[data-tool="can-i-buy"] a`, after: 900 }] },
      }],
    },
    {
      title: "Money", icon: "💰", color: "#2e7d32",
      shots: [
        {
          title: "Can I buy?", icon: "🛒", line: "Type your money and the prices.",
          shot: { path: "/#can-i-buy", expect: `!!document.querySelector('${money("can-i-buy", "money")}')`,
            steps: [
              { type: money("can-i-buy", "money"), text: "50" },
              { type: lastPrice("can-i-buy"), text: "4.50" },
              { tap: addItem("can-i-buy") },
              { type: lastPrice("can-i-buy"), text: "12.90" },
              { js: "document.activeElement.blur()", after: 300 },
              { focus: "#result", zoom: 1.25, after: 900 },
            ] },
        },
        {
          title: "What is the change?", icon: "🪙", line: "Type what you give, and what it costs.",
          shot: { path: "/#change", expect: `!!document.querySelector('${money("change", "money")}')`,
            steps: [
              { type: money("change", "money"), text: "5" },
              { type: money("change", "spend"), text: "2.30" },
              { js: "document.activeElement.blur()", after: 300 },
              { focus: "#result", zoom: 1.25, after: 900 },
            ] },
        },
        {
          title: "Next dollar", icon: "💲", line: "Pay the next whole dollar.",
          shot: { path: "/#next-dollar", expect: `!!document.querySelector('${lastPrice("next-dollar")}')`,
            steps: [
              { type: lastPrice("next-dollar"), text: "1.20" },
              { tap: addItem("next-dollar") },
              { type: lastPrice("next-dollar"), text: "0.80" },
              { tap: addItem("next-dollar") },
              { type: lastPrice("next-dollar"), text: "1.50" },
              { js: "document.activeElement.blur()", after: 300 },
              { focus: "#result", zoom: 1.25, after: 900 },
            ] },
        },
        {
          title: "Make the amount", icon: "👛", line: "See the notes and coins to use.",
          shot: { path: "/#make-amount", expect: `!!document.querySelector('${money("make-amount", "need")}')`,
            steps: [
              { type: money("make-amount", "need"), text: "1.30" },
              { js: "document.activeElement.blur()", after: 400 },
              { focus: "#result", zoom: 1.2, after: 1000 },
            ] },
        },
      ],
    },
    {
      title: "My day", icon: "/img/pic/menu-my-day.svg", color: "#1565c0",
      shots: [
        {
          title: "Now and next", icon: "/img/pic/menu-now-next.svg", line: "What happens now, and what comes next.",
          shot: { path: "/#now-next", prep: MORNING_CARDS, expect: `!!document.querySelector('#tool-now-next .nn-done')`,
            steps: [{ wait: 500 }, { tap: "#tool-now-next .nn-done", after: 1200 }] },
        },
        {
          title: "Wait", icon: "/img/pic/more-time.svg", line: "Pick the minutes. Watch the time go.",
          shot: { path: "/#wait", expect: `document.querySelectorAll('#tool-wait .wait-min').length === 5`,
            steps: [{ wait: 400 }, { tap: `#tool-wait .wait-min[data-minutes="5"]`, after: 1500 }] },
        },
        {
          title: "Steps", icon: "/img/pic/menu-steps.svg", line: "A task, one step at a time.",
          shot: { path: "/#steps?deck=wash-hands", expect: `!!document.querySelector('#tool-steps .steps-next')`,
            steps: [{ wait: 500 }, { tap: "#tool-steps .steps-next", after: 800 }, { tap: "#tool-steps .steps-next", after: 900 }] },
        },
      ],
    },
    {
      title: "Talk", icon: "/img/pic/menu-talk.svg", color: "#6a1b9a",
      shots: [
        {
          title: "I need", icon: "/img/pic/menu-i-need.svg", line: "Tap a card to show an adult.",
          shot: { path: "/#i-need", expect: `document.querySelectorAll('#tool-i-need .need-card').length >= 7`,
            steps: [{ wait: 500 }, { tap: `#tool-i-need .need-card[data-card="break"]`, after: 1300 }] },
        },
        {
          title: "Show a card", icon: "/img/pic/menu-show-card.svg", line: "Big cards to show people outside.",
          shot: { path: "/#show-card", expect: `document.querySelectorAll('#tool-show-card .sc-card').length === 6`,
            steps: [{ wait: 500 }, { tap: `#tool-show-card .sc-card`, after: 1300 }] },
        },
      ],
    },
    {
      title: "Stay safe", icon: "/img/pic/menu-safe.svg", color: "#c62828",
      shots: [
        {
          title: "Stop and check", icon: "/img/pic/stop.svg", line: "Asked for a code? Stop, and show an adult.",
          shot: { path: "/#stop-check", expect: `document.querySelectorAll('#tool-stop-check .sk-ask').length === 10`,
            steps: [{ wait: 500 }, { tap: `#tool-stop-check .sk-ask[data-ask="code"]`, after: 1400 }] },
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
