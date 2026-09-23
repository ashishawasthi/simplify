// I need (#i-need): big cards for what a student needs to say when speech is
// hard — Help, Break, Toilet, Water, Too loud, Stop, Hurts and, once an
// adult switches them on, I want, More time, Don't understand and All done.
// A tap puts the whole sentence over the screen (../show-card.js) for an
// adult to read, with Turn around and Speak: "I need a break" — with 2 or
// 5 minutes of Wait on it. Hurts first asks where (a body to tap) and how
// much (i-need-hurts.js); I want asks for a picture (the picture picker).
// The cards and their words are in i-need-cards.js.
//
// The grid: 2 columns on a phone, 3 on a tablet-sized screen — at least
// 600 px both ways, so a phone turned on its side keeps its 2 and no card
// changes place. Every card has its place for good: one switched off on the
// set-up page leaves a gap. On a pictures-only device the labels step
// aside; the card that opens keeps its words, which are for the adult.
//
// Nothing is kept but which cards are on (the set-up page, per device) —
// not what was tapped, nor when, nor where it hurt — so the screen has no ✕.

import { openCard } from "../show-card.js";
import { pickPicture } from "../picture-picker.js";
import { PICTURES, pictureImg } from "../pictures.js";
import {
  BREAK_MINUTES, CARDS, cardById, cardsOn, gridCells, hurtsSentence, wantSentence, withCard,
} from "./i-need-cards.js";
import { FACE_REGIONS, bodyDrawing } from "./i-need-body.js";
import { mountHurts } from "./i-need-hurts.js";

function make(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
}

export function mount(block, shell) {
  const list = make("ul", "need-cards");
  list.setAttribute("role", "list"); // Safari stops calling a list without bullets a list
  const slots = CARDS.map((card) => {
    const slot = make("li", "need-slot");
    const btn = make("button", "need-card");
    btn.type = "button";
    btn.dataset.card = card.id;
    const img = pictureImg(card.picture, { alt: "" });
    if (img) btn.append(img);
    // the button's name — kept for screen readers on a pictures-only device
    btn.append(make("span", "need-label pic-words", card.label));
    btn.addEventListener("click", () => tap(card));
    slot.append(btn);
    list.append(slot);
    return { card, slot };
  });
  // only when an adult has switched every card off: better than a blank screen
  const none = make("p", "need-none",
    "All the cards are switched off on this device. An adult can switch them on again on the set-up page.");
  block.append(list, none);

  const hurts = mountHurts(block, {
    onAnswer: ({ region, size }) => openCard({
      picture: bodyDrawing({
        view: region === "back" ? "back" : "front",
        region,
        closeUp: FACE_REGIONS.includes(region),
      }),
      words: hurtsSentence(region, size),
    }),
  });

  let onScreen = false;

  function tap(card) {
    if (card.id === "hurts") return hurts.open();
    if (card.id === "want") return iWant();
    openCard({
      picture: card.picture,
      words: card.sentence,
      // for whoever holds the card: a wait of either length, on the Wait
      // tool (its link works even where the menu hides it)
      actions: card.id === "break"
        ? BREAK_MINUTES.map((m) => ({ picture: "wait", number: String(m), words: "minutes", onTap: () => shell.go("wait", { m }) }))
        : [],
    });
  }

  // I want: a picture (and a few words, for a student who reads) → the card
  async function iWant() {
    const pick = await pickPicture({ title: cardById("want").label, allowWords: !shell.device.picturesOnly });
    // null: ✕, or the screen changed and took the picker away
    if (!pick || !onScreen) return;
    const known = PICTURES.find((p) => p.id === pick.picture) ?? null;
    openCard({ picture: known?.id ?? null, words: wantSentence(pick, known?.words) });
  }

  function render() {
    const cells = gridCells(shell.settings);
    for (const [i, { slot }] of slots.entries()) {
      const on = cells[i]?.on ?? false;
      slot.hidden = i >= cells.length; // after the last card on: no place to keep
      slot.classList.toggle("is-off", !on); // out of sight, still holding its place
      slot.inert = !on; // and out of reach: no focus, not read out
    }
    list.hidden = cells.length === 0;
    none.hidden = cells.length > 0;
  }
  render();
  // a change on the set-up page, its Put it back, or the page in another tab
  shell.onDeviceChange(render);

  return {
    show() {
      onScreen = true;
      hurts.close(); // new params on the same screen: start from the grid
      render();
    },
    hide() {
      onScreen = false;
      hurts.close();
    },
  };
}

// ---- the set-up page's section (the contract is in ../tools.js) ----
// Built inside the set-up page, so it borrows that page's switch rows and
// note (css/tools/setup.css); css/tools/i-need.css styles the one part of
// its own. Every change is saved at once and offered back in the toast.

// under each card's name, what it says — word for word where it can
function says(card) {
  if (card.id === "hurts") return "Asks where and how much, then “It hurts here …”";
  if (card.id === "want") return "Asks for a picture, then “I want …”";
  return `“${card.sentence}”`;
}

export function setup(section, shell) {
  const root = make("div", "need-setup");
  root.append(make("p", "setup-note", "A card switched off leaves a gap, so the other cards stay where they are."));

  const list = make("ul", "setup-list");
  const rows = CARDS.map((card) => {
    const sw = make("button", "setup-switch");
    sw.type = "button";
    sw.setAttribute("role", "switch");
    sw.dataset.card = card.id;
    const icon = make("span", "tool-icon");
    icon.setAttribute("aria-hidden", "true");
    const img = pictureImg(card.picture, { alt: "" });
    if (img) icon.append(img);
    const name = make("span", "setup-switch-name", card.label);
    name.append(make("span", "need-says", says(card)));
    const state = make("span", "switch-state");
    state.setAttribute("aria-hidden", "true"); // aria-checked says it
    state.append(make("span", "switch-knob"), make("span", "switch-word"));
    sw.append(icon, name, state);
    sw.addEventListener("click", () => {
      const wasOn = cardsOn(shell.settings).includes(card.id);
      shell.saveSettings(withCard(shell.settings, card.id, !wasOn));
      shell.showToast(`${card.label}: ${wasOn ? "off" : "on"}`,
        () => shell.saveSettings(withCard(shell.settings, card.id, wasOn)));
    });
    const li = make("li");
    li.append(sw);
    list.append(li);
    return { id: card.id, sw };
  });
  root.append(list);
  section.append(root);

  // the switches follow the settings, including a Put it back
  function render() {
    const on = cardsOn(shell.settings);
    for (const { id, sw } of rows) {
      const isOn = on.includes(id);
      sw.setAttribute("aria-checked", String(isOn));
      sw.querySelector(".switch-knob").textContent = isOn ? "✔" : "";
      sw.querySelector(".switch-word").textContent = isOn ? "On" : "Off";
    }
  }
  render();
  shell.onDeviceChange(render);

  return { show: render };
}
