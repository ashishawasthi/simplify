// Pure money helpers. All amounts are integer cents — no float arithmetic.

import { CURRENCIES, DEFAULT_CURRENCY, findDenomination } from "./currency-data.js";

const MAX_CENTS = 100_000_000; // $1,000,000 — sanity cap, not a validation error

// Forgiving parse: accepts "5", "5.5", "$5.50", "1,000", and keyboard-dictation
// text like "10 dollars 50 cents". Returns integer cents, or null when the
// string contains no number at all. Never throws, never returns negatives.
export function parseToCents(input) {
  if (input == null) return null;
  const s = String(input).replace(/,/g, "");
  const nums = s.match(/\d*\.\d+|\d+\.?/g);
  if (!nums) return null;
  let cents;
  if (nums.length >= 2 && !nums[0].includes(".")) {
    // "10 dollars 50" → dollars + cents
    cents = Math.round(parseFloat(nums[0]) * 100) + Math.round(parseFloat(nums[1]));
  } else {
    cents = Math.round(parseFloat(nums[0]) * 100);
  }
  if (!Number.isFinite(cents) || cents < 0) return null;
  return Math.min(cents, MAX_CENTS);
}

// 1350 → "$13.50"; whole dollars drop the ".00" (fewer symbols to read).
export function formatCents(cents, symbol = "$") {
  const dollars = Math.floor(cents / 100);
  const rem = cents % 100;
  return rem === 0
    ? `${symbol}${dollars}`
    : `${symbol}${dollars}.${String(rem).padStart(2, "0")}`;
}

export const sum = (arr) => arr.reduce((a, b) => a + b, 0);

// ---------- notes and coins for an amount ----------
// A "piece" list is [{ valueCents, count }], biggest first.

const cur = CURRENCIES[DEFAULT_CURRENCY];
const PIECES = [...cur.notes, ...cur.coins].map((d) => d.valueCents).sort((a, b) => b - a);
const SMALLEST = PIECES[PIECES.length - 1]; // 5¢ — no 1¢ coin is issued any more

// Round up to an amount the coins can actually make. Up, never down: an
// answer that leaves the student a few cents short is the one wrong answer.
export function roundUpToCoin(cents) {
  return Math.ceil(cents / SMALLEST) * SMALLEST;
}

// The fewest notes and coins that make `cents` (a multiple of 5¢). Taking the
// biggest piece that fits, again and again, is optimal for SGD's 1-2-5 values.
export function breakdown(cents) {
  const pieces = [];
  let left = cents;
  for (const valueCents of PIECES) {
    const count = Math.floor(left / valueCents);
    if (count > 0) {
      pieces.push({ valueCents, count });
      left -= count * valueCents;
    }
  }
  return pieces;
}

export const piecesTotal = (pieces) => sum(pieces.map((p) => p.valueCents * p.count));

// "$1 + 20¢ + 10¢", with "× 3" for repeats — the same way the picker's tray
// writes a count.
export function moneyWords(pieces) {
  return pieces
    .map(({ valueCents, count }) => {
      const label = findDenomination(DEFAULT_CURRENCY, valueCents).label;
      return count > 1 ? `${label} × ${count}` : label;
    })
    .join(" + ");
}

// Next dollar: pay the next whole dollar up. $3.50 → $4; $4 is already whole.
export function nextDollar(cents) {
  return Math.ceil(cents / 100) * 100;
}

// Next note: the smallest note that covers the total — with the $1 coin as
// the first step, as the lesson counts it ("$1, $2, $5 …") — plus the one
// after it, for when the student doesn't have that note. Past the biggest
// note: a $100 for each full hundred and the next note for the rest, with
// no backup.
const LADDER = [100, ...cur.notes.map((n) => n.valueCents)].sort((a, b) => a - b);

export function nextNotes(cents) {
  const top = LADDER[LADDER.length - 1];
  if (cents <= top) {
    const i = LADDER.findIndex((v) => v >= cents);
    return {
      pay: [{ valueCents: LADDER[i], count: 1 }],
      backup: LADDER[i + 1] ? [{ valueCents: LADDER[i + 1], count: 1 }] : null,
    };
  }
  const pay = [{ valueCents: top, count: Math.floor(cents / top) }];
  const rest = cents % top;
  if (rest > 0) {
    const next = LADDER.find((v) => v >= rest);
    if (next === top) pay[0].count += 1;
    else pay.push({ valueCents: next, count: 1 });
  }
  return { pay, backup: null };
}
