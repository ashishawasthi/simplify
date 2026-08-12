// The answer panel: always visible, recomputed on every change.
// Color + icon + plain words together, so no single channel carries the message.

import { formatCents } from "./money.js";

let panel, icon, headline, subline, float;

export function initResult(els) {
  ({ panel, icon, headline, subline, float } = els);
}

export function renderResult({ moneyCents, hasMoney, itemsCents, hasPrices }) {
  if (!hasMoney) {
    show("is-neutral", "⬆️", "Type your money at the top", "");
    return;
  }
  if (!hasPrices) {
    show("is-neutral", "🛒", "Add the prices of things to buy", "");
    return;
  }

  const leftover = moneyCents - itemsCents;
  if (leftover > 0) {
    show("is-yes", "✅", "Yes! You have enough",
      `Money left: <strong>${formatCents(leftover)}</strong>`);
  } else if (leftover === 0) {
    show("is-yes", "✅", "Yes — exactly enough",
      "Money left: <strong>$0</strong>");
  } else {
    // phrased as "need more", never as a negative number
    show("is-no", "✋", "Not enough",
      `You need <strong>${formatCents(-leftover)}</strong> more`);
  }
}

function show(stateClass, iconChar, head, sub) {
  panel.classList.remove("is-yes", "is-no", "is-neutral");
  panel.classList.add(stateClass);
  icon.textContent = iconChar;
  headline.textContent = head;
  subline.innerHTML = sub;

  // mirror a real verdict at the top of the screen; the neutral hints stay
  // bottom-only because the bare icon can't carry their meaning
  const isVerdict = stateClass !== "is-neutral";
  float.hidden = !isVerdict;
  if (isVerdict) {
    float.classList.remove("is-yes", "is-no");
    float.classList.add(stateClass);
    float.textContent = iconChar;
  }
}
