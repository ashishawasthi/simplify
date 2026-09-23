// Now and next (#now-next), with its My day view: a picture schedule the
// student carries — what is happening now, what comes next, and the whole
// day. The contract it follows is in ../tools.js; the list's rules (and how
// it is saved, "simplify-now-next-v1") are in now-next-list.js.
//
// Two big switches at the top choose the view; the one chosen last is kept.
//
// Now and next: the Now card, big, in a blue frame, with ⏳ to open Wait; a
// big ✔ Done under it; the Next card, smaller, below. Done moves Next up to
// Now — a short slide up, none under reduced motion — and screen readers
// hear "Now: <words>". While the last card is Now, Next shows what comes
// after it: All done. After the last, one green All done card. With no
// cards at all there is one big ＋ Add (the picture picker): that card is Now.
//
// My day: the whole day as a strip, top to bottom. Cards done are small and
// grey, with ✔: a tap goes back to one (it is Now again; Put it back in the
// toast). Now is big and blue, the cards after it outlined. Every card not
// done yet has ✕ (take it away — Put it back), ↑ ↓ (one place up or down
// among the cards not done; one moved up past Now becomes Now) and Changed:
// the plan has changed, so the card shows the Changed picture and word, in
// both views — a change is said, not hidden. A tap on a card's picture picks
// another. ＋ Add at the end, up to 12 cards; then Remove all (Put it back).
//
// The header ✕ starts the day again — nothing done, the cards kept — with
// Put it back. It shows once something is done.
//
// A second tap that comes too soon after the first (a bounce, a double tap)
// is ignored, so one Done never skips a card and one ↑ never undoes itself.
// Nothing is sent anywhere, and nothing is logged.

import { menuIconSrc, pictureImg, pictureSrc } from "../pictures.js";
import { pickPicture } from "../picture-picker.js";
import * as day from "./now-next-list.js";

const DONE_QUIET_MS = 600; // a second Done sooner than this is a bounce, not the next card
const TAP_QUIET_MS = 450; // the same for the buttons in My day
const SLOT_WORDS = { now: "Now", next: "Next", later: "Later" }; // the picker's title

function make(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
}

function button(className, label) {
  const btn = make("button", className);
  btn.type = "button";
  if (label) btn.setAttribute("aria-label", label);
  return btn;
}

// a sign the words beside it already say (✔, ＋, ✕): not read out twice
function sign(text, className) {
  const span = make("span", className, text);
  span.setAttribute("aria-hidden", "true");
  return span;
}

// A picture in its box. The same <img> stays while the picture does, so
// nothing blinks when the cards around it change.
function setPicture(box, id, alt = "") {
  const src = id ? pictureSrc(id) : null;
  box.hidden = !src;
  if (!src) {
    box.replaceChildren();
    return;
  }
  let img = box.firstElementChild;
  if (!img || img.getAttribute("src") !== src) {
    img = pictureImg(id, { alt });
    box.replaceChildren(img);
  }
  img.alt = alt;
}

// A card's words. With a picture, the picture says them too: on a
// pictures-only device they step aside (still read out). Without one they
// are all the card has, so they stay. Long words ("Speech therapy with Ms
// Tan") are set a size smaller, so they wrap between words, not inside one.
function setWords(el, card) {
  el.textContent = card.words;
  el.hidden = !card.words;
  el.classList.toggle("pic-words", !!card.picture);
  const longest = Math.max(0, ...card.words.split(" ").map((w) => w.length));
  el.classList.toggle("is-long", card.words.length > 18 || longest > 11);
}

// The Changed mark: its picture, and the word beside it
function changedMark(className) {
  const mark = make("span", className);
  mark.append(pictureImg("changed", { alt: "" }), make("span", "pic-words", "Changed"));
  mark.hidden = true;
  return mark;
}

const usable = (el) => !!el && el.isConnected && !el.disabled && el.getClientRects().length > 0;

// what screen readers hear of a card: its words, and that it changed
const describe = (card) => `${day.label(card)}${card.changed ? ". Changed" : ""}`;

export function mount(block, shell) {
  let state = day.clean(shell.load());
  let doneQuietUntil = 0;
  let tapQuietUntil = 0;
  let sayTimer = null;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

  // ---------- the two views' switches ----------
  const views = make("div", "nn-views");
  views.setAttribute("role", "group");
  views.setAttribute("aria-label", "View");
  const viewButtons = new Map();
  for (const [view, words] of [["now-next", "Now and next"], ["my-day", "My day"]]) {
    const btn = button("nn-view");
    // the menu's own pictures for the tool and for its group
    const icon = make("img");
    icon.alt = "";
    icon.width = 128;
    icon.height = 128;
    icon.draggable = false;
    icon.src = menuIconSrc(view);
    btn.append(icon, make("span", "pic-words", words));
    btn.addEventListener("click", () => switchTo(view));
    viewButtons.set(view, btn);
    views.append(btn);
  }

  // ---------- Now and next ----------
  const nowNext = make("div", "nn-now-next");

  const addFirst = button("nn-add-first", "Add a card");
  addFirst.append(sign("＋", "nn-plus"), make("span", "pic-words", "Add"));
  addFirst.addEventListener("click", () => addCard());

  const nowCard = make("div", "nn-now");
  nowCard.tabIndex = -1; // focus lands here when the card under a finger has gone
  const nowTop = make("div", "nn-top");
  const nowBadge = changedMark("nn-badge");
  const waitBtn = button("round-btn nn-wait", "Wait: open the timer");
  waitBtn.append(pictureImg("wait", { alt: "" }));
  waitBtn.addEventListener("click", () => shell.go("wait"));
  nowTop.append(make("span", "nn-tag pic-words", "Now"), nowBadge, waitBtn);
  const nowPic = make("div", "nn-pic");
  const nowWords = make("p", "nn-words");
  nowCard.append(nowTop, nowPic, nowWords);

  const doneBtn = button("nn-done");
  doneBtn.append(sign("✔"), make("span", "pic-words", "Done"));
  doneBtn.addEventListener("click", markDone);

  const nextEl = make("div", "nn-next");
  const nextPic = make("div", "nn-pic");
  const nextText = make("div", "nn-next-text");
  const nextTop = make("div", "nn-next-top");
  const nextBadge = changedMark("nn-badge");
  nextTop.append(make("span", "nn-tag pic-words", "Next"), nextBadge);
  const nextWords = make("p", "nn-words");
  nextText.append(nextTop, nextWords);
  nextEl.append(nextPic, nextText);

  const allDoneCard = make("div", "nn-all-done");
  allDoneCard.tabIndex = -1;
  const allDonePic = make("div", "nn-pic");
  allDonePic.append(pictureImg("all-done", { alt: "" }));
  allDoneCard.append(allDonePic, make("p", "nn-words pic-words", "All done"));

  nowNext.append(addFirst, nowCard, doneBtn, nextEl, allDoneCard);

  // ---------- My day ----------
  const myDay = make("div", "nn-my-day");
  const strip = make("ol", "nn-strip");
  strip.setAttribute("aria-label", "My day");
  const addBtn = button("add-btn nn-add", "Add a card");
  addBtn.append(sign("＋", "nn-add-sign"), make("span", "pic-words", "Add"));
  addBtn.addEventListener("click", () => tap(addCard));
  // no room for more: said quietly, never as an error
  const full = make("p", "nn-full", `Full: ${day.MAX_CARDS} cards`);
  const removeAllBtn = button("nn-remove-all", "Remove all the cards");
  removeAllBtn.append(sign("✕"), " Remove all");
  removeAllBtn.addEventListener("click", () => tap(removeAll));
  myDay.append(strip, addBtn, full, removeAllBtn);

  // Done's "Now: …" for screen readers; toasts speak for themselves
  const status = make("p", "visually-hidden");
  status.setAttribute("role", "status");

  block.append(views, nowNext, myDay, status);

  // One <li> per card, kept by the card's id: it moves with the card, so a
  // button keeps its place under focus, and its picture never reloads.
  const items = new Map();

  function stripItem(id) {
    const li = make("li", "nn-item");

    // a card done: the whole row is one button — back to this card
    const back = button("nn-back");
    const backPic = make("span", "nn-pic");
    const backWords = make("span", "nn-words");
    const backMark = make("span", "nn-mark");
    backMark.append(pictureImg("changed", { alt: "" }));
    back.append(sign("✔", "nn-tick"), backPic, backWords, backMark);
    back.addEventListener("click", () => tap(() => goBack(id)));

    // a card still to do: the card (tap: another picture), and its buttons
    const live = make("div", "nn-live");
    const tag = make("span", "nn-tag pic-words", "Now");
    const face = button("nn-face");
    const facePic = make("span", "nn-pic");
    const faceWords = make("span", "nn-words");
    face.append(facePic, faceWords);
    face.addEventListener("click", () => tap(() => changeCard(id)));
    const remove = button("round-btn nn-remove");
    remove.append(sign("✕"));
    remove.addEventListener("click", () => tap(() => removeCard(id)));
    const controls = make("div", "nn-controls");
    const up = button("round-btn nn-up");
    up.append(sign("↑"));
    up.addEventListener("click", () => tap(() => moveCard(id, -1)));
    const down = button("round-btn nn-down");
    down.append(sign("↓"));
    down.addEventListener("click", () => tap(() => moveCard(id, 1)));
    const changed = button("nn-toggle");
    changed.append(pictureImg("changed", { alt: "" }), make("span", "pic-words", "Changed"));
    changed.addEventListener("click", () => tap(() => commit(day.toggleChanged(state, id))));
    controls.append(up, down, changed);
    live.append(tag, face, remove, controls);

    li.append(back, live);
    return { li, back, backPic, backWords, backMark, live, tag, face, facePic, faceWords, remove, up, down, changed };
  }

  function updateItem(it, card, index) {
    const where = day.slot(state, index); // done, now, next or later
    const name = day.label(card);
    it.li.classList.toggle("is-done", where === "done");
    it.li.classList.toggle("is-now", where === "now");
    it.li.classList.toggle("is-later", where === "next" || where === "later");
    it.back.hidden = where !== "done";
    it.live.hidden = where === "done";
    if (where === "done") {
      setPicture(it.backPic, card.picture);
      setWords(it.backWords, card);
      it.backMark.hidden = !card.changed;
      it.back.setAttribute("aria-label", `Done: ${name}${card.changed ? ", changed" : ""}. Go back to it`);
      return;
    }
    it.tag.hidden = where !== "now";
    setPicture(it.facePic, card.picture);
    setWords(it.faceWords, card);
    it.face.setAttribute("aria-label", `Change: ${name}`);
    it.remove.setAttribute("aria-label", `Take away: ${name}`);
    it.up.setAttribute("aria-label", `Move up: ${name}`);
    it.down.setAttribute("aria-label", `Move down: ${name}`);
    it.changed.setAttribute("aria-label", `Changed: ${name}`);
    it.changed.setAttribute("aria-pressed", String(card.changed));
    // up as far as Now, never in among the cards done; down to the end
    it.up.disabled = index <= state.done;
    it.down.disabled = index >= state.cards.length - 1;
  }

  // ---------- drawing the state ----------

  function renderViews() {
    for (const [view, btn] of viewButtons) btn.setAttribute("aria-pressed", String(state.view === view));
    nowNext.hidden = state.view !== "now-next";
    myDay.hidden = state.view !== "my-day";
  }

  function renderNowNext() {
    const now = day.current(state);
    const next = day.nextCard(state);
    addFirst.hidden = state.cards.length > 0;
    nowCard.hidden = !now;
    doneBtn.hidden = !now;
    nextEl.hidden = !now;
    allDoneCard.hidden = !day.allDone(state);
    if (!now) return;

    const name = day.label(now);
    setPicture(nowPic, now.picture, now.words ? "" : name);
    setWords(nowWords, now);
    nowBadge.hidden = !now.changed;
    doneBtn.setAttribute("aria-label", `Done: ${name}`);

    nextEl.classList.toggle("is-end", !next);
    if (next) {
      setPicture(nextPic, next.picture, next.words ? "" : day.label(next));
      setWords(nextWords, next);
      nextBadge.hidden = !next.changed;
    } else {
      // after the last card: nothing more to do
      setPicture(nextPic, "all-done");
      setWords(nextWords, { picture: "all-done", words: "All done" });
      nextBadge.hidden = true;
    }
  }

  function renderStrip() {
    const ids = new Set(state.cards.map((c) => c.id));
    for (const [id, it] of items) {
      if (!ids.has(id)) {
        it.li.remove();
        items.delete(id);
      }
    }
    state.cards.forEach((card, i) => {
      let it = items.get(card.id);
      if (!it) {
        it = stripItem(card.id);
        items.set(card.id, it);
      }
      updateItem(it, card, i);
      if (strip.children[i] !== it.li) strip.insertBefore(it.li, strip.children[i] ?? null);
    });
    const room = day.canAdd(state);
    addBtn.hidden = !room;
    full.hidden = room;
    removeAllBtn.hidden = state.cards.length === 0;
  }

  function render() {
    const focused = document.activeElement;
    renderViews();
    renderNowNext();
    renderStrip();
    shell.setClearAll(state.done > 0);
    // a card that moved in the strip took its focused button out and back in
    if (focused !== document.activeElement && block.contains(focused) && usable(focused)) {
      focused.focus({ preventScroll: true });
    }
  }

  // every change goes through here: saved, drawn, and the ✕ kept right
  function commit(next) {
    if (next === state) return false;
    state = next;
    shell.save(state);
    render();
    return true;
  }

  // a polite line for screen readers, emptied first so the same words twice are read twice
  function say(text) {
    clearTimeout(sayTimer);
    status.textContent = "";
    sayTimer = setTimeout(() => {
      status.textContent = text;
    }, 100);
  }

  function tap(action) {
    const now = performance.now();
    if (now < tapQuietUntil) return;
    tapQuietUntil = now + TAP_QUIET_MS;
    action();
  }

  // ---------- what the buttons do ----------

  function switchTo(view) {
    if (!commit(day.setView(state, view))) return;
    if (view !== "my-day") return;
    // cards done above it can push Now off the screen: bring it into sight
    const now = day.current(state);
    const li = now && items.get(now.id)?.li;
    if (!li) return;
    const box = li.getBoundingClientRect();
    if (box.top < 0 || box.bottom > innerHeight) {
      li.scrollIntoView({ block: "nearest", behavior: reduceMotion.matches ? "auto" : "smooth" });
    }
  }

  function markDone() {
    const now = performance.now();
    if (now < doneQuietUntil) return;
    doneQuietUntil = now + DONE_QUIET_MS;
    if (!commit(day.markDone(state))) return;
    slideUp();
    if (day.allDone(state)) {
      // Done has gone from under the finger: focus goes to what took its place
      allDoneCard.focus({ preventScroll: true });
    } else {
      say(`Now: ${describe(day.current(state))}`);
    }
  }

  // Next moving up into Now: a short slide, so it can be seen where it went
  function slideUp() {
    if (reduceMotion.matches || typeof nowCard.animate !== "function") return;
    const timing = { duration: 280, easing: "cubic-bezier(0.2, 0.7, 0.3, 1)" };
    const arrived = day.allDone(state) ? allDoneCard : nowCard;
    arrived.animate([{ transform: "translateY(40px)", opacity: 0.3 }, { transform: "none", opacity: 1 }], timing);
    if (!nextEl.hidden) {
      nextEl.animate([{ transform: "translateY(24px)", opacity: 0 }, { transform: "none", opacity: 1 }],
        { ...timing, delay: 80, fill: "backwards" });
    }
  }

  async function addCard() {
    if (!day.canAdd(state)) return;
    const first = state.cards.length === 0;
    const picked = await pickPicture({ title: SLOT_WORDS[day.slotOfNew(state)] });
    if (!picked || !commit(day.add(state, picked))) return;
    const card = state.cards.at(-1);
    if (state.view === "now-next") {
      // ＋ Add has made way for the card itself
      if (first) nowCard.focus({ preventScroll: true });
      return;
    }
    // the day is full now, and ＋ Add has gone from under the focus (which
    // falls back to the page itself): the new card takes it
    const focus = document.activeElement;
    if (addBtn.hidden && (!focus || focus === document.body || !usable(focus))) items.get(card.id)?.face.focus();
    say(`Added: ${describe(card)}`);
  }

  async function changeCard(id) {
    const i = day.indexOf(state, id);
    if (i < state.done) return; // gone, or done (a done card goes back instead)
    const { picture, words } = state.cards[i];
    const picked = await pickPicture({ title: SLOT_WORDS[day.slot(state, i)], current: { picture, words } });
    if (picked) commit(day.change(state, id, picked));
  }

  function removeCard(id) {
    const i = day.indexOf(state, id);
    if (i === -1) return;
    const card = state.cards[i];
    if (!commit(day.remove(state, id))) return;
    // focus goes to the card that took its place (not its ✕: one tap too
    // many would take that away too), or to ＋ Add
    const after = state.cards[i] && items.get(state.cards[i].id);
    const to = [after?.face, addBtn, removeAllBtn].find(usable);
    to?.focus();
    shell.showToast(`Took away ${day.label(card)}`, () => commit(day.putBack(state, card, i)));
  }

  function moveCard(id, delta) {
    const nowBefore = day.current(state);
    if (!commit(day.move(state, id, delta))) return;
    const it = items.get(id);
    // the button stays with its card; at the end of the line, its partner
    const [own, other] = delta < 0 ? [it.up, it.down] : [it.down, it.up];
    (usable(own) ? own : other).focus();
    const card = state.cards[day.indexOf(state, id)];
    const now = day.current(state);
    say(`${delta < 0 ? "Moved up" : "Moved down"}: ${day.label(card)}` +
      (now.id !== nowBefore.id ? `. Now: ${describe(now)}` : ""));
  }

  function goBack(id) {
    const before = state.done;
    if (!commit(day.backTo(state, id))) return;
    items.get(id)?.face.focus({ preventScroll: true });
    shell.showToast(`Back to ${day.label(day.current(state))}`, () => commit(day.setDone(state, before)));
  }

  function removeAll() {
    const before = state;
    if (!commit(day.removeAll(state))) return;
    addBtn.focus({ preventScroll: true });
    const text = before.cards.length === 1 ? day.label(before.cards[0]) : `${before.cards.length} cards`;
    shell.showToast(`Took away ${text}`, () => commit(day.restoreAll(state, before)));
  }

  render();

  return {
    clearLabel: "Start the day again: nothing done, the cards stay",
    show() {
      render();
    },
    hide() {
      clearTimeout(sayTimer);
      status.textContent = "";
    },
    // the header ✕: start the day again — the cards stay
    clearAll() {
      const before = state.done;
      if (commit(day.restart(state))) {
        shell.showToast("Back to the start", () => commit(day.setDone(state, before)));
      }
    },
    hasAnything: () => state.done > 0,
  };
}
