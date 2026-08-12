// Voice entry. The money fields use inputmode="decimal", and neither Gboard
// nor the iOS keyboard offers voice typing on the number pad — so this dialog
// opens a plain text box (full keyboard, mic available), and whatever gets
// dictated is parsed back into a clean amount for the numeric field.

import { formatCents } from "./money.js";

let els = null;
let onAmount = null;

export function initSpeak(elements) {
  els = elements;
  els.input.addEventListener("input", preview);
  els.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      finish();
    }
  });
  els.done.addEventListener("click", finish);
  els.cancel.addEventListener("click", () => els.dialog.close());
}

// cb receives the amount as field text, e.g. "12.50"
export function openSpeak(cb) {
  onAmount = cb;
  els.input.value = "";
  preview();
  els.dialog.showModal();
  els.input.focus(); // same tap gesture, so the keyboard opens right away
}

function preview() {
  const cents = speechToCents(els.input.value);
  els.heard.textContent = cents == null ? " " : `That is ${formatCents(cents)}`;
}

function finish() {
  const cents = speechToCents(els.input.value);
  if (cents == null) {
    els.heard.textContent = "Say a number, like “ten dollars”";
    return;
  }
  els.dialog.close();
  onAmount?.(formatCents(cents, ""));
}

// Dictated speech → integer cents, or null when no number can be heard in it.
// Dictation mostly hands us digits already ("$12.50", "12:50", "10 dollars
// 50 cents") but can leave word numbers ("twelve fifty"), so both are handled.
export function speechToCents(raw) {
  if (raw == null) return null;
  let s = String(raw)
    .toLowerCase()
    .replace(/[,$]/g, "")
    .replace(/(\d+):(\d{2})/g, "$1.$2") // "twelve fifty" often arrives as "12:50"
    .trim();
  s = wordsToDigits(s);

  const hasDollar = /dollar|buck/.test(s);
  const hasCent = /cent/.test(s);
  const nums = s.match(/\d*\.\d+|\d+/g);
  if (!nums) return null;

  const first = parseFloat(nums[0]);
  if (hasCent && !hasDollar) return Math.round(first); // "50 cents"
  if (nums.length >= 2 && !nums[0].includes(".") && !nums[1].includes(".")) {
    const second = parseFloat(nums[1]);
    // "10 50" / "10 dollars 50 cents" → dollars + cents
    if (second < 100) return Math.round(first * 100 + second);
  }
  return Math.round(first * 100);
}

const UNITS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19,
};
const TENS = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
  eighty: 80, ninety: 90,
};

// "twelve fifty" → "12 50", "one hundred and five" → "100 5" (the caller's
// dollars-plus-cents rule puts split numbers back together where it applies).
function wordsToDigits(s) {
  const out = [];
  let cur = null;
  const flush = () => {
    if (cur != null) out.push(String(cur));
    cur = null;
  };
  for (const tok of s.split(/\s+/)) {
    const word = tok.replace(/-/g, ""); // "twenty-five"
    if (word in TENS) {
      // a tens word never continues a small number: "twelve fifty" is 12 | 50
      if (cur != null && cur % 100 !== 0) flush();
      cur = (cur ?? 0) + TENS[word];
    } else if (word in UNITS) {
      if (cur != null && cur < 20) flush(); // "five five" is 5 | 5
      cur = (cur ?? 0) + UNITS[word];
    } else if (word === "hundred") {
      cur = (cur ?? 1) * 100;
    } else if (word === "thousand") {
      cur = (cur ?? 1) * 1000;
    } else if (word === "and" || word === "a") {
      continue; // "one hundred and five", "a hundred"
    } else {
      flush();
      out.push(tok);
    }
  }
  flush();
  return out.join(" ");
}
