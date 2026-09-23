// Pick a picture, and a few words to go with it, for a card — a Now and next
// card, a Steps step, a card of your own. A full-screen sheet in the same
// look as the notes-and-coins picker (.picker), built the first time it opens.
//
//   pickPicture({ title, allowWords = true, current })
//       → a promise of { picture, words }, or null
//     title       what the picture is for, shown at the top ("Now")
//     allowWords  false: pictures only, no text box; words are the picture's own
//     current     { picture, words } picked before: shown picked and filled in
//   Done gives { picture: an id from pictures.js or null, words: "" or up to
//   40 characters }. ✕, Esc, or Done with nothing picked and nothing typed
//   give null — "nothing changes", never an error.
//   closePicturePicker()  end a pick from code, as ✕ does (null). Any change
//                         of screen does it (app.js), so a pick never
//                         outlives the screen that asked for it.
//
// Tapping a picture fills in its own words when the box is empty, or still
// holds the words the last picture put there, so nothing somebody typed is
// ever overwritten. Tapping the picked picture again un-picks it.

import { PICTURE_GROUPS, PICTURES, pictureImg } from "./pictures.js";

const MAX_WORDS_LENGTH = 40; // about four words

let els = null;
let settle = null; // resolves the promise of the pick in progress
let picked = null; // picture id
let autoWords = ""; // the words a picture put in the box, until someone types
let wordsAllowed = true;

const byId = new Map();

function make(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
}

function build() {
  for (const p of PICTURES) byId.set(p.id, p);

  const dialog = make("dialog", "picker picture-picker");
  dialog.setAttribute("aria-labelledby", "pp-title");

  const header = make("header", "picker-header pp-header");
  const close = make("button", "round-btn pp-close");
  close.type = "button";
  close.setAttribute("aria-label", "Close: keep what was there before");
  const x = make("span", null, "✕");
  x.setAttribute("aria-hidden", "true");
  close.append(x);
  const title = make("h2", "pp-title");
  title.id = "pp-title";
  const done = make("button", "done-btn pp-done");
  done.type = "button";
  // focus lands here, not in the text box: the keyboard would cover the pictures
  done.autofocus = true;
  const tick = make("span", null, "✔");
  tick.setAttribute("aria-hidden", "true");
  done.append(tick, " Done");
  header.append(close, title, done);

  const wordsLabel = make("label", "pp-words-label");
  const wordsText = make("span", "pp-words-text", "Words");
  const words = make("input", "name-field pp-words");
  words.type = "text";
  words.autocomplete = "off";
  words.enterKeyHint = "done";
  words.maxLength = MAX_WORDS_LENGTH;
  words.placeholder = "1 to 4 words";
  wordsLabel.append(wordsText, words);

  const groups = make("div", "pp-groups");
  const known = new Set(PICTURE_GROUPS.map((g) => g.id));
  const sections = [
    ...PICTURE_GROUPS.map((g) => ({ label: g.label, pictures: PICTURES.filter((p) => p.group === g.id) })),
    // a picture whose group isn't listed still gets a place, at the end
    { label: "More", pictures: PICTURES.filter((p) => !known.has(p.group)) },
  ];
  for (const { label, pictures } of sections) {
    if (!pictures.length) continue;
    const grid = make("div", "pp-grid");
    for (const p of pictures) grid.append(pictureButton(p));
    groups.append(make("h3", "picker-group-label", label), grid);
  }

  dialog.append(header, wordsLabel, groups);
  document.body.append(dialog);
  els = { dialog, title, words, wordsLabel, groups };

  close.addEventListener("click", () => finish(null));
  done.addEventListener("click", () => finish(result()));
  words.addEventListener("keydown", (e) => {
    // Enter puts the keyboard away; the pictures are still there to pick
    if (e.key === "Enter") {
      e.preventDefault();
      words.blur();
    }
  });
  // Esc, Android's back button: the same as ✕. The close event comes a
  // moment later, by which time the sheet may be open for the next pick.
  dialog.addEventListener("close", () => {
    if (!dialog.open) finish(null);
  });
}

function pictureButton(p) {
  const btn = make("button", "pp-pic");
  btn.type = "button";
  btn.dataset.picture = p.id;
  btn.setAttribute("aria-pressed", "false");
  const img = pictureImg(p.id, { alt: "" });
  if (img) {
    img.loading = "lazy";
    img.decoding = "async";
    btn.append(img);
  }
  btn.append(make("span", "pp-pic-words", p.words));
  btn.addEventListener("click", () => choose(p.id));
  return btn;
}

function choose(id) {
  const again = id === picked;
  picked = again ? null : id;
  const typed = els.words.value.trim();
  // the box is ours to change only while it holds nothing, or our own words
  if (wordsAllowed && (typed === "" || typed === autoWords)) {
    autoWords = picked ? byId.get(picked).words : "";
    els.words.value = autoWords;
  }
  showPicked();
}

function showPicked() {
  for (const btn of els.groups.querySelectorAll(".pp-pic")) {
    btn.setAttribute("aria-pressed", String(btn.dataset.picture === picked));
  }
}

function result() {
  const words = wordsAllowed
    ? els.words.value.trim().replace(/\s+/g, " ")
    : (picked ? byId.get(picked).words : "");
  return picked || words ? { picture: picked, words } : null;
}

export function pickPicture({ title = "Pick a picture", allowWords = true, current = null } = {}) {
  if (!els) build();
  finish(null); // a pick already open ends unchosen

  wordsAllowed = allowWords;
  picked = current?.picture && byId.has(current.picture) ? current.picture : null;
  const words = allowWords ? String(current?.words ?? "").slice(0, MAX_WORDS_LENGTH) : "";
  els.words.value = words;
  autoWords = picked && words === byId.get(picked).words ? words : "";
  els.wordsLabel.hidden = !allowWords;
  els.title.textContent = title;
  showPicked();

  els.dialog.showModal();
  els.dialog.scrollTop = 0; // a dialog keeps its scroll from the last opening
  els.groups.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: "center" });
  return new Promise((resolve) => {
    settle = resolve;
  });
}

export function closePicturePicker() {
  finish(null);
}

function finish(value) {
  const done = settle;
  settle = null;
  if (els?.dialog.open) els.dialog.close();
  done?.(value);
}
