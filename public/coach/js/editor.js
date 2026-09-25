// The page editor: the class's pages (new, open, delete with Undo), the
// page's name, and the markdown box with its toolbar — saved as the coach
// types, a second after they stop. Toolbar changes go in as typing does
// (execCommand "insertText"), so the browser's own undo still works.
//
// mountEditor(ws, { onPicture, onVideo, onYoutube }) → the editor's api:
//   element                  what to put on the screen
//   pagesBar                 the pages, for the top of the screen
//   pageId                   the page open now (null before there is one)
//   getText()                { title, markdown } as they are now
//   setDraft({ title, markdown })   replace them (the AI helper's draft)
//   insert(block)            a picture, video or YouTube line where the cursor is
//   cursorOffset()           where the cursor is in the markdown
//   flush()                  save now; resolves true once the server has it
//   leave()                  stop (the class screen is closing)
// It tells the rest of the screen through ws.emit: "text" (the words
// changed), "page" (another page opened), "cursor" (the cursor moved).

import { h, statusLine } from "./dom.js";
import { insertBlock, toggleHeading, toggleList, toggleBold, NEXT_SCREEN } from "./edit.js";
import { whenText, number } from "./format.js";

const SAVE_AFTER = 1000; // ms after the last key
const MAX_MARKDOWN = 20000; // firestore.rules
const NEAR_FULL = 18000;
const PLACEHOLDER = "# Going to the dentist\nI am going to the dentist today.\n---\nThe dentist looks at my teeth.";

export function mountEditor(ws, { onPicture, onVideo, onYoutube }) {
  const { code, uid, cloud, toast } = ws;
  const remembered = `simplify-coach-page-${code}`; // sessionStorage: this tab's open page

  let pageId = null;
  let exists = false; // the page has been written (or its first write sent)
  let dirty = false; // changed since the last save began
  let timer = null;
  let lastSaved = null; // Date
  let problem = ""; // the last save's error, in words
  let started = false; // the first list of pages has arrived
  const inFlight = new Set();
  const deleting = new Set(); // deleted, waiting for their Undo to run out

  // ---------- elements ----------

  const pagesList = h("ul", { class: "pages-list" });
  const newPage = h("button", { class: "btn btn-secondary btn-small", type: "button" }, "+ New page");
  const pagesBar = h("nav", { class: "pages-bar", "aria-label": "Pages of this class" }, pagesList, newPage);

  const title = h("input", {
    type: "text", class: "title-input", id: "page-title", maxLength: 80, autocomplete: "off",
    placeholder: "For example: Going to the dentist",
  });
  const text = h("textarea", {
    class: "md-input", id: "page-text", maxLength: MAX_MARKDOWN, rows: 14, spellcheck: "true",
    "aria-describedby": "page-text-help",
  });
  text.placeholder = PLACEHOLDER;

  const toolButton = (label, name, run, extra = {}) =>
    h("button", { class: "tool-btn", type: "button", "data-tool": name, onclick: run, ...extra }, label);
  const toolbar = h("div", { class: "toolbar", role: "toolbar", "aria-label": "Formatting", "aria-controls": "page-text" },
    toolButton([h("span", { class: "tool-glyph", "aria-hidden": "true" }, "H"), " Heading"], "heading", () => apply(toggleHeading)),
    toolButton([h("strong", { class: "tool-glyph", "aria-hidden": "true" }, "B"), " Bold"], "bold", () => apply(toggleBold),
      { "aria-keyshortcuts": "Control+B" }),
    toolButton([h("span", { class: "tool-glyph", "aria-hidden": "true" }, "•"), " List"], "list", () => apply(toggleList)),
    toolButton("Picture", "picture", () => onPicture()),
    toolButton("Video", "video", () => onVideo()),
    toolButton("YouTube", "youtube", () => onYoutube()),
    toolButton("Next screen", "next-screen", () => apply((s) => insertBlock(s, NEXT_SCREEN))));

  const status = statusLine("save-state");
  const count = h("span", { class: "char-count" });
  const remove = h("button", { class: "btn btn-quiet btn-small", type: "button" }, "Delete this page");

  const element = h("section", { class: "editor", "aria-labelledby": "editor-h" },
    h("h2", { id: "editor-h", class: "visually-hidden" }, "The page"),
    h("div", { class: "field" },
      h("label", { for: "page-title" }, "Page name ", h("span", { class: "label-note" }, "(for coaches: learners don't see it)")),
      title),
    h("div", { class: "field" },
      h("label", { for: "page-text" }, "The page"),
      toolbar,
      text,
      // under the box, not above it: the words to write come first
      h("p", { class: "field-hint", id: "page-text-help" },
        "Each line shows as it is. A line with only --- starts the next screen. Use the buttons for the rest.")),
    h("div", { class: "editor-foot" }, status, count, remove));

  // ---------- typing and saving ----------

  function changed() {
    dirty = true;
    problem = "";
    if (!pageId) pageId = cloud.newPageId(code);
    clearTimeout(timer);
    timer = setTimeout(save, SAVE_AFTER);
    renderStatus();
    renderCount();
    renderPages();
    ws.emit("text");
  }

  function save() {
    clearTimeout(timer);
    if (!dirty || !pageId) return Promise.all(inFlight).then(() => !problem, () => false);
    dirty = false;
    const id = pageId;
    const content = { title: title.value.trim(), markdown: text.value };
    const creating = !exists;
    exists = true;
    remember(id);
    const write = creating ? cloud.createPage(code, id, uid, content) : cloud.savePage(code, id, uid, content);
    inFlight.add(write);
    renderStatus();
    return write.then(() => {
      if (id === pageId) lastSaved = new Date();
      return true;
    }, (err) => {
      if (id === pageId) {
        problem = err.message;
        dirty = true;
        if (creating) exists = false;
      }
      return false;
    }).finally(() => {
      inFlight.delete(write);
      renderStatus();
    });
  }

  function renderStatus() {
    status.replaceChildren();
    status.classList.toggle("is-problem", Boolean(problem));
    if (problem) {
      const again = h("button", { class: "btn btn-quiet btn-small", type: "button", onclick: () => { dirty = true; save(); } },
        "Try again");
      status.append(`Not saved: ${problem} `, again);
    } else if (dirty || inFlight.size) {
      status.append(navigator.onLine === false
        ? "Not saved yet: no internet. Keep this page open; it saves when the internet is back."
        : "Saving…");
    } else if (lastSaved) {
      status.append(`Saved ${whenText(lastSaved)}`);
    }
    remove.hidden = !pageId;
  }
  addEventListener("online", renderStatus);
  addEventListener("offline", renderStatus);

  function renderCount() {
    const n = text.value.length;
    count.textContent = n >= NEAR_FULL ? `${number(n)} of ${number(MAX_MARKDOWN)} characters` : "";
  }

  // Replace the text so the browser's undo can take it back: select the part
  // that changes and type the new part over it. Where that isn't possible,
  // set the value instead.
  function replaceText(next) {
    const old = text.value;
    let a = 0;
    while (a < old.length && a < next.text.length && old[a] === next.text[a]) a++;
    let b = 0;
    while (b < old.length - a && b < next.text.length - a &&
      old[old.length - 1 - b] === next.text[next.text.length - 1 - b]) b++;
    const typed = next.text.slice(a, next.text.length - b);
    text.focus({ preventScroll: true });
    text.setSelectionRange(a, old.length - b);
    let done = false;
    try {
      done = typed ? document.execCommand("insertText", false, typed) : document.execCommand("delete");
    } catch {
      done = false;
    }
    if (!done || text.value !== next.text) text.value = next.text;
    text.setSelectionRange(next.start, next.end);
  }

  function apply(fn) {
    const next = fn({ text: text.value, start: text.selectionStart, end: text.selectionEnd });
    if (next.text.length > MAX_MARKDOWN) {
      problem = `the page is full (${number(MAX_MARKDOWN)} characters)`;
      renderStatus();
      return;
    }
    replaceText(next);
    changed();
  }

  title.addEventListener("input", changed);
  text.addEventListener("input", changed);
  text.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "b") {
      e.preventDefault();
      apply(toggleBold);
    }
  });
  for (const type of ["keyup", "click", "select", "focus"]) text.addEventListener(type, () => ws.emit("cursor"));

  // leaving with a save not yet sent: the browser asks first
  const guard = (e) => {
    if (dirty || inFlight.size) {
      save();
      e.preventDefault();
      e.returnValue = "";
    }
  };
  addEventListener("beforeunload", guard);

  // ---------- pages ----------

  const visiblePages = () => (ws.pages ?? [])
    .filter((p) => !deleting.has(p.id))
    .sort((a, b) => (a.createdAt?.getTime?.() ?? 0) - (b.createdAt?.getTime?.() ?? 0));

  function renderPages() {
    const latest = ws.klass?.latest?.pageId;
    const pages = visiblePages();
    // the page being written is in the list at once, even before its first save arrives
    if (pageId && !pages.some((p) => p.id === pageId) && !deleting.has(pageId)) pages.push({ id: pageId });
    pagesList.replaceChildren(...pages.map((page) => {
      const current = page.id === pageId;
      const name = (current ? title.value.trim() : page.title) || "Untitled page";
      return h("li", null, h("button", {
        class: "page-tab", type: "button", "aria-current": current ? "page" : null,
        onclick: () => open(page.id),
      }, h("span", { class: "page-tab-name" }, name),
      page.id === latest ? h("span", { class: "page-tab-live" }, h("span", { "aria-hidden": "true" }, "● "), "Learners see this") : null));
    }));
  }

  function remember(id) {
    try {
      if (id) sessionStorage.setItem(remembered, id);
      else sessionStorage.removeItem(remembered);
    } catch { /* private mode: only the choice of page is lost */ }
  }

  function show(page) {
    pageId = page?.id ?? null;
    exists = Boolean(page);
    dirty = false;
    problem = "";
    lastSaved = page?.updatedAt ?? null;
    title.value = page?.title ?? "";
    text.value = page?.markdown ?? "";
    remember(pageId);
    renderPages();
    renderStatus();
    renderCount();
    ws.emit("page");
    ws.emit("text");
  }

  function open(id) {
    if (id === pageId) return;
    save(); // what was typed goes with its own page
    show(visiblePages().find((p) => p.id === id) ?? null);
  }

  newPage.addEventListener("click", () => {
    save();
    show(null);
    pageId = cloud.newPageId(code);
    dirty = true;
    save(); // an empty page in the list straight away
    renderPages();
    title.focus();
  });

  remove.addEventListener("click", () => {
    if (!pageId) return;
    const id = pageId;
    const name = title.value.trim() || "Untitled page";
    const kept = { title: title.value, markdown: text.value }; // what Undo shows, whatever the list says yet
    save(); // and the server has the last words too
    deleting.add(id);
    const others = visiblePages();
    show(others.length ? others.reduce((a, b) => ((a.updatedAt ?? 0) > (b.updatedAt ?? 0) ? a : b)) : null);
    toast.show(`Deleted “${name}”`, {
      undo: () => {
        deleting.delete(id);
        const back = (ws.pages ?? []).find((p) => p.id === id) ?? { id };
        show({ ...back, ...kept });
      },
      commit: () => {
        cloud.deletePage(code, id).catch((err) => ws.problem(err)).finally(() => {
          deleting.delete(id);
          renderPages();
        });
      },
    });
  });

  ws.on("pages", () => {
    if (!started) {
      started = true;
      if (pageId || dirty) return renderPages(); // already writing: that stays
      const pages = visiblePages();
      let first = null;
      try {
        first = pages.find((p) => p.id === sessionStorage.getItem(remembered));
      } catch { /* no sessionStorage */ }
      first ??= pages.reduce((a, b) => (!a || (b.updatedAt ?? 0) > (a.updatedAt ?? 0) ? b : a), null);
      show(first);
      return;
    }
    // the open page deleted somewhere else: its words stay here, and the
    // next save writes it again as it is
    if (pageId && exists && !dirty && !inFlight.size && !(ws.pages ?? []).some((p) => p.id === pageId)) exists = false;
    renderPages();
  });
  ws.on("class", renderPages);

  return {
    element,
    pagesBar,
    get pageId() { return pageId; },
    getText: () => ({ title: title.value.trim(), markdown: text.value }),
    setDraft({ title: newTitle, markdown }) {
      if (typeof newTitle === "string") title.value = newTitle.trim().slice(0, 80);
      replaceText({ text: String(markdown ?? "").slice(0, MAX_MARKDOWN), start: 0, end: 0 });
      text.scrollTop = 0;
      changed();
    },
    insert(block) {
      const next = insertBlock({ text: text.value, start: text.selectionStart, end: text.selectionEnd }, block);
      if (next.text.length > MAX_MARKDOWN) return false;
      replaceText(next);
      changed();
      return true;
    },
    cursorOffset: () => text.selectionStart,
    flush: save,
    leave() {
      save();
      clearTimeout(timer);
      removeEventListener("beforeunload", guard);
      removeEventListener("online", renderStatus);
      removeEventListener("offline", renderStatus);
    },
  };
}
