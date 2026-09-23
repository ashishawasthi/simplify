// Show a card (#show-card): big cards to show someone in a public place — a
// bus captain, station staff, a cashier, the people around. A tap puts the
// card over the whole screen (../show-card.js), with Turn around for the
// person opposite and Speak; nothing is said until Speak is tapped. The
// cards, their wording and the settings are in show-card-cards.js; the
// contract this follows is in ../tools.js.
//
// The screen: the six cards in two columns, in the same places on every
// visit — two columns on an iPad and on a phone on its side too, and a card
// switched off on the set-up page leaves a gap, so a hand learns where each
// one is. On a pictures-only device the labels step aside; the card itself
// keeps its words, which are for someone else to read. The screen keeps
// nothing, so it has no ✕.
//
// The set-up page (setup() below) keeps what an adult chooses for this
// device: which cards show, the stop's name for "My stop", and the second
// line of "Please be patient with me." — none, unless the student wants one.

import { openCard } from "../show-card.js";
import { pictureImg } from "../pictures.js";
import {
  CARDS, DISCLOSURES, STOP_MAX, cardFor, cleanStop, readSettings, withCard, withDisclosure, withStop,
} from "./show-card-cards.js";

function make(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
}

export function mount(block, shell) {
  const list = make("ul", "sc-cards");
  list.setAttribute("role", "list"); // Safari stops calling a list without bullets a list
  const slots = CARDS.map((card) => {
    const slot = make("li", "sc-slot");
    const btn = make("button", "sc-card");
    btn.type = "button";
    btn.dataset.card = card.id;
    const img = pictureImg(card.picture, { alt: "" });
    if (img) btn.append(img);
    // the button's name — kept for screen readers on a pictures-only device
    btn.append(make("span", "sc-card-label pic-words", card.label));
    btn.addEventListener("click", () => openCard(cardFor(card.id, shell.settings)));
    slot.append(btn);
    list.append(slot);
    return { id: card.id, slot };
  });
  // only when an adult has switched every card off: better than a blank screen
  const none = make("p", "sc-none",
    "All the cards are switched off on this device. An adult can switch them on again on the set-up page.");
  block.append(list, none);

  function render() {
    const { hidden } = readSettings(shell.settings);
    for (const { id, slot } of slots) {
      const off = hidden.includes(id);
      slot.classList.toggle("is-off", off); // out of sight, still holding its place
      slot.inert = off; // and out of reach: no focus, not read out
    }
    const allOff = hidden.length === CARDS.length;
    list.hidden = allOff;
    none.hidden = !allOff;
  }
  render();
  // a change on the set-up page, its Put it back, or the page in another tab
  shell.onDeviceChange(render);

  return { show: render };
}

// ---- the set-up page's section (the contract is in ../tools.js) ----
// Built inside the set-up page, so it borrows that page's switch rows and
// notes (css/tools/setup.css); css/tools/show-card.css styles the few parts
// of its own. Every change is saved at once and offered back in the toast.

export function setup(section, shell) {
  const root = make("div", "sc-setup");
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
    const says = make("span", "sc-says"); // what the card says, word for word
    name.append(says);
    const state = make("span", "switch-state");
    state.setAttribute("aria-hidden", "true"); // aria-checked says it
    state.append(make("span", "switch-knob"), make("span", "switch-word"));
    sw.append(icon, name, state);
    sw.addEventListener("click", () => {
      const wasOn = !readSettings(shell.settings).hidden.includes(card.id);
      shell.saveSettings(withCard(shell.settings, card.id, !wasOn));
      shell.showToast(`${card.label}: ${wasOn ? "off" : "on"}`,
        () => shell.saveSettings(withCard(shell.settings, card.id, wasOn)));
    });
    const li = make("li");
    li.append(sw);
    list.append(li);
    return { id: card.id, li, sw, says };
  });
  const rowOf = (id) => rows.find((row) => row.id === id).li;

  // ---- My stop: the stop's name, a line under the card's words ----
  const stopBox = make("div", "sc-extra");
  const stopLabel = make("label", "sc-extra-label", "Stop name");
  const stop = make("input", "name-field sc-stop");
  stop.type = "text";
  stop.id = "sc-stop";
  stopLabel.htmlFor = stop.id;
  stop.maxLength = STOP_MAX;
  stop.autocomplete = "off";
  stop.spellcheck = false;
  stop.enterKeyHint = "done";
  stop.setAttribute("autocapitalize", "words");
  const stopNote = make("p", "setup-note",
    "The card shows it under its words: “My stop: …”. Leave it empty on a shared iPad.");
  stopNote.id = "sc-stop-note";
  stop.setAttribute("aria-describedby", stopNote.id);
  stopBox.append(stopLabel, stop, stopNote);
  rowOf("bell").append(stopBox);

  // Kept as it is typed, so nothing is lost if the app closes; offered back
  // once the box is left (or Enter), as one change from what it held before.
  let stopBefore = "";
  stop.addEventListener("focus", () => {
    stopBefore = readSettings(shell.settings).stop;
  });
  stop.addEventListener("input", () => shell.saveSettings(withStop(shell.settings, stop.value)));
  stop.addEventListener("change", () => {
    const now = readSettings(shell.settings).stop;
    stop.value = now; // without the stray spaces
    if (now === stopBefore) return;
    const was = stopBefore;
    stopBefore = now;
    shell.showToast(now ? `Stop name: ${now}` : "Stop name removed",
      () => shell.saveSettings(withStop(shell.settings, was)));
  });
  stop.addEventListener("keydown", (e) => {
    // Enter puts the keyboard away; the box keeps what was typed
    if (e.key === "Enter") {
      e.preventDefault();
      stop.blur();
    }
  });

  // ---- Please be patient with me: the second line, the student's choice ----
  const second = make("fieldset", "sc-extra");
  second.append(make("legend", "sc-extra-label", "Second line"));
  const secondNote = make("p", "setup-note", "Only if the student wants it.");
  secondNote.id = "sc-second-note";
  second.setAttribute("aria-describedby", secondNote.id);
  second.append(secondNote);
  const radios = DISCLOSURES.map((d) => {
    const choice = make("label", "sc-choice");
    const radio = make("input");
    radio.type = "radio";
    radio.name = "sc-disclose";
    radio.value = d.id;
    choice.append(radio, make("span", null, d.line || "No second line"));
    second.append(choice);
    return radio;
  });
  second.addEventListener("change", (e) => {
    const before = readSettings(shell.settings).disclose;
    const next = e.target.value;
    if (next === before) return;
    shell.saveSettings(withDisclosure(shell.settings, next));
    const line = DISCLOSURES.find((d) => d.id === next)?.line;
    shell.showToast(line ? `Second line: ${line}` : "No second line",
      () => shell.saveSettings(withDisclosure(shell.settings, before)));
  });
  rowOf("please").append(second);

  root.append(list);
  section.append(root);

  // everything follows the settings, including a Put it back
  function render() {
    const s = readSettings(shell.settings);
    for (const { id, sw, says } of rows) {
      const on = !s.hidden.includes(id);
      sw.setAttribute("aria-checked", String(on));
      sw.querySelector(".switch-knob").textContent = on ? "✔" : "";
      sw.querySelector(".switch-word").textContent = on ? "On" : "Off";
      const { words, lines } = cardFor(id, s);
      says.textContent = `“${[words, ...lines].join(" ")}”`;
    }
    // not in the middle of typing: "Bishan " is kept as "Bishan", and that
    // must not take the space away as it is typed
    if (cleanStop(stop.value) !== s.stop) stop.value = s.stop;
    for (const radio of radios) radio.checked = radio.value === s.disclose;
  }
  render();
  shell.onDeviceChange(render);

  return { show: render };
}
