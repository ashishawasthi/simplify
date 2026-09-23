// Steps: the decks, and how to move through one. Plain data and pure
// functions, no DOM — steps.js shows them, and tools/test-steps.mjs pins
// both (every picture is in pictures.js, every deck has at least 3 core
// steps, no step has more than 8 words, the moves below).
//
// A deck: { id, name, picture, end, steps }
//   id       its address (#steps?deck=<id>) and its key in the saved progress
//   name     its button on the chooser
//   picture  that button's picture, an id from pictures.js
//   end      the All done screen's line, pointing back to the real task
//   steps    in order, each { picture, words, core, open? }
//     words  one plain, literal action, 2–8 words
//     core   still shown when an adult turns on "Fewer steps" for the deck:
//            the small steps drop away as the student learns them (fading)
//     open   another tool this step offers a button for: { id, icon, words },
//            icon as on the menu
//
// Where a student is in a deck is one number, `at`: the index, in the whole
// deck, of the step on screen, or steps.length once the deck is done. It
// counts in the whole deck, not in the steps shown, so turning "Fewer steps"
// on or off never sends the student to another part of the routine: a step
// that is no longer shown shows as the next one that is.

const step = (picture, words, { core = true, open = null } = {}) =>
  Object.freeze({ picture, words, core, ...(open && { open: Object.freeze(open) }) });

export const DECKS = Object.freeze([
  {
    id: "wash-hands",
    name: "Wash hands",
    picture: "wash-hands",
    end: "All done. Your hands are clean.",
    steps: [
      step("tap-water", "Turn on the tap"),
      step("rinse", "Wet your hands"),
      step("soap", "Put on soap"),
      step("rub-hands", "Rub for 20 seconds"),
      step("rinse", "Rinse off the soap"),
      step("tap-water", "Turn off the tap", { core: false }),
      step("dry-hands", "Dry your hands"),
    ],
  },
  {
    // at a hawker centre, coffeeshop or food court (NEA, since 2021). The
    // routine only — never fines.
    id: "return-tray",
    name: "Return the tray",
    picture: "tray-return",
    end: "All done. The table is ready for the next person.",
    steps: [
      step("tray", "Finish your food"),
      step("tray", "Put tissues and bones on the tray", { core: false }),
      step("carry-tray", "Carry the tray with two hands"),
      step("tray-return", "Find the tray return"),
      step("tray-return", "Halal tray? Use the halal side"),
      step("tray-return", "Put the tray in"),
      step("wipe-table", "Throw away table litter", { core: false }),
    ],
  },
  {
    id: "pay-card",
    name: "Pay by card",
    picture: "card-reader",
    end: "All done. You paid.",
    steps: [
      step("check-amount", "Can I buy it?", {
        core: false,
        open: { id: "can-i-buy", icon: "🛒", words: "Can I buy?" },
      }),
      step("check-amount", "Look at the price on the screen"),
      step("tap-card", "Tap your card on the reader"),
      step("card-reader", "Wait for the beep or the green tick"),
      step("travel-card", "Take your card back"),
      step("receipt", "Take the receipt if you want it", { core: false }),
    ],
  },
].map((deck) => Object.freeze({ ...deck, steps: Object.freeze(deck.steps) })));

// the picture of the All done screen
export const DONE_PICTURE = "all-done";

const BY_ID = new Map(DECKS.map((deck) => [deck.id, deck]));

// The deck with this id, or null — a Map, so "#steps?deck=toString" finds
// nothing rather than Object's own.
export function deckById(id) {
  return BY_ID.get(id) ?? null;
}

// The indexes (in the whole deck) of the steps shown: all of them, or with
// fewer on, only the core ones.
export function shownSteps(deck, fewer) {
  const shown = [];
  deck.steps.forEach((s, i) => {
    if (!fewer || s.core) shown.push(i);
  });
  return shown;
}

// A saved `at` as a usable one: a whole number from 0 to steps.length.
// Anything else (missing, junk, from a version whose deck was longer) is
// clamped, or the start.
export function cleanAt(deck, at) {
  if (typeof at !== "number" || !Number.isFinite(at)) return 0;
  return Math.min(Math.max(Math.floor(at), 0), deck.steps.length);
}

// What the screen shows for `at`:
//   { shown, count, place, done, index, step }
//   shown  the indexes of the steps shown (shownSteps)
//   count  how many that is: the number of dots
//   place  the step on screen among them, from 0 — count once done
//   done   the All done screen
//   index  the step's index in the whole deck (steps.length once done)
//   step   the step itself, or null once done
export function where(deck, fewer, at) {
  const shown = shownSteps(deck, fewer);
  const from = cleanAt(deck, at);
  let place = shown.findIndex((i) => i >= from);
  if (place === -1) place = shown.length;
  const done = place === shown.length;
  const index = done ? deck.steps.length : shown[place];
  return { shown, count: shown.length, place, done, index, step: done ? null : deck.steps[index] };
}

// Next ▶: the next step shown, or done after the last. Done stays done.
export function stepAfter(deck, fewer, at) {
  const { shown, place, done } = where(deck, fewer, at);
  if (done) return deck.steps.length;
  return place + 1 < shown.length ? shown[place + 1] : deck.steps.length;
}

// ◀ Back: the step shown before this one; from All done, the last step. The
// first step stays the first.
export function stepBefore(deck, fewer, at) {
  const { shown, place } = where(deck, fewer, at);
  return place > 0 ? shown[place - 1] : shown[0] ?? 0;
}

// Saved progress, { <deck id>: at }, as a usable one: every deck, each at a
// clean `at`; unknown decks and junk dropped.
export function cleanProgress(saved) {
  const from = saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
  return Object.fromEntries(DECKS.map((deck) => [deck.id, cleanAt(deck, Object.hasOwn(from, deck.id) ? from[deck.id] : 0)]));
}

// The adult's "Fewer steps" (settings.fewer): the ids of real decks, once each.
export function cleanFewer(list) {
  return Array.isArray(list) ? [...new Set(list.filter((id) => BY_ID.has(id)))] : [];
}

// The steps "Fewer steps" leaves out of a deck, by their words (the set-up page lists them)
export function leftOut(deck) {
  return deck.steps.filter((s) => !s.core).map((s) => s.words);
}
