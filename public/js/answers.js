// What the answer panel says in each tool. Pure — no DOM — so
// tools/test-money.mjs can hold every wording to the requester's examples.
//
// Each function takes amounts already parsed to cents (null = an empty box)
// and returns { tone, icon, headline, subline?, badge?, showMe?, pictures? }:
//   tone      "yes" | "no" | "answer" | "neutral" — the panel's colour.
//             "answer" is an amount (change, next dollar …), not a yes/no.
//             "neutral" is nothing to judge yet: no panel is shown at all
//             (a "type your money here" line is only more to read — the
//             empty boxes already say it), so it carries nothing else.
//   icon      an emoji, or { picture: valueCents } for a note or coin drawing
//   subline   HTML, built only from formatted numbers and denomination
//             labels — never from anything the user typed (ANSWERS marks
//             these answers with MARKUP, below, so result.js trusts them)
//   badge     short plain text ("$6 more") on a yes/no answer only, echoed
//             on the floating badge at the top of the screen — the on-screen
//             keyboard hides the bottom panel far more often than it hides
//             the top of the screen, and a bare ✋ can't say how much
//   showMe    { label, title, cents } — the 💵 Show me sheet's content
//   pictures  [{ pieces, caption? }] — drawn on the tool's screen
//
// An empty money box counts as $0 as soon as there is something to judge:
// the answer never sits waiting for it.

import {
  formatCents, roundUpToCoin, breakdown, moneyWords, nextDollar, nextNotes, piecesTotal,
} from "./money.js";

const strong = (cents) => `<strong>${formatCents(cents)}</strong>`;

const NOTHING_YET = { tone: "neutral" };

function cannotBuy(short) {
  return {
    tone: "no",
    icon: "✋",
    headline: "Cannot buy",
    // phrased as "need more", never as a negative number
    subline: `You need ${strong(short)} more`,
    badge: `${formatCents(short)} more`,
    showMe: { label: "You need", title: `${formatCents(short)} more`, cents: short },
  };
}

export function canIBuy({ money, total, hasPrices }) {
  if (!hasPrices) return NOTHING_YET;
  const left = (money ?? 0) - total;
  if (left < 0) return cannotBuy(-left);
  return {
    tone: "yes", icon: "✅", headline: "Can buy",
    subline: `Money left: ${strong(left)}`, badge: `${formatCents(left)} left`,
  };
}

export function change({ money, spend }) {
  if (!spend) return NOTHING_YET;
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
  if (!hasPrices) return NOTHING_YET;
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
  if (!hasPrices) return NOTHING_YET;
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
  if (!need) return NOTHING_YET;
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
  if (!hasPrices) return NOTHING_YET;
  const left = (money ?? 0) - total;
  if (left < 0) {
    return {
      tone: "no", icon: "✋", headline: "Over your budget",
      subline: `Too much by ${strong(-left)}`, badge: `${formatCents(-left)} over`,
    };
  }
  return {
    tone: "yes", icon: "✅", headline: "Yes! Within your budget",
    subline: `Money left: ${strong(left)}`, badge: `${formatCents(left)} left`,
  };
}

// Marks an answer from this file, whose subline may be markup (<strong>)
// built only from formatted numbers and fixed words. result.js puts a
// subline on screen with innerHTML only when its answer carries this mark;
// every other answer — any new tool's, with words a person typed — is shown
// as plain text. A Symbol, so no JSON (saved state, a class post) can claim it.
export const MARKUP = Symbol("markup built by answers.js");

const marked = (answer) => (amounts) => ({ ...answer(amounts), [MARKUP]: true });

// The tools, by the id used in the URL (#change) and in the guide
// (/guide/change).
export const ANSWERS = {
  "can-i-buy": marked(canIBuy),
  "change": marked(change),
  "next-dollar": marked(nextDollarAnswer),
  "next-note": marked(nextNote),
  "make-amount": marked(makeAmount),
  "shopping-list": marked(shoppingList),
};
