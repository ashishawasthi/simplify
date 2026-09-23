// A list of big price rows ("Things I want to buy"), one list per tool.
// Empty or unreadable rows simply count as $0 — never a validation error.
// A shopping list also gives each row a name box above its price.

import { parseToCents, sum } from "./money.js";
import { openSpeak } from "./speak.js";

export function createItems(listEl, { withNames = false, onChange, onRemove, onClear }) {
  let items = []; // { id, value, name } — raw text as typed
  let nextId = 1;

  const blank = () => ({ id: nextId++, value: "", name: "" });

  function set(arr) {
    items = (arr && arr.length ? arr : [{}]).map((it) => ({
      id: nextId++,
      value: it.value || "",
      name: it.name || "",
    }));
    render();
  }

  const get = () => items.map((it) => (withNames ? { name: it.name, value: it.value } : { value: it.value }));

  const totalCents = () => sum(items.map((it) => parseToCents(it.value) ?? 0));

  const hasAnyPrice = () => items.some((it) => (parseToCents(it.value) ?? 0) > 0);

  // "Add item" appears once the last row has a price in it
  const lastHasValue = () => {
    const last = items[items.length - 1];
    return !!last && last.value.trim() !== "";
  };

  const anyHasValue = () => items.some((it) => it.value.trim() !== "" || it.name.trim() !== "");

  function add() {
    items.push(blank());
    render();
    // put the cursor in the new row so "add → type" is one motion
    const rows = listEl.querySelectorAll(".item-row");
    rows[rows.length - 1]?.querySelector("input")?.focus();
    onChange();
  }

  function restore(item, index) {
    const at = Math.min(index, items.length);
    items.splice(at, 0, { id: nextId++, value: item.value || "", name: item.name || "" });
    render();
    onChange();
  }

  function removeItem(id) {
    const index = items.findIndex((it) => it.id === id);
    if (index === -1) return;
    const [removed] = items.splice(index, 1);
    if (items.length === 0) items.push(blank());
    render();
    onChange();
    // only offer "put it back" when something was actually in the row
    if (removed.value.trim() !== "" || removed.name.trim() !== "") {
      onRemove({ value: removed.value, name: removed.name }, index);
    }
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
        onChange();
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
        onChange();
        speak.focus(); // this button just hid itself; don't strand focus
        onClear({ value: prev }, () => {
          item.value = prev;
          render();
          onChange();
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

      if (withNames) {
        // a plain text box: the full keyboard comes up, microphone and all,
        // so a name can be said without the 🎤 window
        const name = document.createElement("input");
        name.type = "text";
        name.className = "name-field";
        name.autocomplete = "off";
        name.enterKeyHint = "next";
        name.maxLength = 40;
        name.placeholder = "Item name";
        name.value = item.name;
        name.setAttribute("aria-label", `Name of thing ${i + 1}`);
        name.addEventListener("input", () => {
          item.name = name.value;
          onChange();
        });
        const fields = document.createElement("div");
        fields.className = "item-fields";
        fields.append(name, wrap);
        li.append(fields, remove);
      } else {
        li.append(wrap, remove);
      }
      listEl.append(li);
    });
  }

  return { set, get, totalCents, hasAnyPrice, lastHasValue, anyHasValue, add, restore };
}
