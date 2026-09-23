// Record the voice Speak plays: one MP3 clip for every fixed sentence the
// learner app can say, in one Google Cloud Chirp 3 HD voice, served from
// public/audio/voice/ and kept on the device by the service worker.
//
//   node tools/make-voice.mjs           record what is missing, delete what
//                                       nothing says any more, write the map
//   node tools/make-voice.mjs --check   change nothing and use no network:
//                                       exit 1 if a clip, the map or sw.js is
//                                       out of date
//
// No npm packages: Node 22, ffmpeg with LAME (`brew install ffmpeg`), and the
// gcloud CLI signed in to an account that may use Cloud Text-to-Speech on the
// simplify-special project (the API is enabled there): `gcloud auth login`.
//
// Chirp 3 HD now and then stops mid-word — about one sentence in four at this
// pace ("I want: Tray" came back as "I want tra—", heard back 2026-09-24),
// and says it a little differently each time it is asked. So Cloud TTS is
// asked for plain 16-bit audio (LINEAR16), whose last 100 ms are measured
// here: speech still going at the very end is asked for again (up to
// TRIES times; the take that ends quietest is kept, with a warning). ffmpeg
// then makes the MP3.
//
// The sentences come from the tools' own data modules, never copied here, so a
// reworded card is picked up by the next run (and node tools/test-voice.mjs
// fails until then):
//   - I need: every card's sentence; every Hurts answer (each region, My back
//     included, × each size); "I want: <words>" for every picture's own words
//   - Show a card: every card's words and each optional second line
// Anything else a card can say — a stop name, words typed into I want — has
// no clip, and say-aloud.js reads it in the device's own voice.
//
// Each clip is named by a short hash of the voice, the pace and the words
// sent (public/audio/voice/<hash>.mp3), so only a sentence that is new or
// changed is recorded: a re-run costs nothing, and changing VOICE or RATE
// below re-records every clip. The map public/js/voice-clips.js (written by
// this script) is keyed by the words as the card shows them; the words sent
// may differ in punctuation only (speechText below).
//
// A clip that sounds wrong (heard back, or by a person): delete its file and
// run this again for another take.
//
// After a run that changed anything: node tools/test-voice.mjs, then bump
// CACHE in public/sw.js (this script rewrites the clip list inside ASSETS).

import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { PICTURES } from "../public/js/pictures.js";
import { CARDS as NEED_CARDS, REGIONS, SIZES, hurtsSentence, wantSentence } from "../public/js/tools/i-need-cards.js";
import { CARDS as SHOW_CARDS, DISCLOSURES, cardFor, cardLines } from "../public/js/tools/show-card-cards.js";

// The voice. Change it here and re-run: every clip is recorded again.
// Google has no Singapore English (en-SG) Chirp 3 HD voice (checked
// 2026-09-24 against the API's voice list and the Chirp 3 HD language table),
// so this is the British one — the same fallback say-aloud.js takes for the
// device's own voice. Erinome is the voice Google describes as clear.
export const VOICE = Object.freeze({ name: "en-GB-Chirp3-HD-Erinome", languageCode: "en-GB" });
// a little slower than normal, for a noisy place — as say-aloud.js asks of the
// device's voice
export const RATE = 0.9;
// Chirp 3 HD's own sampling rate, mono
const AUDIO = Object.freeze({ audioEncoding: "LINEAR16", speakingRate: RATE, sampleRateHertz: 24000 });
// MP3 plays on iOS Safari and Android Chrome; a constant 32 kbit/s, mono, is
// plenty for speech — 4 KB a second. Chirp starts some clips with up to 0.8 s
// of silence, which would feel like Speak not working: all but 50 ms of it is
// cut. bitexact keeps ffmpeg's version out of the file.
const MP3 = Object.freeze(["-af", "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05",
  "-codec:a", "libmp3lame", "-b:a", "32k", "-ac", "1", "-ar", "24000",
  "-map_metadata", "-1", "-fflags", "+bitexact", "-flags:a", "+bitexact"]);

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
export const CLIP_DIR = join(ROOT, "public", "audio", "voice");
export const CLIP_URL = "/audio/voice/";
export const MAP_FILE = join(ROOT, "public", "js", "voice-clips.js");
const SW_FILE = join(ROOT, "public", "sw.js");
const PROJECT = "simplify-special";
const ENDPOINT = "https://texttospeech.googleapis.com/v1/text:synthesize";

// The same text, however it was spaced: say-aloud.js looks clips up this way.
export const normalise = (text) => String(text ?? "").replace(/\s+/g, " ").trim();

// What is sent to be spoken, for what the card shows: punctuation and capitals
// only, never other words. Heard back (transcribed, 2026-09-24), "It hurts
// here: ear." ran the region into "here" ("here, here", "hurts here and" for
// hand), so the region gets a sentence of its own: "It hurts here. Ear. A
// lot." "I want: Stop" keeps its colon — without it, or with a comma, it came
// out as "I won't stop". A sentence with no full stop can end on a rising
// note, so every one gets one.
export function speechText(text) {
  let speech = normalise(text)
    .replace(/^It hurts here: (\S)/, (_, first) => `It hurts here. ${first.toUpperCase()}`);
  if (!/[.!?]$/.test(speech)) speech += ".";
  return speech;
}

// Every fixed sentence the learner app can say, once each, with where it
// comes from (for the report and the tests).
export function phrases() {
  const found = new Map(); // text → from
  const add = (text, from) => {
    const t = normalise(text);
    if (t && !found.has(t)) found.set(t, from);
  };
  for (const card of NEED_CARDS) if (card.sentence) add(card.sentence, `I need: ${card.id}`);
  for (const region of REGIONS) {
    for (const size of SIZES) add(hurtsSentence(region.id, size.id), `I need: hurts ${region.id} ${size.id}`);
  }
  // I want: the picture picker offers every picture, and its words are the
  // picture's own unless someone types others (those have no clip)
  for (const p of PICTURES) add(wantSentence({ picture: p.id, words: p.words }, p.words), `I need: want ${p.id}`);
  for (const card of SHOW_CARDS) add(cardFor(card.id, {}).words, `Show a card: ${card.id}`);
  for (const d of DISCLOSURES) {
    for (const line of cardLines("please", { disclose: d.id })) add(line, `Show a card: second line ${d.id}`);
  }
  return [...found].map(([text, from]) => ({ text, from }));
}

// "<12 hex>.mp3": the voice, pace and words sent, hashed
export function clipName(speech) {
  const key = JSON.stringify([VOICE.name, VOICE.languageCode, AUDIO, MP3, speech]);
  return `${createHash("sha256").update(key).digest("hex").slice(0, 12)}.mp3`;
}

// The whole plan, sorted by text so the map never changes order between runs:
// [{ text, speech, file, from }]
export function plan() {
  return phrases()
    .map(({ text, from }) => {
      const speech = speechText(text);
      return { text, speech, file: clipName(speech), from };
    })
    .sort((a, b) => (a.text < b.text ? -1 : a.text > b.text ? 1 : 0));
}

export function renderMap(entries = plan()) {
  const rows = entries.map(({ text, file }) => `  ${JSON.stringify(text)}: ${JSON.stringify(CLIP_URL + file)},`);
  return `// GENERATED by node tools/make-voice.mjs — do not edit by hand; change the
// sentences where the tools keep them, or the voice in make-voice.mjs, and run
// it again.
//
// The recorded voice Speak plays (say-aloud.js): each sentence a card can say,
// exactly as the card shows it, → its clip. A sentence not here — a stop name,
// words typed into I want — is read by the device's own voice.

export const VOICE = ${JSON.stringify(VOICE.name)};

export const CLIPS = Object.freeze({
${rows.join("\n")}
});
`;
}

// sw.js's ASSETS carries the clips between these two lines
const BEGIN = "  // >>> the recorded voice (js/voice-clips.js), written by node tools/make-voice.mjs — don't edit by hand";
const END = "  // <<< the recorded voice";

export function renderSw(src, entries = plan()) {
  const start = src.indexOf(BEGIN);
  const end = src.indexOf(END);
  if (start < 0 || end < start) throw new Error(`public/sw.js: no "${BEGIN.trim()}" … "${END.trim()}" block in ASSETS`);
  const files = [...new Set(entries.map((e) => e.file))].sort();
  const lines = [];
  for (let i = 0; i < files.length; i += 4) {
    lines.push(`  ${files.slice(i, i + 4).map((f) => JSON.stringify(CLIP_URL + f)).join(", ")},`);
  }
  return `${src.slice(0, start)}${BEGIN}\n${lines.join("\n")}\n${src.slice(end)}`;
}

// ---------- the run ----------

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
// How loud the last 100 ms of a 16-bit mono WAV are, in dB (0 = full scale).
// A finished sentence has faded out (Chirp's end well below -50 dB); speech
// still going at the very end means the clip was cut off.
const CUT_OFF_DB = -35;
const TRIES = 6;
export function endLoudness(wav) {
  const data = wav.indexOf("data", 12) + 8; // the samples follow the "data" chunk's header
  const rate = wav.readUInt32LE(24);
  const from = Math.max(data, wav.length - Math.round(rate * 0.1) * 2);
  let sum = 0;
  let n = 0;
  for (let i = from; i + 1 < wav.length; i += 2, n++) sum += (wav.readInt16LE(i) / 32768) ** 2;
  return n ? 10 * Math.log10(sum / n || 1e-12) : -120;
}

function toMp3(wav) {
  const run = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "wav", "-i", "pipe:0", ...MP3,
    "-f", "mp3", "pipe:1"], { input: wav, maxBuffer: 1 << 26 });
  if (run.error) throw new Error(`ffmpeg: ${run.error.message} — install it, with LAME (brew install ffmpeg)`);
  if (run.status !== 0 || !run.stdout.length) throw new Error(`ffmpeg failed: ${String(run.stderr).trim()}`);
  return run.stdout;
}

function token() {
  try {
    return execFileSync("gcloud", ["auth", "print-access-token"], { encoding: "utf8" }).trim();
  } catch {
    throw new Error("no access token from `gcloud auth print-access-token` — sign in with `gcloud auth login`");
  }
}

async function synthesise(speech, auth) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${auth}`, "X-Goog-User-Project": PROJECT, "Content-Type": "application/json" },
    body: JSON.stringify({ input: { text: speech }, voice: VOICE, audioConfig: AUDIO }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.audioContent) {
    throw new Error(`Text-to-Speech ${res.status} for "${speech}": ${body.error?.message ?? "no audio"}`);
  }
  return Buffer.from(body.audioContent, "base64");
}

async function main() {
  const check = process.argv.includes("--check");
  const entries = plan();
  const wanted = new Set(entries.map((e) => e.file));
  mkdirSync(CLIP_DIR, { recursive: true });
  const present = readdirSync(CLIP_DIR).filter((f) => f.endsWith(".mp3"));
  const missing = entries.filter((e) => !existsSync(join(CLIP_DIR, e.file)));
  const orphans = present.filter((f) => !wanted.has(f));
  const map = renderMap(entries);
  const swSrc = readFileSync(SW_FILE, "utf8");
  const sw = renderSw(swSrc, entries);
  const mapStale = !existsSync(MAP_FILE) || readFileSync(MAP_FILE, "utf8") !== map;

  if (check) {
    for (const e of missing) console.log(`missing clip: "${e.text}" (${e.file})`);
    for (const f of orphans) console.log(`clip nothing says: ${f}`);
    if (mapStale) console.log("public/js/voice-clips.js is out of date");
    if (sw !== swSrc) console.log("public/sw.js's clip list is out of date");
    const stale = missing.length || orphans.length || mapStale || sw !== swSrc;
    console.log(stale ? "\nrun: node tools/make-voice.mjs" : `all ${entries.length} clips up to date`);
    process.exit(stale ? 1 : 0);
  }

  let characters = 0;
  if (missing.length) {
    const auth = token();
    for (const e of missing) {
      let best = null;
      for (let attempt = 1; attempt <= TRIES; attempt++) {
        const wav = await synthesise(e.speech, auth);
        characters += e.speech.length;
        const end = endLoudness(wav);
        if (!best || end < best.end) best = { wav, end };
        if (end <= CUT_OFF_DB) break;
      }
      if (best.end > CUT_OFF_DB) {
        console.log(`  warning: every take was cut off (best ends at ${best.end.toFixed(1)} dB) — listen to "${e.speech}"`);
      }
      const audio = toMp3(best.wav);
      writeFileSync(join(CLIP_DIR, e.file), audio);
      console.log(`recorded ${e.file}  ${kb(audio.length).padStart(7)}  "${e.speech}"`);
    }
  }
  for (const f of orphans) {
    rmSync(join(CLIP_DIR, f));
    console.log(`deleted ${f} (nothing says it any more)`);
  }
  if (mapStale) writeFileSync(MAP_FILE, map);
  if (sw !== swSrc) writeFileSync(SW_FILE, sw);

  const total = entries.reduce((sum, e) => sum + statSync(join(CLIP_DIR, e.file)).size, 0);
  console.log(`\n${entries.length} clips, ${kb(total)} in all; ${missing.length} recorded now ` +
    `(${characters} characters sent), ${orphans.length} deleted — voice ${VOICE.name}`);
  if (missing.length || orphans.length || sw !== swSrc) {
    console.log("next: node tools/test-voice.mjs && node tools/test-assets.mjs, and bump CACHE in public/sw.js");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main().catch((err) => {
    console.error(`make-voice: ${err.message}`);
    process.exit(1);
  });
}
