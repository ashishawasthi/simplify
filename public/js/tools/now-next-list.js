// Now and next's list: the day's cards, how many are done, and which view is
// on screen. Pure — no DOM, no storage — so every rule here is pinned by
// tools/test-now-next.mjs; now-next.js draws whatever these return.
//
// The state, as saved ("simplify-now-next-v1"):
//   { cards: [{ id, picture, words, changed }], done, view }
//     cards    the day in order, at most MAX_CARDS
//       id       a whole number, unique in the list: it follows the card when
//                it moves, so the screen can keep hold of it
//       picture  an id from pictures.js, or null for a card of words only
//       words    "" or up to MAX_WORDS characters (the picture picker's own
//                limit); a card has a picture, words, or both
//       changed  true: the card is a change to the plan — it shows the
//                "Changed" picture and word, so the change is said, not hidden
//     done     how many cards, from the top, are done: cards[done] is Now,
//              cards[done + 1] Next. done === cards.length (with any cards)
//              is All done.
//     view     "now-next" or "my-day": the view last on screen
//
// Every function takes a state and gives back a new one (frozen), or the same
// one when there is nothing to do — never an error. A card is found by its
// id, not its place, so a tap on a card that has since moved still means that
// card.

import { PICTURES } from "../pictures.js";

export const MAX_CARDS = 12;
export const MAX_WORDS = 40;
export const VIEWS = Object.freeze(["now-next", "my-day"]);

const PICTURE_WORDS = new Map(PICTURES.map((p) => [p.id, p.words]));

const isRecord = (value) => !!value && typeof value === "object" && !Array.isArray(value);
const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);

function freeze(state) {
  for (const card of state.cards) Object.freeze(card);
  Object.freeze(state.cards);
  return Object.freeze(state);
}

export function emptyState() {
  return freeze({ cards: [], done: 0, view: "now-next" });
}

// A card from anything: a picker's { picture, words }, a stored card, junk.
// Unknown pictures become null; words are trimmed, single-spaced and cut to
// MAX_WORDS; with neither picture nor words there is no card (null).
export function cleanCard(raw) {
  if (!isRecord(raw)) return null;
  const picture = typeof raw.picture === "string" && PICTURE_WORDS.has(raw.picture) ? raw.picture : null;
  const words = typeof raw.words === "string"
    ? raw.words.trim().replace(/\s+/g, " ").slice(0, MAX_WORDS).trim()
    : "";
  if (!picture && !words) return null;
  return { picture, words, changed: raw.changed === true };
}

// Whatever was stored — an older shape, a hand edit, junk — as a usable
// state. A card that can't be shown is left out, and done counts only the
// cards that stay, so Now is still the card it was.
export function clean(raw) {
  const r = isRecord(raw) ? raw : {};
  const list = Array.isArray(r.cards) ? r.cards : [];
  const doneBefore = Number.isInteger(r.done) ? r.done : 0;
  const cards = [];
  let done = 0;
  const ids = new Set();
  list.forEach((item, i) => {
    const card = cleanCard(item);
    if (!card || cards.length >= MAX_CARDS) return;
    if (i < doneBefore) done++;
    const id = Number.isSafeInteger(item.id) && item.id > 0 && !ids.has(item.id) ? item.id : null;
    if (id) ids.add(id);
    cards.push({ id, ...card });
  });
  // a card without a usable id gets the next free one
  let next = Math.max(0, ...ids) + 1;
  for (const card of cards) card.id ??= next++;
  return freeze({
    cards,
    done: clamp(done, 0, cards.length),
    view: VIEWS.includes(r.view) ? r.view : "now-next",
  });
}

// ---------- reading it ----------

// What a card says: its words, or its picture's own words when it has none
export function label(card) {
  if (!card) return "";
  return card.words || PICTURE_WORDS.get(card.picture) || "";
}

export const current = (s) => s.cards[s.done] ?? null;
export const nextCard = (s) => s.cards[s.done + 1] ?? null;
export const allDone = (s) => s.cards.length > 0 && s.done >= s.cards.length;
export const canAdd = (s) => s.cards.length < MAX_CARDS;
export const indexOf = (s, id) => s.cards.findIndex((c) => c.id === id);

// Where a card is in the day: "done", "now", "next" or "later"
export function slot(s, index) {
  if (index < s.done) return "done";
  if (index === s.done) return "now";
  if (index === s.done + 1) return "next";
  return "later";
}

// The place a new card would take, at the end of the day
export const slotOfNew = (s) => slot(s, s.cards.length);

const nextId = (cards) => Math.max(0, ...cards.map((c) => c.id)) + 1;

function withCards(s, cards, done = s.done) {
  return freeze({ ...s, cards: cards.map((c) => ({ ...c })), done: clamp(done, 0, cards.length) });
}

// ---------- changing it ----------

// A new card at the end of the day. After All done, it is Now.
export function add(s, input) {
  const card = cleanCard({ picture: input?.picture, words: input?.words });
  if (!card || !canAdd(s)) return s;
  return withCards(s, [...s.cards, { id: nextId(s.cards), ...card }]);
}

// A card's picture and words, picked again: it keeps its place, id and mark
export function change(s, id, input) {
  const i = indexOf(s, id);
  const card = cleanCard({ picture: input?.picture, words: input?.words, changed: s.cards[i]?.changed });
  if (i === -1 || !card) return s;
  const cards = [...s.cards];
  cards[i] = { id, ...card };
  return withCards(s, cards);
}

// Take a card away. One above Now takes Now's count with it; Now itself
// hands over to the card after it.
export function remove(s, id) {
  const i = indexOf(s, id);
  if (i === -1) return s;
  return withCards(s, s.cards.filter((c) => c.id !== id), i < s.done ? s.done - 1 : s.done);
}

// "Put it back" after remove(): the card goes back where it was — or, if
// cards before that place have been done since, just after them: it wasn't
// done, so it doesn't come back done. A full day has no room for it.
export function putBack(s, card, index) {
  const cleaned = cleanCard(card);
  if (!cleaned || !canAdd(s)) return s;
  const id = Number.isSafeInteger(card.id) && card.id > 0 && indexOf(s, card.id) === -1 ? card.id : nextId(s.cards);
  const at = clamp(Number.isInteger(index) ? index : s.cards.length, s.done, s.cards.length);
  const cards = [...s.cards];
  cards.splice(at, 0, { id, ...cleaned });
  return withCards(s, cards);
}

// One place up (delta -1) or down (+1), among the cards not yet done: a
// card can become Now this way, but never slips in among the done ones.
export function move(s, id, delta) {
  const i = indexOf(s, id);
  const j = i + delta;
  if (i === -1 || (delta !== -1 && delta !== 1) || i < s.done || j < s.done || j >= s.cards.length) return s;
  const cards = [...s.cards];
  [cards[i], cards[j]] = [cards[j], cards[i]];
  return withCards(s, cards);
}

export function toggleChanged(s, id) {
  const i = indexOf(s, id);
  if (i === -1) return s;
  const cards = [...s.cards];
  cards[i] = { ...cards[i], changed: !cards[i].changed };
  return withCards(s, cards);
}

// Done: Next becomes Now (or, after the last card, All done)
export function markDone(s) {
  return s.done < s.cards.length ? withCards(s, s.cards, s.done + 1) : s;
}

// A done card tapped: the day goes back to it, and it is Now again
export function backTo(s, id) {
  const i = indexOf(s, id);
  return i !== -1 && i < s.done ? withCards(s, s.cards, i) : s;
}

// Start the day again: nothing done, the cards kept
export const restart = (s) => (s.done === 0 ? s : withCards(s, s.cards, 0));

// Undo for the three above: done as it was (as far as the cards allow now)
export function setDone(s, done) {
  return Number.isInteger(done) ? withCards(s, s.cards, done) : s;
}

export const removeAll = (s) => (s.cards.length ? withCards(s, [], 0) : s);

// "Put it back" after removeAll(): the cards that were there, and after them
// any added since, as far as the day has room; done as it was.
export function restoreAll(s, before) {
  const old = clean({ cards: before?.cards, done: before?.done });
  if (!old.cards.length) return s;
  const cards = [...old.cards];
  for (const card of s.cards) {
    if (cards.length >= MAX_CARDS) break;
    cards.push({ ...card, id: nextId(cards) });
  }
  return withCards(s, cards, old.done);
}

export function setView(s, view) {
  return VIEWS.includes(view) && view !== s.view ? freeze({ ...s, view }) : s;
}
