// I need's cards and the words each one says: plain data and pure
// functions, no DOM, so node tools/test-i-need.mjs can pin every word. The
// screen is i-need.js, beside this file; the body Hurts asks "Where?" with
// is i-need-body.js, and its two questions are i-need-hurts.js.
//
// CARDS is the fixed grid, in the order it shows. A card keeps its place for
// good (the AAC motor-planning rule: a hand learns where "Help" is), so a
// card an adult switches off leaves a gap and nothing after it moves up.
//   id        stable — the settings name cards by it — and the id of its
//             picture in ../pictures.js
//   label     the one or two words under the picture on the grid
//   sentence  the whole sentence the card shows the adult, or null for the
//             two that ask something first: Hurts (where, then how much)
//             and I want (a picture)
//   on        whether it shows before an adult has chosen for this device
//
// The settings, per device, made on the set-up page (shell.saveSettings):
//   { cards: ["help", "break", …] }  the cards that are on, in CARDS order
// {} — nothing chosen yet — means the defaults. Nothing else is kept: not
// which card was tapped, nor when, nor where it hurt.

const card = (id, label, sentence, on) => Object.freeze({ id, picture: id, label, sentence, on });

export const CARDS = Object.freeze([
  card("help", "Help", "I need help", true),
  card("break", "Break", "I need a break", true),
  card("toilet", "Toilet", "I need the toilet", true),
  card("water", "Water", "I need water", true),
  card("too-loud", "Too loud", "It is too loud", true),
  card("stop", "Stop", "Stop, please", true),
  card("hurts", "Hurts", null, true),
  card("want", "I want", null, false),
  card("more-time", "More time", "I need more time", false),
  card("dont-understand", "Don't understand", "I don't understand", false),
  card("all-done", "All done", "I am all done", false),
]);

// Break's card offers a wait of either length (the Wait tool, #wait?m=2)
export const BREAK_MINUTES = Object.freeze([2, 5]);

const BY_ID = new Map(CARDS.map((c) => [c.id, c]));
export const DEFAULT_ON = Object.freeze(CARDS.filter((c) => c.on).map((c) => c.id));

export const cardById = (id) => BY_ID.get(id) ?? null;

// ---- which cards are on ----

// The ids of the cards that are on, in CARDS order. Whatever is stored — {}
// before the set-up page saves anything, an older shape, junk — gives a
// usable answer, never an error: no list at all means the defaults, and an
// id that isn't a card is left out.
export function cardsOn(settings) {
  const list = settings && typeof settings === "object" && Array.isArray(settings.cards) ? settings.cards : null;
  if (!list) return [...DEFAULT_ON];
  return CARDS.filter((c) => list.includes(c.id)).map((c) => c.id);
}

export const isOn = (settings, id) => cardsOn(settings).includes(id);

// The whole next settings object, to save, with one card switched on or
// off; an id that isn't a card changes nothing. Other keys ride along.
export function withCard(settings, id, on) {
  const base = settings && typeof settings === "object" && !Array.isArray(settings) ? settings : {};
  const cards = new Set(cardsOn(base));
  if (BY_ID.has(id)) {
    if (on) cards.add(id);
    else cards.delete(id);
  }
  return { ...base, cards: CARDS.filter((c) => cards.has(c.id)).map((c) => c.id) };
}

// The grid's places: every card up to the last one that is on, each with
// whether it shows ({ card, on }) — an off card before it keeps its place as
// a gap. Places after the last card on are left out: nothing comes after
// them, so leaving them out moves no card. [] when every card is off.
export function gridCells(settings) {
  const on = new Set(cardsOn(settings));
  const last = CARDS.findLastIndex((c) => on.has(c.id));
  return CARDS.slice(0, last + 1).map((c) => ({ card: c, on: on.has(c.id) }));
}

// ---- Hurts: where, and how much ----

// Where it hurts: the body map's regions, head to foot, then My back (a
// button of its own: the back doesn't show on a body seen from the front).
// name is the button's name and, in lower case, the word in the sentence:
// "It hurts here: mouth or teeth." A region of the body that comes in two
// (ears, arms, hands, legs, feet) is one region: the sentence names no
// side, since a picture seen from the front swaps them — the adult asks
// which one, and the student can point.
const region = (id, name) => Object.freeze({ id, name });
export const REGIONS = Object.freeze([
  region("head", "Head"),
  region("eyes", "Eyes"),
  region("ear", "Ear"),
  region("mouth", "Mouth or teeth"),
  region("throat", "Throat"),
  region("chest", "Chest"),
  region("tummy", "Tummy"),
  region("arm", "Arm"),
  region("hand", "Hand"),
  region("leg", "Leg"),
  region("foot", "Foot"),
  region("back", "My back"),
]);

// How much: three sizes, drawn as growing circles
const size = (id, name) => Object.freeze({ id, name });
export const SIZES = Object.freeze([
  size("little", "A little"),
  size("lot", "A lot"),
  size("very", "Very bad"),
]);

export const regionById = (id) => REGIONS.find((r) => r.id === id) ?? null;
export const sizeById = (id) => SIZES.find((s) => s.id === id) ?? null;

// "It hurts here: tummy. A lot." — without the size if there is none, and
// just "It hurts." for a place that isn't a region (never an error)
export function hurtsSentence(regionId, sizeId) {
  const where = regionById(regionId);
  const much = sizeById(sizeId);
  if (!where) return much ? `It hurts. ${much.name}.` : "It hurts.";
  return `It hurts here: ${where.name.toLowerCase()}.${much ? ` ${much.name}.` : ""}`;
}

// ---- I want ----

// "I want: Chicken rice" from what the picture picker gave ({ picture,
// words }). With no words — the box emptied, or a pictures-only device —
// the picture's own words (pictureWords) say it; with neither, "I want".
export function wantSentence(pick, pictureWords = "") {
  const tidy = (text) => (typeof text === "string" ? text.replace(/\s+/g, " ").trim() : "");
  const words = tidy(pick?.words) || tidy(pictureWords);
  return words ? `I want: ${words}` : "I want";
}
