// Speak on a tap: a card read out loud, for someone who can't say it right
// now. Output only — the microphone stays off (the Permissions-Policy in
// firebase.json turns it off for the whole site).
//
//   canSpeak()  whether this device can speak at all: recorded clips or the
//               browser's own voice
//   canSpeak(what)
//               whether any of what (as for say()) can be said here
//   say(text)   speak it now, cutting off anything still being said; call it
//               straight from a tap: iOS only lets sound start from one, so
//               nothing may be awaited before it. Returns a promise that
//               settles when the speaking ends or is cut off.
//   say([{ text, lang }, …])
//               the same, one part after another — lang a language tag
//               ("zh-SG", "ms", "ta"), English without one.
//   stop()      go quiet; tools call it from hide(), and it happens by itself
//               when the app goes to the background
//
// The recorded voice. Every fixed sentence a card can say has a clip recorded
// in one clear voice (voice-clips.js, made by tools/make-voice.mjs; the
// service worker keeps them on the device), so Speak sounds the same on every
// phone, online or not. A part with a clip plays it — looked up by its words
// exactly as the card shows them, spaces tidied. A part without one (a stop
// name, words typed into I want, another language) is read by the device's
// own voice (speechSynthesis): one part is never half clip, half device.
// The parts go one after another on one <audio> element — iOS lets an
// element that a tap started play again later — and when a clip follows the
// device's voice, or the other way round, the one still to come is woken
// inside the tap too. A clip that can't play (not downloaded yet) is read by
// the device's voice instead.
//
// The device's voice. Voices arrive late (voiceschanged) and differ per
// phone. Singapore English is rarely installed, so English falls back to
// British, then any English; Chinese to Singapore, then China and Taiwan
// Mandarin — never a Cantonese voice (Hong Kong), which would read the words
// in another spoken language. Within each, an on-device voice beats a network
// one, which fails offline. A part in a language this device has no voice for
// is left out: read by the English voice it would come out as nonsense.

import { CLIPS } from "./voice-clips.js";

// the regions to try, in order, after an exact match, by language
const REGIONS = { en: ["sg", "gb"], zh: ["sg", "cn", "tw"], ms: ["sg", "my"], ta: ["sg", "in"] };
// voices of the same written language that speak another one
const NOT_THIS_TONGUE = { zh: ["hk", "mo"] };
const RATE = 0.9; // the device's voice, a little slower than its default, for a noisy place (the clips are recorded so)

const chosen = new Map(); // language tag → its voice, or null for none on this device

const hasSynth = () => !!window.speechSynthesis && typeof window.SpeechSynthesisUtterance === "function";
const hasClips = () => typeof window.Audio === "function" && Object.keys(CLIPS).length > 0;

// "en_SG" (some Android builds) and "en-SG" are the same language
const tagOf = (lang) => String(lang || "").replace(/_/g, "-").toLowerCase();
const regionOf = (tag) => tag.split("-").slice(1).find((part) => part.length === 2) ?? "";
const isEnglish = (lang) => !lang || tagOf(lang).startsWith("en");
const tidy = (text) => String(text ?? "").replace(/\s+/g, " ").trim();

function voiceFor(lang) {
  const want = tagOf(lang) || "en-sg";
  if (chosen.has(want)) return chosen.get(want);
  const all = window.speechSynthesis.getVoices();
  const [primary] = want.split("-");
  const voices = all.filter((v) => tagOf(v.lang).split("-")[0] === primary);
  const tests = [
    (tag) => tag === want,
    ...(REGIONS[primary] ?? []).map((region) => (tag) => regionOf(tag) === region),
    (tag) => !(NOT_THIS_TONGUE[primary] ?? []).includes(regionOf(tag)),
  ];
  let found = null;
  for (const test of tests) {
    found = voices.find((v) => v.localService && test(tagOf(v.lang))) ?? voices.find((v) => test(tagOf(v.lang)));
    if (found) break;
  }
  if (all.length) chosen.set(want, found); // no voices at all yet: ask again next time
  return found;
}

// What to say, in order: a clip ({ clip, text }) or the device's voice
// ({ text, lang, voice }) per part. Parts nothing here can say are left out.
function steps(what) {
  const parts = (Array.isArray(what) ? what : [what])
    .map((part) => (part && typeof part === "object" ? part : { text: part }))
    .map(({ text, lang }) => ({ text: tidy(text), lang: lang || null }))
    .filter((part) => part.text);
  const out = [];
  const synth = hasSynth();
  const loaded = synth && window.speechSynthesis.getVoices().length > 0;
  for (const { text, lang } of parts) {
    const clip = isEnglish(lang) && hasClips() && Object.hasOwn(CLIPS, text) ? CLIPS[text] : null;
    if (clip) {
      out.push({ clip, text, lang });
      continue;
    }
    if (!synth) continue;
    const voice = voiceFor(lang);
    // no voice for it: English still goes (the browser picks one), and so does
    // any language while the device hasn't listed its voices yet
    if (!voice && !isEnglish(lang) && loaded) continue;
    out.push({ text, lang, voice });
  }
  return out;
}

export function canSpeak(what) {
  if (what === undefined) return hasClips() || hasSynth();
  return steps(what).length > 0;
}

// ---------- playing ----------

let audio = null; // the one <audio> element every clip plays on
let current = 0; // which say() is speaking; stop() and the next say() move it on
let cut = null; // ends the part playing now, when it is cut off

function player() {
  if (!audio) {
    audio = new Audio();
    audio.preload = "auto";
  }
  return audio;
}

function utterance(text, lang, voice) {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = voice ? voice.lang : lang || "en-SG";
  if (voice) u.voice = voice;
  u.rate = RATE;
  return u;
}

// the device's voice: every part of a run queued at once, as a tap allows
function speakRun(run) {
  const synth = window.speechSynthesis;
  const ended = run.map(({ text, lang, voice }) => {
    const u = utterance(text, lang, voice);
    const done = new Promise((resolve) => {
      u.onend = resolve;
      u.onerror = resolve; // cut off by stop() or another say()
    });
    synth.speak(u);
    return done;
  });
  // Chrome can be left paused after a cancel(), and then says nothing
  if (synth.paused) synth.resume();
  return Promise.all(ended);
}

// one clip; if it can't play, the device's voice reads its words instead
function playClip(step, mine) {
  const el = player();
  return new Promise((resolve) => {
    let over = false;
    const end = (fallBack) => {
      if (over) return;
      over = true;
      el.removeEventListener("ended", onEnded);
      el.removeEventListener("error", onError);
      cut = null;
      if (fallBack && mine === current && hasSynth()) speakRun([{ ...step, voice: voiceFor(step.lang) }]).then(resolve);
      else resolve();
    };
    const onEnded = () => end(false);
    const onError = () => end(true);
    el.addEventListener("ended", onEnded);
    el.addEventListener("error", onError);
    cut = () => end(false);
    el.muted = false;
    if (el.getAttribute("src") !== step.clip) el.src = step.clip;
    else el.currentTime = 0;
    Promise.resolve(el.play()).catch((err) => {
      // AbortError: paused or given another clip before it began — cut off
      end(err?.name !== "AbortError");
    });
  });
}

// Inside the tap, wake whichever output comes later but not first, so a
// phone that only lets sound start from a tap still lets it start then.
function wake(list) {
  const later = list.slice(1);
  if (list[0].clip && later.some((s) => !s.clip)) {
    window.speechSynthesis.speak(utterance("", null, null)); // an empty line: nothing heard
  }
  const clip = !list[0].clip && later.find((s) => s.clip);
  if (clip) {
    const el = player();
    el.muted = true;
    el.src = clip.clip;
    Promise.resolve(el.play()).then(() => {
      if (el.muted) el.pause(); // still waiting its turn
    }).catch(() => {});
  }
}

export function say(what) {
  stop();
  const list = steps(what);
  if (!list.length) return Promise.resolve();
  const mine = ++current;
  wake(list);
  // runs straight through to the first part's play() or speak(), in the tap
  return (async () => {
    for (let i = 0; i < list.length && mine === current;) {
      if (list[i].clip) {
        await playClip(list[i], mine);
        i++;
      } else {
        let j = i;
        while (j < list.length && !list[j].clip) j++;
        await speakRun(list.slice(i, j));
        i = j;
      }
    }
  })();
}

export function stop() {
  current++;
  if (hasSynth()) window.speechSynthesis.cancel();
  if (audio) {
    audio.pause();
    audio.muted = false;
  }
  cut?.();
}

if (hasSynth()) {
  const synth = window.speechSynthesis;
  synth.getVoices(); // asking starts the loading, so the voices are there by the first tap
  synth.addEventListener?.("voiceschanged", () => chosen.clear());
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stop();
});
