// Cloud Functions tests: the six callables in functions/index.js, with the fake
// models (SIMPLIFY_AI_FAKE=1 — nothing is sent to Gemini and nothing costs money):
//
//   node tools/test-functions.mjs
//
// It starts the Auth, Firestore, Storage and Functions emulators itself, from a
// temporary firebase.json with ports of its own, then
//   - calls the handlers directly (so it can also move time: a render that is
//     30 minutes old), against the Firestore and Storage emulators, and
//   - calls a few of them over HTTP through the Functions emulator, exactly as
//     the coach app does (callable protocol, an ID token, functions/.env.local).
// Covers: who may call, write / ask / decline, the free answer for an empty
// instruction, monthly limits (also under parallel calls), refunds, the Singapore
// month, the page check, and plan → start → check → approve / discard.
// Needs `npm ci` in functions/ first. No other dependencies.

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PROJECT = "simplify-special";
// ports of its own (the Functions emulator also starts Eventarc and Cloud Tasks
// emulators, so those are pinned too), so it can run beside other emulators
const PORTS = {
  auth: 9321, firestore: 8321, storage: 9421, functions: 5321, hub: 4421, logging: 4521, websocket: 9521,
  eventarc: 9621, tasks: 9721,
};

// ---------- outside: the copy check, then the emulators, then this file inside them ----------

if (process.env.SIMPLIFY_FUNCTIONS_INSIDE !== "1") {
  const copy = spawn(process.execPath, [join(ROOT, "tools", "copy-class-markdown.mjs"), "--check"], { stdio: "inherit" });
  const copyOk = await new Promise((r) => copy.on("exit", (code) => r(code === 0)));

  const dir = mkdtempSync(join(tmpdir(), "simplify-functions-"));
  writeFileSync(join(dir, "firebase.json"), JSON.stringify({
    firestore: { rules: join(ROOT, "firestore.rules") },
    storage: { rules: join(ROOT, "storage.rules") },
    // relative: the CLI reads a functions source as relative to the config's folder
    functions: [{ source: relative(dir, join(ROOT, "functions")), codebase: "default", runtime: "nodejs22" }],
    emulators: {
      auth: { port: PORTS.auth },
      firestore: { port: PORTS.firestore, websocketPort: PORTS.websocket },
      storage: { port: PORTS.storage },
      functions: { port: PORTS.functions },
      eventarc: { port: PORTS.eventarc },
      tasks: { port: PORTS.tasks },
      hub: { port: PORTS.hub },
      logging: { port: PORTS.logging },
      ui: { enabled: false },
    },
  }, null, 2));
  // TMPDIR: the emulators keep their hub locator and Storage files in the OS temp
  // folder, shared by every emulator suite of the project — a run of its own
  // must not see (or clean up) another's
  const child = spawn("firebase", [
    "emulators:exec", "--only", "auth,firestore,storage,functions",
    "--config", join(dir, "firebase.json"), "--project", PROJECT,
    `node "${fileURLToPath(import.meta.url)}"`,
  ], {
    cwd: dir,
    env: { ...process.env, SIMPLIFY_FUNCTIONS_INSIDE: "1", SIMPLIFY_AI_FAKE: "1", GCLOUD_PROJECT: PROJECT, TMPDIR: dir },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (d) => {
    log += d;
    for (const line of String(d).split("\n")) if (/^(ok  |FAIL|all |\d+ of |—)/.test(line)) console.log(line);
  });
  child.stderr.on("data", (d) => { log += d; });
  child.on("exit", (code) => {
    if (code !== 0 && !/\d+ of \d+ failed/.test(log)) console.log(log); // the emulators did not start: show why
    rmSync(dir, { recursive: true, force: true });
    process.exit(code === 0 && copyOk ? 0 : 1);
  });
} else {
  await runInside();
}

// ---------- inside ----------

async function runInside() {
  const fns = await import(pathToFileURL(join(ROOT, "functions", "index.js")).href);
  const { db, bucket, monthKey, FieldValue } = await import(pathToFileURL(join(ROOT, "functions", "lib.js")).href);
  const { cleanPage, cleanTitle, linksIn, youtubeId } = await import(pathToFileURL(join(ROOT, "functions", "check.js")).href);
  // firebase-admin as the functions resolve it (tools/ has no node_modules of its own)
  const fromFunctions = createRequire(join(ROOT, "functions", "package.json"));
  const { Timestamp } = await import(pathToFileURL(fromFunctions.resolve("firebase-admin/firestore")).href);

  let failed = 0;
  let count = 0;
  const check = (what, got, want) => {
    count++;
    const ok = typeof want === "function" ? want(got) : JSON.stringify(got) === JSON.stringify(want);
    if (!ok) failed++;
    const shown = typeof got === "string" ? got : JSON.stringify(got);
    console.log(`${ok ? "ok  " : "FAIL"}  ${what.padEnd(58)} ${String(shown).slice(0, 90)}${ok || typeof want === "function" ? "" : `\n      expected ${JSON.stringify(want)}`}`);
  };
  const section = (title) => console.log(`— ${title}`);

  // a callable request, as firebase-functions hands it to a handler
  const as = (uid) => (uid ? { uid, token: { uid, email: `${uid}@example.com`, email_verified: true, firebase: { sign_in_provider: "google.com" } } } : undefined);
  // run a handler; an HttpsError comes back as { error: code, message }
  async function call(handler, uid, data) {
    try {
      return await handler({ auth: as(uid), data, rawRequest: {} });
    } catch (err) {
      if (err?.httpErrorCode || err?.code) return { error: err.code, message: err.message };
      throw err;
    }
  }
  const usage = async (uid) => (await db.doc(`usage/${uid}_${monthKey()}`).get()).data() ?? {};

  // ---------- seed ----------

  const A = "K7M3RQP9T"; // active: coachA, coachC, coachS (suspended)
  const P = "P9TK7M3RQ"; // paused: coachA
  const past = Timestamp.fromDate(new Date("2026-09-01T02:00:00Z"));
  const seeds = {
    "coaches/coachA": { name: "Coach A", email: "coachA@example.com", createdAt: past },
    "coaches/coachB": { name: "Coach B", email: "coachB@example.com", createdAt: past },
    "coaches/coachC": { name: "Coach C", email: "coachC@example.com", createdAt: past },
    "coaches/coachS": { name: "Coach S", email: "coachS@example.com", createdAt: past, suspended: true },
    [`classes/${A}`]: { name: "3 Kindness", org: "", status: "active", latest: null, createdAt: past, updatedAt: past },
    [`classes/${P}`]: { name: "4 Care", org: "", status: "suspended", latest: null, createdAt: past, updatedAt: past },
    [`classCoaches/${A}`]: { uids: ["coachA", "coachS", "coachC"] },
    [`classCoaches/${P}`]: { uids: ["coachA"] },
    [`classes/${A}/pictures/busstop1`]: { words: "Our bus stop", file: "pictures/busstop1.jpg", width: 1600, height: 1200, createdAt: past, createdBy: "coachA" },
    [`classes/${A}/videos/wash1`]: { status: "approved", prompt: "hands", words: "Hands washing", seconds: 8, interactionId: "x", createdBy: "coachA", createdAt: past, updatedAt: past },
  };
  for (const [path, data] of Object.entries(seeds)) await db.doc(path).set(data);

  // ---------- who may call ----------

  section("who may call (writePage stands for all six)");
  const W = fns.writePageHandler;
  const write = (uid, data) => call(W, uid, { classCode: A, instruction: "Write a story about the bus", markdown: "", ...data });
  check("not signed in", (await write(null)).error, "unauthenticated");
  check("signed in, no coach profile", await write("stranger"), { error: "permission-denied", message: "Fill in About you first." });
  check("suspended coach", await write("coachS"), { error: "permission-denied", message: "Your account is paused. Ask the admin." });
  check("coach of another class", await write("coachB"), { error: "permission-denied", message: "You are not a coach of this class." });
  check("class that does not exist", (await write("coachA", { classCode: "ZZZZZZZZZ" })).message, "You are not a coach of this class.");
  check("paused class", await write("coachA", { classCode: P }), { error: "failed-precondition", message: "This class is paused by the admin." });
  check("a code with dashes and lower case is fine", (await write("coachA", { classCode: "k7m-3rq-p9t" })).action, "write");
  check("a code that is too short", (await write("coachA", { classCode: "K7M" })).error, "invalid-argument");
  check("an instruction over 1000 characters", (await write("coachA", { instruction: "x".repeat(1001) })).error, "invalid-argument");
  check("a page over 20000 characters", (await write("coachA", { markdown: "x".repeat(20001) })).error, "invalid-argument");
  for (const [name, handler, data] of [
    ["planVideo", fns.planVideoHandler, { request: "hands washing" }],
    ["startVideo", fns.startVideoHandler, { planId: "nope" }],
    ["checkVideo", fns.checkVideoHandler, { videoId: "nope" }],
    ["approveVideo", fns.approveVideoHandler, { videoId: "nope" }],
    ["discardVideo", fns.discardVideoHandler, { videoId: "nope" }],
  ]) {
    check(`${name}: coach of another class`, (await call(handler, "coachB", { classCode: A, ...data })).error, "permission-denied");
    check(`${name}: suspended coach`, (await call(handler, "coachS", { classCode: A, ...data })).error, "permission-denied");
  }

  // ---------- writePage ----------

  section("writePage: write / ask / decline, usage and refunds");
  await db.doc(`usage/coachA_${monthKey()}`).delete();
  let r = await write("coachA", { instruction: "" });
  check("empty instruction → a free question", [r.action, r.questions.length, r.used], ["ask", 1, 0]);
  check("... that starts I understood:", r.understood, (u) => u.startsWith("I understood: "));
  r = await write("coachA", { instruction: "?!" });
  check("\"?!\" → a free question (not counted)", [r.action, r.used], ["ask", 0]);
  r = await write("coachA", { instruction: "Make a picture story about the bus?" });
  check("unclear → ask, with suggested answers", [r.action, r.questions[0]?.answers.length, r.used], ["ask", 3, 1]);
  r = await write("coachA", { instruction: "Make a picture story about the bus?", answers: [{ question: "Who is the page for?", answer: "The learners" }] });
  check("with answers → write", [r.action, r.used, r.limit], ["write", 2, 200]);
  check("... uses the shelf picture", r.markdown, (m) => m.includes("![Our bus stop](pictures/busstop1.jpg)"));
  check("... has a title", r.title, "Our class page");
  check("... says what it understood", r.understood, (u) => u.startsWith("I understood: Make a picture story"));
  r = await write("coachA", { instruction: "a recipe for beer" });
  check("out of scope → decline, kindly", [r.action, r.markdown, r.used], ["decline", "", 3]);
  check("... a decline is counted as declined too", (await usage("coachA")).declined, 1);
  r = await write("coachA", { instruction: "[fail] a page about lunch" });
  check("the model fails → unavailable", r.error, "unavailable");
  check("... and the request is given back", (await usage("coachA")).flash, 3);
  r = await write("coachA", { instruction: "Update the page", title: "Lunch", markdown: "# Old" });
  check("keeps the coach's title when writing", r.title, "Lunch");

  section("writePage: monthly limit");
  await db.doc("config/limits").set({ flashPerMonth: 5, videosPerMonth: 5 });
  r = await write("coachA");
  check("the 5th request of 5", [r.action, r.used, r.limit], ["write", 5, 5]);
  r = await write("coachA");
  check("the 6th → limit reached", r, { error: "resource-exhausted", message: "You have used all 5 helper requests for this month." });
  r = await write("coachA", { instruction: "" });
  check("an empty instruction still gets its free question", [r.action, r.used, r.limit], ["ask", 5, 5]);
  await db.doc("config/limits").set({ flashPerMonth: 8 });
  const parallel = await Promise.all(Array.from({ length: 6 }, () => write("coachA")));
  check("6 at once with 3 left → exactly 3 written", parallel.filter((x) => x.action === "write").length, 3);
  check("... the other 3 refused", parallel.filter((x) => x.error === "resource-exhausted").length, 3);
  check("... and the count is exactly the limit", (await usage("coachA")).flash, 8);
  await db.doc("config/limits").set({ flashPerMonth: "lots", videosPerMonth: -1 });
  r = await call(fns.writePageHandler, "coachA", { classCode: A, instruction: "" });
  check("a broken limits doc falls back to 200 / 5", r.limit, 200);
  await db.doc("config/limits").delete();

  section("the Singapore month (UTC+8)");
  check("30 Sep 23:59 in Singapore is September", monthKey(Date.UTC(2026, 8, 30, 15, 59)), "2026-09");
  check("1 Oct 00:00 in Singapore is October", monthKey(Date.UTC(2026, 8, 30, 16, 0)), "2026-10");
  check("31 Dec 16:00 UTC is January", monthKey(Date.UTC(2026, 11, 31, 16, 0)), "2027-01");

  // ---------- the page check ----------

  section("the page check (only shelf media, only the coach's links)");
  const shelf = { pictureIds: new Set(["busstop1"]), videoIds: new Set(["wash1"]) };
  const clean = (md, links = []) => cleanPage(md, { ...shelf, links });
  check("keeps a shelf picture", clean("![Bus stop](pictures/busstop1.jpg)").markdown, "![Bus stop](pictures/busstop1.jpg)");
  check("drops a picture not on the shelf", clean("![Bus](pictures/other.jpg)\n\nI wait.").markdown, "I wait.");
  check("drops a picture from the web", clean("![Bus](https://example.com/bus.jpg)\n\nI wait.").markdown, "I wait.");
  check("keeps an approved video", clean("![Wash](videos/wash1.mp4)").markdown, "![Wash](videos/wash1.mp4)");
  check("drops a video that is not approved", clean("![Wash](videos/draft9.mp4)\n\nWash.").markdown, "Wash.");
  check("keeps a link the coach gave", clean("[LTA](https://www.lta.gov.sg/)", ["https://www.lta.gov.sg/"]).markdown, "[LTA](https://www.lta.gov.sg/)");
  check("a made-up link keeps only its words", clean("[LTA](https://lta.example/)").markdown, "LTA");
  check("an http link keeps only its words", clean("[Site](http://example.com/)", ["http://example.com/"]).markdown, "Site");
  check("keeps the coach's YouTube video (any link form)", clean("[Wash hands](https://youtu.be/abcdefghijk)", ["https://www.youtube.com/watch?v=abcdefghijk"]).markdown, "[Wash hands](https://youtu.be/abcdefghijk)");
  check("a YouTube video the coach did not give → words", clean("[Wash hands](https://youtu.be/zzzzzzzzzzz)", ["https://youtu.be/abcdefghijk"]).markdown, "Wash hands");
  check("a bare address the coach did not give is removed", clean("Go to https://made.up/page now.").markdown, "Go to  now.");
  check("HTML is removed", clean("<b>Hello</b> <script>x</script>").markdown, "Hello x");
  check("empty screens are removed", clean("---\n\nOne\n\n---\n\n---\n\nTwo\n\n---").markdown, "One\n\n---\n\nTwo");
  check("what was dropped is counted", clean("![a](pictures/x.jpg) [b](https://x.example/) c<br>").dropped, 3);
  const longPage = Array.from({ length: 30 }, (_, i) => `Screen ${i} ${"words ".repeat(150)}`).join("\n\n---\n\n");
  const cut = clean(longPage).markdown;
  check("over 20000 characters → cut at a whole screen", [cut.length <= 20000, cut.endsWith("words")], [true, true]);
  check("links in the coach's words (punctuation trimmed)", linksIn("See https://www.lta.gov.sg/, and https://youtu.be/abcdefghijk."), ["https://www.lta.gov.sg/", "https://youtu.be/abcdefghijk"]);
  check("YouTube ids: watch, youtu.be, shorts, embed, nocookie", [
    youtubeId("https://www.youtube.com/watch?v=abcdefghijk&t=3"), youtubeId("https://youtu.be/abcdefghijk"),
    youtubeId("https://youtube.com/shorts/abcdefghijk"), youtubeId("https://www.youtube.com/embed/abcdefghijk"),
    youtubeId("https://www.youtube-nocookie.com/embed/abcdefghijk"), youtubeId("https://example.com/watch?v=abcdefghijk"),
  ], ["abcdefghijk", "abcdefghijk", "abcdefghijk", "abcdefghijk", "abcdefghijk", null]);
  check("a link with a title the coach did not give → words", clean("Look here.\n[Site](https://made.up/ \"Site\")").markdown, "Look here.\nSite");
  check("an <address> link the coach did not give → words", clean("One\n[Site](<https://made.up/a b>)").markdown, "One\nSite");
  check("... one the coach gave stays", clean("[Site](<https://coach.example/a b>)", ["https://coach.example/a%20b"]).markdown, "[Site](<https://coach.example/a b>)");
  check("a picture with a title, not on the shelf → out", clean("![Bus](pictures/zz.jpg \"Bus\")\nWait.").markdown, "Wait.");
  check("\"a < b\" and <3 are not HTML", clean("3 < 4 and 5 > 2 <3").markdown, "3 < 4 and 5 > 2 <3");
  check("*** and ___ are screen breaks too (written as ---)", clean("One\n***\nTwo\n_ _ _\n\n\n\nThree").markdown, "One\n\n---\n\nTwo\n\n---\n\nThree");
  const hostile = "[".repeat(20000) + "](" + " ".repeat(20000) + "<a" + " x".repeat(10000);
  const t0 = Date.now();
  clean(hostile);
  check("a hostile answer is checked quickly", Date.now() - t0, (ms) => ms < 3000);
  check("a YouTube line without https:// the coach did not give", clean("youtu.be/zzzzzzzzzzz\nWash.").markdown, "Wash.");
  check("... and one the coach gave stays", clean("youtu.be/abcdefghijk", ["https://youtu.be/abcdefghijk"]).markdown, "youtu.be/abcdefghijk");
  check("the coach's YouTube link without https:// counts", linksIn("add youtube.com/shorts/abcdefghijk please"), ["https://youtu.be/abcdefghijk"]);
  check("a title loses markdown and stays under 80", cleanTitle(`# **${"Bus ".repeat(30)}**`), (t) => t.length <= 80 && !/[#*]/.test(t));

  section("writePage over the page check");
  r = await write("coachA", { instruction: "Add this video https://youtu.be/abcdefghijk to the page" });
  check("a link in the instruction may be used", r.action, "write");

  // ---------- planVideo ----------

  section("planVideo: write / ask / decline");
  await db.doc(`usage/coachA_${monthKey()}`).delete();
  const plan = (data) => call(fns.planVideoHandler, "coachA", { classCode: A, ...data });
  r = await plan({ request: "" });
  check("empty request → a free question", [r.action, r.used, r.planId], ["ask", 0, ""]);
  r = await plan({ request: "hands washing?" });
  check("unclear → ask", [r.action, r.questions.length, r.used], ["ask", 1, 1]);
  r = await plan({ request: "beer being poured" });
  check("out of scope → decline", [r.action, r.planId, r.used], ["decline", "", 2]);
  r = await plan({ request: "[fail] hands" });
  check("the model fails → unavailable, given back", [r.error, (await usage("coachA")).flash], ["unavailable", 2]);
  r = await plan({ request: "hands washing with soap at a sink" });
  check("clear → a plan", [r.action, r.seconds, r.used, !!r.planId], ["write", 8, 3, true]);
  check("... with the exact video request", r.prompt, (p) => p.includes("hands washing with soap at a sink"));
  const stored = (await db.doc(`classes/${A}/videoPlans/${r.planId}`).get()).data();
  check("... stored for startVideo", [stored.createdBy, stored.seconds, stored.words], ["coachA", 8, "hands washing with soap at a sink"]);
  check("planning spends no video credit", (await usage("coachA")).video ?? 0, 0);

  // ---------- videos ----------

  section("startVideo → checkVideo → approveVideo / discardVideo");
  const start = (planId, uid = "coachA") => call(fns.startVideoHandler, uid, { classCode: A, planId });
  const checkV = (videoId) => call(fns.checkVideoHandler, "coachA", { classCode: A, videoId });
  const newPlan = async (request) => (await plan({ request })).planId;
  const video = async (id) => (await db.doc(`classes/${A}/videos/${id}`).get()).data();
  const fileExists = async (path) => (await bucket().file(path).exists())[0];

  check("a plan that does not exist", (await start("nope")).error, "not-found");
  const okPlan = await newPlan("hands washing with soap");
  check("another coach's plan (same class)", (await start(okPlan, "coachC")).error, "not-found");
  r = await start(okPlan);
  check("start → one credit, rendering", [r.used, r.limit, (await video(r.videoId)).status], [1, 5, "rendering"]);
  const okVideo = r.videoId;
  check("... the render's id is stored", (await video(okVideo)).interactionId, (id) => /^fake-ok-/.test(id));
  r = await start(okPlan);
  check("pressed twice → the same video, no second credit", [r.videoId, r.used], [okVideo, 1]);
  check("a draft cannot be approved while rendering", (await call(fns.approveVideoHandler, "coachA", { classCode: A, videoId: okVideo })).error, "failed-precondition");
  check("nor discarded", (await call(fns.discardVideoHandler, "coachA", { classCode: A, videoId: okVideo })).error, "failed-precondition");
  r = await checkV(okVideo);
  check("check → ready", r, { videoId: okVideo, status: "ready" });
  const [draftBytes] = await bucket().file(`classes/${A}/video-drafts/${okVideo}.mp4`).download();
  check("... the draft is in Storage, an MP4", draftBytes.subarray(4, 8).toString("latin1"), "ftyp");
  const [draftMeta] = await bucket().file(`classes/${A}/video-drafts/${okVideo}.mp4`).getMetadata();
  check("... as video/mp4", draftMeta.contentType, "video/mp4");
  check("check again → still ready (idempotent)", (await checkV(okVideo)).status, "ready");
  r = await call(fns.approveVideoHandler, "coachA", { classCode: A, videoId: okVideo });
  check("approve → approved", r, { videoId: okVideo, status: "approved" });
  check("... the public copy exists", await fileExists(`classes/${A}/videos/${okVideo}.mp4`), true);
  check("... the draft is gone", await fileExists(`classes/${A}/video-drafts/${okVideo}.mp4`), false);
  check("approve again → approved (idempotent)", (await call(fns.approveVideoHandler, "coachA", { classCode: A, videoId: okVideo })).status, "approved");
  r = await write("coachA", { instruction: "Use the new video" });
  check("an approved video can go in a page", r.action, "write");
  r = await call(fns.discardVideoHandler, "coachA", { classCode: A, videoId: okVideo });
  check("discard → discarded", r, { videoId: okVideo, status: "discarded" });
  check("... the public copy is gone", await fileExists(`classes/${A}/videos/${okVideo}.mp4`), false);
  check("... and the credit is not given back", (await usage("coachA")).video, 1);
  check("discard again → discarded (idempotent)", (await call(fns.discardVideoHandler, "coachA", { classCode: A, videoId: okVideo })).status, "discarded");
  const orphan = await start(await newPlan("hands drying with a towel"));
  await checkV(orphan.videoId);
  await bucket().file(`classes/${A}/video-drafts/${orphan.videoId}.mp4`).delete();
  check("a draft whose file is gone → a plain message", (await call(fns.approveVideoHandler, "coachA", { classCode: A, videoId: orphan.videoId })).message, "The video's file is missing. Discard it and make it again.");
  check("... and it can be discarded", (await call(fns.discardVideoHandler, "coachA", { classCode: A, videoId: orphan.videoId })).status, "discarded");

  // from here on, credits are counted from what was used before each step
  let credits = (await usage("coachA")).video;

  r = await start(await newPlan("[fail-start] hands"));
  check("Omni cannot start → unavailable, credit back", [r.error, (await usage("coachA")).video], ["unavailable", credits]);
  check("... the message says so", r.message, (m) => m.includes("credit was given back"));
  r = await start(await newPlan("[fail-render] hands"));
  check("a render that fails", (await checkV(r.videoId)).status, "failed");
  check("... gives the credit back", (await usage("coachA")).video, credits);
  check("... and says why", (await video(r.videoId)).error, "The video could not be made.");
  const failedPlan = (await video(r.videoId)).planId;
  r = await start(failedPlan);
  check("its plan can be started again", [r.used, (await video(r.videoId)).status], [credits + 1, "rendering"]);
  await call(fns.checkVideoHandler, "coachA", { classCode: A, videoId: r.videoId });
  r = await start(await newPlan("[slow] hands"));
  const slow = r.videoId;
  check("a slow render stays rendering", (await checkV(slow)).status, "rendering");
  await db.doc(`classes/${A}/videos/${slow}`).update({ createdAt: Timestamp.fromMillis(Date.now() - 31 * 60 * 1000) });
  check("... after 30 minutes it fails", (await checkV(slow)).status, "failed");
  check("... and gives the credit back", (await usage("coachA")).video, credits);
  await db.doc(`classes/${A}/videos/lost1`).set({
    status: "rendering", prompt: "x", words: "x", seconds: 8, interactionId: null, planId: "x", usageMonth: monthKey(),
    createdBy: "coachA", createdAt: Timestamp.fromMillis(Date.now() - 11 * 60 * 1000), updatedAt: past,
  });
  await db.doc(`usage/coachA_${monthKey()}`).update({ video: FieldValue.increment(1) });
  check("startVideo died before the render id → fails after 10 min", (await checkV("lost1")).status, "failed");
  check("... credit back", (await usage("coachA")).video, credits);
  await db.doc(`classes/${A}/videos/old1`).set({
    status: "rendering", prompt: "x", words: "x", seconds: 8, interactionId: "fake-slow-x", planId: "x", usageMonth: "2026-08",
    createdBy: "coachA", createdAt: Timestamp.fromMillis(Date.now() - 40 * 60 * 1000), updatedAt: past,
  });
  await db.doc("usage/coachA_2026-08").set({ video: 1 });
  await checkV("old1");
  await db.doc(`classes/${A}/videos/late1`).set({
    status: "rendering", prompt: "x", words: "x", seconds: 8, interactionId: "fake-ok-late", planId: "x", usageMonth: monthKey(),
    createdBy: "coachA", createdAt: Timestamp.fromMillis(Date.now() - 45 * 60 * 1000), updatedAt: past,
  });
  await db.doc(`usage/coachA_${monthKey()}`).update({ video: FieldValue.increment(1) });
  check("a clip that finished while nobody looked is still saved", (await checkV("late1")).status, "ready");
  check("... and its credit stays used", (await usage("coachA")).video, credits + 1);
  credits += 1;
  check("a refund goes to the month the credit came from", [(await db.doc("usage/coachA_2026-08").get()).get("video"), (await usage("coachA")).video], [0, credits]);

  section("startVideo: monthly video limit");
  const usedVideos = (await usage("coachA")).video;
  await db.doc("config/limits").set({ videosPerMonth: usedVideos + 1 });
  r = await start(await newPlan("tapping a card at a gate"));
  check("the last video of the month", [r.used, r.limit], [usedVideos + 1, usedVideos + 1]);
  await checkV(r.videoId);
  r = await start(await newPlan("returning a tray"));
  check("one more → limit reached", r, { error: "resource-exhausted", message: `You have made all ${usedVideos + 1} videos for this month.` });
  await db.doc("config/limits").delete();

  // ---------- over HTTP, as the coach app calls ----------

  section("over HTTP through the Functions emulator (the coach app's way)");
  const base = `http://127.0.0.1:${PORTS.functions}/${PROJECT}/asia-southeast1`;
  const idToken = (uid) => {
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const t = Math.floor(Date.now() / 1000);
    return `${b64({ alg: "none", typ: "JWT" })}.${b64({
      iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT, sub: uid, user_id: uid, auth_time: t, iat: t, exp: t + 3600,
      email: `${uid}@example.com`, email_verified: true, firebase: { identities: {}, sign_in_provider: "google.com" },
    })}.`;
  };
  async function http(name, uid, data) {
    const res = await fetch(`${base}/${name}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(uid ? { authorization: `Bearer ${idToken(uid)}` } : {}) },
      body: JSON.stringify({ data }),
    });
    return res.json();
  }
  await db.doc(`usage/coachA_${monthKey()}`).delete();
  let h = await http("writePage", "coachA", { classCode: A, instruction: "A picture story about the bus", markdown: "" });
  check("writePage → a page from the fake helper", [h.result?.action, h.result?.used], ["write", 1]);
  h = await http("writePage", null, { classCode: A, instruction: "A page" });
  check("no ID token → UNAUTHENTICATED", h.error?.status, "UNAUTHENTICATED");
  h = await http("writePage", "coachB", { classCode: A, instruction: "A page" });
  check("another class's coach → the plain message", [h.error?.status, h.error?.message], ["PERMISSION_DENIED", "You are not a coach of this class."]);
  h = await http("planVideo", "coachA", { classCode: A, request: "a tray returned at a hawker centre" });
  check("planVideo → a plan", [h.result?.action, !!h.result?.planId], ["write", true]);
  const httpPlan = h.result?.planId;
  h = await http("startVideo", "coachA", { classCode: A, planId: httpPlan });
  check("startVideo → rendering", !!h.result?.videoId, true);
  const httpVideo = h.result?.videoId;
  h = await http("checkVideo", "coachA", { classCode: A, videoId: httpVideo });
  check("checkVideo → ready", h.result?.status, "ready");
  h = await http("approveVideo", "coachA", { classCode: A, videoId: httpVideo });
  check("approveVideo → approved", h.result?.status, "approved");
  const media = await fetch(`http://127.0.0.1:${PORTS.storage}/v0/b/simplify-special.firebasestorage.app/o/${encodeURIComponent(`classes/${A}/videos/${httpVideo}.mp4`)}?alt=media`);
  check("a learner (no sign-in) can fetch the approved video", [media.status, media.headers.get("content-type")], [200, "video/mp4"]);
  h = await http("discardVideo", "coachA", { classCode: A, videoId: httpVideo });
  check("discardVideo → discarded", h.result?.status, "discarded");

  console.log(failed ? `\n${failed} of ${count} failed` : `\nall ${count} passed`);
  process.exit(failed ? 1 : 0);
}
