// One money box: type the amount, say it (🎤), or — for "My money" — count
// it with the notes-and-coins picker (💵). The 🎤 and 💵 show only while
// the box is empty, the ✕ once it holds something, so a filled box never
// looks like it is waiting for another step.

import { parseToCents, formatCents, sum } from "./money.js";
import { openSpeak } from "./speak.js";
import { openPicker } from "./note-picker.js";

export function createMoneyField({ input, speakBtn, clearBtn, pickerBtn, chip }, { onChange, onCleared }) {
  // value: the text in the box; picked: cents of each tapped note, in order
  const field = { value: "", source: "typed", picked: [] };

  function sync() {
    const filled = input.value.trim() !== "";
    speakBtn.hidden = filled;
    clearBtn.hidden = !filled;
    // 💵 is another way to fill an empty box, so it goes with the 🎤
    if (pickerBtn) pickerBtn.hidden = filled;
    if (chip) chip.hidden = field.source !== "notes";
  }

  function set(value = "", source = "typed", picked = []) {
    field.value = value;
    field.source = source;
    field.picked = [...picked];
    input.value = value;
    sync();
  }

  input.addEventListener("input", () => {
    // typing takes over from the picker: the picked notes no longer match
    set(input.value);
    onChange();
  });

  // tidy the box once the user is done ("5.5" → "5.50", "abc" left alone)
  input.addEventListener("blur", () => {
    const cents = parseToCents(field.value);
    if (cents != null && formatCents(cents, "") !== field.value) {
      set(formatCents(cents, ""), field.source, field.picked);
      onChange();
    }
  });

  speakBtn.addEventListener("click", () =>
    openSpeak((text) => {
      set(text);
      onChange();
    }));

  clearBtn.addEventListener("click", () => {
    const before = { ...field, picked: [...field.picked] };
    set();
    onChange();
    // this button just hid itself; hand focus to the 🎤 that took its place
    // rather than the box, whose keypad would bury the mic on a phone
    speakBtn.focus();
    onCleared(before);
  });

  pickerBtn?.addEventListener("click", () =>
    openPicker(field.source === "notes" ? field.picked : [], (picked) => {
      if (picked.length > 0) set(formatCents(sum(picked), ""), "notes", picked);
      onChange();
      // 💵 hides itself once the box is filled, so land on the ✕ that
      // replaced it rather than letting focus fall to the page body
      (pickerBtn.hidden ? clearBtn : pickerBtn).focus();
    }));

  return {
    get: () => ({ value: field.value, source: field.source, picked: [...field.picked] }),
    set,
    cents: () => parseToCents(field.value),
    filled: () => field.value.trim() !== "",
  };
}
