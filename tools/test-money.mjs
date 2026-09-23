// Regression cases for the money maths and every tool's answer. No
// dependencies, no runner:
//
//   node tools/test-money.mjs
//
// The requester's own examples (the change-requests PDF, numbered as there)
// are here verbatim, so a wording or sum can't drift from what was asked.

import {
  roundUpToCoin, breakdown, moneyWords, nextDollar, nextNotes,
} from "../public/js/money.js";
import {
  canIBuy, change, nextDollarAnswer, nextNote, makeAmount, shoppingList,
} from "../public/js/answers.js";

const text = (html) => (html ?? "").replace(/<[^>]+>/g, "");
// includes badge (the floating top-of-screen amount, e.g. "$6 more") when the
// answer has one, so a yes/no wording can't drift without this catching it
const said = (a) => [a.tone, a.headline, text(a.subline), a.badge && `[${a.badge}]`]
  .filter(Boolean).join(" | ");
const pieces = (list) => list.map((p) => `${p.valueCents}x${p.count}`).join(" ");

const cases = [
  // ---- the maths ----
  ["round up 133¢", roundUpToCoin(133), 135],
  ["round up 130¢", roundUpToCoin(130), 130],
  ["round up 1¢", roundUpToCoin(1), 5],
  ["breakdown $1.30 (req 6, 7d)", pieces(breakdown(130)), "100x1 20x1 10x1"],
  ["breakdown $1.35", pieces(breakdown(135)), "100x1 20x1 10x1 5x1"],
  ["breakdown $2.70", pieces(breakdown(270)), "200x1 50x1 20x1"],
  ["breakdown $4", pieces(breakdown(400)), "200x2"],
  ["breakdown $80", pieces(breakdown(8000)), "5000x1 1000x3"],
  ["breakdown $187.65", pieces(breakdown(18765)), "10000x1 5000x1 1000x3 500x1 200x1 50x1 10x1 5x1"],
  ["words $1.30", moneyWords(breakdown(130)), "$1 + 20¢ + 10¢"],
  ["words $4", moneyWords(breakdown(400)), "$2 × 2"],
  ["next dollar $3.50 (req 7b)", nextDollar(350), 400],
  ["next dollar $4", nextDollar(400), 400],
  ["next dollar 30¢", nextDollar(30), 100],
  ["next notes $3.50 (req 7c)", pieces(nextNotes(350).pay) + " / " + pieces(nextNotes(350).backup), "500x1 / 1000x1"],
  ["next notes 80¢: $1 first", pieces(nextNotes(80).pay) + " / " + pieces(nextNotes(80).backup), "100x1 / 200x1"],
  ["next notes $5 exact", pieces(nextNotes(500).pay) + " / " + pieces(nextNotes(500).backup), "500x1 / 1000x1"],
  ["next notes $60", pieces(nextNotes(6000).pay) + " / " + nextNotes(6000).backup, "10000x1 / null"],
  ["next notes $130", pieces(nextNotes(13000).pay), "10000x1 5000x1"],
  ["next notes $260", pieces(nextNotes(26000).pay), "10000x3"],
  ["next notes $100.50", pieces(nextNotes(10050).pay), "10000x1 100x1"],

  // ---- 1, 2, 4: Can I buy? ----
  ["nothing typed", said(canIBuy({ money: null, total: 0, hasPrices: false })), "neutral | Type your money at the top"],
  ["money, no prices", said(canIBuy({ money: 500, total: 0, hasPrices: false })), "neutral | Add the prices of things to buy"],
  ["req 2: price, money empty", said(canIBuy({ money: null, total: 100, hasPrices: true })), "no | Cannot buy | You need $1 more | [$1 more]"],
  ["req 4: enough", said(canIBuy({ money: 500, total: 350, hasPrices: true })), "yes | Can buy | Money left: $1.50 | [$1.50 left]"],
  ["exactly enough", said(canIBuy({ money: 350, total: 350, hasPrices: true })), "yes | Can buy | Money left: $0 | [$0 left]"],
  ["req 6: short $1.30", said(canIBuy({ money: 500, total: 630, hasPrices: true })), "no | Cannot buy | You need $1.30 more | [$1.30 more]"],
  ["req 6: show me", JSON.stringify(canIBuy({ money: 500, total: 630, hasPrices: true }).showMe),
    JSON.stringify({ label: "You need", title: "$1.30 more", cents: 130 })],
  // the reported bug: My money $10, items $8 + $8 — the bottom panel is
  // often hidden by the on-screen keyboard, so the floating badge at the
  // top must carry the shortfall too, not just the ✋ icon
  ["reported: $10 money, $16 items", said(canIBuy({ money: 1000, total: 1600, hasPrices: true })),
    "no | Cannot buy | You need $6 more | [$6 more]"],

  // ---- 7a: What is the change? ----
  ["req 7a: $5 pay $2.30", said(change({ money: 500, spend: 230 })), "answer | Change: $2.70 | The money you get back"],
  ["change show me", change({ money: 500, spend: 230 }).showMe.cents, 270],
  ["exact money", said(change({ money: 230, spend: 230 })), "answer | No change | You gave the exact money"],
  ["not enough to pay", said(change({ money: 200, spend: 230 })), "no | Cannot buy | You need $0.30 more | [$0.30 more]"],
  ["spend, money empty", said(change({ money: null, spend: 230 })), "no | Cannot buy | You need $2.30 more | [$2.30 more]"],
  ["money, no spend", said(change({ money: 500, spend: null })), "neutral | Type how much you spend"],

  // ---- 7b: Next dollar ----
  ["req 7b: 1.20 + 0.80 + 1.50", said(nextDollarAnswer({ total: 350, hasPrices: true })), "answer | Next dollar: $4 | You get back $0.50"],
  ["whole dollars", said(nextDollarAnswer({ total: 400, hasPrices: true })), "answer | Next dollar: $4 | That is exact — no change"],
  ["no prices", said(nextDollarAnswer({ total: 0, hasPrices: false })), "neutral | Add the prices of things to buy"],

  // ---- 7c: Next note ----
  ["req 7c: $3.50", said(nextNote({ total: 350, hasPrices: true })), "answer | Next note: $5 | No $5? Use $10"],
  ["req 7c: 2 pictures max", nextNote({ total: 350, hasPrices: true }).pictures.length, 2],
  ["top note, no backup", said(nextNote({ total: 6000, hasPrices: true })), "answer | Next note: $100"],
  ["over $100", said(nextNote({ total: 13000, hasPrices: true })), "answer | Pay $100 + $50 | That makes $150"],

  // ---- 7d: Make the amount ----
  ["req 7d: $1.30", said(makeAmount({ need: 130 })), "answer | Make $1.30 | $1 + 20¢ + 10¢"],
  ["odd cents round up", said(makeAmount({ need: 133 })), "answer | Make $1.33 | $1 + 20¢ + 10¢ + 5¢ makes $1.35"],
  ["nothing needed", said(makeAmount({ need: null })), "neutral | Type how much you need"],

  // ---- 7e: Make a shopping list ----
  ["req 7e: $5, 1.20 + 0.80 + 1.50", said(shoppingList({ money: 500, total: 350, hasPrices: true })),
    "yes | Yes! Within your budget | Money left: $1.50 | [$1.50 left]"],
  ["over budget", said(shoppingList({ money: 300, total: 350, hasPrices: true })), "no | Over your budget | Too much by $0.50 | [$0.50 over]"],
  ["list, money empty", said(shoppingList({ money: null, total: 350, hasPrices: true })), "no | Over your budget | Too much by $3.50 | [$3.50 over]"],
  ["money, empty list", said(shoppingList({ money: 500, total: 0, hasPrices: false })), "neutral | Add the things you need to buy"],
];

let failed = 0;
for (const [name, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name.padEnd(32)} → ${String(got)}` + (ok ? "" : `\n      expected ${want}`));
}

console.log(failed ? `\n${failed} of ${cases.length} failed` : `\nall ${cases.length} passed`);
process.exit(failed ? 1 : 0);
