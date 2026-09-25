// Stop and check (#stop-check): someone — a message, a call, a new "friend" —
// asks for something. "Someone asked me for:" and ten big buttons, each a
// picture and a few words, in places that never move (two columns). A tap
// puts a card over the whole screen (../show-card.js): STOP. Show a trusted
// adult., the one plain rule for that ask, and 1799 for when no adult is
// near — with Turn around, to show someone, and Speak where the set-up page
// allows it. The words are in stop-check-cards.js; the contract this follows
// is in ../tools.js. Nothing is kept: not which card was shown, nor when.

import { openCard } from "../show-card.js";
import { pictureImg } from "../pictures.js";
import { ASKS, cardFor } from "./stop-check-cards.js";

function make(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
}

export function mount(block) {
  const h = make("h2", "sk-title", "Someone asked me for:");
  h.id = "sk-title";
  const list = make("ul", "sk-asks");
  list.setAttribute("role", "list"); // Safari stops calling a list without bullets a list
  list.setAttribute("aria-labelledby", h.id);
  for (const a of ASKS) {
    const li = make("li");
    const btn = make("button", "sk-ask");
    btn.type = "button";
    btn.dataset.ask = a.id;
    const img = pictureImg(a.picture, { alt: "" });
    if (img) btn.append(img);
    btn.append(make("span", "sk-ask-label pic-words", a.label));
    btn.addEventListener("click", () => openCard(cardFor(a.id)));
    li.append(btn);
    list.append(li);
  }
  block.append(h, list);
  return { show() {} };
}
