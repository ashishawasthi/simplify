// Speak on a tap: the device's own voice reads a card out loud, for someone
// who can't say it right now. Output only — the microphone stays off (the
// Permissions-Policy in firebase.json turns it off for the whole site).
//
//   canSpeak()  whether this browser can speak at all (hide the button if not)
//   say(text)   speak it now, cutting off anything still being said; call it
//               straight from a tap: iOS only lets speech start from one, so
//               nothing may be awaited before it. Returns a promise that
//               settles when the speaking ends or is cut off.
//   say([{ text, lang }, …])
//               the same, one part after another, each in a voice for its
//               own language — lang a language tag ("zh-SG", "ms", "ta"),
//               English without one. A part in a language this device has
//               no voice for is left out: read by the English voice it
//               would come out as nonsense.
//   stop()      go quiet; tools call it from hide(), and it happens by itself
//               when the app goes to the background
//
// Voices arrive late (voiceschanged) and differ per phone. Singapore English
// is rarely installed, so English falls back to British, then any English;
// Chinese to Singapore, then China and Taiwan Mandarin — never a Cantonese
// voice (Hong Kong), which would read the words in another spoken language.
// Within each, an on-device voice beats a network one, which fails offline.

// the regions to try, in order, after an exact match, by language
const REGIONS = { en: ["sg", "gb"], zh: ["sg", "cn", "tw"], ms: ["sg", "my"], ta: ["sg", "in"] };
// voices of the same written language that speak another one
const NOT_THIS_TONGUE = { zh: ["hk", "mo"] };

const chosen = new Map(); // language tag → its voice, or null for none on this device

export function canSpeak() {
  return !!window.speechSynthesis && typeof window.SpeechSynthesisUtterance === "function";
}

// "en_SG" (some Android builds) and "en-SG" are the same language
const tagOf = (lang) => String(lang || "").replace(/_/g, "-").toLowerCase();
const regionOf = (tag) => tag.split("-").slice(1).find((part) => part.length === 2) ?? "";

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

export function say(what) {
  const parts = (Array.isArray(what) ? what : [what])
    .map((part) => (part && typeof part === "object" ? part : { text: part }))
    .map(({ text, lang }) => ({ text: String(text ?? "").trim(), lang: lang || null }))
    .filter((part) => part.text);
  if (!canSpeak() || !parts.length) return Promise.resolve();
  const synth = window.speechSynthesis;
  synth.cancel();
  const loaded = synth.getVoices().length > 0;
  const ended = [];
  for (const { text, lang } of parts) {
    const voice = voiceFor(lang);
    const english = !lang || tagOf(lang).startsWith("en");
    // no voice for it: English still goes (the browser picks one), and so does
    // any language while the device hasn't listed its voices yet
    if (!voice && !english && loaded) continue;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = voice ? voice.lang : lang || "en-SG";
    if (voice) utterance.voice = voice;
    utterance.rate = 0.9; // a little slower than the default, for a noisy place
    ended.push(new Promise((resolve) => {
      utterance.onend = resolve;
      utterance.onerror = resolve; // cut off by stop() or another say()
    }));
    synth.speak(utterance);
  }
  // Chrome can be left paused after a cancel(), and then says nothing
  if (synth.paused) synth.resume();
  return Promise.all(ended).then(() => {});
}

export function stop() {
  if (canSpeak()) window.speechSynthesis.cancel();
}

if (canSpeak()) {
  const synth = window.speechSynthesis;
  synth.getVoices(); // asking starts the loading, so the voices are there by the first tap
  synth.addEventListener?.("voiceschanged", () => chosen.clear());
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
  });
}
