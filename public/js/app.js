// Entry point: the menu, the six money tools, and what they share — the
// answer panel, the notes-and-coins picker, the speak window, "Show me" and
// the undo toast. Each tool is one block in index.html whose boxes are marked
// data-box="money|spend|need" and whose list is data-list="items|named"; one
// controller below runs whichever of those a tool has.

import { parseToCents, formatCents } from "./money.js";
import { createItems } from "./items.js";
import { createMoneyField } from "./money-field.js";
import { initResult, renderResult, setResultVisible } from "./result.js";
import { initPicker } from "./note-picker.js";
import { initSpeak } from "./speak.js";
import { initShowMoney, openShowMoney, renderPictureGroups } from "./show-money.js";
import { ANSWERS } from "./answers.js";
import { DEFAULT_CURRENCY, moneySvg } from "./currency-data.js";
import { load, save, flush } from "./storage.js";
import { initUpdates } from "./update.js";

const $ = (id) => document.getElementById(id);

// the tools, in menu order, by the id used in the URL (#change) and the guide
const TITLES = {
  "can-i-buy": "Can I buy?",
  "change": "What is the change?",
  "next-dollar": "Next dollar",
  "next-note": "Next note",
  "make-amount": "Make the amount",
  "shopping-list": "Make a shopping list",
};

// Can I buy? keeps the key it had when it was the whole app, so numbers
// saved before the menu existed are still there after the update.
const storageKey = (id) => (id === "can-i-buy" ? "afford-it-v1" : `simplify-${id}-v1`);

const header = $("app-header");
const title = $("screen-title");
const menu = $("menu");
const toMenu = $("to-menu");
const clearAllWrap = $("clear-all-wrap");
const guideLink = $("guide-link");
const guideLinkText = $("guide-link-text");
const toast = $("toast");
const toastText = $("toast-text");
const toastUndo = $("toast-undo");

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
    header,
    title,
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

// menu pictures are the app's own note and coin drawings
for (const slot of document.querySelectorAll("[data-picture]")) {
  slot.innerHTML = slot.dataset.picture
    .split(" ")
    .map((cents) => moneySvg(DEFAULT_CURRENCY, Number(cents)))
    .join("");
}

// ---------- one controller per tool ----------

let active = null; // id of the tool on screen; null while the menu shows
const tools = {};

function mountTool(id) {
  const block = $(`tool-${id}`);
  const answer = ANSWERS[id];
  const key = storageKey(id);

  const boxes = {};
  for (const wrap of block.querySelectorAll("[data-box]")) {
    const name = wrap.dataset.box;
    boxes[name] = createMoneyField(
      {
        input: wrap.querySelector("input"),
        speakBtn: wrap.querySelector(".mic-btn"),
        clearBtn: wrap.querySelector(".clear-btn"),
        pickerBtn: block.querySelector(`[data-picker-for="${name}"]`),
        chip: block.querySelector(`[data-chip-for="${name}"]`),
      },
      {
        onChange: update,
        onCleared: (before) =>
          showToast(`Cleared ${formatCents(parseToCents(before.value) ?? 0)}`, () => {
            boxes[name].set(before.value, before.source, before.picked);
            update();
          }),
      },
    );
  }

  const listEl = block.querySelector("[data-list]");
  const items = listEl && createItems(listEl, {
    withNames: listEl.dataset.list === "named",
    onChange: update,
    onRemove: (item, index) =>
      showToast(`Took away ${item.name.trim() || formatCents(parseToCents(item.value) ?? 0)}`,
        () => items.restore(item, index)),
    onClear: (item, undo) =>
      showToast(`Cleared ${formatCents(parseToCents(item.value) ?? 0)}`, undo),
  });
  const addBtn = block.querySelector("[data-add-item]");
  addBtn?.addEventListener("click", () => items.add());
  const totalEl = block.querySelector("[data-total]");
  const picturesEl = block.querySelector("[data-pictures]");

  // Saved shape: { moneyValue, moneySource, pickedNotes, spendValue,
  // needValue, items } — only the parts this tool has. Can I buy?'s is the
  // exact shape the single-screen app used to save.
  function snapshot() {
    const snap = {};
    if (boxes.money) {
      const money = boxes.money.get();
      snap.moneyValue = money.value;
      snap.moneySource = money.source;
      snap.pickedNotes = money.picked;
    }
    if (boxes.spend) snap.spendValue = boxes.spend.get().value;
    if (boxes.need) snap.needValue = boxes.need.get().value;
    if (items) snap.items = items.get();
    return snap;
  }

  function restore(snap = {}) {
    boxes.money?.set(snap.moneyValue || "", snap.moneySource || "typed", snap.pickedNotes || []);
    boxes.spend?.set(snap.spendValue || "");
    boxes.need?.set(snap.needValue || "");
    items?.set(snap.items);
    update();
  }

  const hasAnything = () =>
    Object.values(boxes).some((box) => box.filled()) || !!items?.anyHasValue();

  function update() {
    if (items) {
      totalEl.textContent = formatCents(items.totalCents());
      // one empty row at a time: fill it before another can be added
      addBtn.hidden = !items.lastHasValue();
    }
    const said = answer({
      money: boxes.money ? boxes.money.cents() : null,
      spend: boxes.spend ? boxes.spend.cents() : null,
      need: boxes.need ? boxes.need.cents() : null,
      total: items ? items.totalCents() : 0,
      hasPrices: !!items?.hasAnyPrice(),
    });
    if (picturesEl) renderPictureGroups(picturesEl, said.pictures);
    if (active === id) {
      renderResult(said);
      // nothing entered anywhere yet means nothing to clear
      clearAllWrap.hidden = !hasAnything();
    }
    save(key, snapshot());
  }

  function clearAll() {
    const before = snapshot();
    restore({});
    showToast("Everything cleared", () => restore(before));
  }

  restore(load(key) || {});
  return { block, update, clearAll };
}

for (const id of Object.keys(TITLES)) tools[id] = mountTool(id);

// ---------- menu ⇄ tools ----------
// The address says where you are (/#next-note), so the browser's and
// Android's back button work, and a teacher can share a link to one tool.

let shown; // what route() showed last: a tool id, null for the menu
let cameFromMenu = false;

function route() {
  const id = location.hash.slice(1);
  const next = id in TITLES ? id : null;
  // opened from the menu in this visit: then 🏠 can simply step back to it
  cameFromMenu = next !== null && shown === null;
  shown = next;
  active = next;

  menu.hidden = next !== null;
  for (const [toolId, tool] of Object.entries(tools)) tool.block.hidden = toolId !== next;
  header.hidden = next === null;
  title.textContent = next ? TITLES[next] : "Simplify";
  document.title = next ? `${TITLES[next]} — Simplify` : "Simplify";
  guideLink.href = next ? `/guide/${next}` : "/guide";
  guideLinkText.textContent = next ? "How to use this tool" : "How to use this app";
  hideToast();
  setResultVisible(next !== null);
  if (next) tools[next].update();

  window.scrollTo(0, 0);
  // a screen reader lands on the new screen's name, not the old button
  title.focus({ preventScroll: true });
}

addEventListener("hashchange", route);

toMenu.addEventListener("click", (e) => {
  e.preventDefault();
  if (cameFromMenu) {
    history.back(); // no new history entry, so Back from the menu leaves the app
  } else {
    // opened straight into a tool (a shared link): swap it for the menu
    history.replaceState(null, "", location.pathname);
    route();
  }
});

$("clear-all").addEventListener("click", () => {
  tools[active]?.clearAll();
  title.focus({ preventScroll: true }); // Start over just hid itself
});

// ---------- undo toast ----------

let toastTimer = null;
let toastAction = null;

function showToast(text, undoFn) {
  toastText.textContent = text;
  toastAction = undoFn;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, 5000);
}

function hideToast() {
  toast.hidden = true;
  toastAction = null;
}

toastUndo.addEventListener("click", () => {
  toastAction?.();
  hideToast();
});

// ---------- boot ----------

route();

// a phone may kill a backgrounded app without warning, so save first
document.addEventListener("visibilitychange", () => {
  if (document.hidden) flush();
});

initUpdates();
