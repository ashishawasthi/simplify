// Show a card: the cards' wording, their pictures and the settings logic
// (public/js/tools/show-card-cards.js). No dependencies, no runner:
//
//   node tools/test-show-card.mjs
//
// The wording is pinned word for word: these cards speak for a student to a
// stranger, and three of them must stay exactly as LTA's Helping Hand cards
// say it, so a bus captain knows them at a glance (docs/daily-life-tools.md,
// section 7 — checked on caringcommuters.gov.sg, 2026-09-23).

import {
  CARDS, DISCLOSURES, STOP_MAX, cleanStop, readSettings, withCard, withStop, withDisclosure, cardLines, cardFor,
} from "../public/js/tools/show-card-cards.js";
import { PICTURES } from "../public/js/pictures.js";

const LTA = {
  seat: "May I have a seat please?",
  stop: "Please alert me when I am approaching my stop.",
  universal: "Your care is greatly appreciated. Thank you!",
};

const json = (v) => JSON.stringify(v);
const byId = (id) => CARDS.find((c) => c.id === id);
const frozen = (v) => Object.freeze({ ...v, hidden: Object.freeze([...(v.hidden ?? [])]) });
const DEFAULTS = json({ hidden: [], stop: "", disclose: "none" });
const pictureIds = new Set(PICTURES.map((p) => p.id));
const wordCount = (s) => s.split(" ").length;

const cases = [
  // ---- the cards: fixed, in this order ----
  ["six cards, in their places", CARDS.map((c) => c.id).join(), "seat,bell,cannot-talk,please,space,thank-you"],
  ["labels", CARDS.map((c) => c.label).join(" | "),
    "Seat, please | My stop | I cannot talk | Be patient with me | Give us space | Thank you"],
  ["seat: LTA's words", byId("seat").words, LTA.seat],
  ["stop: LTA's words", byId("bell").words, LTA.stop],
  ["thank you: LTA's words", byId("thank-you").words, LTA.universal],
  ["cannot talk", byId("cannot-talk").words, "I cannot talk now. I can point or type."],
  ["be patient", byId("please").words, "Please be patient with me."],
  ["give us space (a parent's card)", byId("space").words,
    "My child is overwhelmed. Please give us some space. We are OK."],
  ["pictures", CARDS.map((c) => c.picture).join(), "seat,bell,cannot-talk,please,space,thank-you"],
  ["every picture is in pictures.js", CARDS.filter((c) => !pictureIds.has(c.picture)).map((c) => c.id).join(), ""],
  ["labels: 1–4 words, a capital first, no stray spaces",
    CARDS.filter((c) => wordCount(c.label) > 4 || !/^[A-Z]/.test(c.label) || c.label !== c.label.trim() ||
      /\s{2}/.test(c.label)).map((c) => c.id).join(), ""],
  ["words: whole sentences, each ending . ? or !",
    CARDS.filter((c) => !/^[A-Z].*[.?!]$/.test(c.words) || /\s{2}/.test(c.words)).map((c) => c.id).join(), ""],
  ["no card names a diagnosis by itself",
    CARDS.filter((c) => /autis|disab|asd|adhd|diagnos/i.test(`${c.label} ${c.words}`)).map((c) => c.id).join(), ""],
  ["cards and entries are frozen", CARDS.every(Object.isFrozen) && Object.isFrozen(CARDS), true],

  // ---- the second line of "Please be patient with me." ----
  ["disclosures, none first", DISCLOSURES.map((d) => `${d.id}:${d.line}`).join(" | "),
    "none: | hidden-disability:I have a hidden disability. | autistic:I am autistic."],

  // ---- settings: anything stored comes back usable ----
  ["nothing saved yet ({})", json(readSettings({})), DEFAULTS],
  ["undefined", json(readSettings(undefined)), DEFAULTS],
  ["null", json(readSettings(null)), DEFAULTS],
  ["a string", json(readSettings("seat")), DEFAULTS],
  ["an array", json(readSettings(["seat"])), DEFAULTS],
  ["junk values", json(readSettings({ hidden: "seat", stop: 42, disclose: "yes" })), DEFAULTS],
  ["hidden: known ids only, once each, in the cards' order",
    json(readSettings({ hidden: ["space", "seat", "nope", "seat", 5, null, "__proto__", "toString"] }).hidden),
    json(["seat", "space"])],
  ["disclose: a known id", readSettings({ disclose: "autistic" }).disclose, "autistic"],
  ["disclose: an inherited name is not an id", readSettings({ disclose: "toString" }).disclose, "none"],
  ["disclose: not text", readSettings({ disclose: ["autistic"] }).disclose, "none"],
  ["only the three settings are kept", Object.keys(readSettings({ hidden: [], extra: 1, log: ["seat"] })).join(),
    "hidden,stop,disclose"],

  // ---- the stop's name ----
  ["stop: spaces and new lines tidied", cleanStop("  Bishan \n  Interchange \t"), "Bishan Interchange"],
  ["stop: control characters become spaces", cleanStop("Toa\u0000Payoh\u0007 Int"), "Toa Payoh Int"],
  ["stop: at most 40 characters", cleanStop("x".repeat(60)).length, STOP_MAX],
  ["stop: STOP_MAX is 40", STOP_MAX, 40],
  ["stop: cut at 40 leaves no space at the end", cleanStop(`${"a".repeat(39)} bcd`), "a".repeat(39)],
  ["stop: an emoji at the cut is kept whole, never halved", cleanStop(`${"a".repeat(39)}🚌🚌`), `${"a".repeat(39)}🚌`],
  ["stop: not text", cleanStop(12345), ""],
  ["stop: markup is kept as text (shown with textContent)", cleanStop("<b>Bishan</b>"), "<b>Bishan</b>"],
  ["stop read from settings", readSettings({ stop: "  Opp Blk 123  " }).stop, "Opp Blk 123"],

  // ---- changes ----
  ["switch a card off", json(withCard({}, "space", false)), json({ hidden: ["space"], stop: "", disclose: "none" })],
  ["…and on again", json(withCard({ hidden: ["seat", "space"] }, "space", true).hidden), json(["seat"])],
  ["off twice is still once", json(withCard({ hidden: ["space"] }, "space", false).hidden), json(["space"])],
  ["off keeps the cards' order", json(withCard({ hidden: ["thank-you"] }, "seat", false).hidden),
    json(["seat", "thank-you"])],
  ["an unknown card changes nothing", json(withCard({ hidden: ["seat"] }, "bus", false).hidden), json(["seat"])],
  ["a change keeps the other settings",
    json(withCard({ stop: "Bishan", disclose: "autistic" }, "seat", false)),
    json({ hidden: ["seat"], stop: "Bishan", disclose: "autistic" })],
  ["frozen settings (as the shell gives them) are not changed", (() => {
    const before = frozen({ hidden: ["seat"], stop: "Bishan", disclose: "none" });
    withCard(before, "space", false);
    withStop(before, "Yishun");
    withDisclosure(before, "autistic");
    return json(before);
  })(), json({ hidden: ["seat"], stop: "Bishan", disclose: "none" })],
  ["set the stop", json(withStop({ hidden: ["space"] }, "  Yishun   Int ")),
    json({ hidden: ["space"], stop: "Yishun Int", disclose: "none" })],
  ["clear the stop", withStop({ stop: "Yishun" }, "   ").stop, ""],
  ["choose a second line", withDisclosure({}, "hidden-disability").disclose, "hidden-disability"],
  ["back to none", withDisclosure({ disclose: "autistic" }, "none").disclose, "none"],
  ["an unknown second line keeps the one chosen", withDisclosure({ disclose: "autistic" }, "loud").disclose,
    "autistic"],

  // ---- what a card shows (openCard's options) ----
  ["seat", json(cardFor("seat", {})), json({ picture: "seat", words: LTA.seat, lines: [] })],
  ["stop, no name set: no line", json(cardFor("bell", {})), json({ picture: "bell", words: LTA.stop, lines: [] })],
  ["stop, with its name", json(cardFor("bell", { stop: "Bishan Interchange" }).lines),
    json(["My stop: Bishan Interchange"])],
  ["be patient: no second line by default", json(cardFor("please", {}).lines), json([])],
  ["be patient + hidden disability", json(cardFor("please", { disclose: "hidden-disability" }).lines),
    json(["I have a hidden disability."])],
  ["be patient + autistic", json(cardFor("please", { disclose: "autistic" })),
    json({ picture: "please", words: "Please be patient with me.", lines: ["I am autistic."] })],
  ["the stop's name only on the stop card, the second line only on its own",
    CARDS.filter((c) => !["bell", "please"].includes(c.id))
      .map((c) => cardLines(c.id, { stop: "Bishan", disclose: "autistic" }).length).join(), "0,0,0,0"],
  ["a switched-off card still says the same (the switch only hides it)",
    json(cardFor("seat", { hidden: ["seat"] })), json(cardFor("seat", {}))],
  ["not a card", cardFor("bus", {}), null],
  ["an inherited name is not a card", cardFor("__proto__", {}), null],
];

let failed = 0;
for (const [name, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name.padEnd(44)} → ${String(got)}` + (ok ? "" : `\n      expected ${want}`));
}

console.log(failed ? `\n${failed} of ${cases.length} failed` : `\nall ${cases.length} passed`);
process.exit(failed ? 1 : 0);
