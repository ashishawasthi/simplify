// Time sums (#time-sums): two questions about the clock, answered in the
// answer panel like the money tools (docs/learner/time-sums.md):
//   How long until?    from a time (now, unless changed) until another time
//                      → "1 hour 20 minutes"
//   What time after?   from a time, add an amount → "4:10 pm"
// Two big buttons at the top choose the question; they never move. Under
// them the From box (the same place for both questions): the time now,
// kept up to date, until someone changes it — then a Now button puts it back.
// Under that the second box: Until (a time), or Add (hours and minutes, with
// quick amounts). Nothing is ever refused: a box that can't be read gives no
// answer yet. The arithmetic is in time-sums-calc.js; the contract this
// follows is in ../tools.js.
//
// Kept on the device: the question, the Until time and the amount to add. The
// From time is kept only while this visit lasts (a reload keeps it): opened
// again from the menu, it is the time now.

import {
  DAY, MAX_ADD, QUICK, afterAnswer, inputValue, minutesOf, parseTime, quickText, untilAnswer, wholeNumber,
} from "./time-sums-calc.js";
import { pictureImg } from "../pictures.js";

const TICK = 15_000; // how often "now" is looked at again

function make(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
}

const MODES = [
  { id: "until", picture: "more-time", words: "How long until?" },
  { id: "after", picture: "clock", words: "What time after?" },
];

function clean(saved) {
  const s = saved && typeof saved === "object" ? saved : {};
  const time = (v) => (Number.isInteger(v) && v >= 0 && v < DAY ? v : null);
  return {
    mode: s.mode === "after" ? "after" : "until",
    start: time(s.start), // null: now
    end: time(s.end),
    add: Number.isInteger(s.add) && s.add > 0 ? Math.min(s.add, MAX_ADD) : 0,
  };
}

export function mount(block, shell) {
  let state = clean(shell.load());
  let timer = null;

  // ---- the two questions ----
  const modes = make("div", "ts-modes");
  modes.setAttribute("role", "group");
  modes.setAttribute("aria-label", "Question");
  const modeBtns = MODES.map((m) => {
    const btn = make("button", "ts-mode");
    btn.type = "button";
    btn.dataset.mode = m.id;
    const img = pictureImg(m.picture, { alt: "" });
    if (img) btn.append(img);
    btn.append(make("span", "ts-mode-words pic-words", m.words));
    btn.addEventListener("click", () => {
      if (state.mode === m.id) return;
      state.mode = m.id;
      changed();
    });
    modes.append(btn);
    return btn;
  });

  // ---- a labelled time box ----
  function timeZone(id, title) {
    const zone = make("section", "zone ts-zone");
    const head = make("div", "zone-head");
    const h = make("h2", null, title);
    h.id = `ts-${id}-h`;
    zone.setAttribute("aria-labelledby", h.id);
    head.append(h);
    const input = make("input", "ts-time");
    input.type = "time";
    input.id = `ts-${id}`;
    input.setAttribute("aria-labelledby", h.id);
    zone.append(head, input);
    return { zone, head, input };
  }

  // From: the time now, until someone changes it
  const from = timeZone("from", "From");
  const nowBtn = make("button", "icon-btn ts-now");
  nowBtn.type = "button";
  nowBtn.setAttribute("aria-label", "From now");
  nowBtn.title = "From now";
  nowBtn.append(make("span", "ts-now-words", "Now"));
  nowBtn.addEventListener("click", () => {
    state.start = null;
    changed();
  });
  from.head.append(nowBtn);
  const nowNote = make("p", "ts-note pic-words", "Now");
  from.zone.append(nowNote);
  from.input.addEventListener("input", () => {
    // an empty box (cleared on the device's picker) goes back to now
    state.start = parseTime(from.input.value);
    changed({ typing: true });
  });

  // Until: a time
  const until = timeZone("until", "Until");
  until.input.addEventListener("input", () => {
    state.end = parseTime(until.input.value);
    changed({ typing: true });
  });

  // Add: hours and minutes, and the quick amounts
  const addZone = make("section", "zone ts-zone");
  const addH = make("h2", null, "Add");
  addH.id = "ts-add-h";
  addZone.setAttribute("aria-labelledby", addH.id);
  const boxes = make("div", "ts-amount");
  function numberBox(label, max) {
    const wrap = make("label", "ts-number");
    const input = make("input");
    input.type = "text";
    input.inputMode = "numeric";
    input.autocomplete = "off";
    input.enterKeyHint = "done";
    input.placeholder = "0";
    input.maxLength = 4;
    input.setAttribute("aria-label", label);
    wrap.append(input, make("span", "ts-unit", label));
    input.addEventListener("input", () => {
      const hours = Math.min(23, wholeNumber(hoursBox.value));
      const mins = Math.min(max, wholeNumber(minsBox.value));
      state.add = Math.min(MAX_ADD, hours * 60 + mins);
      changed({ typing: true });
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") input.blur();
    });
    boxes.append(wrap);
    return input;
  }
  const hoursBox = numberBox("hours", 23);
  const minsBox = numberBox("minutes", MAX_ADD);
  const quick = make("div", "ts-quick");
  quick.setAttribute("role", "group");
  quick.setAttribute("aria-label", "Quick amounts");
  for (const m of QUICK) {
    const btn = make("button", "ts-quick-btn", quickText(m));
    btn.type = "button";
    btn.addEventListener("click", () => {
      state.add = m;
      changed();
    });
    quick.append(btn);
  }
  addZone.append(addH, boxes, quick);

  block.append(modes, from.zone, until.zone, addZone);

  // ---- drawing it ----
  const startNow = () => state.start ?? minutesOf(new Date());

  function render({ typing = false } = {}) {
    for (const btn of modeBtns) btn.setAttribute("aria-pressed", String(btn.dataset.mode === state.mode));
    until.zone.hidden = state.mode !== "until";
    addZone.hidden = state.mode !== "after";
    const live = state.start == null;
    // don't rewrite a box under the finger that is typing in it
    if (document.activeElement !== from.input || !typing) from.input.value = inputValue(startNow());
    nowBtn.hidden = live; // only when there is something to put back
    nowNote.hidden = !live;
    if (document.activeElement !== until.input) until.input.value = state.end == null ? "" : inputValue(state.end);
    if (!typing || ![hoursBox, minsBox].includes(document.activeElement)) {
      hoursBox.value = state.add >= 60 ? String(Math.floor(state.add / 60)) : "";
      minsBox.value = state.add % 60 ? String(state.add % 60) : "";
    }
    const answer = state.mode === "until" ? untilAnswer(startNow(), state.end) : afterAnswer(startNow(), state.add || null);
    if (answer && (state.mode === "until" || state.add > 0)) {
      shell.result.render({ ...answer, icon: pictureImg(state.mode === "until" ? "more-time" : "clock", { alt: "" }) ?? "🕒" });
    } else {
      shell.result.render({ tone: "neutral" });
    }
    shell.setClearAll(hasAnything());
  }

  function changed(opts) {
    render(opts);
    shell.save(state);
  }

  function hasAnything() {
    return state.start != null || state.end != null || state.add > 0;
  }

  // "now" moves on while the screen is up
  function tick() {
    clearInterval(timer);
    timer = setInterval(() => {
      if (state.start == null) render({ typing: true });
    }, TICK);
  }

  return {
    show(params, { fresh }) {
      if (fresh) state.start = null; // opened again: from now
      render();
      tick();
    },
    hide() {
      clearInterval(timer);
      timer = null;
    },
    clearAll() {
      const before = { ...state };
      state = { ...state, start: null, end: null, add: 0 };
      changed();
      shell.showToast("Everything cleared", () => {
        state = { ...before };
        changed();
      });
    },
    hasAnything,
  };
}
