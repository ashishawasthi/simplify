// I need's cards, settings, sentences and body map. No dependencies, no runner:
//
//   node tools/test-i-need.mjs
//
// The cards' order, labels and sentences are pinned word for word: a card's
// place is part of the design (positions never move), and its sentence is
// what an adult reads.

import {
  BREAK_MINUTES, CARDS, DEFAULT_ON, REGIONS, SIZES, cardsOn, gridCells, hurtsSentence, isOn, wantSentence, withCard,
} from "../public/js/tools/i-need-cards.js";
import { CLOSE_UP, FACE_REGIONS, MAP_REGIONS, MARKS, PARTS, SPOTS, UPPER, VIEW } from "../public/js/tools/i-need-body.js";
import { PICTURES } from "../public/js/pictures.js";

const cases = [];
const eq = (name, got, want) => cases.push([name, JSON.stringify(got), JSON.stringify(want)]);
const ok = (name, got) => cases.push([name, String(Boolean(got)), "true"]);

// ---- the cards ----
eq("order", CARDS.map((c) => c.id),
  ["help", "break", "toilet", "water", "too-loud", "stop", "hurts", "want", "more-time", "dont-understand", "all-done"]);
eq("labels", CARDS.map((c) => c.label),
  ["Help", "Break", "Toilet", "Water", "Too loud", "Stop", "Hurts", "I want", "More time", "Don't understand", "All done"]);
eq("sentences", CARDS.map((c) => c.sentence), [
  "I need help", "I need a break", "I need the toilet", "I need water", "It is too loud", "Stop, please",
  null, null, "I need more time", "I don't understand", "I am all done",
]);
eq("on by default", DEFAULT_ON, ["help", "break", "toilet", "water", "too-loud", "stop", "hurts"]);
eq("Break offers", BREAK_MINUTES, [2, 5]);
const pictureIds = new Set(PICTURES.map((p) => p.id));
for (const c of CARDS) ok(`picture exists: ${c.picture}`, pictureIds.has(c.picture));
ok("picture exists: wait (Break's choices)", pictureIds.has("wait"));
ok("picture exists: hurts (the question's picture)", pictureIds.has("hurts"));
ok("labels 1–2 words", CARDS.every((c) => c.label.split(" ").length <= 2));

// ---- settings: which cards are on ----
eq("nothing saved: defaults", cardsOn({}), DEFAULT_ON);
eq("undefined: defaults", cardsOn(undefined), DEFAULT_ON);
eq("junk: defaults", cardsOn({ cards: "help" }), DEFAULT_ON);
eq("an array itself: defaults", cardsOn(["help"]), DEFAULT_ON);
eq("saved list, put in grid order", cardsOn({ cards: ["water", "help", "nope", 7, "__proto__"] }), ["help", "water"]);
eq("all off is kept", cardsOn({ cards: [] }), []);
eq("isOn", [isOn({}, "help"), isOn({}, "want"), isOn({ cards: ["want"] }, "want")], [true, false, true]);
eq("switch one off", withCard({}, "water", false), { cards: ["help", "break", "toilet", "too-loud", "stop", "hurts"] });
eq("switch one on", withCard({}, "all-done", true).cards.at(-1), "all-done");
eq("switch back: as before", withCard(withCard({}, "water", false), "water", true).cards, DEFAULT_ON);
eq("an unknown id changes nothing", withCard({ cards: ["help"] }, "toString", true), { cards: ["help"] });
eq("other keys ride along", withCard({ cards: ["help"], later: 1 }, "stop", true), { cards: ["help", "stop"], later: 1 });
eq("junk settings, then a switch", withCard("junk", "want", true).cards, [...DEFAULT_ON, "want"]);

// ---- positions never move: every card that is on sits at its own index,
// for every one of the 2^11 choices of cards ----
let moved = 0;
let trailing = 0;
for (let mask = 0; mask < 1 << CARDS.length; mask++) {
  const settings = { cards: CARDS.filter((_, i) => mask & (1 << i)).map((c) => c.id) };
  const cells = gridCells(settings);
  CARDS.forEach((c, i) => {
    if (settings.cards.includes(c.id) && cells[i]?.card.id !== c.id) moved++;
    if (settings.cards.includes(c.id) && !cells[i]?.on) moved++;
  });
  if (cells.length && !cells.at(-1).on) trailing++; // nothing but gaps after the last card
  if (cells.some((cell, i) => cell.card !== CARDS[i])) moved++;
}
eq("no card ever moves (2048 choices)", moved, 0);
eq("no gaps after the last card", trailing, 0);
eq("the default grid", gridCells({}).map((c) => c.card.id), DEFAULT_ON);
eq("a gap keeps its place", gridCells({ cards: ["help", "toilet"] }).map((c) => (c.on ? c.card.id : "_")), ["help", "_", "toilet"]);
eq("all off: no places", gridCells({ cards: [] }), []);

// ---- Hurts ----
eq("regions", REGIONS.map((r) => r.id),
  ["head", "eyes", "ear", "mouth", "throat", "chest", "tummy", "arm", "hand", "leg", "foot", "back"]);
eq("region names", REGIONS.map((r) => r.name),
  ["Head", "Eyes", "Ear", "Mouth or teeth", "Throat", "Chest", "Tummy", "Arm", "Hand", "Leg", "Foot", "My back"]);
eq("sizes", SIZES.map((s) => s.name), ["A little", "A lot", "Very bad"]);
eq("the brief's example", hurtsSentence("tummy", "lot"), "It hurts here: tummy. A lot.");
eq("my back", hurtsSentence("back", "very"), "It hurts here: my back. Very bad.");
eq("mouth or teeth", hurtsSentence("mouth", "little"), "It hurts here: mouth or teeth. A little.");
eq("no size", hurtsSentence("ear", null), "It hurts here: ear.");
eq("not a region", hurtsSentence("toString", "lot"), "It hurts. A lot.");
eq("nothing", hurtsSentence(), "It hurts.");
ok("every region × size is one plain sentence pair",
  REGIONS.every((r) => SIZES.every((s) => /^It hurts here: [a-z ]+\. (A little|A lot|Very bad)\.$/.test(hurtsSentence(r.id, s.id)))));

// ---- I want ----
eq("picture and words", wantSentence({ picture: "snack", words: "Snack" }, "Snack"), "I want: Snack");
eq("words typed", wantSentence({ picture: null, words: "  Chicken   rice " }), "I want: Chicken rice");
eq("words emptied: the picture's own", wantSentence({ picture: "swim", words: "" }, "Swim"), "I want: Swim");
eq("nothing at all", wantSentence(null), "I want");
eq("words not text", wantSentence({ words: 5 }, ""), "I want");

// ---- the body map ----
const within = (s) => s.x >= 0 && s.y >= 0 && s.x + s.w <= VIEW.width && s.y + s.h <= VIEW.height;
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
eq("the map's regions: every region but My back", MAP_REGIONS, REGIONS.filter((r) => r.id !== "back").map((r) => r.id));
for (const id of MAP_REGIONS) {
  eq(`${id}: one spot for screen readers`, SPOTS.filter((s) => s.region === id && s.main).length, 1);
  ok(`${id}: drawn, so it can light up`, [...PARTS, ...MARKS].some((p) => p.region === id));
}
ok("every spot is a region", SPOTS.every((s) => MAP_REGIONS.includes(s.region)));
ok("every spot inside the drawing", SPOTS.every(within));
eq("no two spots overlap", SPOTS.flatMap((a, i) => SPOTS.slice(i + 1).filter((b) => overlap(a, b))
  .map((b) => `${a.region}/${b.region}`)), []);
// fitted into a phone's sheet (375 × 812: about 343 × 620 for the body), no
// spot is smaller than 44 px either way — the eyes are the smallest
const scale = Math.min(343 / VIEW.width, 620 / VIEW.height);
eq("smallest spot on a phone, px", Math.floor(Math.min(...SPOTS.flatMap((s) => [s.w * scale, s.h * scale]))) >= 44, true);
ok("the close-up holds the face's regions", SPOTS.filter((s) => FACE_REGIONS.includes(s.region))
  .every((s) => s.y + s.h <= CLOSE_UP.y + CLOSE_UP.height + 2));
ok("the upper view holds the back", PARTS.filter((p) => p.region === "chest" || p.region === "tummy")
  .every((p) => p.kind === "path") && UPPER.height >= 260);

let failed = 0;
for (const [name, got, want] of cases) {
  const pass = got === want;
  if (!pass) failed++;
  console.log(`${pass ? "ok  " : "FAIL"}  ${name}${pass ? "" : `\n      got  ${got}\n      want ${want}`}`);
}
console.log(failed ? `\n${failed} of ${cases.length} failed` : `\nall ${cases.length} passed`);
process.exit(failed ? 1 : 0);
