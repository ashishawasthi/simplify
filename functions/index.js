// Cloud Functions for the Simplify coach platform (docs/coach/,
// docs/platform/ai-models.md). Six callables and one trigger, all in asia-southeast1:
//
//   writePage    the page helper: one Gemini Flash call → write / ask / decline
//   planOverlay  marks over a picture (an arrow, a ring, a label): one Flash call
//                looks at the picture → the shapes for a page video
//   makeVideo    uses one of the coach's videos this month and starts the video
//                renderer (a Cloud Run job) on one of the class's pages
//   checkVideo   is the render still going? failed, or too slow → the video back
//   approveVideo a finished draft becomes placeable in pages (public path)
//   discardVideo removes the clip (the video is not given back: it was made)
//   classSignal  on every change to classes/{code}: the push signal learners'
//                devices listen to (signal.js)
//
// Every callable first checks that the caller is signed in, has a coach profile
// the admin has not suspended, is listed for the class, and that the class is
// active. Errors carry a short plain message the coach app shows as it is.
//
// Local development: the Functions emulator reads functions/.env.local
// (SIMPLIFY_AI_FAKE=1), so the models are replaced by deterministic fakes (ai.js).

import { setGlobalOptions } from "firebase-functions/v2";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onCall } from "firebase-functions/v2/https";
import { askFlash, fakeOverlay, fakeWritePage } from "./ai.js";
import { cleanPage, cleanTitle, linksIn } from "./check.js";
import { parseClassMarkdown } from "./class-markdown.js";
import {
  bucket, cleanAnswers, cleanId, cleanText, countDecline, db, fail, FieldValue, LIMIT_REACHED,
  limitDocs, limitsFrom, meaningfulLength, monthKey, peekUsage, refund, requireClassCoach, reserve, usageRef,
} from "./lib.js";
import { THINKING } from "./models.js";
import { cleanShapes } from "./overlay.js";
import { OVERLAY_SCHEMA, OVERLAY_SYSTEM, overlayInput, EMPTY_WRITE_ANSWER, WRITE_PAGE_SCHEMA, WRITE_PAGE_SYSTEM, writePageInput } from "./prompts.js";
import { fakeRenderClip, readRender, startRender } from "./render.js";
import { classSignalHandler } from "./signal.js";

setGlobalOptions({
  region: "asia-southeast1",
  serviceAccount: "simplify-functions@simplify-special.iam.gserviceaccount.com",
  maxInstances: 10,
});

const callable = (timeoutSeconds, handler) => onCall({ timeoutSeconds, enforceAppCheck: false }, handler);

const SHORTEST = 4; // letters and digits: fewer, and the request is too short to act on
const BUSY = "The AI is not available right now. Try again in a minute. This request was not counted.";
const MINUTE = 60 * 1000;

// ---------- small shared pieces ----------

const shelfLimit = { pictures: 100, videos: 50 };

// the class's shelf, newest first: pictures, and videos a coach has approved
async function readShelf(code) {
  const [pictures, videos] = await Promise.all([
    db.collection(`classes/${code}/pictures`).orderBy("createdAt", "desc").limit(shelfLimit.pictures).get(),
    db.collection(`classes/${code}/videos`).where("status", "==", "approved").limit(shelfLimit.videos).get(),
  ]);
  return {
    pictures: pictures.docs.map((d) => ({ id: d.id, words: String(d.get("words") ?? "") })),
    videos: videos.docs.map((d) => ({ id: d.id, words: String(d.get("words") ?? "") })),
  };
}

// "I understood: …" — always one sentence that starts that way
function understoodLine(text, fallback) {
  const line = String(text ?? "").replace(/\s+/g, " ").trim() || fallback;
  const sentence = /^i understood\b/i.test(line) ? line.replace(/^i understood\s*:?\s*/i, "I understood: ") : `I understood: ${line}`;
  return sentence.length > 400 ? `${sentence.slice(0, 399).replace(/\s+\S*$/, "")}…` : sentence;
}

// up to 3 questions, each with up to 4 suggested answers; never an empty one
function cleanQuestions(list) {
  return (Array.isArray(list) ? list : []).slice(0, 3).map((q) => ({
    question: String(q?.question ?? "").replace(/\s+/g, " ").trim().slice(0, 200),
    answers: (Array.isArray(q?.answers) ? q.answers : [])
      .map((a) => String(a ?? "").replace(/\s+/g, " ").trim().slice(0, 80))
      .filter(Boolean).slice(0, 4),
  })).filter((q) => q.question);
}

const oneLine = (text, max) => String(text ?? "").replace(/\s+/g, " ").trim().slice(0, max);

// ---------- writePage ----------

export async function writePageHandler(request) {
  const data = request.data ?? {};
  const { uid, code } = await requireClassCoach(request, data.classCode);
  const instruction = cleanText(data.instruction, 1000, "The instruction is too long. Use at most 1,000 characters.");
  const markdown = cleanText(data.markdown, 20000, "The page is too long. It can have at most 20,000 characters.");
  const title = cleanText(data.title, 80, "The title is too long. Use at most 80 characters.");
  const answers = cleanAnswers(data.answers);

  // too short to act on: a free question, no model call, not counted
  if (meaningfulLength([instruction, ...answers.map((a) => a.answer)].join(" ")) < SHORTEST) {
    const { used, limit } = await peekUsage(uid, "flash");
    return { action: "ask", ...EMPTY_WRITE_ANSWER, title: "", markdown: "", note: "", used, limit };
  }

  const shelf = await readShelf(code);
  const links = linksIn(instruction, markdown, ...answers.map((a) => a.answer));
  const material = { instruction, answers, title, markdown, pictures: shelf.pictures, videos: shelf.videos, links };

  const ticket = await reserve(uid, "flash");
  let reply;
  try {
    reply = await askFlash({
      system: WRITE_PAGE_SYSTEM,
      schema: WRITE_PAGE_SCHEMA,
      input: writePageInput(material),
      thinking: THINKING.writePage,
      feature: "write-page",
      fake: () => fakeWritePage(material),
    });
    if (!reply.blocked && !["write", "ask", "decline"].includes(reply.answer?.action)) throw new Error("no action");
  } catch (err) {
    console.error(JSON.stringify({ event: "writePage failed", code, error: String(err?.message ?? err) }));
    await refund(ticket);
    fail("unavailable", BUSY);
  }

  const answer = reply.blocked
    ? { action: "decline", understood: "", note: "The AI cannot write this. Try asking in a different way." }
    : reply.answer;
  const out = {
    action: answer.action,
    understood: understoodLine(answer.understood, `you asked: ${oneLine(instruction, 200)}`),
    questions: [],
    title: "",
    markdown: "",
    note: oneLine(answer.note, 300),
  };

  if (out.action === "write") {
    let page;
    try {
      page = cleanPage(answer.markdown, {
        pictureIds: new Set(shelf.pictures.map((p) => p.id)),
        videoIds: new Set(shelf.videos.map((v) => v.id)),
        links,
      });
    } catch (err) {
      console.error(JSON.stringify({ event: "writePage check failed", code, error: String(err?.message ?? err) }));
      page = { markdown: "", dropped: 0 };
    }
    if (!page.markdown) {
      await refund(ticket);
      fail("unavailable", "The AI's page came back empty. Try again. This request was not counted.");
    }
    out.markdown = page.markdown;
    out.title = cleanTitle(answer.title) || title || "My class";
    if (page.dropped) {
      out.note = oneLine(`${out.note} I left out ${page.dropped === 1 ? "one thing" : `${page.dropped} things`} that pages cannot show (a picture not on the shelf, a link you did not give, or HTML).`, 400);
    }
  } else if (out.action === "ask") {
    out.questions = cleanQuestions(answer.questions);
    if (!out.questions.length) out.questions = EMPTY_WRITE_ANSWER.questions;
  } else {
    out.note ||= "The AI can only write pages about school, learning and daily life.";
    await countDecline(ticket);
  }
  console.log(JSON.stringify({ event: "writePage", code, uid, action: out.action, chars: out.markdown.length }));
  return { ...out, used: ticket.used, limit: ticket.limit };
}

// ---------- planOverlay ----------

// A mark from the model is about a box round the thing ([ymin, xmin, ymax,
// xmax], 0–1000, the way Gemini finds things); here it becomes a shape the
// renderer draws (public/coach/js/overlay.js), placed by code, not guessed.
export function markToShape(mark) {
  const t = Array.isArray(mark?.target) ? mark.target.map(Number) : [];
  if (t.length !== 4 || t.some((v) => !Number.isFinite(v))) return null;
  const [y1, x1, y2, x2] = [Math.min(t[0], t[2]), Math.min(t[1], t[3]), Math.max(t[0], t[2]), Math.max(t[1], t[3])]
    .map((v) => Math.min(1000, Math.max(0, Math.round(v))));
  const cx = Math.round((x1 + x2) / 2);
  const cy = Math.round((y1 + y2) / 2);
  const pad = 20;
  if (mark.kind === "circle") return { type: "circle", at: [cx, cy], r: Math.max(40, Math.round(Math.max(x2 - x1, y2 - y1) / 2 * 1.15)) };
  if (mark.kind === "box") return { type: "box", from: [Math.max(0, x1 - pad), Math.max(0, y1 - pad)], to: [Math.min(1000, x2 + pad), Math.min(1000, y2 + pad)] };
  if (mark.kind === "label") {
    // above the thing, or below it when there is no room above
    const y = y1 > 120 ? y1 - 60 : Math.min(960, y2 + 60);
    return { type: "label", at: [Math.min(880, Math.max(120, cx)), y], text: mark.text };
  }
  // an arrow from the side with the most room, ending just outside the thing
  const room = [[x1, [-1, 0]], [1000 - x2, [1, 0]], [y1, [0, -1]], [1000 - y2, [0, 1]]].sort((a, b) => b[0] - a[0])[0][1];
  const edge = [room[0] < 0 ? x1 - pad : room[0] > 0 ? x2 + pad : cx, room[1] < 0 ? y1 - pad : room[1] > 0 ? y2 + pad : cy];
  const len = 260;
  const from = [edge[0] + room[0] * len + (room[1] ? 90 : 0), edge[1] + room[1] * len + (room[0] ? -90 : 0)];
  return { type: "arrow", from: from.map((v) => Math.min(980, Math.max(20, Math.round(v)))), to: edge.map((v) => Math.min(1000, Math.max(0, Math.round(v)))) };
}

export async function planOverlayHandler(request) {
  const data = request.data ?? {};
  const { uid, code } = await requireClassCoach(request, data.classCode);
  const pictureId = cleanId(data.pictureId, "picture");
  const requestText = cleanText(data.request, 300, "Say it in at most 300 characters.");
  const picture = await db.doc(`classes/${code}/pictures/${pictureId}`).get();
  if (!picture.exists) fail("not-found", "That picture is not on the class's shelf.");

  if (meaningfulLength(requestText) < SHORTEST) {
    const { used, limit } = await peekUsage(uid, "flash");
    return { action: "none", understood: "I understood: nothing yet.", shapes: [],
      note: "Say what to point out, for example: an arrow to the tap.", used, limit };
  }

  const ticket = await reserve(uid, "flash");
  let reply;
  try {
    const [bytes] = await bucket().file(`classes/${code}/pictures/${pictureId}.jpg`).download();
    reply = await askFlash({
      system: OVERLAY_SYSTEM,
      schema: OVERLAY_SCHEMA,
      input: overlayInput({ request: requestText, words: String(picture.get("words") ?? "") }),
      image: { data: bytes.toString("base64"), mimeType: "image/jpeg" },
      thinking: THINKING.planOverlay,
      feature: "plan-overlay",
      fake: () => fakeOverlay({ request: requestText }),
    });
    if (!reply.blocked && !["draw", "none", "decline"].includes(reply.answer?.action)) throw new Error("no action");
  } catch (err) {
    console.error(JSON.stringify({ event: "planOverlay failed", code, error: String(err?.message ?? err) }));
    await refund(ticket);
    fail("unavailable", BUSY);
  }

  const answer = reply.blocked ? { action: "decline", note: "The AI cannot mark this. Try asking in a different way." } : reply.answer;
  const shapes = answer.action === "draw"
    ? cleanShapes((Array.isArray(answer.marks) ? answer.marks : []).map(markToShape).filter(Boolean))
    : [];
  const action = answer.action === "draw" && !shapes.length ? "none" : answer.action;
  if (action === "decline") await countDecline(ticket);
  const out = {
    action,
    understood: understoodLine(answer.understood, `you asked me to mark: ${oneLine(requestText, 200)}`),
    shapes,
    note: oneLine(answer.note, 300) || (action === "none" ? "I could not find that in the picture. Try other words." : ""),
  };
  console.log(JSON.stringify({ event: "planOverlay", code, uid, action, shapes: shapes.length }));
  return { ...out, used: ticket.used, limit: ticket.limit };
}

// ---------- makeVideo ----------

const videoRef = (code, id) => db.doc(`classes/${code}/videos/${id}`);
const draftPath = (code, id) => `classes/${code}/video-drafts/${id}.mp4`;
const publicPath = (code, id) => `classes/${code}/videos/${id}.mp4`;
const MAX_MARKED_PICTURES = 20;

// the coach's marks, only for pictures the page shows, each list checked
function cleanOverlays(raw, pictureIds) {
  const out = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [id, shapes] of Object.entries(raw)) {
    if (!pictureIds.has(id) || Object.keys(out).length >= MAX_MARKED_PICTURES) continue;
    const clean = cleanShapes(shapes);
    if (clean.length) out[id] = clean;
  }
  return out;
}

export async function makeVideoHandler(request) {
  const data = request.data ?? {};
  const { uid, code } = await requireClassCoach(request, data.classCode);
  const pageId = cleanId(data.pageId, "page");
  const [page, klass] = await db.getAll(db.doc(`classes/${code}/pages/${pageId}`), db.doc(`classes/${code}`));
  if (!page.exists) fail("not-found", "That page was not found.");
  const markdown = String(page.get("markdown") ?? "");
  const screens = parseClassMarkdown(markdown).screens;
  if (!screens.length || !markdown.trim()) fail("failed-precondition", "The page is empty. Write it first, then make its video.");
  const pictureIds = new Set(screens.flat().filter((b) => b.type === "picture").map((b) => b.id));
  const title = cleanTitle(page.get("title")) || "Our class page";
  const month = monthKey();
  const video = db.collection(`classes/${code}/videos`).doc();

  // In one transaction: a video is left this month (the coach's own limit, if
  // the admin gave them one), then the count and the video to be made.
  const made = await db.runTransaction(async (tx) => {
    const [usage, limits, coach] = await tx.getAll(...limitDocs(uid, month));
    const limit = limitsFrom(limits, coach).videosPerMonth;
    const used = usage.get("video") ?? 0;
    if (used >= limit) fail("resource-exhausted", LIMIT_REACHED.video(limit));
    const now = FieldValue.serverTimestamp();
    tx.set(usageRef(uid, month), { video: used + 1, uid, month }, { merge: true });
    tx.set(video, {
      kind: "page",
      status: "rendering",
      words: `Video of the page: ${title}`.slice(0, 80),
      title,
      className: String(klass.get("name") ?? ""),
      pageId,
      markdown, // the page as it was when the coach pressed Make: later edits don't change it
      readAloud: data.readAloud !== false,
      music: data.music !== false,
      overlays: cleanOverlays(data.overlays, pictureIds),
      execution: null,
      usageMonth: month, // a video given back goes to the month it came from
      createdBy: uid,
      createdAt: now,
      updatedAt: now,
    });
    return { used: used + 1, limit };
  });

  let execution;
  try {
    execution = await startRender({ code, videoId: video.id, markdown });
  } catch (err) {
    console.error(JSON.stringify({ event: "makeVideo failed", code, videoId: video.id, error: String(err?.message ?? err) }));
    const refunded = await failVideo(code, video.id, "The video could not be started.");
    fail("unavailable", `The video could not be started. ${refunded ? "It was not counted. " : ""}Try again later.`);
  }
  // Should this write never land, checkVideo gives the video back after 10 minutes.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await video.update({ execution, updatedAt: FieldValue.serverTimestamp() });
      break;
    } catch (err) {
      console.error(JSON.stringify({ event: "makeVideo save execution failed", code, videoId: video.id, attempt, error: String(err?.message ?? err) }));
    }
  }
  console.log(JSON.stringify({ event: "makeVideo", code, uid, videoId: video.id, screens: screens.length }));
  return { videoId: video.id, used: made.used, limit: made.limit };
}

// "rendering" → "failed", and the video back to the month it came from. Only
// the first caller does it (a transaction), so a video is never given back twice.
async function failVideo(code, videoId, message) {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(videoRef(code, videoId));
    if (!snap.exists || snap.get("status") !== "rendering") return false;
    tx.update(snap.ref, { status: "failed", error: message, updatedAt: FieldValue.serverTimestamp() });
    tx.set(usageRef(snap.get("createdBy"), snap.get("usageMonth")), { video: FieldValue.increment(-1) }, { merge: true });
    return true;
  });
}

// ---------- checkVideo ----------

const GIVE_UP_AFTER = 30 * MINUTE; // still not finished → failed, the video back
const NEVER_STARTED_AFTER = 10 * MINUTE; // makeVideo died before storing the run's name

export async function checkVideoHandler(request) {
  const data = request.data ?? {};
  const { code } = await requireClassCoach(request, data.classCode);
  const videoId = cleanId(data.videoId, "video");
  const snap = await videoRef(code, videoId).get();
  if (!snap.exists) fail("not-found", "That video was not found.");
  const status = snap.get("status");
  if (status !== "rendering") return { videoId, status };

  const now = async (message) =>
    ({ videoId, status: await failVideo(code, videoId, message) ? "failed" : (await snap.ref.get()).get("status") });
  const age = Date.now() - (snap.get("createdAt")?.toMillis?.() ?? Date.now());
  // the renderer said why it could not finish
  if (snap.get("renderError")) return now("The video could not be made.");
  const execution = snap.get("execution");
  if (!execution) return age < NEVER_STARTED_AFTER ? { videoId, status: "rendering" } : now("The video could not be started.");

  let run;
  try {
    run = await readRender(execution);
  } catch (err) {
    // a blip reading the run is not a failed run: ask again next time
    console.warn(JSON.stringify({ event: "checkVideo read failed", code, videoId, error: String(err?.message ?? err) }));
    return age > GIVE_UP_AFTER ? now("The video could not be made.") : { videoId, status: "rendering" };
  }
  if (run === "running") return age > GIVE_UP_AFTER ? now("The video took too long to make.") : { videoId, status: "rendering" };
  if (run === "failed") return now("The video could not be made.");

  // succeeded: the renderer marks the video ready itself. The stand-in for it
  // (emulator, tests) does what it would: the draft, then "ready".
  if (execution.startsWith("fake-")) {
    const clip = fakeRenderClip();
    await bucket().file(draftPath(code, videoId)).save(clip, { resumable: false, contentType: "video/mp4", metadata: { cacheControl: "private, max-age=0" } });
    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(snap.ref);
      if (fresh.get("status") === "rendering") tx.update(snap.ref, { status: "ready", bytes: clip.length, updatedAt: FieldValue.serverTimestamp() });
    });
  }
  const after = (await snap.ref.get()).get("status");
  // a run that ended without marking the video (it changed meanwhile, or the
  // write was lost): nothing more will come
  return after === "rendering" ? now("The video could not be made.") : { videoId, status: after };
}

// ---------- approveVideo ----------

export async function approveVideoHandler(request) {
  const data = request.data ?? {};
  const { uid, code } = await requireClassCoach(request, data.classCode);
  const videoId = cleanId(data.videoId, "video");
  const ref = videoRef(code, videoId);
  const snap = await ref.get();
  if (!snap.exists) fail("not-found", "That video was not found.");
  if (snap.get("status") === "approved") return { videoId, status: "approved" };
  if (snap.get("status") !== "ready") fail("failed-precondition", "This video is not ready to approve.");

  const draft = bucket().file(draftPath(code, videoId));
  const published = bucket().file(publicPath(code, videoId));
  const [draftThere] = await draft.exists();
  if (!draftThere) fail("failed-precondition", "The video's file is missing. Discard it and make it again.");
  await draft.copy(published);
  await published.setMetadata({ contentType: "video/mp4", cacheControl: "public, max-age=86400" });
  const status = await db.runTransaction(async (tx) => {
    const now = await tx.get(ref);
    if (now.get("status") !== "ready") return now.get("status");
    tx.update(ref, { status: "approved", approvedBy: uid, updatedAt: FieldValue.serverTimestamp() });
    return "approved";
  });
  if (status !== "approved") {
    // discarded while this ran: take the public copy down again
    await published.delete({ ignoreNotFound: true });
    fail("failed-precondition", "This video was discarded.");
  }
  await draft.delete({ ignoreNotFound: true }).catch(() => {}); // one copy is enough
  console.log(JSON.stringify({ event: "approveVideo", code, uid, videoId }));
  return { videoId, status };
}

// ---------- discardVideo ----------

export async function discardVideoHandler(request) {
  const data = request.data ?? {};
  const { uid, code } = await requireClassCoach(request, data.classCode);
  const videoId = cleanId(data.videoId, "video");
  const ref = videoRef(code, videoId);
  const snap = await ref.get();
  if (!snap.exists) fail("not-found", "That video was not found.");
  if (snap.get("status") === "discarded") return { videoId, status: "discarded" };
  if (snap.get("status") === "rendering") fail("failed-precondition", "This video is still being made. Discard it when it is ready.");

  await ref.update({ status: "discarded", discardedBy: uid, updatedAt: FieldValue.serverTimestamp() });
  await Promise.all([
    bucket().file(draftPath(code, videoId)).delete({ ignoreNotFound: true }),
    bucket().file(publicPath(code, videoId)).delete({ ignoreNotFound: true }),
  ]);
  console.log(JSON.stringify({ event: "discardVideo", code, uid, videoId }));
  return { videoId, status: "discarded" };
}

// ---------- the callables ----------

export const writePage = callable(120, writePageHandler);
export const planOverlay = callable(120, planOverlayHandler);
export const makeVideo = callable(60, makeVideoHandler);
export const checkVideo = callable(60, checkVideoHandler);
export const approveVideo = callable(120, approveVideoHandler);
export const discardVideo = callable(60, discardVideoHandler);

// ---------- the trigger ----------

export const classSignal = onDocumentWritten({ document: "classes/{code}", timeoutSeconds: 60 }, classSignalHandler);
