// The six money tools, all run by this one controller. Each is a block in
// index.html whose boxes are marked data-box="money|spend|need" and whose
// list is data-list="items|named"; the controller runs whichever of those a
// tool has, and asks answers.js what to say. Mounted like any other tool
// (see tools.js); its shell keeps each tool's numbers under the key it has
// always had, so an update never loses them.

import { parseToCents, formatCents } from "./money.js";
import { createItems } from "./items.js";
import { createMoneyField } from "./money-field.js";
import { renderPictureGroups } from "./show-money.js";
import { ANSWERS } from "./answers.js";

export function mountMoneyTool(block, shell) {
  const answer = ANSWERS[shell.id];

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
          shell.showToast(`Cleared ${formatCents(parseToCents(before.value) ?? 0)}`, () => {
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
      shell.showToast(`Took away ${item.name.trim() || formatCents(parseToCents(item.value) ?? 0)}`,
        () => items.restore(item, index)),
    onClear: (item, undo) =>
      shell.showToast(`Cleared ${formatCents(parseToCents(item.value) ?? 0)}`, undo),
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
    // both reach the screen only while this tool is on it (the shell checks)
    shell.result.render(said);
    // nothing entered anywhere yet means nothing to clear
    shell.setClearAll(hasAnything());
    shell.save(snapshot());
  }

  function clearAll() {
    const before = snapshot();
    restore({});
    shell.showToast("Everything cleared", () => restore(before));
  }

  restore(shell.load() || {});
  return { show: update, clearAll, hasAnything };
}
