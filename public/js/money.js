// Pure money helpers. All amounts are integer cents — no float arithmetic.

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
