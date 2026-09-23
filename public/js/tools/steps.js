// Steps — a routine one step at a time: wash hands, return the tray at a
// hawker centre, pay by card (task analysis, NCAEP 2020; the decks and how to
// move through one are in steps-decks.js). The contract it follows is in
// ../tools.js.
//
// Two screens, each with its own address, so Back (Android's, the browser's)
// goes from a deck to the chooser, and a teacher can share one deck:
//   #steps             the chooser: a big button per deck, picture and name
//   #steps?deck=<id>   one step fills the screen — its picture, its words,
//                      progress dots, a big Next ▶ and a smaller ◀ Back; after
//                      the last step, All done: a green ✔, the deck's end line
//                      and Choose another
// Nothing moves from step to step: the picture, the words and the buttons
// keep their places (a step's words may take one line or three), and the
// Pay by card deck's "Can I buy?" button sits in the room of that step's
// words (one line), not in the way of the buttons below.
//
// Where the student is in each deck is saved (shell.save: { at: { <deck id>:
// the step's index in the whole deck }, touched: { <deck id>: when it was
// last opened or moved, ms } }), so a reload, a trip to Can I buy? and back,
// or 🏠 and back into the deck finds the same step. A deck left on All done
// starts again the next time it is opened, and so does a deck left alone for
// 30 minutes (FORGET_AFTER_MS): on a shared iPad the next student starts at
// step 1, not in the middle of someone else's routine — also when the iPad
// is woken with the deck still on screen. The header ✕ starts the deck on
// screen again, with Put it back.
//
// The adult's set-up page has "Fewer steps" per deck (setup() below): only
// the deck's core steps, as the student learns the small ones. Saved as this
// tool's settings, { fewer: [deck ids] }.
//
// Pictures only: the words — the step's, the deck names, the buttons' — are
// pic-words; the pictures, ◀ ▶ and the dots stay, and the picture takes the
// words' room. Screen readers hear each new step ("Step 3 of 7: Put on soap")
// from a status line; nothing is spoken aloud.

import { pictureImg, pictureSrc, menuIconSrc } from "../pictures.js";
import {
  DECKS, DONE_PICTURE, deckById, where, stepAfter, stepBefore, cleanProgress, cleanFewer, leftOut,
  cleanTouched, resumeAt,
} from "./steps-decks.js";

// A second tap on Next this soon after the first is the same tap (a double
// tap, a tremor), not "skip a step".
const NEXT_REPEAT_MS = 350;
// Choose another arrives where Next was: a tap this soon after All done came
// up was meant for Next, not for leaving the deck.
const ARRIVAL_MS = 800;

// ▶ and ◀ drawn as text, not as a coloured emoji button (U+FE0E)
const NEXT_GLYPH = "\u25B6\uFE0E";
const BACK_GLYPH = "\u25C0\uFE0E";

function make(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
}

function glyph(text) {
  const span = make("span", "steps-glyph", text);
  span.setAttribute("aria-hidden", "true");
  return span;
}

const fewerOn = (settings, deck) => cleanFewer(settings?.fewer).includes(deck.id);

export function mount(block, shell) {
  const saved = shell.load();
  const at = cleanProgress(saved?.at); // { <deck id>: at }
  const touched = cleanTouched(saved?.touched); // { <deck id>: ms }
  // a deck was opened or moved: saved, with the time (the 30-minute start again)
  const keep = (d) => {
    touched[d.id] = Date.now();
    shell.save({ at, touched });
  };
  let deck = null; // the deck on screen, or null for the chooser

  // "Choose another" returns to the chooser the way Back does when the
  // chooser is the step right behind this deck in the history; otherwise
  // (a shared link to a deck, after a reload) it opens the chooser afresh.
  let openedFromChooser = null; // the deck the chooser has just asked go() for
  let chooserBehind = false;
  let lastShown; // "chooser", or the id of the last deck on screen

  let lastNextAt = -Infinity;
  let doneSince = -Infinity; // when Next brought up All done

  // ---- the chooser ----
  const chooser = make("ul", "steps-chooser");
  for (const d of DECKS) {
    const btn = make("button", "steps-choose");
    btn.type = "button";
    btn.dataset.deck = d.id;
    const pic = make("span", "steps-choose-picture");
    pic.setAttribute("aria-hidden", "true");
    const img = pictureImg(d.picture);
    if (img) pic.append(img);
    btn.append(pic, make("span", "steps-choose-name pic-words", d.name));
    btn.addEventListener("click", () => {
      openedFromChooser = d.id;
      shell.go("steps", { deck: d.id });
    });
    const li = make("li");
    li.append(btn);
    chooser.append(li);
  }

  // ---- a deck ----
  const view = make("section", "steps-deck");
  view.setAttribute("aria-label", "Steps");

  // "Step 2 of 7" for screen readers; the dots for everyone else
  const progress = make("div", "steps-progress");
  const progressWords = make("span", "visually-hidden");
  const dots = make("span", "steps-dots");
  dots.setAttribute("aria-hidden", "true");
  progress.append(progressWords, dots);

  const pictureBox = make("div", "steps-picture");
  const picture = pictureImg(DECKS[0].steps[0].picture); // its src follows the step
  picture.decoding = "sync"; // the new step's picture with its words, not a moment after
  pictureBox.append(picture);

  // the words, and under them on one step a button to another tool (Pay by
  // card: Can I buy?) — that step's words are one line, so the button fits
  // in the words' room and nothing below it moves
  const wordsBox = make("div", "steps-words-box");
  const words = make("p", "steps-words pic-words");
  const openBtn = make("button", "steps-open");
  openBtn.type = "button";
  const openIcon = glyph("");
  const openWords = make("span", "pic-words");
  openBtn.append(openIcon, openWords);
  wordsBox.append(words, openBtn);

  const nav = make("div", "steps-nav");
  const backBtn = make("button", "steps-back");
  backBtn.type = "button";
  backBtn.append(glyph(BACK_GLYPH), make("span", "pic-words", "Back"));
  const nextBtn = make("button", "steps-next");
  nextBtn.type = "button";
  nextBtn.append(make("span", "pic-words", "Next"), glyph(NEXT_GLYPH));
  const anotherBtn = make("button", "steps-another");
  anotherBtn.type = "button";
  const anotherIcon = make("img");
  anotherIcon.alt = "";
  anotherIcon.width = 128; // the file's own square; CSS sets the size
  anotherIcon.height = 128;
  anotherIcon.src = menuIconSrc("steps");
  anotherBtn.append(anotherIcon, make("span", "pic-words", "Choose another"));
  nav.append(backBtn, nextBtn, anotherBtn);

  // what screen readers hear when the step changes
  const status = make("p", "visually-hidden");
  status.setAttribute("role", "status");

  view.append(progress, pictureBox, wordsBox, nav, status);
  block.append(chooser, view);

  // ---- showing ----
  const fewer = (d) => fewerOn(shell.settings, d);
  const place = () => where(deck, fewer(deck), at[deck.id]);

  function render() {
    chooser.hidden = deck !== null;
    view.hidden = deck === null;
    if (!deck) return;

    const now = place();
    const { count, done, step } = now;
    view.setAttribute("aria-label", deck.name);
    view.classList.toggle("is-done", done);
    view.classList.toggle("has-extra", !!step?.open);

    dots.replaceChildren(...now.shown.map((_, i) => {
      const dot = make("span", "steps-dot");
      if (i < now.place) dot.classList.add("is-done");
      else if (i === now.place) dot.classList.add("is-now");
      return dot;
    }));
    progressWords.textContent = done
      ? `${deck.name}: all ${count} steps done`
      : `${deck.name}: step ${now.place + 1} of ${count}`;

    picture.src = pictureSrc(done ? DONE_PICTURE : step.picture);
    // a new line after a question or a sentence, so each idea has its own:
    // "Halal tray?" / "Use the halal side", "All done." / "You paid."
    const text = done ? deck.end : step.words;
    words.replaceChildren(...text.split(/(?<=[.?]) /).flatMap((part, i) => (i ? [make("br"), part] : [part])));

    openBtn.hidden = !step?.open;
    if (step?.open) {
      openIcon.textContent = step.open.icon;
      openWords.textContent = step.open.words;
    }

    // Back keeps its place on the first step, with nothing to go back to
    backBtn.classList.toggle("is-away", !done && now.place === 0);
    nextBtn.hidden = done;
    anotherBtn.hidden = !done;
  }

  // the pictures of a deck, fetched before they are needed, so each step's
  // picture is there the moment Next is tapped
  const preloaded = new Set();
  function preload(d) {
    if (preloaded.has(d.id)) return;
    preloaded.add(d.id);
    for (const id of [...d.steps.map((s) => s.picture), DONE_PICTURE]) {
      const img = new Image();
      img.src = pictureSrc(id);
    }
  }

  // Emptied first, so the same words twice in a row (Back, then Next) are
  // still read out.
  let said = 0;
  function announce(text) {
    status.textContent = "";
    const which = ++said;
    setTimeout(() => {
      if (which === said && deck) status.textContent = text;
    }, 100);
  }

  const usable = (el) => el.isConnected && el.getClientRects().length > 0 &&
    getComputedStyle(el).visibility !== "hidden";

  // Next or Back: the new step, saved, read out; the ✕ follows (nothing to
  // start again on the first step)
  function move(to) {
    if (to === at[deck.id]) return;
    const focused = block.contains(document.activeElement) ? document.activeElement : null;
    at[deck.id] = to;
    keep(deck);
    render();
    shell.setClearAll(hasAnything());
    const now = place();
    if (now.done) doneSince = performance.now();
    announce(now.done ? deck.end : `Step ${now.place + 1} of ${now.count}: ${now.step.words}`);
    // the button that was tapped may have just gone (Next on the last step,
    // Back on the second): focus goes to the one that took its place
    if (focused && !usable(focused)) (now.done ? anotherBtn : nextBtn).focus({ preventScroll: true });
  }

  nextBtn.addEventListener("click", () => {
    const now = performance.now();
    if (now - lastNextAt < NEXT_REPEAT_MS) return;
    lastNextAt = now;
    move(stepAfter(deck, fewer(deck), at[deck.id]));
  });
  backBtn.addEventListener("click", () => move(stepBefore(deck, fewer(deck), at[deck.id])));
  openBtn.addEventListener("click", () => {
    const open = place().step?.open;
    if (open) shell.go(open.id);
  });
  anotherBtn.addEventListener("click", () => {
    if (performance.now() - doneSince < ARRIVAL_MS) return;
    if (chooserBehind) shell.back();
    else shell.go("steps");
  });

  function hasAnything() {
    return deck !== null && place().place > 0;
  }

  // the header ✕: this deck from its first step again, and Put it back
  function clearAll() {
    if (!deck) return;
    const d = deck;
    const before = at[d.id];
    at[d.id] = 0;
    keep(d);
    render();
    shell.showToast("Back to step 1", () => {
      at[d.id] = before;
      keep(d);
      if (deck === d) {
        render();
        shell.setClearAll(hasAnything());
      }
    });
  }

  function show(params, { fresh }) {
    const d = deckById(params.get("deck")); // none, or not a deck: the chooser
    if (d) {
      // left alone for 30 minutes (a reload, Back, a new visit): step 1
      at[d.id] = resumeAt(d, at[d.id], touched[d.id], Date.now());
      if (fresh) {
        chooserBehind = openedFromChooser === d.id;
        // a deck finished earlier starts again when it is opened anew
        if (where(d, fewer(d), at[d.id]).done) at[d.id] = 0;
      } else if (lastShown !== d.id) {
        chooserBehind = false; // back here some other way: not sure what is behind
      }
      keep(d);
      preload(d);
    } else {
      chooserBehind = false;
    }
    openedFromChooser = null;
    lastShown = d ? d.id : "chooser";
    deck = d;
    lastNextAt = -Infinity;
    doneSince = -Infinity;
    status.textContent = "";
    render();
  }

  // an adult's "Fewer steps" changed (the set-up page, its Put it back, or
  // another tab): the same place in the routine, with the steps now shown
  shell.onDeviceChange(() => {
    if (!deck) return;
    render();
    shell.setClearAll(hasAnything());
  });

  // the app back in front (an iPad woken up) with a deck on screen that was
  // left alone for 30 minutes: step 1, as if it were opened now
  document.addEventListener("visibilitychange", () => {
    if (document.hidden || !deck || block.hidden) return;
    const from = resumeAt(deck, at[deck.id], touched[deck.id], Date.now());
    if (from === at[deck.id]) return;
    at[deck.id] = from;
    keep(deck);
    lastNextAt = -Infinity;
    doneSince = -Infinity;
    status.textContent = "";
    render();
    shell.setClearAll(hasAnything());
  });

  render();
  return { show, clearAll, hasAnything };
}

// ---- the set-up page's section (the contract is in ../tools.js) ----
// Built inside the set-up page, so it borrows that page's switch rows and
// notes (css/tools/setup.css); css/tools/steps.css styles the one part of its
// own, the line that says which steps a switch leaves out. Each change is
// saved at once and offered back in the toast.

export function setup(section, shell) {
  const root = make("div", "steps-setup");
  root.append(make("p", "setup-note",
    "Fewer steps: only the main steps of a routine, for a student who already does the small ones."));

  const list = make("ul", "setup-list");
  const switches = DECKS.map((d) => {
    const sw = make("button", "setup-switch");
    sw.type = "button";
    sw.setAttribute("role", "switch");
    sw.dataset.deck = d.id;
    sw.setAttribute("aria-label", `${d.name}: fewer steps`);
    const icon = make("span", "tool-icon");
    icon.setAttribute("aria-hidden", "true");
    const img = pictureImg(d.picture);
    if (img) icon.append(img);
    const name = make("span", "setup-switch-name", d.name);
    const leaves = make("span", "steps-leaves", `Leaves out: ${leftOut(d).join(" · ")}`);
    leaves.id = `steps-leaves-${d.id}`;
    sw.setAttribute("aria-describedby", leaves.id);
    name.append(leaves);
    const state = make("span", "switch-state");
    state.setAttribute("aria-hidden", "true"); // aria-checked says it
    state.append(make("span", "switch-knob"), make("span", "switch-word"));
    sw.append(icon, name, state);
    sw.addEventListener("click", () => {
      const before = shell.settings;
      const fewer = new Set(cleanFewer(before.fewer));
      const on = !fewer.has(d.id);
      if (on) fewer.add(d.id);
      else fewer.delete(d.id);
      shell.saveSettings({ ...before, fewer: DECKS.map((x) => x.id).filter((id) => fewer.has(id)) });
      shell.showToast(`${d.name}: ${on ? "fewer steps" : "all steps"}`, () => shell.saveSettings(before));
    });
    const li = make("li");
    li.append(sw);
    list.append(li);
    return { deck: d, sw };
  });
  root.append(list);
  section.append(root);

  // the switches follow the settings, including a Put it back
  function render() {
    for (const { deck: d, sw } of switches) {
      const on = fewerOn(shell.settings, d);
      sw.setAttribute("aria-checked", String(on));
      sw.querySelector(".switch-knob").textContent = on ? "✔" : "";
      sw.querySelector(".switch-word").textContent = on ? "On" : "Off";
    }
  }
  render();
  shell.onDeviceChange(render);
  return { show: render };
}
