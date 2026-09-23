// Entry point: the shell around the tools — the menu, the header's 🏠 and ✕,
// the answer panel, the undo toast and the notes-and-coins windows — and the
// routing that puts one screen at a time on show. Which tools there are, and
// how one plugs in, is in tools.js; the six money tools share money-tool.js.

import { initResult, renderResult, setResultVisible } from "./result.js";
import { initPicker } from "./note-picker.js";
import { initSpeak } from "./speak.js";
import { initShowMoney, openShowMoney } from "./show-money.js";
import { DEFAULT_CURRENCY, moneySvg } from "./currency-data.js";
import { load, save, flush } from "./storage.js";
import { initUpdates, setBusy } from "./update.js";
import { initToast, showToast, hideToast } from "./toast.js";
import { getDevice, onDeviceChange, toolSettings } from "./device.js";
import { stop as stopSpeaking } from "./say-aloud.js";
import { closeCard } from "./show-card.js";
import { closePicturePicker } from "./picture-picker.js";
import { menuIconSrc } from "./pictures.js";
import { TOOLS } from "./tools.js";
import { mountSetup } from "./setup.js";

const $ = (id) => document.getElementById(id);
const CLEAR_ALL_LABEL = "Start over: clear everything in this tool";

const header = $("app-header");
const title = $("screen-title");
const menu = $("menu");
const toMenu = $("to-menu");
const clearAllWrap = $("clear-all-wrap");
const guideLink = $("guide-link");
const guideLinkText = $("guide-link-text");

// ---------- shared parts ----------

initResult(
  {
    panel: $("result"),
    icon: $("result-icon"),
    headline: $("result-headline"),
    subline: $("result-subline"),
    float: $("result-float"),
    floatIcon: $("result-float-icon"),
    floatAmount: $("result-float-amount"),
    actionWrap: $("result-action-wrap"),
    action: $("result-action"),
  },
  { onShowMe: openShowMoney },
);

initPicker({
  dialog: $("picker"),
  total: $("picker-total"),
  trayList: $("tray-list"),
  trayEmpty: $("tray-empty"),
  undo: $("picker-undo"),
  clear: $("picker-clear"),
  done: $("picker-done"),
  noteGrid: $("note-grid"),
  coinGrid: $("coin-grid"),
});

initSpeak({
  dialog: $("speak"),
  input: $("speak-input"),
  heard: $("speak-heard"),
  done: $("speak-done"),
  close: $("speak-close"),
});

initShowMoney({
  dialog: $("show-money"),
  label: $("show-money-label"),
  title: $("show-money-title"),
  words: $("show-money-words"),
  note: $("show-money-note"),
  pieces: $("show-money-pieces"),
  done: $("show-money-done"),
});

// after an undo with nowhere better to go, focus goes to the screen's name
initToast({ toast: $("toast"), text: $("toast-text"), undo: $("toast-undo"), status: $("toast-status"), home: title });

// menu pictures are the app's own note and coin drawings
for (const slot of document.querySelectorAll("[data-picture]")) {
  slot.innerHTML = slot.dataset.picture
    .split(" ")
    .map((cents) => moneySvg(DEFAULT_CURRENCY, Number(cents)))
    .join("");
}
// …and, for the other tools and their groups, pictures from the app's own
// set, drawn the same on every phone and iPad
for (const slot of document.querySelectorAll("[data-menu-icon]")) {
  const src = menuIconSrc(slot.dataset.menuIcon);
  if (!src) {
    console.error(`pictures.js has no menu icon for ${slot.dataset.menuIcon}`);
    continue;
  }
  const img = document.createElement("img");
  img.alt = "";
  img.width = 128; // the file's own square; CSS sets the size
  img.height = 128;
  img.draggable = false;
  img.src = src;
  slot.replaceChildren(img);
}

// On an iPad or iPhone home screen the app has no tabs: a new-tab link
// leaves it for Safari, whose storage is not the app's, so a device set up
// from there (the guide leads to #setup) would not be this app. There the
// guide opens in the app's own window, and its links lead back. Elsewhere it
// keeps a tab of its own beside the app — an installed Android app opens it
// over the app in Chrome, which shares the app's storage.
if (navigator.standalone === true) guideLink.removeAttribute("target");

// ---------- the screens: every tool, and the set-up page ----------

// Not on the menu: the user guide links to it (#setup), and a class's QR
// code opens it (#join=<CODE>).
const SETUP = { id: "setup", title: "Set up this device", mount: mountSetup, guide: "/guide/set-up" };

const screens = new Map(); // id → { entry, block, tool, shell }
const broken = new Set(); // tools that could not start: off the menu, not the others' problem
const screenListeners = new Set(); // shell.onScreenChange
let active = null; // id of the screen on show; null while the menu shows

// Can I buy? keeps the key it had when it was the whole app, so numbers
// saved before the menu existed are still there after the update.
const storageKey = (id) => (id === "can-i-buy" ? "afford-it-v1" : `simplify-${id}-v1`);

// What a tool gets to work with — the contract is spelled out in tools.js.
function makeShell(id) {
  const key = storageKey(id);
  const onScreen = () => active === id;
  let lastAnswer = null;
  return Object.freeze({
    id,
    load: () => load(key),
    save: (state) => save(key, state),
    showToast: (text, undo) => {
      if (onScreen()) showToast(text, undo);
    },
    setClearAll: (visible) => {
      if (onScreen()) clearAllWrap.hidden = !(visible && screens.get(id)?.tool.clearAll);
    },
    result: Object.freeze({
      render(answer) {
        lastAnswer = answer;
        if (onScreen()) renderResult(answer);
      },
      setVisible(visible) {
        if (!onScreen()) return;
        if (visible && lastAnswer) renderResult(lastAnswer);
        else setResultVisible(false);
      },
    }),
    get device() {
      return getDevice();
    },
    get settings() {
      return toolSettings(id);
    },
    onDeviceChange,
    onScreenChange: (fn) => {
      screenListeners.add(fn);
      return () => screenListeners.delete(fn);
    },
    setBusy: (busy) => setBusy(id, busy),
    go: (to, params) => {
      if (onScreen()) go(to, params);
    },
    back: () => {
      if (onScreen()) back();
    },
  });
}

for (const entry of [...TOOLS, SETUP]) {
  const block = $(`tool-${entry.id}`);
  if (!block) {
    broken.add(entry.id);
    console.error(`index.html has no #tool-${entry.id}`);
    continue;
  }
  const shell = makeShell(entry.id);
  try {
    const tool = entry.mount(block, shell);
    if (typeof tool?.show !== "function") throw new Error("mount() must return { show(params) … } (see tools.js)");
    screens.set(entry.id, { entry, block, tool, shell });
  } catch (err) {
    broken.add(entry.id);
    console.error(`${entry.title} could not start`, err);
  }
}

// the menu in index.html and TOOLS must name the same tools
for (const li of menu.querySelectorAll("li[data-tool]")) {
  if (!TOOLS.some((t) => t.id === li.dataset.tool)) console.error(`the menu has ${li.dataset.tool}, tools.js doesn't`);
}
for (const { id } of TOOLS) {
  if (!menu.querySelector(`li[data-tool="${id}"]`)) console.error(`tools.js has ${id}, the menu doesn't`);
}

// ---------- device settings: the menu, pictures only ----------

function applyDevice(device) {
  document.documentElement.toggleAttribute("data-pictures-only", device.picturesOnly);
  for (const li of menu.querySelectorAll("li[data-tool]")) {
    const id = li.dataset.tool;
    li.hidden = device.hidden.includes(id) || broken.has(id) ||
      // My class only once this device follows a class
      (id === "my-class" && !device.classCode);
  }
  // a group with every tool hidden loses its heading too
  for (const list of menu.querySelectorAll("ul[data-group]")) {
    const empty = [...list.children].every((li) => li.hidden);
    list.hidden = empty;
    const heading = menu.querySelector(`h2[data-group="${list.dataset.group}"]`);
    if (heading) heading.hidden = empty;
  }
}

applyDevice(getDevice());
onDeviceChange(applyDevice);

// ---------- menu ⇄ screens ----------
// The address says where you are (/#next-note), so the browser's and
// Android's back button work, and a teacher can share a link to one tool.
// "#wait?m=2" carries params for the tool; "#join=<CODE>" is a class's QR
// code and opens the set-up page with join=<CODE>.
//
// Every step of the history showing a screen keeps a note in history.state,
// { steps, seen }, which Back, Forward and a reload all keep with it:
//   steps  how far back the start of this visit is: the menu, or the screen
//          a shared link opened. 1 for a tool opened from the menu, 2 for the
//          one it opened with go(), and so on; 0 for that first screen. 🏠
//          goes back exactly that far, so no screen is left behind the menu
//          for Back to find — and if the start is a screen, the menu takes
//          its place, so Back from the menu leaves the app.
//   seen   this step has been shown before, so showing it again (Back, a
//          reload) is not a fresh visit — show()'s fresh, in tools.js.

function parseAddress() {
  const raw = location.hash.slice(1);
  if (raw.startsWith("join=")) return { id: "setup", params: new URLSearchParams(raw) };
  const q = raw.indexOf("?");
  if (q === -1) return { id: raw, params: new URLSearchParams() };
  return { id: raw.slice(0, q), params: new URLSearchParams(raw.slice(q + 1)) };
}

// A tool's own code may throw; the app around it carries on.
function safely(what, fn) {
  try {
    fn();
  } catch (err) {
    console.error(what, err);
  }
}

let shown; // what route() showed last: a screen id, null for the menu, undefined before the first
let steps = 0; // the note of the step on show (see above); the menu is always 0

// fresh: true when go() asks for this screen — even the one already on show
function route({ fresh } = {}) {
  const { id, params } = parseAddress();
  // Map.has, never "id in …": "#toString" must not find Object's own
  const next = screens.has(id) ? id : null;

  // this step's place in the history
  const note = history.state;
  if (next === null) {
    steps = 0;
  } else if (Number.isInteger(note?.steps) && note.steps >= 0) {
    steps = note.steps;
    fresh ??= !note.seen;
    if (!note.seen) history.replaceState({ steps, seen: true }, "");
  } else {
    // a step the app hasn't seen: the address it opened at (a shared link),
    // or a new one — a tap on the menu, a link or an address typed in — just
    // after the step that was on show
    steps = shown === undefined ? 0 : steps + 1;
    fresh = true;
    history.replaceState({ steps, seen: true }, "");
  }

  // Nothing of the last screen may linger on this one: a card or a picture
  // pick it opened ends (its promise settles), and the screen that is leaving
  // lets go. One staying on screen with new params is just shown again.
  closeCard();
  closePicturePicker();
  if (shown && shown !== next) {
    const leaving = screens.get(shown);
    safely(`${shown}: hide()`, () => leaving.tool.hide?.());
  }
  stopSpeaking();
  shown = next;
  active = next;

  const screen = next === null ? null : screens.get(next);
  menu.hidden = next !== null;
  for (const [screenId, s] of screens) s.block.hidden = screenId !== next;
  header.hidden = next === null;
  const name = screen ? screen.entry.title : "Simplify";
  title.textContent = name;
  // on a pictures-only device the screen's name goes too — but the set-up
  // page is for adults, who need to read it
  title.classList.toggle("pic-words", next !== "setup");
  document.title = screen ? `${name} — Simplify` : "Simplify";
  guideLink.href = screen?.entry.guide ?? "/guide";
  guideLinkText.textContent = screen?.entry.guide ? "How to use this tool" : "How to use this app";
  hideToast();
  // no answer and no ✕ until the new screen shows its own
  setResultVisible(false);
  clearAllWrap.hidden = true;
  // the ✕ says what it does in this tool: "start the day again" is not
  // "clear everything" (a tool may return clearLabel from mount())
  $("clear-all").setAttribute("aria-label", screen?.tool.clearLabel ?? CLEAR_ALL_LABEL);
  if (screen) {
    safely(`${next}: show()`, () => {
      screen.tool.show(params, Object.freeze({ fresh: !!fresh }));
      if (screen.tool.hasAnything) screen.shell.setClearAll(screen.tool.hasAnything());
    });
    // show() sent us on to another screen (go()): that route() has done the rest
    if (shown !== next) return;
  }

  window.scrollTo(0, 0);
  // a screen reader lands on the new screen's name, not the old button
  title.focus({ preventScroll: true });
  for (const fn of screenListeners) safely("onScreenChange", () => fn(next));
}

// shell.go(): open another screen, as a new step in the history, one step
// further from the start of the visit than this one
function go(id, params) {
  if (!screens.has(id)) {
    console.error(`go(): there is no screen "${id}"`);
    return;
  }
  const query = params == null ? "" : new URLSearchParams(params).toString();
  const hash = `#${id}${query ? `?${query}` : ""}`;
  // no hashchange for pushState, so route() is called here; already there:
  // no new step, the screen is just shown afresh
  if (location.hash !== hash) history.pushState({ steps: steps + 1, seen: true }, "", hash);
  route({ fresh: true });
}

// shell.back(): what Back does — except on the first screen of the visit,
// where Back would leave the app: that one goes to the menu
function back() {
  if (steps > 0) history.back();
  else showMenuHere();
}

// The menu in place of the step on show (the first of the visit), so Back
// from the menu leaves the app rather than finding that screen again.
function showMenuHere() {
  history.replaceState({ steps: 0 }, "", location.pathname);
  route();
}

// 🏠: back to the start of this visit, however many steps go() added — or,
// on its first screen, the menu in its place
let homing = 0; // when 🏠 set off back through the history; 0 once it is there
const HOMING_MS = 1000; // a trip back through the history takes far less

toMenu.addEventListener("click", (e) => {
  e.preventDefault();
  if (homing && performance.now() - homing < HOMING_MS) return; // on its way already
  // more steps than the history holds (browsers keep ~50): the start is gone
  if (steps > 0 && steps < history.length) {
    homing = performance.now();
    history.go(-steps);
  } else {
    showMenuHere();
  }
});

// Arriving back from 🏠. At the menu, its hashchange shows it. At the screen
// a shared link opened, the menu takes that step's place — which also turns
// the hashchange on its way (if the address changed) into a stale one.
addEventListener("popstate", () => {
  if (!homing) return;
  const late = performance.now() - homing > HOMING_MS;
  homing = 0;
  if (!late && screens.has(parseAddress().id)) showMenuHere();
});

addEventListener("hashchange", (e) => {
  // for an address no longer there (🏠 put the menu in its place): done already
  if (e.newURL === location.href) route();
});

$("clear-all").addEventListener("click", () => {
  const screen = active === null ? null : screens.get(active);
  if (screen) {
    safely(`${active}: clearAll()`, () => {
      screen.tool.clearAll?.();
      if (screen.tool.hasAnything) screen.shell.setClearAll(screen.tool.hasAnything());
    });
  }
  title.focus({ preventScroll: true }); // the ✕ just hid itself
});

// ---------- boot ----------

route();

// a phone may kill a backgrounded app without warning, and leaving for the
// guide unloads it, so save first
document.addEventListener("visibilitychange", () => {
  if (document.hidden) flush();
});
addEventListener("pagehide", flush);

initUpdates();
