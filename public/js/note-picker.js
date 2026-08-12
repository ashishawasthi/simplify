// Full-screen money picker: tap pictures of notes and coins to count cash,
// like laying money out on a table. Undo takes back the last tap.

import { formatCents, sum } from "./money.js";
import {
  CURRENCIES, DEFAULT_CURRENCY, findDenomination, isCoin, noteSvg, coinSvg,
} from "./currency-data.js";

let els = {};
let onDone = null;
let picked = []; // cents value of each tap, in tap order
let currency = DEFAULT_CURRENCY;

export function initPicker(elements, options) {
  els = elements;
  onDone = options.onDone;

  buildGrids();

  els.undo.addEventListener("click", () => {
    picked.pop();
    update();
  });
  els.clear.addEventListener("click", () => {
    picked = [];
    update();
  });
  els.done.addEventListener("click", close);
  // Esc / browser dismissal counts as Done too — never lose a count
  els.dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    close();
  });
}

export function openPicker(existingPicked = []) {
  picked = [...existingPicked];
  update();
  els.dialog.showModal();
}

function close() {
  els.dialog.close();
  onDone([...picked]);
}

function buildGrids() {
  const cur = CURRENCIES[currency];
  els.noteGrid.textContent = "";
  els.coinGrid.textContent = "";

  for (const note of cur.notes) {
    els.noteGrid.append(moneyButton(note, "note-btn", noteSvg(note)));
  }
  for (const coin of cur.coins) {
    els.coinGrid.append(moneyButton(coin, "coin-btn", coinSvg(coin)));
  }
}

function moneyButton(denom, className, svg) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = className;
  btn.setAttribute("aria-label", `Add ${denom.speech}`);
  btn.innerHTML = svg;
  btn.addEventListener("click", () => {
    picked.push(denom.valueCents);
    update();
    navigator.vibrate?.(10); // silent no-op where unsupported (iOS)
    els.total.classList.remove("pop");
    void els.total.offsetWidth; // restart the animation
    els.total.classList.add("pop");
  });
  return btn;
}

function update() {
  els.total.textContent = formatCents(sum(picked));

  // tray: one chip per denomination in first-tap order, with a × count
  const counts = new Map();
  for (const v of picked) counts.set(v, (counts.get(v) || 0) + 1);

  els.trayList.textContent = "";
  for (const [valueCents, count] of counts) {
    const denom = findDenomination(currency, valueCents);
    const li = document.createElement("li");
    li.className = "tray-item" + (isCoin(currency, valueCents) ? " is-coin" : "");
    li.style.background = denom.color;
    li.textContent = count > 1 ? `${denom.label} × ${count}` : denom.label;
    els.trayList.append(li);
  }

  els.trayEmpty.hidden = picked.length > 0;
  els.undo.disabled = picked.length === 0;
  els.clear.disabled = picked.length === 0;
}
