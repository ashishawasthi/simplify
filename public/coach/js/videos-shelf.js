// The class's video shelf: short videos made with AI (Gemini Omni), in three
// steps, each the coach's own decision:
//   1. Plan (free of video credits): the coach describes the video; one
//      Flash request turns it into the exact request (planVideo) — or asks,
//      or declines. The coach sees that request and what it will cost.
//   2. Make (one of the month's videos): startVideo. Gemini takes about two
//      minutes to accept it, and a few more to finish; the shelf asks
//      checkVideo every 10 seconds meanwhile (and when the class opens).
//   3. Check, then Approve (it can go in pages) or Discard. A finished video
//      is private to the class's coaches until approved.
// "Put in page" places ![words](videos/<id>.mp4) where the editor's cursor is.
//
// mountVideos(ws) → { element, choose() } — choose() is the editor's Video
// button: the approved videos in a dialog.

import { h, fill } from "./dom.js";
import { openDialog } from "./dialog.js";
import { questionsForm } from "./questions.js";
import { videoMarkdown } from "./edit.js";
import { plural, whenText } from "./format.js";

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

  // ---------- making one ----------

  const request = h("textarea", { id: "video-request", class: "helper-input", rows: 3, maxLength: 1000, "aria-describedby": "video-request-hint" });
  const plan = h("button", { class: "btn btn-primary", type: "button" }, "Plan the video");
  const maker = h("div", { class: "maker-result", "aria-live": "polite" });
  const makeBox = h("details", { class: "fold", id: "video-maker" },
    h("summary", null, "Make a short video"),
    h("div", { class: "stack" },
      h("div", { class: "field" },
        h("label", { for: "video-request" }, "Describe the video"),
        h("p", { class: "field-hint", id: "video-request-hint" },
          "One calm scene, up to 10 seconds. For example: “hands washing with soap at a sink”. " +
          "Planning it is free; making it uses one of your videos this month."),
        request),
      h("div", { class: "actions" }, plan),
      maker));
  let busy = false;
  const sync = () => { plan.disabled = busy || !request.value.trim(); };
  request.addEventListener("input", sync);
  sync();

  const usage = h("p", { class: "usage-line" });
  const list = h("ul", { class: "video-list", "aria-label": "Videos on the shelf" });
  const empty = h("p", { class: "empty" }, "No videos yet.");
  const element = h("section", { class: "shelf panel", "aria-labelledby": "videos-h" },
    h("h2", { id: "videos-h" }, "Videos"),
    usage, makeBox, list, empty);

  function renderUsage() {
    usage.textContent = `Videos: ${ws.usage.video} of ${ws.limits.videosPerMonth} this month`;
  }

  async function planIt(answers = []) {
    const text = request.value.trim();
    if (busy || (!text && !answers.length)) return;
    busy = true;
    sync();
    fill(maker, h("p", { class: "working" }, "Planning the video. This can take up to a minute."));
    let reply;
    try {
      reply = await cloud.callFunction("planVideo", { classCode: code, request: text, answers });
    } catch (err) {
      fill(maker, h("p", { class: "notice is-problem" }, err.message));
      return;
    } finally {
      busy = false;
      sync();
    }
    if (Number.isInteger(reply.used) && Number.isInteger(reply.limit)) {
      ws.setUsage({ flash: reply.used }, { flashPerMonth: reply.limit });
    }
    const understood = h("p", { class: "understood" }, reply.understood || `I understood: ${text}`);
    const note = reply.note ? h("p", { class: "helper-note" }, reply.note) : null;
    if (reply.action === "ask") {
      fill(maker, understood, h("p", { class: "helper-done" }, "The planner needs to know a little more:"),
        note, questionsForm(reply.questions, (a) => planIt(a)));
    } else if (reply.action === "write" && reply.planId) {
      showPlan(reply, understood, note);
    } else {
      fill(maker, understood, h("div", { class: "notice is-info" }, h("p", null, reply.note || "The planner can't plan this video.")));
    }
  }

  function showPlan(reply, understood, note) {
    const left = Math.max(0, ws.limits.videosPerMonth - ws.usage.video);
    const make = h("button", { class: "btn btn-primary", type: "button", disabled: left === 0 }, "Make the video");
    const change = h("button", { class: "btn btn-secondary", type: "button" }, "Change the description");
    change.addEventListener("click", () => {
      fill(maker, );
      request.focus();
    });
    make.addEventListener("click", () => start(reply.planId, make, change));
    fill(maker, understood, note,
      h("div", { class: "plan-card" },
        h("p", { class: "plan-label" }, "The video request"),
        h("blockquote", { class: "plan-prompt" }, reply.prompt),
        h("dl", { class: "plan-facts" },
          h("dt", null, "Length"), h("dd", null, plural(reply.seconds, "second")),
          h("dt", null, "Words for learners"), h("dd", null, reply.words))),
      h("p", { class: "plan-cost" }, left === 0
        ? `You have made all ${ws.limits.videosPerMonth} videos for this month.`
        : `Making it uses 1 of your ${ws.limits.videosPerMonth} videos this month. You have ${left} left.`),
      h("div", { class: "actions" }, make, change));
  }

  async function start(planId, make, change) {
    make.disabled = true;
    change.disabled = true;
    plan.disabled = true;
    const waiting = h("div", { class: "working-box", role: "status" },
      h("div", { class: "progress-calm", "aria-hidden": "true" }, h("span")),
      h("p", null, "Starting the video. This takes about 2 minutes, and then a few more to finish. " +
        "You can keep working on the page meanwhile."));
    maker.append(waiting);
    let reply;
    try {
      reply = await cloud.callFunction("startVideo", { classCode: code, planId });
    } catch (err) {
      waiting.replaceWith(h("p", { class: "notice is-problem" }, err.message));
      change.disabled = false;
      sync();
      return;
    }
    if (!alive) return;
    if (Number.isInteger(reply.used) && Number.isInteger(reply.limit)) {
      ws.setUsage({ video: reply.used }, { videosPerMonth: reply.limit });
    }
    request.value = "";
    sync();
    checkSoon.add(reply.videoId);
    fill(maker, h("p", { class: "helper-done" },
      "The video is being made. It shows below when it is ready to check."));
    schedule(true);
  }

  plan.addEventListener("click", () => planIt());

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
      media, actions,
      h("details", { class: "video-request" }, h("summary", null, "The request"), h("p", null, video.prompt ?? "")));

    if (video.status === "rendering") {
      media.append(h("p", { class: "shelf-state" }, "It usually takes a few minutes. This updates by itself."));
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
        `${video.error || "The video could not be made."} Your video credit was given back.`));
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
    const makeLink = h("button", { class: "btn btn-secondary", type: "button" }, "Make a short video");
    const body = h("div", { class: "chooser" }, listEl, h("div", { class: "actions" }, makeLink));
    const dialog = openDialog({ title: "Put a video in the page", body });
    makeLink.addEventListener("click", () => {
      dialog.close();
      makeBox.open = true;
      makeBox.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      request.focus({ preventScroll: true });
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
        : [h("li", { class: "empty" }, "No approved videos yet. Make one, check it, then approve it.")]));
    };
    redrawers.add(draw);
    dialog.closed.then(() => redrawers.delete(draw));
    draw();
  }

  ws.on("videos", render);
  ws.on("usage", renderUsage);
  renderUsage();
  render();

  return {
    element,
    choose,
    leave() {
      alive = false;
      clearTimeout(pollTimer);
      document.removeEventListener("visibilitychange", onVisible);
      for (const url of drafts.values()) URL.revokeObjectURL(url);
    },
  };
}
