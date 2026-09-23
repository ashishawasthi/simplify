// Pictures of the notes and coins that make an amount: the 💵 "Show me"
// sheet (how much more is needed, or the change to expect), and the answers
// of Next note and Make the amount. A number on the money means "how many",
// the same ×N badge the picker uses.

import { formatCents, roundUpToCoin, breakdown, moneyWords } from "./money.js";
import {
  DEFAULT_CURRENCY, findDenomination, isCoin, noteSvg, coinSvg, pictureScale,
} from "./currency-data.js";

// pieces: [{ valueCents, count }], biggest first. Notes go in one column,
// coins in a row under them, each drawn at its real size order.
export function renderMoney(el, pieces) {
  el.textContent = "";
  const notes = document.createElement("div");
  notes.className = "money-notes";
  const coins = document.createElement("div");
  coins.className = "money-coins";

  for (const { valueCents, count } of pieces) {
    const denom = findDenomination(DEFAULT_CURRENCY, valueCents);
    const coin = isCoin(DEFAULT_CURRENCY, valueCents);
    const piece = document.createElement("div");
    piece.className = `money-piece ${coin ? "is-coin" : "is-note"}`;
    piece.innerHTML = coin ? coinSvg(denom) : noteSvg(denom);
    piece.style.setProperty("--scale", pictureScale(DEFAULT_CURRENCY, denom).toFixed(3));
    if (count > 1) {
      const badge = document.createElement("span");
      badge.className = "count-badge";
      badge.textContent = `×${count}`;
      piece.append(badge);
    }
    (coin ? coins : notes).append(piece);
  }
  for (const group of [notes, coins]) if (group.children.length) el.append(group);
}

// Answer pictures on a tool's own screen: [{ pieces, caption? }]
export function renderPictureGroups(el, groups = []) {
  el.textContent = "";
  el.hidden = groups.length === 0;
  for (const { pieces, caption } of groups) {
    if (caption) {
      const p = document.createElement("p");
      p.className = "money-caption";
      p.textContent = caption;
      el.append(p);
    }
    const box = document.createElement("div");
    renderMoney(box, pieces);
    el.append(box);
  }
}

let els = null;

export function initShowMoney(elements) {
  els = elements;
  els.done.addEventListener("click", () => els.dialog.close());
}

// label: "You need" / "Your change"; title: "$1.30 more" / "$2.70"
export function openShowMoney({ label, title, cents }) {
  // there is no 1¢ coin: show enough to cover it, and say what that makes
  const made = roundUpToCoin(cents);
  const pieces = breakdown(made);
  els.label.textContent = label;
  els.title.textContent = title;
  els.words.textContent = moneyWords(pieces);
  els.note.hidden = made === cents;
  els.note.textContent = `That makes ${formatCents(made)}`;
  renderMoney(els.pieces, pieces);
  els.dialog.showModal();
  els.dialog.scrollTop = 0; // a dialog keeps its scroll from the last opening
}
