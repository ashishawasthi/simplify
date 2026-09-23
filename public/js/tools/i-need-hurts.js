// Hurts: two questions, one per screen, before the card. "Where?" — tap the
// body where it hurts, or My back — then "How much?" — a little, a lot, very
// bad, as three growing circles. Then the tool shows the card: "It hurts
// here: tummy. A lot." over a drawing with the tummy in red.
//
// A full-screen sheet over I need, in the same place as the picture
// picker's (a <dialog>), so the phone's Back button or Esc simply closes it,
// back to the grid, and no step of it lands in the app's history. Its first
// button is in the same place on both screens: ✕ on "Where?" (close), ◀ on
// "How much?" (back to "Where?").
//
//   mountHurts(block, { onAnswer })  builds it inside block (hidden until
//       opened). onAnswer({ region, size }) runs once the sheet has closed
//       with an answer: region an id from REGIONS, size one from SIZES.
//   → { open(), close() }  close(): nothing chosen, nothing said
//
// Every region is a real <button> with its name, laid over the drawing
// where that part is (SPOTS in i-need-body.js), so a screen reader lists
// them head to foot and a keyboard reaches each one; pressing one lights its
// part up. A finger that taps twice can't answer both questions: for a
// moment after a screen changes, taps on the sheet are let go.

import { pictureImg } from "../pictures.js";
import { REGIONS, SIZES, regionById } from "./i-need-cards.js";
import { FACE_REGIONS, SPOTS, VIEW, bodyDrawing } from "./i-need-body.js";

const QUIET_MS = 400; // longer than the gap between the two taps of a double tap

function make(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
}

function roundButton(glyph, label, className) {
  const btn = make("button", `round-btn ${className}`);
  btn.type = "button";
  btn.setAttribute("aria-label", label);
  const icon = make("span", null, glyph);
  icon.setAttribute("aria-hidden", "true");
  btn.append(icon);
  return btn;
}

const pct = (n, of) => `${(n / of) * 100}%`;

export function mountHurts(block, { onAnswer }) {
  const dialog = make("dialog", "picker hurts-sheet");
  dialog.setAttribute("aria-labelledby", "need-hurts-title");

  // ---- the top: ✕ or ◀, and the question ----
  const head = make("header", "hurts-head");
  const close = roundButton("✕", "Close: back to I need", "hurts-close");
  const back = roundButton("◀", "Back: where it hurts", "hurts-back");
  const title = make("h2", "hurts-title");
  title.id = "need-hurts-title";
  title.tabIndex = -1; // a screen reader lands here when the question changes
  const titlePicture = pictureImg("hurts", { alt: "" });
  const question = make("span", "pic-words");
  if (titlePicture) title.append(titlePicture);
  title.append(question);
  head.append(close, back, title);

  // ---- Where? ----
  const where = make("div", "hurts-where");
  const fitBox = make("div", "hurts-fit"); // all the room the body can have
  const map = make("div", "hurts-map"); // the body, sized to fit (fit() below)
  const figure = bodyDrawing({ view: "front" });
  map.append(figure);
  const spots = SPOTS.map((s) => {
    const btn = make("button", "hurts-spot");
    btn.type = "button";
    btn.dataset.region = s.region;
    btn.setAttribute("aria-label", regionById(s.region).name);
    // one button per region for screen readers and the keyboard; the same
    // region's other side is for fingers only
    if (!s.main) {
      btn.setAttribute("aria-hidden", "true");
      btn.tabIndex = -1;
    }
    Object.assign(btn.style, {
      left: pct(s.x, VIEW.width),
      top: pct(s.y, VIEW.height),
      width: pct(s.w, VIEW.width),
      height: pct(s.h, VIEW.height),
    });
    map.append(btn);
    return btn;
  });
  // screen readers read the regions head to foot, then My back
  const order = REGIONS.map((r) => r.id);
  spots.sort((a, b) => order.indexOf(a.dataset.region) - order.indexOf(b.dataset.region));
  map.append(...spots);
  fitBox.append(map);

  const myBack = make("button", "hurts-myback");
  myBack.type = "button";
  myBack.dataset.region = "back";
  const backFigure = bodyDrawing({ view: "back", upper: true, line: 6 });
  myBack.append(backFigure, make("span", "pic-words", regionById("back").name));
  where.append(fitBox, myBack);

  // ---- How much? ----
  const much = make("div", "hurts-much");
  const chosen = make("div", "hurts-chosen");
  const chosenPicture = make("div", "hurts-chosen-picture");
  const chosenName = make("p", "hurts-chosen-name pic-words");
  chosen.append(chosenPicture, chosenName);
  const sizes = make("div", "hurts-sizes");
  for (const s of SIZES) {
    const btn = make("button", "hurts-size");
    btn.type = "button";
    btn.dataset.size = s.id;
    const dotBox = make("span", "hurts-dot-box");
    dotBox.setAttribute("aria-hidden", "true");
    dotBox.append(make("span", `hurts-dot is-${s.id}`));
    btn.append(dotBox, make("span", "hurts-size-words pic-words", s.name));
    btn.addEventListener("click", () => answer(s.id));
    sizes.append(btn);
  }
  much.append(chosen, sizes);

  dialog.append(head, where, much);
  block.append(dialog);

  // ---- state ----
  let region = null; // the answer to "Where?"
  let quietUntil = 0;

  // taps that arrive just after the screen changed were aimed at the last one
  dialog.addEventListener("click", (e) => {
    if (performance.now() < quietUntil) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, { capture: true });
  const hush = () => {
    quietUntil = performance.now() + QUIET_MS;
  };

  function showStep(step) {
    const asking = step === "where";
    where.hidden = !asking;
    close.hidden = !asking;
    much.hidden = asking;
    back.hidden = asking;
    question.textContent = asking ? "Where?" : "How much?";
    for (const btn of [...spots, myBack]) light(btn.dataset.region, false);
    hush();
  }

  // ---- lighting a region up under a finger, a mouse or the keyboard ----
  function light(id, on) {
    const drawing = id === "back" ? backFigure : figure;
    for (const el of drawing.querySelectorAll(`[data-region="${id}"]`)) el.classList.toggle("is-lit", on);
  }
  for (const btn of [...spots, myBack]) {
    const id = btn.dataset.region;
    btn.addEventListener("pointerdown", () => light(id, true));
    btn.addEventListener("pointerenter", (e) => {
      if (e.pointerType === "mouse") light(id, true);
    });
    for (const type of ["pointerup", "pointercancel", "pointerleave"]) {
      btn.addEventListener(type, () => {
        if (document.activeElement !== btn || !btn.matches(":focus-visible")) light(id, false);
      });
    }
    btn.addEventListener("focus", () => {
      if (btn.matches(":focus-visible")) light(id, true);
    });
    btn.addEventListener("blur", () => light(id, false));
    btn.addEventListener("click", () => choose(id));
  }

  function choose(id) {
    region = id;
    const picture = bodyDrawing({
      view: id === "back" ? "back" : "front",
      region: id,
      closeUp: FACE_REGIONS.includes(id),
      line: 4,
    });
    chosenPicture.replaceChildren(picture);
    chosenName.textContent = regionById(id).name;
    showStep("much");
    title.focus({ preventScroll: true });
  }

  function answer(size) {
    const given = { region, size };
    finish();
    onAnswer(given);
  }

  back.addEventListener("click", () => {
    region = null;
    showStep("where");
    title.focus({ preventScroll: true });
  });
  close.addEventListener("click", () => finish());
  // Esc, or the phone's Back button, close it too; so does leaving the screen
  dialog.addEventListener("close", () => {
    region = null;
  });

  function finish() {
    region = null;
    if (dialog.open) dialog.close();
  }

  // ---- the body's size: as big as the room allows, whole ----
  function fit() {
    if (!dialog.open || where.hidden) return;
    const width = fitBox.clientWidth;
    const height = fitBox.clientHeight;
    if (!width || !height) return;
    const scale = Math.min(width / VIEW.width, height / VIEW.height);
    map.style.width = `${Math.floor(VIEW.width * scale)}px`;
    map.style.height = `${Math.floor(VIEW.height * scale)}px`;
  }
  if ("ResizeObserver" in window) new ResizeObserver(fit).observe(fitBox);
  else addEventListener("resize", fit);

  return {
    open() {
      region = null;
      showStep("where");
      if (!dialog.open) dialog.showModal();
      dialog.scrollTop = 0; // a dialog keeps its scroll from the last opening
      // the question first, for screen readers — not the ✕, which would then
      // sit ringed as if it were the thing to press
      title.focus({ preventScroll: true });
      fit();
    },
    close: finish,
  };
}
