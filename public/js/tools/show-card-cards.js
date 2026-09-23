// Show a card's cards and settings: plain data and pure functions, no DOM, so
// node tools/test-show-card.mjs can pin every word. The screen and its set-up
// section are in show-card.js, beside this file.
//
// CARDS is the fixed list, in the order the screen shows it. A card switched
// off leaves a gap, so every other card stays where it always is.
//   id       stable: the settings name cards by it
//   picture  a picture id from ../pictures.js
//   label    the few words under the picture on the screen (1–4 words)
//   words    what the card says to the person it is shown to
// Cards 1, 2 and 6 carry the wording of LTA's Helping Hand cards exactly, so
// bus captains and station staff know it at a glance (checked 2026-09-23 on
// caringcommuters.gov.sg; docs/learner/show-card.md). The wording
// only: the cards' design is LTA's, and nothing here copies it.
//
// The settings, per device, made on the set-up page (shell.saveSettings):
//   { hidden: ["space"], stop: "Bishan Interchange", disclose: "none" }
//     hidden    cards switched off, in CARDS order
//     stop      the stop's name, a line under the stop card ("My stop: …");
//               "" for none
//     disclose  the second line under "Please be patient with me.": "none"
//               (the default: disclosure is the student's choice, never the
//               app's), "hidden-disability" or "autistic"
// Nothing else is kept — not which card was shown, nor when.

export const STOP_MAX = 40; // characters: "Opp Toa Payoh Stn Exit B" fits easily

const card = (id, picture, label, words) => Object.freeze({ id, picture, label, words });

export const CARDS = Object.freeze([
  card("seat", "seat", "Seat, please", "May I have a seat please?"),
  card("bell", "bell", "My stop", "Please alert me when I am approaching my stop."),
  card("cannot-talk", "cannot-talk", "I cannot talk", "I cannot talk now. I can point or type."),
  card("please", "please", "Be patient with me", "Please be patient with me."),
  // for a parent to show, while their child is overwhelmed
  card("space", "space", "Give us space", "My child is overwhelmed. Please give us some space. We are OK."),
  card("thank-you", "thank-you", "Thank you", "Your care is greatly appreciated. Thank you!"),
]);

// The second line of "Please be patient with me.", in the set-up page's order.
export const DISCLOSURES = Object.freeze([
  { id: "none", line: "" },
  { id: "hidden-disability", line: "I have a hidden disability." },
  { id: "autistic", line: "I am autistic." },
].map(Object.freeze));

const BY_ID = new Map(CARDS.map((c) => [c.id, c]));
const LINES = new Map(DISCLOSURES.map((d) => [d.id, d.line]));

// A stop's name as it is kept: one line, no stray spaces or control
// characters, at most STOP_MAX characters (whole characters: an emoji is
// never cut in half). Anything that isn't text is no stop at all.
export function cleanStop(text) {
  if (typeof text !== "string") return "";
  const one = text.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return Array.from(one).slice(0, STOP_MAX).join("").trim();
}

// Whatever is stored — {} before the set-up page saves anything, an older
// shape, junk — comes back as usable settings: a bad value falls back to its
// default, never an error.
export function readSettings(raw) {
  const s = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const hidden = Array.isArray(s.hidden) ? CARDS.filter((c) => s.hidden.includes(c.id)).map((c) => c.id) : [];
  return {
    hidden,
    stop: cleanStop(s.stop),
    disclose: typeof s.disclose === "string" && LINES.has(s.disclose) ? s.disclose : "none",
  };
}

// ---- changes: each gives the whole next settings object, to save ----

export function withCard(settings, id, on) {
  const s = readSettings(settings);
  if (!BY_ID.has(id)) return s;
  const hidden = new Set(s.hidden);
  if (on) hidden.delete(id);
  else hidden.add(id);
  return { ...s, hidden: CARDS.filter((c) => hidden.has(c.id)).map((c) => c.id) };
}

export const withStop = (settings, stop) => ({ ...readSettings(settings), stop: cleanStop(stop) });

// an id that isn't one of DISCLOSURES changes nothing
export function withDisclosure(settings, id) {
  const s = readSettings(settings);
  return { ...s, disclose: typeof id === "string" && LINES.has(id) ? id : s.disclose };
}

// ---- what a card shows ----

// The lines under a card's words, from the settings: the stop's name under
// the stop card, the chosen second line under "Please be patient with me."
export function cardLines(id, settings) {
  const s = readSettings(settings);
  if (id === "bell" && s.stop) return [`My stop: ${s.stop}`];
  if (id === "please" && LINES.get(s.disclose)) return [LINES.get(s.disclose)];
  return [];
}

// openCard()'s options for a card — { picture, words, lines } — or null for
// an id that isn't a card
export function cardFor(id, settings) {
  const c = BY_ID.get(id);
  return c ? { picture: c.picture, words: c.words, lines: cardLines(id, settings) } : null;
}
