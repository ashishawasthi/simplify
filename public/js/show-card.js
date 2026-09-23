// Show a card: one message filling the whole screen, to show to someone — a
// bus captain, a cashier, a teacher. It is a <dialog> styled as a full-screen
// overlay, not the Fullscreen API and no orientation lock (iPhone has
// neither), so it works the same on every phone and iPad. A device on its
// side gets the picture beside the words — on an iPad, or in a browser: the
// installed Android app is held upright by the manifest ("orientation":
// "portrait"), and there Turn around is how the card faces someone.
//
//   openCard({ picture, words, lang, lines, actions })
//       → a promise that settles when the card is closed: with the action
//         that was tapped, or null
//     picture  optional: a picture id from pictures.js, or an element (a photo)
//     words    the message, in the largest type that fits the screen
//     lang     optional: the language of words, if not English ("zh-SG")
//     lines    optional: more lines under it, smaller — each a string, or
//              { text, lang } for a line in another language: 请给我一个座位
//              as { text, lang: "zh-SG" } is drawn in a Chinese font, read
//              out by a Chinese voice (or not at all, where the device has
//              none) and announced in Chinese by screen readers
//     actions  optional: choices on the card, for whoever holds it —
//              [{ picture, number, words, onTap }]: a picture id, a number
//              that always shows ("2"), and words ("minutes"), hidden on a
//              pictures-only device when there is a picture to say them.
//              A tap closes the card first, then calls onTap(), which may
//              open another screen: onTap: () => shell.go("wait", { m: 2 })
//   closeCard()  close it from code (no action: its promise gives null)
//
// Words are only ever set as text (textContent), never as HTML.
//
// Three round buttons run along the bottom edge, the one nearest whoever holds
// the phone: Turn around (turns the card upside down so the person opposite
// can read it; tap again to turn it back — the buttons and choices stay the
// right way up for the holder), Speak (only when the set-up page allows it
// and the device has a voice) and ✕. The screen is kept awake while a card is
// up, where the browser allows it, so it doesn't go dark in front of the
// person reading it. Any change of screen takes the card away (app.js).

import { PICTURES, pictureImg } from "./pictures.js";
import { canSpeak, say, stop } from "./say-aloud.js";
import { getDevice } from "./device.js";

const MIN_PX = 20; // the words never get smaller than this
const MAX_PX = 480;

let els = null;
let openedAt = 0; // performance.now() when the card last opened
let settle = null; // resolves the promise of the card on screen
let spoken = []; // what Speak says: [{ text, lang }]
let wakeLock = null;

function make(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
}

// A round button with its name in words under it (the words are for sighted
// readers; screen readers get aria-label). ✕ has no words, as everywhere else.
function control(icon, words, label) {
  const wrap = make("div", "card-action");
  const btn = make("button", "round-btn card-btn");
  btn.type = "button";
  btn.setAttribute("aria-label", label);
  const glyph = make("span", null, icon);
  glyph.setAttribute("aria-hidden", "true");
  btn.append(glyph);
  wrap.append(btn);
  if (words) {
    const caption = make("span", "card-action-text pic-words", words);
    caption.setAttribute("aria-hidden", "true");
    wrap.append(caption);
  }
  return { wrap, btn };
}

function build() {
  const dialog = make("dialog", "card-sheet");
  const body = make("div", "card-body");
  const picture = make("div", "card-picture");
  const textBox = make("div", "card-text-box");
  const text = make("div", "card-text");
  const words = make("p", "card-words");
  const lines = make("div", "card-lines");
  text.append(words, lines);
  textBox.append(text);
  body.append(picture, textBox);

  const choices = make("div", "card-choices");
  const bar = make("div", "card-actions");
  const turn = control("🔄", "Turn around", "Turn around, for the person opposite");
  const speak = control("🔊", "Speak", "Speak: say the card out loud");
  const close = control("✕", null, "Close the card");
  bar.append(turn.wrap, speak.wrap, close.wrap);

  dialog.append(body, choices, bar);
  document.body.append(dialog);
  els = { dialog, picture, textBox, text, words, lines, choices, turn: turn.btn, speakWrap: speak.wrap };

  // A quick double tap on a tile near the bottom of a grid can land its
  // second tap on the card that just opened under the finger: ignore taps
  // for a moment after opening (capture, so they never reach a button).
  // Only a real finger's tap counts: a tap from code is always meant.
  dialog.addEventListener("click", (e) => {
    if (e.isTrusted && performance.now() - openedAt < 350) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, true);

  turn.btn.addEventListener("click", () => {
    const turned = dialog.classList.toggle("is-turned");
    turn.btn.setAttribute("aria-pressed", String(turned));
  });
  speak.btn.addEventListener("click", () => say(spoken));
  close.btn.addEventListener("click", () => closeCard());
  // Esc and Android's back button close the dialog themselves. The close
  // event comes a moment later, by which time another card may be up.
  dialog.addEventListener("close", () => {
    if (!dialog.open) finish(null);
  });

  // a phone turned on its side, a split-screen iPad: fit the words again
  if ("ResizeObserver" in window) new ResizeObserver(fit).observe(textBox);
  else addEventListener("resize", fit);
}

// "Thank you!", or { text, lang }: always { text, lang }
function asLine(line) {
  const { text, lang } = line && typeof line === "object" ? line : { text: line };
  return { text: String(text ?? "").trim(), lang: typeof lang === "string" && lang ? lang : null };
}

function setLang(el, lang) {
  if (lang) el.lang = lang;
  else el.removeAttribute("lang");
}

function choiceButton(action) {
  const btn = make("button", "card-choice");
  btn.type = "button";
  const known = typeof action.picture === "string" ? PICTURES.find((p) => p.id === action.picture) : null;
  if (known) btn.append(pictureImg(known.id, { alt: "" }));
  const label = make("span", "card-choice-label"); // under the picture: 2 minutes
  const number = String(action.number ?? "").trim();
  if (number) label.append(make("span", "card-choice-number", number));
  const words = String(action.words ?? "").trim();
  // words a picture already says step aside on a pictures-only device; with
  // no picture they are all the button has
  if (words) label.append(make("span", known ? "card-choice-words pic-words" : "card-choice-words", words));
  if (label.childElementCount) btn.append(label);
  // "2 minutes", not "2minutes" run together from the two parts
  btn.setAttribute("aria-label", [number, words].filter(Boolean).join(" ") || known?.words || "");
  btn.addEventListener("click", () => {
    closeCard(action);
    action.onTap?.();
  });
  return btn;
}

export function openCard({ picture = null, words = "", lang = null, lines = [], actions = [] } = {}) {
  if (!els) build();
  finish(null); // one card at a time: a card already up is simply replaced

  const message = asLine({ text: words, lang });
  const extra = (Array.isArray(lines) ? lines : [lines]).map(asLine).filter((line) => line.text);

  els.picture.replaceChildren();
  const known = typeof picture === "string" ? PICTURES.find((p) => p.id === picture) : null;
  const img = picture instanceof Node ? picture : known ? pictureImg(known.id, { alt: message.text ? "" : known.words }) : null;
  if (img) els.picture.append(img);
  els.picture.hidden = !img;

  els.words.textContent = message.text;
  setLang(els.words, message.lang);
  els.words.hidden = !message.text;
  els.lines.replaceChildren(...extra.map((line) => {
    const p = make("p", null, line.text);
    setLang(p, line.lang);
    return p;
  }));
  spoken = [message, ...extra].filter((part) => part.text);
  els.dialog.setAttribute("aria-label", message.text || known?.words || "Card");

  const choices = (Array.isArray(actions) ? actions : []).filter((a) => a && (a.words || a.number || a.picture));
  els.choices.replaceChildren(...choices.map(choiceButton));
  els.choices.hidden = !choices.length;

  els.dialog.classList.remove("is-turned");
  els.turn.setAttribute("aria-pressed", "false");
  els.speakWrap.hidden = !(getDevice().speak && canSpeak() && spoken.length);

  openedAt = performance.now();
  if (!els.dialog.open) els.dialog.showModal();
  fit();
  keepAwake();
  return new Promise((resolve) => {
    settle = resolve;
  });
}

// action: the choice that closed it, if one did
export function closeCard(action = null) {
  if (!els?.dialog.open) return;
  els.dialog.close();
  finish(action);
}

// The card on screen is over: quiet, let the screen sleep again, and settle
// its promise. Safe to call twice.
function finish(value) {
  if (!settle) return;
  stop();
  wakeLock?.release().catch(() => {});
  wakeLock = null;
  const done = settle;
  settle = null;
  done(value);
}

// The biggest font size at which the words and lines fit their box without
// breaking a word; a word too long even at the smallest size may then break.
function fit() {
  if (!els?.dialog.open) return;
  const { textBox, text } = els;
  const width = textBox.clientWidth;
  const height = textBox.clientHeight;
  if (!width || !height) return;
  const fits = (px) => {
    text.style.fontSize = `${px}px`;
    return text.scrollWidth <= width && text.offsetHeight <= height;
  };
  text.classList.remove("is-squeezed");
  let lo = MIN_PX;
  let hi = Math.min(MAX_PX, height);
  if (!fits(lo)) {
    text.classList.add("is-squeezed");
    fits(lo);
    return;
  }
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  fits(lo);
}

async function keepAwake() {
  if (wakeLock && !wakeLock.released) return;
  wakeLock = null;
  try {
    const lock = await navigator.wakeLock?.request("screen");
    if (!lock) return;
    // keep one lock, and only while a card is still up once it arrives
    if (els.dialog.open && !wakeLock) wakeLock = lock;
    else lock.release().catch(() => {});
  } catch {
    // not allowed here (battery saver, an older browser): the card still shows
  }
}

// The browser drops the wake lock whenever the app goes to the background;
// ask again on the way back if the card is still up.
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && els?.dialog.open) keepAwake();
});
