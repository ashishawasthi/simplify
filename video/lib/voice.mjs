// The narration: the app's own voice (tools/make-voice.mjs — Chirp 3 HD,
// en-IN Erinome, a little slow), one short line per shot. Each line is
// cached by its text, so re-rendering a video only pays for lines that
// changed. Returns WAV (24 kHz mono) with the leading silence trimmed.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PROJECT, token } from "./auth.mjs";
import { endLoudness, speechText, VOICE } from "../../tools/make-voice.mjs";

const ENDPOINT = "https://texttospeech.googleapis.com/v1/text:synthesize";
// the app speaks a little slowly, for a noisy place; a video can go at the
// normal pace, since it can be replayed
const VIDEO_RATE = 1.0;
const AUDIO = { audioEncoding: "LINEAR16", speakingRate: VIDEO_RATE, sampleRateHertz: 24000 };
const TRIES = 4;

async function synthesise(text) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${await token()}`, "X-Goog-User-Project": PROJECT, "Content-Type": "application/json" },
    body: JSON.stringify({ input: { text }, voice: VOICE, audioConfig: AUDIO }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.audioContent) throw new Error(`Text-to-Speech ${res.status} for "${text}": ${body.error?.message ?? "no audio"}`);
  return Buffer.from(body.audioContent, "base64");
}

// ffmpeg: trim the silence Chirp sometimes starts with, keep 24 kHz mono WAV
function trim(wav) {
  const run = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "wav", "-i", "pipe:0",
    "-af", "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.08,areverse",
    "-ar", "24000", "-ac", "1", "-f", "wav", "pipe:1"], { input: wav, maxBuffer: 1 << 26 });
  if (run.status !== 0) throw new Error(`ffmpeg: ${String(run.stderr).trim()}`);
  return run.stdout;
}

export const wavSeconds = (wav) => (wav.length - (wav.indexOf("data", 12) + 8)) / (wav.readUInt32LE(28));

export async function speak(line, cacheDir) {
  const text = speechText(line);
  const key = createHash("sha256").update(`${VOICE.name}|${VIDEO_RATE}|${text}`).digest("hex").slice(0, 16);
  mkdirSync(cacheDir, { recursive: true });
  const file = join(cacheDir, `${key}.wav`);
  if (existsSync(file)) return { file, seconds: wavSeconds(readFileSync(file)) };
  let best = null;
  for (let i = 0; i < TRIES; i++) {
    const wav = await synthesise(text);
    const end = endLoudness(wav);
    if (!best || end < best.end) best = { wav, end };
    if (end <= -35) break; // not cut off mid-word
  }
  const wav = trim(best.wav);
  writeFileSync(file, wav);
  return { file, seconds: wavSeconds(wav) };
}
