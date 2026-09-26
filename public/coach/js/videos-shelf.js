// The class's video shelf: videos of the class's own pages, made by the
// video renderer (a Cloud Run job that films the page in the real learner
// reader — docs/coach/videos.md), in steps that are each the coach's own:
//   1. Choose: the page open in the editor, read aloud or not, quiet music or
//      not, and marks over its pictures — an arrow, a ring, a label — which the
//      AI places from the coach's words (planOverlay: one AI request each) and
//      the coach sees before anything is made.
//   2. Make (one of the month's videos): makeVideo. It takes a minute or two;
//      the shelf asks checkVideo every 10 seconds meanwhile.
//   3. Check, then Approve (it can go in pages) or Discard. A finished video
//      is private to the class's coaches until approved.
// "Put in page" places ![words](videos/<id>.mp4) where the editor's cursor is.
// When the month's videos are used up, the coach can ask the admin for more.
//
// mountVideos(ws) → { element, choose() } — choose() is the editor's Video
// button: the approved videos in a dialog.

import { h, fill } from "./dom.js";
import { openDialog } from "./dialog.js";
import { videoMarkdown } from "./edit.js";
import { whenText } from "./format.js";
import { overlaySvg } from "./overlay.js";

const CHECK_EVERY = 10_000; // ms

export function mountVideos(ws) {
  const { code, cloud, toast } = ws;
  const drafts = new Map(); // video id → blob: URL of its draft, once watched
  const redrawers = new Set();
  let pollTimer = null;
  let checking = false;
  let firstList = true;
  let alive = true;
  const checkSoon = new Set(); // just started: checked as soon as the shelf lists it

  // ---------- making one: a video of the page open in the editor ----------

  const overlays = new Map(); // picture id → shapes, for the page being made
  const markUrls = new Set(); // blob: URLs of the marks shown, released when rows go
  const readAloud = h("input", { type: "checkbox", checked: true, id: "video-read" });
  const withMusic = h("input", { type: "checkbox", checked: true, id: "video-music" });
  const marks = h("div", { class: "video-marks" });
  const make = h("button", { class: "btn btn-primary", type: "button" }, "Make the video");
  const cost = h("p", { class: "plan-cost" });
  const more = h("div", { class: "more-videos" });
  const maker = h("div", { class: "maker-result", "aria-live": "polite" });
  const makeBox = h("details", { class: "fold", id: "video-maker" },
    h("summary", null, "Make a video of this page"),
    h("div", { class: "stack" },
      h("p", { class: "field-hint" },
        "The page as learners see it in My class, one screen at a time. It takes a minute or two, " +
        "and uses one of your videos this month."),
      h("label", { class: "check-line", for: "video-read" }, readAloud, " Read the words aloud"),
      h("label", { class: "check-line", for: "video-music" }, withMusic, " Quiet music"),
      marks,
      cost,
      h("div", { class: "actions" }, make),
      more,
      maker));
  let busy = false;

  const usage = h("p", { class: "usage-line" });
  const list = h("ul", { class: "video-list", "aria-label": "Videos on the shelf" });
  const empty = h("p", { class: "empty" }, "No videos yet.");
  const element = h("section", { class: "shelf panel", "aria-labelledby": "videos-h" },
    h("h2", { id: "videos-h" }, "Videos"),
    usage, makeBox, list, empty);

  const left = () => Math.max(0, ws.limits.videosPerMonth - ws.usage.video);

  function renderUsage() {
    usage.textContent = `Videos: ${ws.usage.video} of ${ws.limits.videosPerMonth} this month`;
    cost.textContent = left() === 0
      ? `You have made all ${ws.limits.videosPerMonth} videos for this month.`
      : `Making it uses 1 of your ${ws.limits.videosPerMonth} videos this month. You have ${left()} left.`;
    renderMore();
    syncMake();
  }

  // the pictures of the page open now, each with its marks and a box to ask for them
  // (the parser is loaded when the maker is first opened, as the preview
  // loads it: a class screen opens no faster or slower for this panel)
  let pictureKey = null; // the pictures the rows are for (null: none drawn yet)
  let parser = null;
  function clearMarks() {
    for (const url of markUrls) URL.revokeObjectURL(url);
    markUrls.clear();
    marks.replaceChildren();
  }
  async function renderMarks() {
    if (!ws.editor) return; // the editor is made after this panel
    parser ??= await import("/js/class-markdown.js");
    const blocks = parser.parseClassMarkdown(ws.editor.getText().markdown).screens.flat();
    const pictures = [...new Map(blocks.filter((b) => b.type === "picture" && ws.pictures.some((p) => p.id === b.id))
      .map((b) => [b.id, b])).values()];
    const key = pictures.map((p) => p.id).join(",");
    for (const id of [...overlays.keys()]) if (!pictures.some((p) => p.id === id)) overlays.delete(id);
    if (key === pictureKey) return;
    pictureKey = key;
    clearMarks();
    if (!pictures.length) return;
    marks.replaceChildren(
      h("h3", { class: "marks-h" }, "Point things out"),
      h("p", { class: "field-hint" }, "Optional. Say what to point out in a picture, and the AI draws an arrow, a ring or a label on it. Each uses one AI request."),
      ...pictures.map(markRow));
  }

  function markRow(picture) {
    const img = h("img", { src: cloud.mediaUrl(code, "picture", picture.id), alt: picture.words || "" });
    // the marks as a picture of their own over the photo (never markup in the page), from a blob: URL
    const layer = h("img", { class: "mark-layer", alt: "", hidden: true });
    const draw = () => {
      const shapes = overlays.get(picture.id) ?? [];
      const show = shapes.length > 0 && img.naturalWidth > 0;
      layer.hidden = !show;
      if (layer.src) {
        URL.revokeObjectURL(layer.src);
        markUrls.delete(layer.src);
      }
      if (show) {
        layer.src = URL.createObjectURL(new Blob([overlaySvg(shapes, img.naturalWidth, img.naturalHeight)], { type: "image/svg+xml" }));
        markUrls.add(layer.src);
      } else {
        layer.removeAttribute("src");
      }
      clear.hidden = !shapes.length;
    };
    img.addEventListener("load", () => draw());
    const inputId = `mark-${picture.id}`;
    const words = h("input", { id: inputId, class: "mark-input", maxLength: 300, placeholder: "For example: an arrow to the tap" });
    const ask = h("button", { class: "btn btn-secondary btn-small", type: "button" }, "Draw it");
    const clear = h("button", { class: "btn btn-quiet btn-small", type: "button", hidden: true }, "Remove the marks");
    const said = h("div", { class: "mark-said", "aria-live": "polite" });
    ask.addEventListener("click", async () => {
      const text = words.value.trim();
      if (!text || ask.disabled) return;
      ask.disabled = true;
      fill(said, h("p", { class: "working" }, "The AI is looking at the picture."));
      try {
        const reply = await cloud.callFunction("planOverlay", { classCode: code, pictureId: picture.id, request: text });
        if (Number.isInteger(reply.used) && Number.isInteger(reply.limit)) ws.setUsage({ flash: reply.used }, { flashPerMonth: reply.limit });
        if (reply.action === "draw" && reply.shapes?.length) {
          overlays.set(picture.id, reply.shapes);
          fill(said, h("p", { class: "understood" }, reply.understood), reply.note ? h("p", { class: "helper-note" }, reply.note) : null);
        } else {
          fill(said, h("p", { class: "understood" }, reply.understood),
            h("div", { class: "notice is-info" }, h("p", null, reply.note || "The AI could not mark this.")));
        }
      } catch (err) {
        fill(said, h("p", { class: "notice is-problem" }, err.message));
      } finally {
        ask.disabled = false;
        draw();
      }
    });
    clear.addEventListener("click", () => {
      overlays.delete(picture.id);
      fill(said);
      draw();
    });
    return h("div", { class: "mark-row", dataset: { picture: picture.id } },
      h("div", { class: "mark-picture" }, img, layer),
      h("div", { class: "stack" },
        h("label", { for: inputId }, picture.words || "A picture"),
        words,
        h("div", { class: "actions" }, ask, clear),
        said));
  }

  function syncMake() {
    const page = ws.editor?.getText();
    make.disabled = busy || left() === 0 || !ws.editor?.pageId || !page?.markdown.trim();
  }

  async function start() {
    if (make.disabled) return;
    busy = true;
    syncMake();
    const waiting = h("div", { class: "working-box", role: "status" },
      h("div", { class: "progress-calm", "aria-hidden": "true" }, h("span")),
      h("p", null, "Starting the video. It shows below when it is ready to check, in a minute or two."));
    fill(maker, waiting);
    let reply;
    try {
      // the video is made from the page as saved: an unsaved page would be the old one
      if (!(await ws.editor.flush())) {
        fill(maker, h("p", { class: "notice is-problem" }, "The page could not be saved, so its video can't be made yet. Check the internet, then try again."));
        return;
      }
      reply = await cloud.callFunction("makeVideo", {
        classCode: code, pageId: ws.editor.pageId, readAloud: readAloud.checked, music: withMusic.checked,
        overlays: Object.fromEntries(overlays),
      });
    } catch (err) {
      fill(maker, h("p", { class: "notice is-problem" }, err.message));
      return;
    } finally {
      busy = false;
      syncMake();
    }
    if (!alive) return;
    if (Number.isInteger(reply.used) && Number.isInteger(reply.limit)) {
      ws.setUsage({ video: reply.used }, { videosPerMonth: reply.limit });
    }
    checkSoon.add(reply.videoId);
    fill(maker, h("p", { class: "helper-done" }, "The video is being made. It shows below when it is ready to check."));
    schedule(true);
  }
  make.addEventListener("click", start);

  // ---------- asking the admin for more ----------

  let asked = null; // this coach's waiting request for more videos, once known
  cloud.myRequests(ws.uid).then((mine) => {
    asked = mine.find((r) => r.kind === "more-videos" && r.status === "pending") ?? null;
    renderMore();
  }).catch(() => {});

  function renderMore() {
    if (asked) {
      fill(more, h("p", { class: "field-hint" }, "You asked the admin for more videos. They will decide soon."));
      return;
    }
    if (left() > 3) return fill(more);
    const note = h("textarea", { id: "more-videos-note", rows: 2, maxLength: 300 });
    const send = h("button", { class: "btn btn-secondary btn-small", type: "button" }, "Ask the admin for more videos");
    send.addEventListener("click", async () => {
      send.disabled = true;
      try {
        await cloud.askForMoreVideos(ws.uid, { note: note.value.trim() });
        asked = { kind: "more-videos", status: "pending" };
        toast.show("Asked. The admin will decide.");
        renderMore();
      } catch (err) {
        send.disabled = false;
        ws.problem(err);
      }
    });
    fill(more, h("div", { class: "field" },
      h("label", { for: "more-videos-note" }, "Need more videos each month? Say why (if you like)"),
      note),
      h("div", { class: "actions" }, send));
  }

  makeBox.addEventListener("toggle", () => {
    if (makeBox.open) renderMarks();
  });
  let marksTimer = null;
  const pageChanged = () => {
    syncMake();
    clearTimeout(marksTimer);
    marksTimer = setTimeout(() => makeBox.open && renderMarks(), 400);
  };
  ws.on("text", pageChanged);
  ws.on("page", () => {
    overlays.clear();
    pictureKey = null;
    clearMarks();
    fill(maker);
    pageChanged();
  });

  // ---------- the shelf ----------

  const STATE = {
    rendering: ["is-waiting", "Being made"],
    ready: ["is-ready", "Ready to check"],
    approved: ["is-yes", "On the shelf"],
    failed: ["is-no", "Could not be made"],
  };

  function row(video) {
    const [tone, words] = STATE[video.status] ?? ["is-waiting", video.status];
    const actions = h("div", { class: "shelf-actions" });
    const media = h("div", { class: "video-media" });
    const item = h("li", { class: `video-item ${tone}`, dataset: { video: video.id } },
      h("div", { class: "video-head" },
        h("span", { class: `chip ${tone}` }, words),
        h("span", { class: "video-words" }, video.words || "A video"),
        h("span", { class: "video-when" }, whenText(video.createdAt))),
      media, actions);

    if (video.status === "rendering") {
      media.append(h("p", { class: "shelf-state" }, "It usually takes a minute or two. This updates by itself."));
    } else if (video.status === "ready") {
      const watch = h("button", { class: "btn btn-secondary btn-small", type: "button" }, "Watch it");
      const showDraft = (url) => media.replaceChildren(h("video", {
        class: "video-player", src: url, controls: true, playsinline: true, preload: "metadata",
        "aria-label": video.words || "The video",
      }));
      if (drafts.has(video.id)) showDraft(drafts.get(video.id));
      else media.append(watch);
      watch.addEventListener("click", async () => {
        watch.disabled = true;
        watch.textContent = "Loading…";
        try {
          const url = await cloud.draftVideoUrl(code, video.id);
          drafts.set(video.id, url);
          showDraft(url);
        } catch (err) {
          media.replaceChildren(h("p", { class: "notice is-problem" }, err.message));
        }
      });
      const approve = h("button", { class: "btn btn-primary btn-small", type: "button" }, "Approve");
      approve.addEventListener("click", async () => {
        approve.disabled = true;
        try {
          await cloud.callFunction("approveVideo", { classCode: code, videoId: video.id });
          toast.show("Approved. It can go in pages now.");
        } catch (err) {
          approve.disabled = false;
          ws.problem(err);
        }
      });
      actions.append(approve, discardButton(video, "Discard"));
    } else if (video.status === "approved") {
      media.append(h("video", {
        class: "video-player", src: cloud.mediaUrl(code, "video", video.id), controls: true, playsinline: true,
        preload: "metadata", "aria-label": video.words || "The video",
      }));
      const place = h("button", { class: "btn btn-secondary btn-small", type: "button" }, "Put in page");
      place.addEventListener("click", () => insert(video));
      actions.append(place, discardButton(video, "Delete"));
    } else if (video.status === "failed") {
      media.append(h("p", { class: "shelf-state" },
        `${video.error || "The video could not be made."} It was not counted.`));
      actions.append(discardButton(video, "Remove"));
    }
    return item;
  }

  // Discard waits for the toast's Undo to run out, then the function removes it
  function discardButton(video, words) {
    const b = h("button", { class: "btn btn-quiet btn-small", type: "button" }, words);
    b.addEventListener("click", () => {
      ws.hiddenVideos.add(video.id);
      ws.refreshVideos();
      toast.show(video.status === "failed" ? "Removed" : "Video deleted", {
        undo: () => {
          ws.hiddenVideos.delete(video.id);
          ws.refreshVideos();
        },
        commit: () => {
          cloud.callFunction("discardVideo", { classCode: code, videoId: video.id }).catch((err) => {
            ws.hiddenVideos.delete(video.id);
            ws.refreshVideos();
            ws.problem(err);
          });
        },
      });
    });
    return b;
  }

  function insert(video) {
    if (!ws.editor.insert(videoMarkdown(video.id, video.words))) toast.show("The page is full: there is no room for another video.");
  }

  function render() {
    const shown = ws.videos.filter((v) => STATE[v.status]);
    // a row with a draft playing keeps playing: only rows whose state changed are new
    const keep = new Map([...list.querySelectorAll("[data-video]")].map((el) => [el.dataset.video, el]));
    list.replaceChildren(...shown.map((v) => {
      const old = keep.get(v.id);
      return old && old.dataset.state === v.status ? old : stamp(row(v), v.status);
    }));
    empty.hidden = shown.length > 0;
    for (const redraw of redrawers) redraw();
    const arrived = [...checkSoon].filter((id) => ws.videos.some((v) => v.id === id));
    for (const id of arrived) checkSoon.delete(id);
    if (arrived.length || (firstList && ws.videosLoaded)) {
      firstList = false;
      schedule(true); // on opening the class: check what is being made now
    } else {
      schedule(false);
    }
  }
  const stamp = (el, status) => {
    el.dataset.state = status;
    return el;
  };

  // ---------- checking on the ones being made ----------

  function schedule(now) {
    clearTimeout(pollTimer);
    if (!alive || document.hidden || !ws.videos.some((v) => v.status === "rendering")) return;
    pollTimer = setTimeout(check, now ? 0 : CHECK_EVERY);
  }

  async function check() {
    if (checking) return;
    checking = true;
    try {
      for (const video of ws.videos.filter((v) => v.status === "rendering")) {
        if (!alive) return;
        // the answer's status arrives through the shelf's own list as well
        await cloud.callFunction("checkVideo", { classCode: code, videoId: video.id }).catch(() => {});
      }
    } finally {
      checking = false;
      schedule(false);
    }
  }

  const onVisible = () => schedule(true);
  document.addEventListener("visibilitychange", onVisible);

  // ---- the editor's Video button ----
  function choose() {
    const listEl = h("ul", { class: "chooser-list" });
    const makeLink = h("button", { class: "btn btn-secondary", type: "button" }, "Make a video of this page");
    const body = h("div", { class: "chooser" }, listEl, h("div", { class: "actions" }, makeLink));
    const dialog = openDialog({ title: "Put a video in the page", body });
    makeLink.addEventListener("click", () => {
      dialog.close();
      makeBox.open = true;
      makeBox.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      renderMarks();
    });
    const draw = () => {
      const approved = ws.videos.filter((v) => v.status === "approved");
      listEl.replaceChildren(...(approved.length ? approved.map((video) => h("li", null,
        h("button", {
          class: "chooser-row", type: "button",
          onclick: () => {
            insert(video);
            dialog.close();
          },
        }, h("span", { class: "chooser-icon", "aria-hidden": "true" }, "▶"), h("span", null, video.words || "A video"))))
        : [h("li", { class: "empty" }, "No approved videos yet. Make one of a page, check it, then approve it.")]));
    };
    redrawers.add(draw);
    dialog.closed.then(() => redrawers.delete(draw));
    draw();
  }

  ws.on("videos", render);
  ws.on("usage", renderUsage);
  ws.on("pictures", () => makeBox.open && renderMarks());
  renderUsage();
  render();

  return {
    element,
    choose,
    leave() {
      alive = false;
      clearTimeout(pollTimer);
      clearTimeout(marksTimer);
      for (const url of markUrls) URL.revokeObjectURL(url);
      document.removeEventListener("visibilitychange", onVisible);
      for (const url of drafts.values()) URL.revokeObjectURL(url);
    },
  };
}
