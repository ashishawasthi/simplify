// The phone preview: the page as learners see it in My class, one screen at
// a time, with the learner app's own parser and renderer (/js/class-markdown.js,
// same origin) and its styles (/css/tools/my-class.css, for .class-page). It
// follows the cursor — typing on the third screen shows the third screen —
// and Back and Next look through the rest. A picture or video that is not on
// the class's shelf (or a video not approved yet) shows nothing, exactly as
// for learners, and a line under the phone says so.
//
// The parser is loaded when the screen opens, not with the app: if it can't
// load, the editor still works and the preview says so.

import { h } from "./dom.js";
import { plural } from "./format.js";

const RENDER_AFTER = 150; // ms after the last key

export function mountPreview(ws) {
  let lib = null;
  let index = 0;
  let screens = [];
  let shown = ""; // what the phone shows now, to skip redrawing the same thing
  let timer = null;

  const meta = h("p", { class: "phone-meta" });
  const screen = h("div", { class: "phone-screen class-page", role: "region", "aria-label": "Preview: what learners see" });
  const back = h("button", { class: "phone-btn", type: "button" }, h("span", { "aria-hidden": "true" }, "◀ "), "Back");
  const where = h("span", { class: "phone-where", "aria-live": "polite" });
  const nextWords = h("span", null, "Next");
  const nextIcon = h("span", { "aria-hidden": "true" }, " ▶");
  const next = h("button", { class: "phone-btn is-next", type: "button" }, nextWords, nextIcon);
  const phone = h("div", { class: "phone" }, meta, screen, h("div", { class: "phone-nav" }, back, where, next));
  const missing = h("div", { class: "preview-missing" });

  const element = h("section", { class: "preview", "aria-labelledby": "preview-h" },
    h("h2", { id: "preview-h" }, "Preview"),
    h("p", { class: "field-hint" }, "What learners see in My class."),
    phone,
    missing);

  // what the preview may show: only the class's shelf, as for learners
  function mediaUrl(kind, id) {
    if (kind === "picture" && ws.pictures.some((p) => p.id === id)) return ws.cloud.mediaUrl(ws.code, "picture", id);
    if (kind === "video" && ws.videos.some((v) => v.id === id && v.status === "approved")) {
      return ws.cloud.mediaUrl(ws.code, "video", id);
    }
    return null;
  }

  function draw() {
    if (!lib) return;
    const { markdown } = ws.editor.getText();
    const page = lib.parseClassMarkdown(markdown);
    screens = page.screens;
    meta.textContent = ws.klass?.name ?? "";
    index = Math.min(Math.max(index, 0), Math.max(screens.length - 1, 0));

    const key = JSON.stringify([index, screens[index] ?? null, ws.pictures.map((p) => p.id), ws.videos.map((v) => `${v.id}:${v.status}`)]);
    if (key !== shown) {
      shown = key;
      if (!screens.length) {
        screen.replaceChildren(h("p", { class: "phone-empty" }, "Nothing to show yet. Write the page, or ask the helper to write it."));
      } else {
        try {
          screen.replaceChildren(lib.renderScreen(screens[index], { mediaUrl }));
        } catch (err) {
          console.error("preview", err);
          screen.replaceChildren(h("p", { class: "phone-empty" }, "This screen can't be shown."));
        }
      }
      screen.scrollTop = 0;
    }
    const last = index >= screens.length - 1;
    back.disabled = index === 0;
    next.disabled = !screens.length;
    nextWords.textContent = last ? "All done" : "Next";
    nextIcon.textContent = last ? " ✔" : " ▶";
    where.textContent = screens.length ? `Screen ${index + 1} of ${screens.length}` : "";

    // pictures and videos learners won't see
    const off = { picture: 0, video: 0, draft: 0 };
    for (const item of lib.pageMedia(page)) {
      if (mediaUrl(item.kind, item.id)) continue;
      if (item.kind === "video" && ws.videos.some((v) => v.id === item.id && v.status === "ready")) off.draft++;
      else off[item.kind]++;
    }
    const lines = [];
    if (off.picture) lines.push(`${plural(off.picture, "picture")} in the page ${off.picture === 1 ? "is" : "are"} not on the class's shelf, so learners won't see ${off.picture === 1 ? "it" : "them"}.`);
    if (off.video) lines.push(`${plural(off.video, "video")} in the page ${off.video === 1 ? "is" : "are"} not on the class's shelf, so learners won't see ${off.video === 1 ? "it" : "them"}.`);
    if (off.draft) lines.push(`${plural(off.draft, "video")} in the page ${off.draft === 1 ? "is" : "are"} not approved yet. Approve ${off.draft === 1 ? "it" : "them"} on the video shelf.`);
    missing.replaceChildren(...lines.map((line) => h("p", { class: "notice is-warning" }, line)));
  }

  const soon = () => {
    clearTimeout(timer);
    timer = setTimeout(draw, RENDER_AFTER);
  };

  // the screen the cursor is on: the screens before it, counted by the parser
  function followCursor() {
    if (!lib) return;
    const { markdown } = ws.editor.getText();
    const at = ws.editor.cursorOffset();
    const lineEnd = markdown.indexOf("\n", at);
    const before = lib.parseClassMarkdown(markdown.slice(0, lineEnd === -1 ? markdown.length : lineEnd));
    index = Math.max(0, before.screens.length - 1);
    soon();
  }

  back.addEventListener("click", () => {
    index--;
    draw();
  });
  next.addEventListener("click", () => {
    index = index >= screens.length - 1 ? 0 : index + 1; // All done: back to the first screen
    draw();
  });

  ws.on("text", followCursor);
  ws.on("cursor", followCursor);
  ws.on("page", () => {
    index = 0;
    soon();
  });
  for (const type of ["class", "pictures", "videos"]) ws.on(type, soon);

  import("/js/class-markdown.js").then((module) => {
    lib = module;
    draw();
  }, (err) => {
    console.error("the preview could not load", err);
    screen.replaceChildren(h("p", { class: "phone-empty" }, "The preview could not load. Reload the page to try again."));
  });

  return { element, leave: () => clearTimeout(timer) };
}
