// Regression cases for the dictation parser. No dependencies, no runner:
//
//   node tools/test-speak.mjs
//
// speechToCents() is a heuristic over whatever the OS keyboard's dictation
// happens to type, so its behaviour is easiest to pin down by example. Every
// case below is also a claim made in docs/voice-input.md — keep them in step.

import { speechToCents } from "../public/js/speak.js";

const cases = [
  // digits, the common case once dictation applies its own normalisation
  ["12.50", 1250],
  ["$12.50", 1250],
  ["12:50", 1250], // dictation guessed a time
  ["1,200", 120000],
  ["10", 1000],
  ["10 dollars 50 cents", 1050],
  ["10 dollars fifty", 1050],
  ["50 cents", 50],

  // word numbers, when no normalisation happened
  ["ten", 1000],
  ["five dollars", 500],
  ["fifty cents", 50],
  ["ninety nine cents", 99],
  ["twelve fifty", 1250], // two numbers, not sixty-two
  ["five five", 505],
  ["twenty five", 2500],
  ["two hundred fifty", 25000], // one number: hundreds absorb a tens word
  ["a hundred and five", 10500],
  ["one thousand", 100000],
  ["one thousand fifty", 105000],
  ["twelve thousand", 1200000],
  ["one hundred thousand", 10000000],

  // "thousand" must not be rescaled by a later "hundred"
  ["one thousand two hundred", 120000],
  ["two thousand five hundred", 250000],
  ["one thousand two hundred thirty four", 123400],

  // hyphens split rather than vanish — a swallowed number used to leave a
  // confident wrong amount behind ("twenty-five dollars fifty cents" → $50)
  ["twenty-five", 2500],
  ["twenty-five dollars fifty cents", 2550],
  ["thirty-two fifty", 3250],

  // nothing usable
  ["nothing", null],
  ["", null],
  [null, null],

  // known gap, deliberate: a second number that cannot be cents is dropped
  // rather than guessed at. The dialog previews the result before it lands.
  ["10 200", 1000],
];

let failed = 0;
for (const [input, want] of cases) {
  const got = speechToCents(input);
  if (got !== want) failed++;
  console.log(
    `${got === want ? "ok  " : "FAIL"}  ${JSON.stringify(input).padEnd(38)} → ${String(got).padEnd(9)}` +
    (got === want ? "" : `expected ${want}`)
  );
}

console.log(failed ? `\n${failed} of ${cases.length} failed` : `\nall ${cases.length} passed`);
process.exit(failed ? 1 : 0);
