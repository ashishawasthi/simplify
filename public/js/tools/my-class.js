// My class — the page this device's class coach published last, one screen
// at a time: big Back and Next at the bottom, always in the same place, and
// "All done" on the last screen, which returns to where the learner came
// from. The page is the coach's markdown (class-markdown.js) with pictures
// and videos from the class's shelf; class-data.js reads it and keeps a copy
// on the device, so it opens offline too. docs/learner/my-class.md.
//
// Also the tile on the menu: "My class" over the class's name. app.js shows
// it only once the set-up page has given this device a class
// (class-setup.js).
//
// A new page never replaces the one being read: the reader keeps what it
// opened with until the next time it opens — unless the learner has not yet
// touched it and it opened moments ago (the page it had just asked for), or
// it had nothing to show. Nothing is an error: no class yet, nothing
// published yet, or no internet each have a calm line.
//
// Saved (shell.save, "simplify-my-class-v1"): { page, screen } — the screen
// being read, so Back to here or a reload shows the same one.

import { parseClassMarkdown, renderScreen } from "../class-markdown.js";
import {
  savedClass, refreshClass, loadClassMedia, publishedWords, forgetClassIfNone,
} from "../class-data.js";
import { menuIconSrc } from "../pictures.js";

const JUST_OPENED_MS = 10 * 1000; // a new page may replace one opened this recently, if untouched
const DOUBLE_TAP_MS = 450; // Next again this soon after the screen changed is the same tap twice
const MAX_DOTS = 12; // more screens than this: "3 / 20" instead of dots

function make(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
}

function hidden(el) {
  el.setAttribute("aria-hidden", "true");
  return el;
}

function schoolPicture(className) {
  const img = make("img", className);
  img.alt = "";
  img.width = 128;
  img.height = 128;
  img.draggable = false;
  img.src = menuIconSrc("my-class");
  return img;
}

export function mount(block, shell) {
  // ---------- the tile on the menu ----------
  const tileLink = document.querySelector('#menu li[data-tool="my-class"] .tool-link');
  const tileName = make("span", "pic-words my-class-tile-name");
  const tileWords = tileLink?.querySelector(".pic-words");
  if (tileWords) {
    const text = make("span", "my-class-tile-text");
    tileWords.replaceWith(text);
    text.append(tileWords, tileName);
  }
  const renderTile = (device) => {
    tileName.textContent = device.className ?? "";
    tileName.hidden = !device.className;
  };

  // ---------- the reader ----------
  const meta = make("p", "mc-meta");
  // a new screen takes the focus, so a screen reader starts reading it: its
  // name says which screen it is
  const content = make("div", "mc-screen class-page");
  content.tabIndex = -1;
  content.setAttribute("role", "region");

  const note = make("div", "mc-note"); // no class, or nothing yet
  const noteWords = make("p", "mc-note-words");
  const noteMore = make("p", "mc-note-more");
  note.append(hidden(schoolPicture("mc-note-picture")), noteWords, noteMore);

  const nav = make("nav", "mc-nav");
  nav.setAttribute("aria-label", "Screens");
  const back = make("button", "mc-btn mc-back");
  back.type = "button";
  back.append(hidden(make("span", "mc-btn-icon", "\u25C0\uFE0E")), make("span", "pic-words", "Back"));
  // where in the page: a dot per screen, or "3 / 20" for a long page
  const where = hidden(make("div", "mc-where"));
  const dots = make("span", "mc-dots");
  const count = make("span", "mc-count");
  where.append(dots, count);
  const next = make("button", "mc-btn mc-next");
  next.type = "button";
  const nextIcon = hidden(make("span", "mc-btn-icon"));
  const nextWords = make("span", "pic-words");
  next.append(nextWords, nextIcon);
  nav.append(back, where, next);

  block.append(meta, note, content, nav);

  // ---------- what is on show ----------
  let shown = null; // { code, cls, screens, key } — the page as the reader opened it
  let media = null; // loadClassMedia() for it: { retry(), release() }
  const files = new Map(); // "picture/<id>" → { state, url }
  const slotBlocks = new WeakMap(); // a picture's or video's slot → its block
  let index = 0; // the screen on show
  let onScreen = false;
  let reopen = true; // left since it was shown: the next show() opens it afresh
  let openedAt = 0;
  let touched = false;
  let changedAt = -Infinity; // when the screen last changed

  const pageKey = (cls) => (cls?.latest ? `${cls.code}|${cls.latest.pageId}|${cls.latest.publishedAt}` : "");

  // what the device has saved now becomes what the reader shows
  function takePage() {
    media?.release();
    media = null;
    files.clear();
    const code = shell.device.classCode;
    const cls = code ? savedClass() : null;
    shown = { code, cls, screens: parseClassMarkdown(cls?.latest?.markdown ?? "").screens, key: pageKey(cls) };
    if (cls?.latest) {
      media = loadClassMedia(cls, (item, result) => {
        files.set(`${item.kind}/${item.id}`, result);
        for (const slot of content.querySelectorAll(`[data-file="${item.kind}/${item.id}"]`)) fillFile(slot);
      });
    }
  }

  // one block of the screen in its own slot; a picture or video waits in a
  // quiet frame until its file is ready — and says so if it needs the internet
  function blockSlot(blockData) {
    const slot = make("div", "mc-block");
    if (blockData.type === "picture" || blockData.type === "video") {
      slot.dataset.file = `${blockData.type}/${blockData.id}`;
      slotBlocks.set(slot, blockData);
      fillFile(slot);
    } else {
      slot.append(renderScreen([blockData]));
    }
    return slot;
  }

  function fillFile(slot) {
    const file = files.get(slot.dataset.file);
    const blockData = slotBlocks.get(slot);
    slot.classList.remove("is-waiting", "is-offline");
    slot.removeAttribute("aria-busy");
    slot.hidden = false;
    if (file?.state === "ready") {
      slot.replaceChildren(renderScreen([blockData], { mediaUrl: () => file.url }));
    } else if (file?.state === "gone") {
      slot.replaceChildren(); // not on the class's shelf any more: nothing to show
      slot.hidden = true;
    } else {
      const frame = make("div", `mc-file-frame is-${blockData.type}`);
      frame.setAttribute("role", "img");
      frame.setAttribute("aria-label", blockData.words || (blockData.type === "video" ? "Video" : "Picture"));
      if (file?.state === "missing") {
        slot.classList.add("is-offline");
        frame.append(make("span", "mc-file-note", "Needs the internet"));
      } else {
        slot.classList.add("is-waiting");
        slot.setAttribute("aria-busy", "true");
      }
      slot.replaceChildren(frame);
    }
    updateBusy();
  }

  function render({ focus = false } = {}) {
    const device = shell.device;
    const screens = shown?.screens ?? [];
    const cls = shown?.cls;

    const name = cls?.name || device.className || "";
    const when = publishedWords(cls?.latest?.publishedAt);
    meta.replaceChildren();
    if (name) meta.append(make("span", "mc-class-name", name));
    if (name && when && screens.length) meta.append(" · ");
    if (when && screens.length) meta.append(make("span", "mc-updated", `Updated ${when}`));
    meta.hidden = !meta.childNodes.length;

    const nothing = !device.classCode || !screens.length;
    note.hidden = !nothing;
    content.hidden = nothing;
    nav.hidden = nothing;
    if (!device.classCode) {
      noteWords.textContent = "No class on this device yet";
      noteMore.textContent = "An adult can add the class code on the set-up page.";
      noteMore.hidden = false;
    } else if (!screens.length) {
      noteWords.textContent = "Nothing from your coach yet";
      noteMore.hidden = true;
    }
    if (nothing) {
      content.replaceChildren();
      updateBusy();
      return;
    }

    index = Math.min(Math.max(index, 0), screens.length - 1);
    content.replaceChildren(...screens[index].map(blockSlot));
    const last = index === screens.length - 1;
    back.disabled = index === 0;
    nextWords.textContent = last ? "All done" : "Next";
    nextIcon.textContent = last ? "✔" : "\u25B6\uFE0E"; // ▶ as a shape, not an emoji
    next.classList.toggle("is-done", last);
    const total = screens.length;
    const many = total > MAX_DOTS;
    dots.replaceChildren(...(total > 1 && !many
      ? screens.map((_, i) => make("span", i === index ? "mc-dot is-here" : "mc-dot"))
      : []));
    count.textContent = many ? `${index + 1} / ${total}` : "";
    content.setAttribute("aria-label", `Screen ${index + 1} of ${total}`);
    updateBusy();
    shell.save({ page: shown.key, screen: index });
    if (focus) content.focus({ preventScroll: true });
  }

  function go(step) {
    index += step;
    changedAt = performance.now();
    render({ focus: true });
    window.scrollTo(0, 0);
  }

  back.addEventListener("click", () => {
    if (index > 0) go(-1);
  });
  next.addEventListener("click", () => {
    if (performance.now() - changedAt < DOUBLE_TAP_MS) return;
    const screens = shown?.screens ?? [];
    if (index < screens.length - 1) go(1);
    else shell.back(); // All done: back where the learner came from
  });

  // A video playing or a YouTube player open: an update waits (update.js)
  let busy = false;
  function updateBusy() {
    const playing = [...content.querySelectorAll("video")].some((v) => !v.paused && !v.ended);
    const now = onScreen && (playing || !!content.querySelector("iframe"));
    if (now !== busy) shell.setBusy((busy = now));
  }
  for (const type of ["play", "pause", "ended"]) content.addEventListener(type, updateBusy, true);
  content.addEventListener("click", () => setTimeout(updateBusy), true);

  // Touching the reader means someone is reading it
  for (const type of ["pointerdown", "keydown", "wheel"]) {
    block.addEventListener(type, () => { touched = true; }, { capture: true, passive: true });
  }

  // A page that arrived while the reader is open: shown now only if nobody
  // is reading yet — otherwise the next time My class opens.
  function arrived({ changed } = {}) {
    if (!changed || !onScreen) return;
    const reading = shown?.screens.length && (touched || performance.now() - openedAt > JUST_OPENED_MS);
    if (reading) return;
    takePage();
    index = 0;
    render();
  }

  // The internet is back: fetch what the page is still missing
  addEventListener("online", () => media?.retry());

  // Refresh when the menu shows, and when the app comes back to the front
  // (class-data.js keeps it to every 10 minutes)
  const refresh = () => refreshClass().then(arrived, () => {});
  shell.onScreenChange((id) => {
    if (id === null) refresh();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    // back in front — a class iPad picked up in the morning: nobody is
    // reading the page on screen yet
    openedAt = performance.now();
    touched = false;
    refresh();
  });

  shell.onDeviceChange((device) => {
    renderTile(device);
    // another class (or none): whatever is on show now is not its page
    if (device.classCode !== shown?.code) {
      reopen = true;
      if (onScreen) {
        takePage();
        index = 0;
        reopen = false;
        render();
      }
    }
  });
  renderTile(shell.device);
  if (!shell.device.classCode) forgetClassIfNone(); // a class left at the last visit

  return {
    show(params, { fresh }) {
      onScreen = true;
      if (fresh || reopen || !shown || shown.code !== shell.device.classCode) {
        takePage();
        const saved = shell.load();
        // Back, Forward or a reload come back to the screen that was on show
        index = !fresh && saved?.page === shown.key && Number.isInteger(saved.screen) ? saved.screen : 0;
      }
      reopen = false;
      openedAt = performance.now();
      touched = false;
      changedAt = -Infinity; // the first tap counts, however soon after the app opened
      render();
      if (shell.device.classCode) refreshClass({ force: true }).then(arrived, () => {});
    },
    hide() {
      onScreen = false;
      reopen = true;
      // stop anything playing: the next visit builds the screen again
      content.replaceChildren();
      updateBusy();
    },
  };
}
