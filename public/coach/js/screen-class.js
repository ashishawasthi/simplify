// One class: its pages and the editor, the phone preview and Publish (with
// the public warning), the AI helper, and the picture and video shelves.
// The class, its pages and its shelves are live lists (Firestore listeners),
// so another coach's upload or publish shows here as it happens.
//
// The parts talk through `ws` (this screen's shared state): each part reads
// ws.klass, ws.pages, ws.pictures, ws.videos, ws.usage, ws.limits and
// ws.editor, and listens with ws.on("class" | "pages" | "pictures" |
// "videos" | "usage" | "text" | "page" | "cursor").

import { h, notice } from "./dom.js";
import { formatCode } from "./class-code.js";
import { mountEditor } from "./editor.js";
import { mountPreview } from "./preview.js";
import { mountPublish } from "./publish.js";
import { mountHelper } from "./helper.js";
import { mountPictures } from "./pictures-shelf.js";
import { mountVideos } from "./videos-shelf.js";
import { chooseYoutube } from "./youtube.js";

const newestFirst = (a, b) => (b.createdAt?.getTime?.() ?? 0) - (a.createdAt?.getTime?.() ?? 0);

export function classScreen(root, ctx, code) {
  const { cloud, toast, user } = ctx;
  const events = new EventTarget();
  const problems = h("div", { class: "class-problems" });
  let rawPictures = [];
  let rawVideos = [];

  const ws = {
    code,
    uid: user.uid,
    cloud,
    toast,
    klass: null,
    pages: null, // null until the first list arrives
    pictures: [],
    videos: [],
    videosLoaded: false,
    hiddenPictures: new Set(), // deleted here, waiting for their Undo to run out
    hiddenVideos: new Set(),
    usage: { flash: 0, video: 0 },
    limits: { ...cloud.DEFAULT_LIMITS },
    editor: null,
    emit: (type) => events.dispatchEvent(new Event(type)),
    on: (type, fn) => events.addEventListener(type, fn),
    setUsage(usage, limits) {
      Object.assign(ws.usage, usage);
      Object.assign(ws.limits, limits);
      ws.emit("usage");
    },
    refreshPictures() {
      ws.pictures = rawPictures.filter((p) => !ws.hiddenPictures.has(p.id)).sort(newestFirst);
      ws.emit("pictures");
    },
    refreshVideos() {
      ws.videos = rawVideos.filter((v) => !ws.hiddenVideos.has(v.id)).sort(newestFirst);
      ws.emit("videos");
    },
    // something that went wrong away from its own button: said once, calmly
    problem(err) {
      toast.show(err?.message || "Something went wrong. Try again in a minute.");
    },
  };

  // ---------- the parts ----------

  const pictures = mountPictures(ws);
  const videos = mountVideos(ws);
  ws.editor = mountEditor(ws, {
    onPicture: () => pictures.choose(),
    onVideo: () => videos.choose(),
    onYoutube: () => chooseYoutube(ws),
  });
  const preview = mountPreview(ws);
  const publish = mountPublish(ws);
  const helper = mountHelper(ws);

  const name = h("span", { class: "class-name" }, "");
  const heading = h("h1", { class: "class-heading" }, name);
  const top = h("div", { class: "class-top" },
    h("a", { class: "back-link", href: "#classes" }, h("span", { "aria-hidden": "true" }, "← "), "My classes"),
    h("div", { class: "class-title-row" },
      heading,
      h("span", { class: "code-pill", "aria-label": `Class code ${[...code].join(" ")}` }, formatCode(code)),
      h("a", { class: "btn btn-secondary btn-small", href: `#poster/${code}` }, "QR poster to print")));

  const workspace = h("div", { class: "workspace" },
    h("div", { class: "ws-pages" }, ws.editor.pagesBar),
    h("div", { class: "ws-editor" }, ws.editor.element),
    h("div", { class: "ws-side" }, preview.element, publish.element),
    h("div", { class: "ws-helper" }, helper.element),
    h("div", { class: "ws-pictures" }, pictures.element),
    h("div", { class: "ws-videos" }, videos.element));

  root.append(h("section", { class: "screen class-screen" }, top, problems, workspace));

  // ---------- live lists ----------

  let stopped = false;
  function listProblem(err) {
    if (stopped || problems.childElementCount) return;
    workspace.hidden = true;
    problems.append(notice(err.code === "permission-denied"
      ? "You can't open this class. You may not be one of its coaches, or the admin may have paused it or your account."
      : err.message, { tone: "problem", action: h("a", { class: "btn btn-secondary", href: "#classes" }, "Back to My classes") }));
  }

  const stops = [
    cloud.watchClass(code, (klass) => {
      if (!klass) {
        listProblem({ message: "There is no class with this code." });
        return;
      }
      ws.klass = klass;
      name.textContent = klass.name;
      document.title = `${klass.name} · Simplify for coaches`;
      if (klass.status !== "active" && !problems.querySelector(".is-paused-note")) {
        problems.append(h("div", { class: "is-paused-note" },
          notice("The admin has paused this class. You can read it here, but nothing can be changed or published.", { tone: "warning" })));
      }
      ws.emit("class");
    }, listProblem),
    cloud.watchPages(code, (list) => {
      ws.pages = list;
      ws.emit("pages");
    }, listProblem),
    cloud.watchPictures(code, (list) => {
      rawPictures = list;
      ws.refreshPictures();
    }, listProblem),
    cloud.watchVideos(code, (list) => {
      rawVideos = list;
      ws.videosLoaded = true;
      ws.refreshVideos();
    }, listProblem),
  ];

  Promise.all([cloud.getUsage(user.uid), cloud.getLimits()]).then(([usage, limits]) => {
    if (!stopped) ws.setUsage(usage, limits);
  });

  return () => {
    stopped = true;
    toast.flush(); // a delete waiting for its Undo happens now, while the class is known
    for (const stop of stops) stop();
    ws.editor.leave();
    preview.leave();
    videos.leave();
  };
}
