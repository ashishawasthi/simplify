// The rules of Now and next's list (public/js/tools/now-next-list.js): what a
// saved day turns into, and what every tap does to it. No dependencies, no
// runner:
//
//   node tools/test-now-next.mjs

import {
  MAX_CARDS, MAX_WORDS, emptyState, clean, cleanCard, label, current, nextCard, allDone, canAdd, slot,
  slotOfNew, add, change, remove, putBack, move, toggleChanged, markDone, backTo, restart, setDone, removeAll,
  restoreAll, setView,
} from "../public/js/tools/now-next-list.js";
import { PICTURES } from "../public/js/pictures.js";

// A state in one line: each card as its words (or picture), * when changed,
// then how many are done and the view — "School, Bus*, Home | done 1 | now-next"
const show = (s) => `${s.cards.map((c) => `${label(c)}${c.changed ? "*" : ""}`).join(", ")} | done ${s.done} | ${s.view}`;
const ids = (s) => s.cards.map((c) => c.id).join(",");

const day = (...names) => names.reduce((s, name) => add(s, { picture: name, words: "" }), emptyState());
const EMPTY = emptyState();
const DAY = day("school", "bus", "home"); // ids 1, 2, 3
const HALF = markDone(DAY); // School done; Bus is Now
const ALL = markDone(markDone(HALF)); // All done

const junk = clean({
  cards: [
    { id: 4, picture: "school", words: "  My   school  " },
    { id: 4, picture: "not-a-picture", words: "" }, // nothing to show: left out
    { id: "x", picture: "not-a-picture", words: "Swim" }, // an unknown picture: words only
    "junk",
    { picture: "home", changed: "yes" },
  ],
  done: 3, // two of the first three stay, so two are done
  view: "sideways",
});

const full = Array.from({ length: 13 }, () => "eat").reduce((s, p) => add(s, { picture: p }), emptyState());
const long = "a".repeat(60);

const cases = [
  // ---- what a saved day turns into ----
  ["nothing saved", show(clean(null)), " | done 0 | now-next"],
  ["junk saved", show(clean("junk")), " | done 0 | now-next"],
  ["cards junk", show(clean({ cards: "no", done: 5, view: "my-day" })), " | done 0 | my-day"],
  ["bad cards left out, done follows", show(junk), "My school, Swim, Home | done 2 | now-next"],
  ["unknown picture → words only", junk.cards[1].picture, null],
  ["repeated or bad ids renumbered", ids(junk), "4,5,6"],
  ["changed only when true", junk.cards.map((c) => c.changed).join(), "false,false,false"],
  ["done never past the end", clean({ cards: DAY.cards, done: 9 }).done, 3],
  ["done never below 0", clean({ cards: DAY.cards, done: -2 }).done, 0],
  ["done not a whole number", clean({ cards: DAY.cards, done: "2" }).done, 0],
  ["at most 12 cards", clean({ cards: Array(20).fill({ picture: "eat" }) }).cards.length, MAX_CARDS],
  ["words cut to 40", clean({ cards: [{ words: long }] }).cards[0].words.length, MAX_WORDS],
  ["frozen all the way down", Object.isFrozen(junk) && Object.isFrozen(junk.cards) && junk.cards.every(Object.isFrozen), true],
  ["saved and read back: the same", JSON.stringify(clean(JSON.parse(JSON.stringify(HALF)))), JSON.stringify(HALF)],
  ["a card of nothing is no card", cleanCard({ picture: null, words: "   " }), null],
  ["a picker's pick is a card", JSON.stringify(cleanCard({ picture: "bus", words: "Bus 190" })),
    JSON.stringify({ picture: "bus", words: "Bus 190", changed: false })],

  // ---- reading it ----
  ["label: the words", label({ picture: "bus", words: "Bus 190" }), "Bus 190"],
  ["label: else the picture's words", label({ picture: "mrt-train", words: "" }), "MRT"],
  ["label: no card", label(null), ""],
  ["Now, Next", `${label(current(DAY))} / ${label(nextCard(DAY))}`, "School / Bus"],
  ["the last is Now: no Next", nextCard(markDone(HALF)), null],
  ["empty: no Now, not All done", `${current(EMPTY)} ${allDone(EMPTY)}`, "null false"],
  ["after the last: All done", allDone(ALL), true],
  ["slots", [0, 1, 2].map((i) => slot(HALF, i)).join(), "done,now,next"],
  ["slots: later", slot(day("eat", "bus", "home", "sleep"), 3), "later"],
  ["a new card: Now on an empty day", slotOfNew(emptyState()), "now"],
  ["a new card: Next after Now", slotOfNew(day("eat")), "next"],
  ["a new card: later", slotOfNew(DAY), "later"],
  ["a new card: Now after All done", slotOfNew(ALL), "now"],

  // ---- adding ----
  ["add: at the end, new ids", `${show(DAY)} / ${ids(DAY)}`, "School, Bus, Home | done 0 | now-next / 1,2,3"],
  ["add: words only", show(add(emptyState(), { picture: null, words: "Grandma" })), "Grandma | done 0 | now-next"],
  ["add: nothing picked, nothing added", add(DAY, null), DAY],
  ["add: at most 12", `${full.cards.length} ${canAdd(full)}`, "12 false"],
  ["add after All done: it is Now", label(current(add(ALL, { picture: "sleep" }))), "Sleep"],
  ["add: never marked changed", add(DAY, { picture: "eat", changed: true }).cards[3].changed, false],
  ["add: an id never used by a card there", ids(add(remove(DAY, 2), { picture: "eat" })), "1,3,4"],

  // ---- changing a card ----
  ["change: new picture and words, same place", show(change(HALF, 2, { picture: "mrt-train", words: "" })),
    "School, MRT, Home | done 1 | now-next"],
  ["change: keeps its id and mark", JSON.stringify(change(toggleChanged(DAY, 2), 2, { picture: "walk", words: "" }).cards[1]),
    JSON.stringify({ id: 2, picture: "walk", words: "", changed: true })],
  ["change: nothing picked, no change", change(DAY, 2, { picture: null, words: "" }), DAY],
  ["change: a card not there", change(DAY, 99, { picture: "eat" }), DAY],
  ["changed: on", show(toggleChanged(DAY, 3)), "School, Bus, Home* | done 0 | now-next"],
  ["changed: off again", show(toggleChanged(toggleChanged(DAY, 3), 3)), "School, Bus, Home | done 0 | now-next"],

  // ---- Done ----
  ["done: Next becomes Now", `${label(current(HALF))} / ${label(nextCard(HALF))}`, "Bus / Home"],
  ["done at All done: nothing more", markDone(ALL), ALL],
  ["done on an empty day: nothing", markDone(EMPTY), EMPTY],

  // ---- taking cards away ----
  ["remove a later card", show(remove(HALF, 3)), "School, Bus | done 1 | now-next"],
  ["remove Now: the next is Now", `${show(remove(HALF, 2))} → ${label(current(remove(HALF, 2)))}`,
    "School, Home | done 1 | now-next → Home"],
  ["remove the last, when Now: All done", allDone(remove(markDone(HALF), 3)), true],
  ["remove a done card: done follows", show(remove(HALF, 1)), "Bus, Home | done 0 | now-next"],
  ["remove: not there", remove(DAY, 99), DAY],
  ["put back where it was", show(putBack(remove(HALF, 3), HALF.cards[2], 2)), "School, Bus, Home | done 1 | now-next"],
  ["put back: keeps its id", ids(putBack(remove(DAY, 2), DAY.cards[1], 1)), "1,2,3"],
  ["put back after more done: not among the done", show(putBack(markDone(remove(HALF, 2)), HALF.cards[1], 1)),
    "School, Home, Bus | done 2 | now-next"],
  // Home (id 3) taken away, Eat added (and given id 3): Home comes back as 4
  ["put back: its id taken since → a new one", ids(putBack(add(remove(DAY, 3), { picture: "eat" }), DAY.cards[2], 2)),
    "1,2,4,3"],
  ["put back: a full day has no room", putBack(full, DAY.cards[0], 0), full],

  // ---- moving ----
  ["move down", show(move(DAY, 2, 1)), "School, Home, Bus | done 0 | now-next"],
  ["move up", show(move(DAY, 3, -1)), "School, Home, Bus | done 0 | now-next"],
  ["move up into Now", label(current(move(HALF, 3, -1))), "Home"],
  ["Now moves down: the next is Now", label(current(move(HALF, 2, 1))), "Home"],
  ["never up among the done", move(HALF, 2, -1), HALF],
  ["a done card never moves", move(HALF, 1, 1), HALF],
  ["never past the end", move(DAY, 3, 1), DAY],
  ["one place at a time", move(DAY, 1, 2), DAY],
  ["move: ids go with the cards", ids(move(DAY, 1, 1)), "2,1,3"],

  // ---- going back ----
  ["a done card tapped: Now again", show(backTo(markDone(HALF), 1)), "School, Bus, Home | done 0 | now-next"],
  ["back to the one just done", label(current(backTo(markDone(HALF), 2))), "Bus"],
  ["back to a card not done: nothing", backTo(HALF, 3), HALF],
  ["start again: nothing done, cards kept", show(restart(markDone(HALF))), "School, Bus, Home | done 0 | now-next"],
  ["start again, nothing done: the same", restart(DAY), DAY],
  ["undo: done as it was", setDone(restart(markDone(HALF)), 2).done, 2],
  ["undo: never past the end", setDone(remove(markDone(HALF), 3), 3).done, 2],
  ["undo: not a number", setDone(HALF, "2"), HALF],

  // ---- all at once ----
  ["remove all", show(removeAll(HALF)), " | done 0 | now-next"],
  ["remove all: the view stays", removeAll(setView(HALF, "my-day")).view, "my-day"],
  ["remove all of nothing: the same", removeAll(EMPTY), EMPTY],
  ["put all back", show(restoreAll(removeAll(HALF), HALF)), "School, Bus, Home | done 1 | now-next"],
  ["put all back: ids kept", ids(restoreAll(removeAll(HALF), HALF)), "1,2,3"],
  ["put all back: cards added since stay, after", show(restoreAll(add(removeAll(HALF), { picture: "eat" }), HALF)),
    "School, Bus, Home, Eat | done 1 | now-next"],
  ["put all back: added since get new ids", ids(restoreAll(add(removeAll(HALF), { picture: "eat" }), HALF)), "1,2,3,4"],
  ["put all back: never more than 12", restoreAll(full, HALF).cards.length, MAX_CARDS],

  // ---- the view ----
  ["view: My day", setView(DAY, "my-day").view, "my-day"],
  ["view: nonsense ignored", setView(DAY, "sideways"), DAY],
  ["view: cards untouched", setView(DAY, "my-day").cards === DAY.cards, true],

  // ---- the pictures the tool uses itself ----
  ["pictures: changed, all-done, wait", ["changed", "all-done", "wait"].every((id) => PICTURES.some((p) => p.id === id)), true],
];

let failed = 0;
for (const [name, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  const text = typeof got === "object" && got !== null ? show(got) : String(got);
  console.log(`${ok ? "ok  " : "FAIL"}  ${name.padEnd(46)} → ${text}` + (ok ? "" : `\n      expected ${typeof want === "object" && want !== null ? show(want) : want}`));
}

console.log(failed ? `\n${failed} of ${cases.length} failed` : `\nall ${cases.length} passed`);
process.exit(failed ? 1 : 0);
