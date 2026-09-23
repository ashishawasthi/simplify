// Wait — how long a wait is, made visible (docs/learner/wait.md).
//
// Idle: five big buttons, 1 2 5 10 15 minutes, in places that never change;
// under them the "While I wait" pictures an adult picks (up to 3, each with
// ✕ and Put it back), and a small sound switch, off unless someone turns it
// on.
// Running: a big disc whose blue part shrinks as the time goes — clockwise,
// like a clock's hand — with the time left in words under it and the
// pictures under that. A tap on the disc pauses it ("Paused"), another tap
// goes on. The header ✕ stops it; Put it back restores the time that was
// left. Under reduced motion the disc doesn't move: it shows the number, big.
// End: the disc turns green with ✔ Done — one soft chime only if sound is
// on, a short buzz where the phone has one — and the minute buttons come
// back under it for another wait. Leaving the screen after that puts Done
// away; a wait that ended while the screen was elsewhere shows Done on the
// way back (for an hour).
//
// While a wait runs on screen, the screen is kept awake (Wake Lock, asked
// for again when the app comes back to the front) and the app is busy, so
// an update never reloads the disc in front of someone watching it. Screen
// readers hear the time left at most once a minute, and "Done" once.
//
// #wait?m=2 starts a 2-minute wait at once — I need's Break does
// go("wait", { m: 2 }) — but only when the address is fresh (tools.js), so
// a reload doesn't start it again. The saved state and the time maths are in
// wait-time.js.

import {
  MINUTE_CHOICES, MAX_PICS, clampMinutes, phaseOf, remainingOf, fractionOf, startWait, pauseWait,
  resumeWait, stopWait, keptForUndo, restoreWait, timeLeft, mayAnnounce, wedgePath, nextDelay,
  signalNow, cleanState, cleanPic,
} from "./wait-time.js";
import { PICTURES, pictureImg, pictureSrc } from "../pictures.js";
import { pickPicture } from "../picture-picker.js";

const SVG = "http://www.w3.org/2000/svg";
const isPicture = (id) => pictureSrc(id) !== null;
const pictureWords = (id) => PICTURES.find((p) => p.id === id)?.words ?? "";
const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

function make(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
}

function draw(tag, attrs) {
  const el = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, String(value));
  return el;
}

// ⏸ and ✔ drawn, not typed, so they look the same on every phone and iPad
function icon(kind) {
  const svg = draw("svg", { class: `wait-icon wait-icon-${kind}`, viewBox: "0 0 48 48", "aria-hidden": "true", focusable: "false" });
  if (kind === "pause") {
    svg.append(draw("rect", { x: 10, y: 8, width: 10, height: 32, rx: 2 }), draw("rect", { x: 28, y: 8, width: 10, height: 32, rx: 2 }));
  } else {
    svg.append(draw("path", { d: "M8 25 20 37 41 12" }));
  }
  return svg;
}

// ---------- sound: one soft chime, only ever started from a tap ----------
// iOS plays Web Audio only from an AudioContext made or resumed inside a
// tap, so the context is made on the tap that starts a wait (or turns the
// sound on, or pauses or goes on) — never before sound is on — and the
// chime at the end reuses it. No tap yet, no context: no sound.

let audio = null;
let ringing = []; // the chime's oscillators, until they end

function unlockAudio() {
  const Context = window.AudioContext ?? window.webkitAudioContext;
  if (!Context) return;
  try {
    audio ??= new Context();
    if (audio.state !== "running") audio.resume().catch(() => {});
    // a silent moment played inside the tap: older iPads need one before
    // they let a later sound out
    const blank = audio.createBufferSource();
    blank.buffer = audio.createBuffer(1, 1, audio.sampleRate);
    blank.connect(audio.destination);
    blank.start();
  } catch {
    // no sound on this device: the wait still works
  }
}

function chime() {
  if (!audio) return;
  try {
    if (audio.state !== "running") audio.resume().catch(() => {});
    const t = audio.currentTime + 0.05;
    // G5 and, softly, its octave: a small bell, not an alarm
    for (const [frequency, peak] of [[784, 0.16], [1568, 0.04]]) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = "sine";
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(peak, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
      osc.connect(gain);
      gain.connect(audio.destination);
      osc.onended = () => {
        ringing = ringing.filter((o) => o !== osc);
      };
      osc.start(t);
      osc.stop(t + 1.9);
      ringing.push(osc);
    }
  } catch {
    // the chime is a bonus; Done is on screen either way
  }
}

function hush() {
  for (const osc of ringing) {
    try {
      osc.stop();
    } catch {
      // already stopped
    }
  }
  ringing = [];
}

// A short buzz at the end. iPhone has no vibrate; Chrome refuses one (and
// logs it) on a page nobody has tapped yet — after a reload, say.
function buzz() {
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  try {
    navigator.vibrate?.(200);
  } catch {
    // not here
  }
}

// ---------- the tool ----------

export function mount(block, shell) {
  let state = cleanState(shell.load(), isPicture);
  let onScreen = false; // between show() and hide()
  let shown = null; // the phase on screen: idle | running | paused | done
  let timer = null;
  let lastSaid = null; // the time-left words screen readers last heard …
  let lastSaidAt = null; // … and when
  let wakeLock = null;
  let asking = false; // a wake lock request is on its way

  // ---- the disc and the time left in words (running, paused, done) ----
  const face = make("div", "wait-face");
  const disc = make("button", "wait-disc");
  disc.type = "button";
  const art = draw("svg", { class: "wait-art", viewBox: "0 0 200 200", "aria-hidden": "true", focusable: "false" });
  const plate = draw("circle", { class: "wait-plate", cx: 100, cy: 100, r: 96 });
  const wedge = draw("path", { class: "wait-wedge", d: "" });
  const rim = draw("circle", { class: "wait-rim", cx: 100, cy: 100, r: 96 });
  art.append(plate, wedge, rim);
  // over the disc's middle: the number (reduced motion), ⏸ Paused, ✔ Done.
  // Screen readers get the same from the words under it and the live line.
  const centre = make("span", "wait-centre");
  centre.setAttribute("aria-hidden", "true");
  const bigNumber = make("span", "wait-big-number");
  const bigUnit = make("span", "wait-big-unit");
  const mark = make("span", "wait-mark");
  const markWord = make("span", "wait-mark-word pic-words");
  mark.append(icon("pause"), icon("tick"), markWord);
  centre.append(bigNumber, bigUnit, mark);
  disc.append(art, centre);
  const words = make("p", "wait-words");
  face.append(disc, words);

  // ---- the minute buttons (idle, and again under Done) ----
  const pick = make("div", "wait-pick");
  pick.setAttribute("role", "group");
  pick.setAttribute("aria-label", "How long to wait");
  for (const minutes of MINUTE_CHOICES) {
    const btn = make("button", "wait-min");
    btn.type = "button";
    btn.dataset.minutes = String(minutes);
    btn.setAttribute("aria-label", minutes === 1 ? "1 minute" : `${minutes} minutes`);
    btn.append(make("span", "wait-min-number", String(minutes)), make("span", "wait-min-unit", "min"));
    btn.addEventListener("click", () => choose(minutes));
    pick.append(btn);
  }

  // ---- While I wait ----
  const strip = make("section", "wait-while");
  const stripLabel = make("h2", "wait-while-label pic-words", "While I wait");
  stripLabel.id = "wait-while-h";
  stripLabel.tabIndex = -1; // focus goes here when the last ＋ has been used
  strip.setAttribute("aria-labelledby", stripLabel.id);
  const cards = make("ul", "wait-while-list");
  // for the adult setting it up, so its words stay on a pictures-only device
  const add = make("button", "add-btn wait-while-add");
  add.type = "button";
  add.setAttribute("aria-label", "Add a picture: While I wait");
  const plus = make("span", null, "＋");
  plus.setAttribute("aria-hidden", "true");
  const addWords = make("span", "wait-while-add-words");
  add.append(plus, addWords);
  strip.append(stripLabel, cards, add);

  // ---- the sound switch (idle, and under Done) ----
  const soundRow = make("div", "wait-sound-row");
  const sound = make("button", "wait-sound");
  sound.type = "button";
  sound.setAttribute("role", "switch");
  const soundIcon = make("span", "wait-sound-icon");
  soundIcon.setAttribute("aria-hidden", "true");
  const soundState = make("span", "wait-sound-state pic-words");
  soundState.setAttribute("aria-hidden", "true"); // aria-checked says it
  sound.append(soundIcon, make("span", "wait-sound-name pic-words", "Sound"), soundState);
  soundRow.append(sound);

  // what screen readers hear without moving: the time left now and then, Done
  const live = make("p", "visually-hidden");
  live.setAttribute("role", "status");

  block.append(face, pick, strip, soundRow, live);

  disc.addEventListener("click", togglePause);
  add.addEventListener("click", addPicture);
  sound.addEventListener("click", toggleSound);

  showSound();
  renderStrip("idle");

  // ---- changes ----

  function persist() {
    shell.save(state);
  }

  // emptied first, so the same words twice are still read out; a later
  // message wins over one still waiting to be written
  let saying = 0;
  function say(text) {
    const which = ++saying;
    live.textContent = "";
    setTimeout(() => {
      if (which === saying) live.textContent = text;
    }, 100);
  }

  function sayTimeLeft(now) {
    const { words: left } = timeLeft(remainingOf(state, now));
    say(`${left} left`);
    lastSaid = left;
    lastSaidAt = now;
  }

  function choose(minutes) {
    if (state.sound) unlockAudio();
    const fromButtons = pick.contains(document.activeElement);
    begin(minutes);
    // the button pressed has gone; the disc is the next thing to press
    if (fromButtons) disc.focus({ preventScroll: true });
  }

  function begin(minutes) {
    const now = Date.now();
    state = startWait(state, minutes, now);
    persist();
    sayTimeLeft(now);
    update();
  }

  function togglePause() {
    const now = Date.now();
    const phase = phaseOf(state, now);
    if (phase === "running") {
      state = pauseWait(state, now);
      say("Paused");
    } else if (phase === "paused") {
      state = resumeWait(state, now);
      sayTimeLeft(now);
    } else {
      return; // Done: nothing to pause
    }
    if (state.sound) unlockAudio();
    persist();
    update();
  }

  function toggleSound() {
    state = { ...state, sound: !state.sound };
    persist();
    showSound();
    if (state.sound) {
      // this tap may start sound: a soft chime now, so whoever set it knows
      // what the end will sound like (and that the device isn't muted)
      unlockAudio();
      chime();
    } else {
      hush();
    }
  }

  async function addPicture() {
    const picked = cleanPic(await pickPicture({ title: "While I wait" }), isPicture);
    if (!picked || !onScreen || state.waitPics.length >= MAX_PICS) return;
    state = { ...state, waitPics: [...state.waitPics, picked] };
    persist();
    renderStrip(shown);
    // the ＋ has gone with the last place filled: focus stays in the strip
    if (add.hidden && document.activeElement === document.body) stripLabel.focus({ preventScroll: true });
  }

  function removePicture(index) {
    const gone = state.waitPics[index];
    if (!gone) return;
    state = { ...state, waitPics: state.waitPics.filter((_, i) => i !== index) };
    persist();
    renderStrip(shown);
    add.focus({ preventScroll: true }); // the ✕ tapped has gone; ＋ is where the next change is
    shell.showToast(`${nameOf(gone)}: removed`, () => {
      const pics = [...state.waitPics];
      pics.splice(Math.min(index, pics.length), 0, gone);
      state = { ...state, waitPics: pics.slice(0, MAX_PICS) };
      persist();
      renderStrip(shown);
    });
  }

  // ---- the screen ----

  // Everything on screen for this moment; while a wait runs on screen it
  // calls itself again as often as the disc needs (nextDelay).
  function update() {
    clearTimeout(timer);
    timer = null;
    if (!onScreen) return;
    const now = Date.now();
    const phase = phaseOf(state, now);
    // a Done older than an hour: the buttons, for good
    if (phase === "idle" && state.endAt != null) {
      state = stopWait(state);
      persist();
    }
    if (phase === "done" && shown === "running") ended(now);
    if (phase !== shown) {
      showPhase(phase);
      shown = phase;
      sync(phase);
    }
    if (phase === "running" || phase === "paused") showTime(now, phase);
    if (phase === "running" && !document.hidden) {
      timer = setTimeout(update, nextDelay(remainingOf(state, now), state.total, { still: still() }));
    }
  }

  // It ended in front of someone: the chime (if sound is on) and the buzz —
  // only right at the end, not when the screen only catches up later.
  function ended(now) {
    if (!signalNow(state, now) || document.hidden) return;
    if (state.sound) chime();
    buzz();
  }

  function showPhase(phase) {
    const waiting = phase === "running" || phase === "paused";
    face.hidden = phase === "idle";
    disc.classList.toggle("is-running", phase === "running");
    disc.classList.toggle("is-paused", phase === "paused");
    disc.classList.toggle("is-done", phase === "done");
    if (phase === "done") {
      disc.setAttribute("aria-label", "Done");
      disc.setAttribute("aria-disabled", "true");
      wedge.setAttribute("d", "");
      say("Done");
    } else {
      disc.setAttribute("aria-label", phase === "paused" ? "Continue the wait" : "Pause the wait");
      disc.removeAttribute("aria-disabled");
    }
    markWord.textContent = phase === "paused" ? "Paused" : phase === "done" ? "Done" : "";
    words.hidden = !waiting;
    pick.hidden = waiting;
    soundRow.hidden = waiting;
    renderStrip(phase);
  }

  function showTime(now, phase) {
    wedge.setAttribute("d", wedgePath(fractionOf(state, now)));
    const left = timeLeft(remainingOf(state, now));
    if (words.textContent === left.words) return;
    words.textContent = left.words;
    bigNumber.textContent = String(left.number);
    bigUnit.textContent = left.unit;
    if (phase === "running" && left.words !== lastSaid && mayAnnounce(lastSaidAt, now)) {
      say(`${left.words} left`);
      lastSaid = left.words;
      lastSaidAt = now;
    }
  }

  // What goes with a phase: busy and awake only while a wait runs on screen,
  // the header ✕ while there is a wait to stop.
  function sync(phase) {
    const running = phase === "running";
    shell.setBusy(onScreen && running);
    shell.setClearAll(running || phase === "paused");
    if (onScreen && running && !document.hidden) keepAwake();
    else letSleep();
  }

  function showSound() {
    sound.setAttribute("aria-checked", String(state.sound));
    soundIcon.textContent = state.sound ? "🔔" : "🔕";
    soundState.textContent = state.sound ? "on" : "off";
  }

  // Running: the pictures to look at, nothing to change. Idle and Done: one
  // row each with its ✕, and ＋ while there is room — the words "While I
  // wait" on ＋ alone while there are none.
  function renderStrip(phase) {
    const editing = phase === "idle" || phase === "done";
    const pics = state.waitPics;
    strip.classList.toggle("is-editing", editing);
    strip.hidden = !editing && pics.length === 0;
    stripLabel.hidden = pics.length === 0;
    cards.hidden = pics.length === 0;
    cards.replaceChildren(...pics.map((p, i) => card(p, i, editing)));
    add.hidden = !editing || pics.length >= MAX_PICS;
    addWords.textContent = pics.length ? "Add" : "While I wait";
  }

  function card(pic, index, editing) {
    const li = make("li", "wait-pic");
    const name = nameOf(pic);
    // a picture whose words were cleared keeps its own words for screen readers
    const img = pic.picture ? pictureImg(pic.picture, { alt: pic.words ? "" : name }) : null;
    if (img) li.append(img);
    // words a picture already says step aside on a pictures-only device
    if (pic.words) li.append(make("span", img ? "wait-pic-words pic-words" : "wait-pic-words", pic.words));
    if (editing) {
      const remove = make("button", "remove-btn wait-pic-remove");
      remove.type = "button";
      remove.setAttribute("aria-label", `Remove: ${name}`);
      const x = make("span", null, "✕");
      x.setAttribute("aria-hidden", "true");
      remove.append(x);
      remove.addEventListener("click", () => removePicture(index));
      li.append(remove);
    }
    return li;
  }

  // ---- keeping the screen awake ----

  async function keepAwake() {
    if (asking || (wakeLock && !wakeLock.released) || !navigator.wakeLock) return;
    asking = true;
    try {
      const lock = await navigator.wakeLock.request("screen");
      // still wanted now it has come? (a pause or a trip away may have been quicker)
      if (onScreen && !document.hidden && phaseOf(state, Date.now()) === "running") wakeLock = lock;
      else lock.release().catch(() => {});
    } catch {
      // not allowed here (battery saver, an older browser): the wait still runs
    } finally {
      asking = false;
    }
  }

  function letSleep() {
    const lock = wakeLock;
    wakeLock = null;
    lock?.release().catch(() => {});
  }

  // The browser lets the screen sleep whenever the app goes to the back, and
  // throttles its timers. Coming to the front, catch up — the time left, or
  // Done — and ask for the wake lock again.
  const toFront = () => {
    if (!onScreen) return;
    if (document.hidden) {
      clearTimeout(timer);
      timer = null;
      return;
    }
    update();
    sync(phaseOf(state, Date.now()));
  };
  document.addEventListener("visibilitychange", toFront);
  addEventListener("pageshow", toFront);

  return {
    show(params, { fresh }) {
      onScreen = true;
      shown = null; // draw it all afresh
      // screen readers hear the time left on arrival, then once a minute
      words.textContent = "";
      lastSaid = null;
      lastSaidAt = null;
      const minutes = fresh ? clampMinutes(params.get("m")) : null;
      if (minutes == null) {
        update();
        return;
      }
      // Asked for by a tap on the screen before (I need's Break): that tap
      // may still start the chime's sound, where the browser says so.
      if (state.sound && navigator.userActivation?.isActive) unlockAudio();
      begin(minutes);
    },

    hide() {
      onScreen = false;
      clearTimeout(timer);
      timer = null;
      shown = null;
      shell.setBusy(false);
      letSleep();
      hush();
      // Done has been seen: next time, the buttons (a running wait carries on)
      if (phaseOf(state, Date.now()) === "done") {
        state = stopWait(state);
        persist();
      }
    },

    clearAll() {
      const now = Date.now();
      const phase = phaseOf(state, now);
      if (phase !== "running" && phase !== "paused") return;
      const kept = keptForUndo(state, now);
      state = stopWait(state);
      persist();
      update();
      shell.showToast("Wait stopped", () => {
        state = restoreWait(state, kept, Date.now());
        persist();
        lastSaid = null;
        lastSaidAt = null;
        update();
      });
    },

    hasAnything() {
      const phase = phaseOf(state, Date.now());
      return phase === "running" || phase === "paused";
    },
  };
}

// what a picture is called: its words, or the picture's own
function nameOf(pic) {
  return pic.words || pictureWords(pic.picture) || "Picture";
}
