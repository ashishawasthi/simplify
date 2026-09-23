// What the answer panel says in each tool. Pure — no DOM — so
// tools/test-money.mjs can hold every wording to the requester's examples.
//
// Each function takes amounts already parsed to cents (null = an empty box)
// and returns { tone, icon, headline, subline?, showMe?, pictures? }:
//   tone      "yes" | "no" | "answer" | "neutral" — the panel's colour.
//             "answer" is an amount (change, next dollar …), not a yes/no.
//   icon      an emoji, or { picture: valueCents } for a note or coin drawing
//   subline   HTML, built only from formatted numbers and denomination
//             labels — never from anything the user typed
//   showMe    { label, title, cents } — the 💵 Show me sheet's content
//   pictures  [{ pieces, caption? }] — drawn on the tool's screen
//
// An empty money box counts as $0 as soon as there is something to judge:
// the answer never sits waiting for it.

import {
  formatCents, roundUpToCoin, breakdown, moneyWords, nextDollar, nextNotes, piecesTotal,
} from "./money.js";

const strong = (cents) => `<strong>${formatCents(cents)}</strong>`;

const TYPE_MONEY = { tone: "neutral", icon: "⬆️", headline: "Type your money at the top" };
const ADD_PRICES = { tone: "neutral", icon: "🛒", headline: "Add the prices of things to buy" };

function cannotBuy(short) {
  return {
    tone: "no",
    icon: "✋",
    headline: "Cannot buy",
    // phrased as "need more", never as a negative number
    subline: `You need ${strong(short)} more`,
    showMe: { label: "You need", title: `${formatCents(short)} more`, cents: short },
  };
}

export function canIBuy({ money, total, hasPrices }) {
  if (!hasPrices) return money == null ? TYPE_MONEY : ADD_PRICES;
  const left = (money ?? 0) - total;
  if (left < 0) return cannotBuy(-left);
  return { tone: "yes", icon: "✅", headline: "Can buy", subline: `Money left: ${strong(left)}` };
}

export function change({ money, spend }) {
  if (!spend) {
    return money == null
      ? TYPE_MONEY
      : { tone: "neutral", icon: "🧾", headline: "Type how much you spend" };
  }
  const back = (money ?? 0) - spend;
  if (back < 0) return cannotBuy(-back);
  if (back === 0) {
    return { tone: "answer", icon: "👍", headline: "No change", subline: "You gave the exact money" };
  }
  return {
    tone: "answer",
    icon: { picture: 50 },
    headline: `Change: ${formatCents(back)}`,
    subline: "The money you get back",
    showMe: { label: "Your change", title: formatCents(back), cents: back },
  };
}

export function nextDollarAnswer({ total, hasPrices }) {
  if (!hasPrices) return ADD_PRICES;
  const pay = nextDollar(total);
  const back = pay - total;
  return {
    tone: "answer",
    icon: "💲",
    headline: `Next dollar: ${formatCents(pay)}`,
    subline: back ? `You get back ${strong(back)}` : "That is exact — no change",
  };
}

export function nextNote({ total, hasPrices }) {
  if (!hasPrices) return ADD_PRICES;
  const { pay, backup } = nextNotes(total);
  const words = moneyWords(pay);
  const single = pay.length === 1 && pay[0].count === 1;
  const answer = {
    tone: "answer",
    icon: { picture: pay[0].valueCents },
    headline: single ? `Next note: ${words}` : `Pay ${words}`,
    subline: single ? "" : `That makes ${strong(piecesTotal(pay))}`,
    pictures: [{ pieces: pay }],
  };
  if (backup) {
    const instead = `No ${words}? Use ${moneyWords(backup)}`;
    answer.subline = instead;
    // drawn at its real size too: a $10 must look bigger than a $5, even as
    // the second choice
    answer.pictures.push({ caption: `No ${words}? Use:`, pieces: backup });
  }
  return answer;
}

export function makeAmount({ need }) {
  if (!need) return { tone: "neutral", icon: "⬆️", headline: "Type how much you need" };
  // there is no 1¢ coin, so an odd amount is made up to the next 5¢
  const made = roundUpToCoin(need);
  const pieces = breakdown(made);
  const words = moneyWords(pieces);
  return {
    tone: "answer",
    icon: { picture: pieces[0].valueCents },
    headline: `Make ${formatCents(need)}`,
    subline: made === need ? words : `${words} makes ${strong(made)}`,
    pictures: [{ pieces }],
  };
}

export function shoppingList({ money, total, hasPrices }) {
  if (!hasPrices) {
    return money == null
      ? TYPE_MONEY
      : { tone: "neutral", icon: "📝", headline: "Add the things you need to buy" };
  }
  const left = (money ?? 0) - total;
  if (left < 0) {
    return { tone: "no", icon: "✋", headline: "Over your budget", subline: `Too much by ${strong(-left)}` };
  }
  return { tone: "yes", icon: "✅", headline: "Yes! Within your budget", subline: `Money left: ${strong(left)}` };
}

// The tools, by the id used in the URL (#change) and in the guide
// (/guide/change).
export const ANSWERS = {
  "can-i-buy": canIBuy,
  "change": change,
  "next-dollar": nextDollarAnswer,
  "next-note": nextNote,
  "make-amount": makeAmount,
  "shopping-list": shoppingList,
};
