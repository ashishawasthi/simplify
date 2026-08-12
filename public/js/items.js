// The "things I want to buy" list: any number of big price rows.
// Empty or unreadable rows simply count as $0 — never a validation error.

import { parseToCents, sum } from "./money.js";
import { openSpeak } from "./speak.js";

let listEl;
let handlers = {};
let items = []; // { id, value } — value is the raw text the user typed
let nextId = 1;

export function initItems(list, { onChange, onRemove, onClear }) {
  listEl = list;
  handlers = { onChange, onRemove, onClear };
}

export function lastItemHasValue() {
  const last = items[items.length - 1];
  return !!last && last.value.trim() !== "";
}

export function anyItemHasValue() {
  return items.some((it) => it.value.trim() !== "");
}

export function setItems(arr) {
  items = (arr && arr.length ? arr : [{ value: "" }]).map((it) => ({
    id: nextId++,
    value: it.value || "",
  }));
  render();
}

export function getItems() {
  return items.map((it) => ({ value: it.value }));
}

export function itemsTotalCents() {
  return sum(items.map((it) => parseToCents(it.value) ?? 0));
}

export function hasAnyPrice() {
  return items.some((it) => (parseToCents(it.value) ?? 0) > 0);
}

export function addItem() {
  items.push({ id: nextId++, value: "" });
  render();
  // put the cursor in the new row so "add → type" is one motion
  const inputs = listEl.querySelectorAll("input");
  inputs[inputs.length - 1]?.focus();
  handlers.onChange();
}

export function restoreItem(item, index) {
  const at = Math.min(index, items.length);
  items.splice(at, 0, { id: nextId++, value: item.value });
  render();
  handlers.onChange();
}

function removeItem(id) {
  const index = items.findIndex((it) => it.id === id);
  if (index === -1) return;
  const [removed] = items.splice(index, 1);
  if (items.length === 0) items.push({ id: nextId++, value: "" });
  render();
  handlers.onChange();
  // only offer "put it back" when something was actually in the row
  if (removed.value.trim() !== "") handlers.onRemove({ value: removed.value }, index);
}

function render() {
  listEl.textContent = "";
  items.forEach((item, i) => {
    const li = document.createElement("li");
    li.className = "item-row";

    const label = document.createElement("label");
    label.className = "amount-field";

    const prefix = document.createElement("span");
    prefix.className = "dollar-prefix";
    prefix.setAttribute("aria-hidden", "true");
    prefix.textContent = "$";

    const input = document.createElement("input");
    input.type = "text";
    input.inputMode = "decimal";
    input.autocomplete = "off";
    input.enterKeyHint = "done";
    input.placeholder = "0";
    input.value = item.value;
    input.setAttribute("aria-label", `Price of thing ${i + 1}, in dollars`);
    input.addEventListener("input", () => {
      item.value = input.value;
      handlers.onChange();
    });

    const speak = document.createElement("button");
    speak.type = "button";
    speak.className = "mic-btn";
    speak.textContent = "🎤";
    speak.setAttribute("aria-label", `Say the price of thing ${i + 1}`);
    speak.addEventListener("click", () =>
      openSpeak((text) => {
        input.value = text;
        input.dispatchEvent(new Event("input"));
      }));

    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "clear-btn";
    clear.textContent = "✕";
    clear.setAttribute("aria-label", `Clear the price of thing ${i + 1}`);
    clear.addEventListener("click", () => {
      const prev = item.value;
      input.value = "";
      item.value = "";
      syncFieldButtons();
      handlers.onChange();
      speak.focus(); // this button just hid itself; don't strand focus
      handlers.onClear({ value: prev }, () => {
        item.value = prev;
        render();
        handlers.onChange();
      });
    });

    // exactly one of 🎤 / ✕ is showing, decided by whether the box has anything
    const syncFieldButtons = () => {
      const filled = input.value.trim() !== "";
      speak.hidden = filled;
      clear.hidden = !filled;
    };
    syncFieldButtons();
    input.addEventListener("input", syncFieldButtons);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-btn";
    remove.textContent = "−";
    remove.setAttribute("aria-label", `Remove thing ${i + 1}`);
    remove.addEventListener("click", () => removeItem(item.id));

    const wrap = document.createElement("div");
    wrap.className = "amount-wrap";
    label.append(prefix, input);
    wrap.append(label, speak, clear);
    li.append(wrap, remove);
    listEl.append(li);
  });
}
