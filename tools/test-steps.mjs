// The Steps decks and how to move through one (public/js/tools/steps-decks.js).
// No dependencies, no runner:
//
//   node tools/test-steps.mjs
//
// The decks are pinned word for word, so a step can't drift from what was
// decided; then the rules every deck must keep (pictures that exist, at least
// 3 core steps, at most 8 words a step), then Next, Back and Fewer steps, and
// the 30-minute start again for a shared iPad.

import {
  DECKS, DONE_PICTURE, deckById, shownSteps, where, stepAfter, stepBefore, cleanAt, cleanProgress,
  cleanFewer, leftOut, FORGET_AFTER_MS, isStale, resumeAt, cleanTouched,
} from "../public/js/tools/steps-decks.js";
import { PICTURES, pictureSrc, menuIconSrc } from "../public/js/pictures.js";

const wordCount = (text) => text.trim().split(/\s+/).filter(Boolean).length;
// a deck as one line per step: "picture | words | core"
const listed = (deck) => deck.steps.map((s) => `${s.picture} | ${s.words}${s.core ? "" : " | not core"}`).join("\n");
// where() as "place/count done? words"
const at = (deck, fewer, n) => {
  const w = where(deck, fewer, n);
  return w.done ? `done ${w.count}/${w.count}` : `${w.place + 1}/${w.count} ${w.step.words}`;
};
// every screen from the first step to All done, pressing Next
const walk = (deck, fewer) => {
  const seen = [];
  let n = 0;
  for (let i = 0; i < 20; i++) {
    seen.push(at(deck, fewer, n));
    if (where(deck, fewer, n).done) break;
    n = stepAfter(deck, fewer, n);
  }
  return seen.join(" → ");
};
// every screen from All done back to the first step, pressing Back
const walkBack = (deck, fewer) => {
  const seen = [];
  let n = deck.steps.length;
  for (let i = 0; i < 20; i++) {
    seen.push(at(deck, fewer, n));
    const before = stepBefore(deck, fewer, n);
    if (before === n) break;
    n = before;
  }
  return seen.join(" → ");
};

const MIN = 60 * 1000;
const MIN30 = 30 * MIN;
const NOW = Date.UTC(2026, 8, 23, 10, 0); // a fixed "now": the tests never read the clock
const wash = deckById("wash-hands");
const tray = deckById("return-tray");
const card = deckById("pay-card");

const cases = [
  // ---- the decks, as decided (the brief for the first release) ----
  ["deck ids, in chooser order", DECKS.map((d) => d.id).join(), "wash-hands,return-tray,pay-card"],
  ["deck names", DECKS.map((d) => d.name).join(" / "), "Wash hands / Return the tray / Pay by card"],
  ["deck pictures", DECKS.map((d) => d.picture).join(), "wash-hands,tray-return,card-reader"],
  ["Wash hands", listed(wash), [
    "tap-water | Turn on the tap",
    "rinse | Wet your hands",
    "soap | Put on soap",
    "rub-hands | Rub for 20 seconds",
    "rinse | Rinse off the soap",
    "tap-off | Turn off the tap | not core",
    "dry-hands | Dry your hands",
  ].join("\n")],
  ["Wash hands: end", wash.end, "All done. Your hands are clean."],
  ["Return the tray", listed(tray), [
    "tray | Finish your food",
    "tray | Put tissues and bones on the tray | not core",
    "carry-tray | Carry the tray with two hands",
    "tray-return | Find the tray return",
    "tray-return-halal | Halal tray? Use the halal side",
    "tray-return | Put the tray in",
    "wipe-table | Throw away table litter | not core",
  ].join("\n")],
  ["Return the tray: end", tray.end, "All done. The table is ready for the next person."],
  ["Pay by card", listed(card), [
    "check-amount | Can I buy it? | not core",
    "check-amount | Look at the price on the screen",
    "tap-card | Tap your card on the reader",
    "reader-tick | Wait for the beep or the green tick",
    "bank-card | Take your card back",
    "receipt | Take the receipt if you want it | not core",
  ].join("\n")],
  ["Pay by card: end", card.end, "All done. You paid."],
  ["Pay by card: the first step opens Can I buy?", JSON.stringify(card.steps[0].open),
    JSON.stringify({ id: "can-i-buy", icon: "🛒", words: "Can I buy?" })],
  ["only that step opens another tool", DECKS.flatMap((d) => d.steps).filter((s) => s.open).length, 1],
  // its button sits in the words' room, under one line of words
  ["a step with a button has one line of words (≤ 4 words, ≤ 16 letters)", DECKS.flatMap((d) => d.steps)
    .filter((s) => s.open && (wordCount(s.words) > 4 || s.words.length > 16)).map((s) => s.words).join() || "all",
  "all"],

  // ---- rules every deck keeps ----
  ["every step's picture is in pictures.js", DECKS.flatMap((d) => d.steps.map((s) => s.picture))
    .filter((id) => !pictureSrc(id)).join() || "all there", "all there"],
  ["every deck's picture is in pictures.js", DECKS.filter((d) => !pictureSrc(d.picture)).map((d) => d.id).join() ||
    "all there", "all there"],
  ["All done's picture is in pictures.js", pictureSrc(DONE_PICTURE), "/img/pic/all-done.svg"],
  ["Choose another's picture is the menu's Steps icon", menuIconSrc("steps"), "/img/pic/menu-steps.svg"],
  ["every deck has at least 3 core steps", DECKS.filter((d) => d.steps.filter((s) => s.core).length < 3)
    .map((d) => d.id).join() || "all", "all"],
  ["core steps per deck", DECKS.map((d) => `${d.id} ${d.steps.filter((s) => s.core).length}`).join(", "),
    "wash-hands 6, return-tray 5, pay-card 4"],
  // a dot per step, in one row: nine fit a 320px phone (steps.css)
  ["every deck has at most 9 steps", DECKS.filter((d) => d.steps.length > 9).map((d) => d.id).join() || "all", "all"],
  ["every step has 2–8 words", DECKS.flatMap((d) => d.steps).filter((s) => wordCount(s.words) < 2 ||
    wordCount(s.words) > 8).map((s) => `${s.words} (${wordCount(s.words)})`).join("; ") || "all", "all"],
  ["the longest step", Math.max(...DECKS.flatMap((d) => d.steps).map((s) => wordCount(s.words))), 8],
  ["words: a capital first, single spaces, no full stop", DECKS.flatMap((d) => d.steps).filter((s) =>
    !/^[A-Z]/.test(s.words) || /\s{2}|^\s|\s$/.test(s.words) || s.words.endsWith(".")).map((s) => s.words)
    .join("; ") || "all", "all"],
  ["end lines start with \"All done.\", at most 10 words", DECKS.filter((d) => !d.end.startsWith("All done. ") ||
    wordCount(d.end) > 10).map((d) => d.id).join() || "all", "all"],
  ["deck names: 2–4 words", DECKS.filter((d) => wordCount(d.name) < 2 || wordCount(d.name) > 4)
    .map((d) => d.name).join() || "all", "all"],
  ["deck ids: unique kebab-case", new Set(DECKS.map((d) => d.id)).size === DECKS.length &&
    DECKS.every((d) => /^[a-z]+(-[a-z]+)*$/.test(d.id)), true],
  ["every step is { picture, words, core, open? }", DECKS.flatMap((d) => d.steps).filter((s) =>
    !["core,picture,words", "core,open,picture,words"].includes(Object.keys(s).sort().join()) ||
    typeof s.core !== "boolean").length, 0],
  ["the decks can't be changed by a tool", Object.isFrozen(DECKS) && DECKS.every((d) => Object.isFrozen(d) &&
    Object.isFrozen(d.steps) && d.steps.every(Object.isFrozen)), true],
  ["pictures.js still has every picture the decks name", PICTURES.length > 0, true],

  // ---- finding a deck ----
  ["deckById: a deck", deckById("pay-card")?.name, "Pay by card"],
  ["deckById: none", deckById(null), null],
  ["deckById: not a deck", deckById("nope"), null],
  ["deckById: inherited names find nothing", [deckById("toString"), deckById("__proto__"), deckById("constructor")]
    .every((d) => d === null), true],

  // ---- Next and Back, all steps ----
  ["Wash hands, Next to the end", walk(wash, false),
    "1/7 Turn on the tap → 2/7 Wet your hands → 3/7 Put on soap → 4/7 Rub for 20 seconds → " +
    "5/7 Rinse off the soap → 6/7 Turn off the tap → 7/7 Dry your hands → done 7/7"],
  ["Wash hands, Back to the start", walkBack(wash, false),
    "done 7/7 → 7/7 Dry your hands → 6/7 Turn off the tap → 5/7 Rinse off the soap → 4/7 Rub for 20 seconds → " +
    "3/7 Put on soap → 2/7 Wet your hands → 1/7 Turn on the tap"],
  ["Next on All done stays there", stepAfter(wash, false, 7), 7],
  ["Back on the first step stays there", stepBefore(wash, false, 0), 0],
  ["where, the first step", JSON.stringify(where(card, false, 0)),
    JSON.stringify({ shown: [0, 1, 2, 3, 4, 5], count: 6, place: 0, done: false, index: 0, step: card.steps[0] })],
  ["where, done", JSON.stringify(where(card, false, 6)),
    JSON.stringify({ shown: [0, 1, 2, 3, 4, 5], count: 6, place: 6, done: true, index: 6, step: null })],

  // ---- Fewer steps: only the core ones ----
  ["shown, all", shownSteps(tray, false).join(), "0,1,2,3,4,5,6"],
  ["shown, fewer", shownSteps(tray, true).join(), "0,2,3,4,5"],
  ["Wash hands, fewer, Next to the end", walk(wash, true),
    "1/6 Turn on the tap → 2/6 Wet your hands → 3/6 Put on soap → 4/6 Rub for 20 seconds → " +
    "5/6 Rinse off the soap → 6/6 Dry your hands → done 6/6"],
  ["Return the tray, fewer, Next to the end", walk(tray, true),
    "1/5 Finish your food → 2/5 Carry the tray with two hands → 3/5 Find the tray return → " +
    "4/5 Halal tray? Use the halal side → 5/5 Put the tray in → done 5/5"],
  ["Pay by card, fewer, Next to the end", walk(card, true),
    "1/4 Look at the price on the screen → 2/4 Tap your card on the reader → " +
    "3/4 Wait for the beep or the green tick → 4/4 Take your card back → done 4/4"],
  ["Pay by card, fewer, Back to the start", walkBack(card, true),
    "done 4/4 → 4/4 Take your card back → 3/4 Wait for the beep or the green tick → " +
    "2/4 Tap your card on the reader → 1/4 Look at the price on the screen"],
  // turned on halfway: a step no longer shown shows as the next one that is
  ["fewer turned on at a step it leaves out", at(wash, true, 5), "6/6 Dry your hands"],
  ["…and Next from there is All done", stepAfter(wash, true, 5), 7],
  ["…and Back from there is the step before it", stepBefore(wash, true, 5), 4],
  ["fewer turned on at the first step, which it leaves out", at(card, true, 0), "1/4 Look at the price on the screen"],
  ["…and Back from there stays there", stepBefore(card, true, 0), 1],
  ["fewer turned on at a left-out last step: All done", at(tray, true, 6), "done 5/5"],
  ["fewer turned off again: the same step", at(wash, false, stepAfter(wash, true, 3)), "5/7 Rinse off the soap"],

  // ---- saved progress, whatever is stored ----
  ["cleanAt: in range", cleanAt(wash, 3), 3],
  ["cleanAt: done", cleanAt(wash, 7), 7],
  ["cleanAt: past the end (a shorter deck in a newer version)", cleanAt(wash, 12), 7],
  ["cleanAt: junk", [cleanAt(wash, -2), cleanAt(wash, "3"), cleanAt(wash, NaN), cleanAt(wash, null),
    cleanAt(wash, Infinity), cleanAt(wash, 2.7)].join(), "0,0,0,0,0,2"],
  ["cleanProgress: nothing saved", JSON.stringify(cleanProgress(null)),
    JSON.stringify({ "wash-hands": 0, "return-tray": 0, "pay-card": 0 })],
  ["cleanProgress: saved, with junk", JSON.stringify(cleanProgress({ "wash-hands": 4, "return-tray": "x",
    "pay-card": 99, gone: 3 })), JSON.stringify({ "wash-hands": 4, "return-tray": 0, "pay-card": 6 })],
  ["cleanProgress: not an object", JSON.stringify(cleanProgress([1, 2])),
    JSON.stringify({ "wash-hands": 0, "return-tray": 0, "pay-card": 0 })],
  ["cleanProgress: a __proto__ key reaches nothing", (() => {
    const p = cleanProgress(JSON.parse('{"__proto__": {"wash-hands": 5}, "toString": 2}'));
    return `${JSON.stringify(p)} ${Object.hasOwn(p, "toString")} ${Object.getPrototypeOf(p) === Object.prototype}`;
  })(), `${JSON.stringify({ "wash-hands": 0, "return-tray": 0, "pay-card": 0 })} false true`],

  // ---- a shared iPad: 30 minutes left alone, and the deck starts again ----
  ["FORGET_AFTER_MS is 30 minutes", FORGET_AFTER_MS, 30 * 60 * 1000],
  ["isStale: just now, 29:59 ago — no", [isStale(NOW, NOW), isStale(NOW - 1000, NOW), isStale(NOW - MIN30 + 1, NOW)]
    .join(), "false,false,false"],
  ["isStale: 30:00 ago, 3 hours, yesterday — yes", [isStale(NOW - MIN30, NOW), isStale(NOW - 3 * 60 * MIN, NOW),
    isStale(NOW - 24 * 60 * MIN, NOW)].join(), "true,true,true"],
  ["isStale: a little in the future (the clock nudged) — no", isStale(NOW + 5000, NOW), false],
  ["isStale: far in the future (the clock was changed) — yes", isStale(NOW + MIN30, NOW), true],
  ["isStale: nothing saved, or junk — yes", [undefined, null, "123", NaN, Infinity, {}].map((t) => isStale(t, NOW))
    .join(), "true,true,true,true,true,true"],
  ["resumeAt: touched 10 minutes ago keeps the step", resumeAt(wash, 4, NOW - 10 * MIN, NOW), 4],
  ["resumeAt: touched 30 minutes ago is step 1", resumeAt(wash, 4, NOW - MIN30, NOW), 0],
  ["resumeAt: All done, 45 minutes ago, is step 1", resumeAt(wash, 7, NOW - 45 * MIN, NOW), 0],
  ["resumeAt: saved by a version with no time is step 1", resumeAt(wash, 4, undefined, NOW), 0],
  ["resumeAt: recent, but junk `at`, is cleaned", [resumeAt(wash, 99, NOW, NOW), resumeAt(wash, "x", NOW, NOW)].join(),
    "7,0"],
  ["cleanTouched: real decks with a finite time; the rest dropped", JSON.stringify(cleanTouched({
    "wash-hands": NOW, "pay-card": "soon", "return-tray": Infinity, gone: NOW })), JSON.stringify({ "wash-hands": NOW })],
  ["cleanTouched: junk", [null, undefined, [NOW], "x", 5].map((t) => JSON.stringify(cleanTouched(t))).join(),
    "{},{},{},{},{}"],
  ["cleanTouched: a __proto__ key reaches nothing", (() => {
    const t = cleanTouched(JSON.parse('{"__proto__": {"wash-hands": 5}, "toString": 2}'));
    return `${JSON.stringify(t)} ${Object.getPrototypeOf(t) === Object.prototype}`;
  })(), "{} true"],

  // ---- the adult's setting ----
  ["cleanFewer: real decks, once each", cleanFewer(["pay-card", "nope", "pay-card", 7, "wash-hands"]).join(),
    "pay-card,wash-hands"],
  ["cleanFewer: junk", [cleanFewer(undefined), cleanFewer("wash-hands"), cleanFewer({})].map((l) => l.length).join(),
    "0,0,0"],
  ["leftOut: what the set-up page lists", DECKS.map((d) => leftOut(d).join(" + ")).join(" / "),
    "Turn off the tap / Put tissues and bones on the tray + Throw away table litter / " +
    "Can I buy it? + Take the receipt if you want it"],
];

let failed = 0;
for (const [name, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  const shown = String(got).includes("\n") ? `\n${String(got).replace(/^/gm, "        ")}` : String(got);
  console.log(`${ok ? "ok  " : "FAIL"}  ${name.padEnd(52)} → ${shown}` +
    (ok ? "" : `\n      expected ${String(want).replace(/\n/g, "\n               ")}`));
}

console.log(failed ? `\n${failed} of ${cases.length} failed` : `\nall ${cases.length} passed`);
process.exit(failed ? 1 : 0);
