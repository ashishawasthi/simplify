// The recorded voice: every sentence a card can say has its clip, every clip
// is in the map, the map is keyed by the words exactly as the cards show them,
// and tools/make-voice.mjs plans the same thing every time. No network, no
// dependencies, no runner:
//
//   node tools/test-voice.mjs
//
// A failure here after a card's words change means: node tools/make-voice.mjs
// (docs/platform/voice.md).

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  CLIP_DIR, CLIP_URL, VOICE, clipName, normalise, phrases, plan, renderMap, renderSw, speechText,
} from "./make-voice.mjs";
import { CLIPS, VOICE as MAP_VOICE } from "../public/js/voice-clips.js";
import { PICTURES } from "../public/js/pictures.js";
import { CARDS as NEED_CARDS, REGIONS, SIZES, hurtsSentence, wantSentence } from "../public/js/tools/i-need-cards.js";
import { CARDS as SHOW_CARDS, DISCLOSURES, cardFor, cardLines } from "../public/js/tools/show-card-cards.js";

const ROOT = join(new URL(".", import.meta.url).pathname, "..");
const MAX_CLIP = 40 * 1024; // the longest sentence is about 5 s: 20 KB
const MAX_TOTAL = 2 * 1024 * 1024; // every device downloads them all

const entries = plan();
const texts = entries.map((e) => e.text);
const keys = Object.keys(CLIPS);
const files = readdirSync(CLIP_DIR);
const inMap = new Set(Object.values(CLIPS));
const sizes = entries.map((e) => statSync(join(CLIP_DIR, e.file), { throwIfNoEntry: false })?.size ?? 0);
const total = sizes.reduce((a, b) => a + b, 0);
const isMp3 = (buf) => buf.subarray(0, 3).toString() === "ID3" || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0);
const letters = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const missingFrom = (list) => list.filter((t) => !Object.hasOwn(CLIPS, t)).join(" | ");
const unique = (list) => [...new Set(list)];

// the app's own sentences, straight from its modules — what a card shows
const NEED = NEED_CARDS.filter((c) => c.sentence).map((c) => c.sentence);
const HURTS = REGIONS.flatMap((r) => SIZES.map((s) => hurtsSentence(r.id, s.id)));
const WANT = unique(PICTURES.map((p) => wantSentence({ picture: p.id, words: p.words }, p.words)));
const SHOW = SHOW_CARDS.map((c) => cardFor(c.id, {}).words);
const LINES = DISCLOSURES.flatMap((d) => cardLines("please", { disclose: d.id }));

const cases = [
  // ---- the voice ----
  ["the map names the generator's voice", MAP_VOICE, VOICE.name],
  ["a Chirp 3 HD voice, female (Erinome)", /^[a-z]{2}-[A-Z]{2}-Chirp3-HD-Erinome$/.test(VOICE.name), true],

  // ---- what is said: every fixed sentence, from the tools' own data ----
  ["every I need card's sentence", missingFrom(NEED), ""],
  ["every Hurts answer: 12 places × 3 sizes", `${HURTS.length} ${missingFrom(HURTS)}`, "36 "],
  ["My back is one of them", HURTS.includes("It hurts here: my back. A lot."), true],
  ["I want: every picture's own words", missingFrom(WANT), ""],
  ["every Show a card card's words", missingFrom(SHOW), ""],
  ["the optional second lines", `${LINES.length} ${missingFrom(LINES)}`, "2 "],
  ["nothing else: exactly those sentences", keys.length, unique([...NEED, ...HURTS, ...WANT, ...SHOW, ...LINES]).length],
  ["the plan is the map", JSON.stringify(texts), JSON.stringify(keys)],
  ["the phrases, each once", phrases().length, unique(phrases().map((p) => p.text)).length],

  // ---- keyed by the words exactly as the cards show them ----
  ["I need help", CLIPS["I need help"]?.startsWith(CLIP_URL), true],
  ["It hurts here: tummy. A lot.", Object.hasOwn(CLIPS, "It hurts here: tummy. A lot."), true],
  ["I want: Kopi", Object.hasOwn(CLIPS, "I want: Kopi"), true],
  ["May I have a seat please? (LTA's words)", Object.hasOwn(CLIPS, "May I have a seat please?"), true],
  ["I am autistic.", Object.hasOwn(CLIPS, "I am autistic."), true],
  ["keys are tidy: no stray spaces", keys.filter((k) => normalise(k) !== k).join(" | "), ""],
  ["typed words have no clip: a stop name", Object.hasOwn(CLIPS, "My stop: Bishan Interchange"), false],
  ["typed words have no clip: I want, typed", Object.hasOwn(CLIPS, "I want: Chicken rice"), false],
  ["the map is plain data: no inherited names", Object.hasOwn(CLIPS, "__proto__") || Object.hasOwn(CLIPS, "toString"), false],
  ["the map is frozen", Object.isFrozen(CLIPS), true],

  // ---- the words sent differ in punctuation and capitals only ----
  ["same words said as shown", entries.filter((e) => letters(e.speech) !== letters(e.text)).map((e) => e.text).join(" | "), ""],
  ["every one ends with . ? or !", entries.filter((e) => !/[.?!]$/.test(e.speech)).map((e) => e.text).join(" | "), ""],
  ["I want keeps its colon (else: \"I won't\")", speechText("I want: Stop"), "I want: Stop."],
  ["Hurts: the place a sentence of its own", speechText("It hurts here: ear. A lot."), "It hurts here. Ear. A lot."],
  ["LTA's words go as they are", speechText("May I have a seat please?"), "May I have a seat please?"],

  // ---- the files ----
  ["every sentence has its clip file", entries.filter((e, i) => !sizes[i]).map((e) => e.text).join(" | "), ""],
  ["every clip file is in the map", files.filter((f) => !inMap.has(CLIP_URL + f)).join(" "), ""],
  ["only clips in the folder", files.filter((f) => !/^[0-9a-f]{12}\.mp3$/.test(f)).join(" "), ""],
  ["one clip per sentence (no two share a file)", unique(entries.map((e) => e.file)).length, entries.length],
  ["every clip is MP3",
    entries.filter((e, i) => sizes[i] && !isMp3(readFileSync(join(CLIP_DIR, e.file)))).map((e) => e.file).join(" "), ""],
  [`every clip under ${MAX_CLIP / 1024} KB`, entries.filter((e, i) => sizes[i] > MAX_CLIP).map((e) => e.file).join(" "), ""],
  [`all of them under ${MAX_TOTAL / 1024 / 1024} MB`, total <= MAX_TOTAL, true],

  // ---- the generator: the same plan every time, and its files up to date ----
  ["plan() twice: the same", JSON.stringify(plan()), JSON.stringify(entries)],
  ["a clip's name: the same words, the same name", clipName("I need help."), clipName("I need help.")],
  ["a clip's name: other words, another name", clipName("I need help.") !== clipName("I need help!"), true],
  ["file names come from the words sent", entries.filter((e) => e.file !== clipName(e.speech)).length, 0],
  ["public/js/voice-clips.js is what the generator writes",
    readFileSync(join(ROOT, "public", "js", "voice-clips.js"), "utf8") === renderMap(entries), true],
  ["sw.js lists every clip, as the generator writes it",
    (() => {
      const sw = readFileSync(join(ROOT, "public", "sw.js"), "utf8");
      return renderSw(sw, entries) === sw;
    })(), true],
];

let failed = 0;
for (const [name, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name.padEnd(48)} → ${String(got)}` + (ok ? "" : `\n      expected ${want}`));
}

console.log(`\n${entries.length} clips, ${(total / 1024).toFixed(0)} KB in all (${VOICE.name})`);
console.log(failed ? `${failed} of ${cases.length} failed — run node tools/make-voice.mjs?` : `all ${cases.length} passed`);
process.exit(failed ? 1 : 0);
