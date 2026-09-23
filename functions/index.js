// Cloud Functions for the Simplify coach platform (docs/daily-life-tools.md
// section 8). Six callables, all in asia-southeast1:
//
//   writePage    the page helper: one Gemini Flash call → write / ask / decline
//   planVideo    the video planner: one Flash call → an exact video request (a plan)
//   startVideo   spends one video credit and starts Gemini Omni on a stored plan
//   checkVideo   finished? → the draft clip in Storage; failed or too slow → refund
//   approveVideo a finished draft becomes placeable in pages (public path)
//   discardVideo removes the clip (the credit is not given back: it was paid for)
//
// Every callable first checks that the caller is signed in, has a coach profile
// the admin has not suspended, is listed for the class, and that the class is
// active. Errors carry a short plain message the coach app shows as it is.
//
// Local development: the Functions emulator reads functions/.env.local
// (SIMPLIFY_AI_FAKE=1), so the models are replaced by deterministic fakes (ai.js).

import { setGlobalOptions } from "firebase-functions/v2";
import { onCall } from "firebase-functions/v2/https";
import { askFlash, fakePlanVideo, fakeWritePage, readOmni, startOmni } from "./ai.js";
import { cleanPage, cleanTitle, linksIn } from "./check.js";
import {
  bucket, cleanAnswers, cleanId, cleanText, countDecline, db, fail, FieldValue, LIMIT_REACHED,
  limitsFrom, meaningfulLength, monthKey, peekUsage, refund, requireClassCoach, reserve, usageRef,
} from "./lib.js";
import { THINKING } from "./models.js";
import {
  EMPTY_PLAN_ANSWER, EMPTY_WRITE_ANSWER, PLAN_VIDEO_SCHEMA, PLAN_VIDEO_SYSTEM, planVideoInput,
  WRITE_PAGE_SCHEMA, WRITE_PAGE_SYSTEM, writePageInput,
} from "./prompts.js";

setGlobalOptions({
  region: "asia-southeast1",
  serviceAccount: "simplify-functions@simplify-special.iam.gserviceaccount.com",
  maxInstances: 10,
});

const callable = (timeoutSeconds, handler) => onCall({ timeoutSeconds, enforceAppCheck: false }, handler);

const SHORTEST = 4; // letters and digits: fewer, and the request is too short to act on
const BUSY = "The helper is not available right now. Try again in a minute. This request was not counted.";
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
    ? { action: "decline", understood: "", note: "The helper cannot write this. Try asking in a different way." }
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
      fail("unavailable", "The helper's page came back empty. Try again. This request was not counted.");
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
    out.note ||= "The helper can only write pages about school, learning and daily life.";
    await countDecline(ticket);
  }
  console.log(JSON.stringify({ event: "writePage", code, uid, action: out.action, chars: out.markdown.length }));
  return { ...out, used: ticket.used, limit: ticket.limit };
}

// ---------- planVideo ----------

export async function planVideoHandler(request) {
  const data = request.data ?? {};
  const { uid, code } = await requireClassCoach(request, data.classCode);
  const requestText = cleanText(data.request, 1000, "The request is too long. Use at most 1,000 characters.");
  const answers = cleanAnswers(data.answers);

  if (meaningfulLength([requestText, ...answers.map((a) => a.answer)].join(" ")) < SHORTEST) {
    const { used, limit } = await peekUsage(uid, "flash");
    return { action: "ask", ...EMPTY_PLAN_ANSWER, planId: "", prompt: "", seconds: 0, words: "", note: "", used, limit };
  }

  const material = { request: requestText, answers };
  const ticket = await reserve(uid, "flash");
  let reply;
  try {
    reply = await askFlash({
      system: PLAN_VIDEO_SYSTEM,
      schema: PLAN_VIDEO_SCHEMA,
      input: planVideoInput(material),
      thinking: THINKING.planVideo,
      feature: "plan-video",
      fake: () => fakePlanVideo(material),
    });
    if (!reply.blocked && !["write", "ask", "decline"].includes(reply.answer?.action)) throw new Error("no action");
  } catch (err) {
    console.error(JSON.stringify({ event: "planVideo failed", code, error: String(err?.message ?? err) }));
    await refund(ticket);
    fail("unavailable", BUSY);
  }

  const answer = reply.blocked
    ? { action: "decline", understood: "", note: "The planner cannot plan this video. Try asking in a different way." }
    : reply.answer;
  const out = {
    action: answer.action,
    understood: understoodLine(answer.understood, `you asked for a video of: ${oneLine(requestText, 200)}`),
    questions: [],
    planId: "",
    prompt: "",
    seconds: 0,
    words: "",
    note: oneLine(answer.note, 300),
  };

  if (out.action === "write") {
    const prompt = String(answer.prompt ?? "").replace(/\s+/g, " ").trim().slice(0, 2000);
    if (!prompt) {
      await refund(ticket);
      fail("unavailable", "The planner's answer came back empty. Try again. This request was not counted.");
    }
    const seconds = Math.min(10, Math.max(3, Math.round(Number(answer.seconds)) || 8));
    const words = oneLine(answer.words, 80) || oneLine(requestText, 80);
    const plan = db.collection(`classes/${code}/videoPlans`).doc();
    await plan.set({ request: requestText, prompt, words, seconds, createdBy: uid, createdAt: FieldValue.serverTimestamp() });
    Object.assign(out, { planId: plan.id, prompt, seconds, words });
  } else if (out.action === "ask") {
    out.questions = cleanQuestions(answer.questions);
    if (!out.questions.length) out.questions = EMPTY_PLAN_ANSWER.questions;
  } else {
    out.note ||= "The planner can only plan short videos about school, learning and daily life.";
    await countDecline(ticket);
  }
  console.log(JSON.stringify({ event: "planVideo", code, uid, action: out.action, planId: out.planId }));
  return { ...out, used: ticket.used, limit: ticket.limit };
}

// ---------- startVideo ----------

const videoRef = (code, id) => db.doc(`classes/${code}/videos/${id}`);
const draftPath = (code, id) => `classes/${code}/video-drafts/${id}.mp4`;
const publicPath = (code, id) => `classes/${code}/videos/${id}.mp4`;

export async function startVideoHandler(request) {
  const data = request.data ?? {};
  const { uid, code } = await requireClassCoach(request, data.classCode);
  const planId = cleanId(data.planId, "video plan");
  const planRef = db.doc(`classes/${code}/videoPlans/${planId}`);
  const month = monthKey();
  const video = db.collection(`classes/${code}/videos`).doc();

  // In one transaction: the plan is this coach's and not already in use, a credit
  // is left this month, and then the credit, the video and the plan's link to it.
  const started = await db.runTransaction(async (tx) => {
    const [plan, usage, limits] = await tx.getAll(planRef, usageRef(uid, month), db.doc("config/limits"));
    if (!plan.exists || plan.get("createdBy") !== uid) fail("not-found", "That video plan was not found. Plan the video again.");
    const limit = limitsFrom(limits).videosPerMonth;
    const used = usage.get("video") ?? 0;
    const earlier = plan.get("videoId");
    if (earlier) {
      // pressed twice: the same video, and no second credit (unless that one failed)
      const previous = await tx.get(videoRef(code, earlier));
      if (previous.exists && previous.get("status") !== "failed") return { videoId: earlier, used, limit, again: true };
    }
    if (used >= limit) fail("resource-exhausted", LIMIT_REACHED.video(limit));
    const now = FieldValue.serverTimestamp();
    tx.set(usageRef(uid, month), { video: used + 1, uid, month }, { merge: true });
    tx.set(video, {
      status: "rendering",
      prompt: plan.get("prompt"),
      words: plan.get("words"),
      seconds: plan.get("seconds"),
      planId,
      interactionId: null,
      usageMonth: month, // a refund goes back to the month the credit came from
      createdBy: uid,
      createdAt: now,
      updatedAt: now,
    });
    tx.update(planRef, { videoId: video.id });
    return { videoId: video.id, used: used + 1, limit, prompt: plan.get("prompt"), seconds: plan.get("seconds") };
  });
  if (started.again) return { videoId: started.videoId, used: started.used, limit: started.limit };

  let interactionId;
  try {
    ({ id: interactionId } = await startOmni({ prompt: started.prompt, seconds: started.seconds }));
  } catch (err) {
    console.error(JSON.stringify({ event: "startVideo failed", code, videoId: video.id, error: String(err?.message ?? err) }));
    const refunded = await failVideo(code, video.id, "The video could not be started.");
    fail("unavailable", `The video could not be started. ${refunded ? "Your video credit was given back. " : ""}Try again later.`);
  }
  // The render is running (and paid for): keep its id. Should that write never
  // land, checkVideo gives the credit back after 10 minutes.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await video.update({ interactionId, updatedAt: FieldValue.serverTimestamp() });
      break;
    } catch (err) {
      console.error(JSON.stringify({ event: "startVideo save id failed", code, videoId: video.id, attempt, error: String(err?.message ?? err) }));
    }
  }
  console.log(JSON.stringify({ event: "startVideo", code, uid, videoId: video.id, seconds: started.seconds }));
  return { videoId: video.id, used: started.used, limit: started.limit };
}

// "rendering" → "failed", and the credit back to the month it came from. Only
// the first caller does it (a transaction), so a credit is never refunded twice.
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

const PENDING = new Set(["in_progress", "queued"]);
const GIVE_UP_AFTER = 30 * MINUTE; // still not finished (or unreadable) → failed, credit back
const NEVER_STARTED_AFTER = 10 * MINUTE; // startVideo died before storing the render's id
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

export async function checkVideoHandler(request) {
  const data = request.data ?? {};
  const { code } = await requireClassCoach(request, data.classCode);
  const videoId = cleanId(data.videoId, "video");
  const snap = await videoRef(code, videoId).get();
  if (!snap.exists) fail("not-found", "That video was not found.");
  const status = snap.get("status");
  if (status !== "rendering") return { videoId, status };

  const age = Date.now() - (snap.get("createdAt")?.toMillis?.() ?? Date.now());
  const interactionId = snap.get("interactionId");
  if (!interactionId) {
    if (age < NEVER_STARTED_AFTER) return { videoId, status: "rendering" };
    return { videoId, status: await failVideo(code, videoId, "The video could not be started.") ? "failed" : (await snap.ref.get()).get("status") };
  }
  const giveUp = async (message) =>
    ({ videoId, status: await failVideo(code, videoId, message) ? "failed" : (await snap.ref.get()).get("status") });

  // Always look first: a clip that finished while nobody had the class open is
  // still saved, however late the check comes.
  let render;
  try {
    render = await readOmni(interactionId);
  } catch (err) {
    // a blip reading the render is not a failed render: ask again next time
    console.warn(JSON.stringify({ event: "checkVideo read failed", code, videoId, error: String(err?.message ?? err) }));
    return age > GIVE_UP_AFTER ? giveUp("The video could not be made.") : { videoId, status: "rendering" };
  }
  if (PENDING.has(render.status)) {
    return age > GIVE_UP_AFTER ? giveUp("The video took too long to make.") : { videoId, status: "rendering" };
  }

  if (render.status === "completed" && render.video) {
    try {
      const clip = await clipBytes(render.video);
      await bucket().file(draftPath(code, videoId)).save(clip, {
        resumable: false,
        contentType: "video/mp4",
        metadata: { cacheControl: "private, max-age=0" },
      });
      const ready = await db.runTransaction(async (tx) => {
        const now = await tx.get(snap.ref);
        if (now.get("status") !== "rendering") return now.get("status");
        tx.update(snap.ref, { status: "ready", bytes: clip.length, updatedAt: FieldValue.serverTimestamp() });
        return "ready";
      });
      console.log(JSON.stringify({ event: "checkVideo", code, videoId, status: ready, bytes: clip.length }));
      return { videoId, status: ready };
    } catch (err) {
      console.error(JSON.stringify({ event: "checkVideo save failed", code, videoId, error: String(err?.message ?? err) }));
      if (err?.badClip) {
        return { videoId, status: await failVideo(code, videoId, "The video came back broken.") ? "failed" : "rendering" };
      }
      return { videoId, status: "rendering" }; // Storage blip: the render is still there next time
    }
  }

  // failed, cancelled, incomplete, over budget, or finished without a clip
  console.warn(JSON.stringify({ event: "checkVideo render failed", code, videoId, status: render.status }));
  return { videoId, status: await failVideo(code, videoId, "The video could not be made.") ? "failed" : (await snap.ref.get()).get("status") };
}

// The finished clip as bytes: inline base64 (the verified delivery), or a copy of
// its URI. It must look like an MP4 (an ISO "ftyp" box) before it is stored.
async function clipBytes({ data, uri }) {
  let bytes;
  if (data) {
    bytes = Buffer.from(data, "base64");
  } else if (uri?.startsWith("gs://")) {
    const [, bucketName, path] = /^gs:\/\/([^/]+)\/(.+)$/.exec(uri) ?? [];
    [bytes] = await bucket().storage.bucket(bucketName).file(path).download();
  } else if (uri?.startsWith("https://")) {
    const res = await fetch(uri, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`clip download HTTP ${res.status}`);
    bytes = Buffer.from(await res.arrayBuffer());
  }
  if (!bytes?.length || bytes.length > MAX_VIDEO_BYTES || bytes.subarray(4, 8).toString("latin1") !== "ftyp") {
    throw Object.assign(new Error(`not an MP4 (${bytes?.length ?? 0} bytes)`), { badClip: true });
  }
  return bytes;
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
export const planVideo = callable(120, planVideoHandler);
// the Omni call alone took ~2 minutes to return: the coach app waits patiently
export const startVideo = callable(540, startVideoHandler);
export const checkVideo = callable(180, checkVideoHandler);
export const approveVideo = callable(120, approveVideoHandler);
export const discardVideo = callable(60, discardVideoHandler);
