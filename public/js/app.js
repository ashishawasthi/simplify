// Entry point: owns the app state, wires the three zones together.

import { parseToCents, formatCents, sum } from "./money.js";
import { initItems, setItems, getItems, itemsTotalCents, hasAnyPrice, addItem, restoreItem } from "./items.js";
import { initResult, renderResult } from "./result.js";
import { initPicker, openPicker } from "./note-picker.js";
import { initSpeak, openSpeak } from "./speak.js";
import { load, save } from "./storage.js";

const $ = (id) => document.getElementById(id);

const state = {
  moneyValue: "",      // raw text in the money field
  moneySource: "typed", // "typed" | "notes"
  pickedNotes: [],      // cents per tapped note/coin, in tap order
};

const moneyInput = $("money-input");
const speakMoneyBtn = $("speak-money");
const moneyChip = $("money-chip");
const itemsTotalEl = $("items-total");
const toast = $("toast");
const toastText = $("toast-text");
const toastUndo = $("toast-undo");

// ---------- wiring ----------

initItems($("items-list"), {
  onChange: update,
  onRemove: (item, index) => {
    showToast(`Took away ${formatCents(parseToCents(item.value) ?? 0)}`, () =>
      restoreItem(item, index));
  },
});

initResult({
  panel: $("result"),
  icon: $("result-icon"),
  headline: $("result-headline"),
  subline: $("result-subline"),
});

initPicker(
  {
    dialog: $("picker"),
    total: $("picker-total"),
    trayList: $("tray-list"),
    trayEmpty: $("tray-empty"),
    undo: $("picker-undo"),
    clear: $("picker-clear"),
    done: $("picker-done"),
    noteGrid: $("note-grid"),
    coinGrid: $("coin-grid"),
  },
  {
    onDone: (picked) => {
      state.pickedNotes = picked;
      if (picked.length > 0) {
        state.moneySource = "notes";
        const cents = sum(picked);
        state.moneyValue = centsToInputText(cents);
        moneyInput.value = state.moneyValue;
      }
      update();
      $("open-picker").focus();
    },
  },
);

moneyInput.addEventListener("input", () => {
  state.moneyValue = moneyInput.value;
  // typing takes over from the picker: the picked notes no longer match
  state.moneySource = "typed";
  state.pickedNotes = [];
  update();
});

// tidy the field once the user is done ("5.5" → "5.50", "abc" left alone)
moneyInput.addEventListener("blur", () => {
  const cents = parseToCents(state.moneyValue);
  if (cents != null) {
    state.moneyValue = centsToInputText(cents);
    moneyInput.value = state.moneyValue;
    save(snapshot());
  }
});

$("open-picker").addEventListener("click", () => {
  openPicker(state.moneySource === "notes" ? state.pickedNotes : []);
});

initSpeak({
  dialog: $("speak"),
  input: $("speak-input"),
  heard: $("speak-heard"),
  done: $("speak-done"),
  cancel: $("speak-cancel"),
});

$("speak-money").addEventListener("click", () =>
  openSpeak((text) => {
    moneyInput.value = text;
    // run the normal typing path: sets state, drops stale picked notes
    moneyInput.dispatchEvent(new Event("input"));
  }));

$("add-item").addEventListener("click", addItem);

$("start-over").addEventListener("click", () => {
  const before = snapshot();
  state.moneyValue = "";
  state.moneySource = "typed";
  state.pickedNotes = [];
  moneyInput.value = "";
  setItems([]);
  update();
  showToast("Everything cleared", () => restore(before));
});

// ---------- state helpers ----------

function centsToInputText(cents) {
  return formatCents(cents, ""); // no "$" — the field has its own prefix
}

function snapshot() {
  return {
    moneyValue: state.moneyValue,
    moneySource: state.moneySource,
    pickedNotes: [...state.pickedNotes],
    items: getItems(),
  };
}

function restore(snap) {
  state.moneyValue = snap.moneyValue || "";
  state.moneySource = snap.moneySource || "typed";
  state.pickedNotes = snap.pickedNotes || [];
  moneyInput.value = state.moneyValue;
  setItems(snap.items || []);
  update();
}

function update() {
  const moneyCents = parseToCents(state.moneyValue);
  itemsTotalEl.textContent = formatCents(itemsTotalCents());
  moneyChip.hidden = state.moneySource !== "notes";
  // the mic only offers itself while the box is empty
  speakMoneyBtn.hidden = moneyInput.value.trim() !== "";
  renderResult({
    moneyCents: moneyCents ?? 0,
    hasMoney: moneyCents != null,
    itemsCents: itemsTotalCents(),
    hasPrices: hasAnyPrice(),
  });
  save(snapshot());
}

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

restore(load() || { items: [{ value: "" }] });

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {
    // offline support is a bonus, never a blocker
  });
}
