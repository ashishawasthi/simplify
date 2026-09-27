// Cloud Functions tests: the six callables and the three triggers in functions/index.js, with the fake
// models (SIMPLIFY_AI_FAKE=1 — nothing is sent to Gemini and nothing costs money):
//
//   node tools/test-functions.mjs
//
// It starts the Auth, Firestore, Storage, Realtime Database and Functions emulators itself, from a
// temporary firebase.json with ports of its own, then
//   - calls the handlers directly (so it can also move time: a render that is
//     30 minutes old), against the Firestore and Storage emulators, and
//   - calls a few of them over HTTP through the Functions emulator, exactly as
//     the coach app does (callable protocol, an ID token, functions/.env.local).
// Covers: who may call (only an approved, unsuspended coach of an active class), write / ask / decline, the free answer for an empty
// instruction, monthly limits (also under parallel calls, and a coach's own limit), refunds, the Singapore
// month, the page check, the overlay planner (marks → shapes), make → check → approve / discard, the push
// signal, and the emails the triggers queue in mail/ (to whom, once only, the day's cap).
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
  eventarc: 9621, tasks: 9721, database: 9821,
};

// ---------- outside: the copy check, then the emulators, then this file inside them ----------

if (process.env.SIMPLIFY_FUNCTIONS_INSIDE !== "1") {
  const copy = spawn(process.execPath, [join(ROOT, "tools", "copy-class-markdown.mjs"), "--check"], { stdio: "inherit" });
  const copyOk = await new Promise((r) => copy.on("exit", (code) => r(code === 0)));

  const dir = mkdtempSync(join(tmpdir(), "simplify-functions-"));
  writeFileSync(join(dir, "firebase.json"), JSON.stringify({
    firestore: { rules: join(ROOT, "firestore.rules") },
    storage: { rules: join(ROOT, "storage.rules") },
    database: { rules: join(ROOT, "database.rules.json") },
    // relative: the CLI reads a functions source as relative to the config's folder
    functions: [{ source: relative(dir, join(ROOT, "functions")), codebase: "default", runtime: "nodejs22" }],
    emulators: {
      auth: { port: PORTS.auth },
      firestore: { port: PORTS.firestore, websocketPort: PORTS.websocket },
      storage: { port: PORTS.storage },
      database: { port: PORTS.database },
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
    "emulators:exec", "--only", "auth,firestore,storage,database,functions",
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
  const { getDatabaseWithUrl } = await import(pathToFileURL(fromFunctions.resolve("firebase-admin/database")).href);
  const { DATABASE_URL, signalFor, classSignalHandler } = await import(pathToFileURL(join(ROOT, "functions", "signal.js")).href);
  const signalNow = async (code) => (await getDatabaseWithUrl(DATABASE_URL).ref(`signals/${code}`).get()).val();

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

  const A = "K7M3RQP9T"; // active: coachA, coachC, coachS (suspended), coachP (waiting), coachD (declined)
  const P = "P9TK7M3RQ"; // paused: coachA
  const past = Timestamp.fromDate(new Date("2026-09-01T02:00:00Z"));
  const seeds = {
    "coaches/coachA": { name: "Coach A", email: "coachA@example.com", institutions: ["awwa-school-napiri"], status: "approved", createdAt: past },
    "coaches/coachB": { name: "Coach B", email: "coachB@example.com", institutions: ["awwa-school-napiri"], status: "approved", createdAt: past },
    "coaches/coachC": { name: "Coach C", email: "coachC@example.com", institutions: ["awwa-school-napiri"], status: "approved", createdAt: past },
    "coaches/coachS": { name: "Coach S", email: "coachS@example.com", institutions: ["awwa-school-napiri"], status: "approved", createdAt: past, suspended: true },
    "coaches/coachP": { name: "Coach P", email: "coachP@example.com", institutions: ["awwa-school-napiri"], status: "pending", createdAt: past },
    "coaches/coachD": { name: "Coach D", email: "coachD@example.com", institutions: ["awwa-school-napiri"], status: "declined", createdAt: past },
    // made before approvals existed: no status yet, so not approved
    "coaches/coachL": { name: "Coach L", email: "coachL@example.com", org: "AWWA School @ Napiri", createdAt: past },
    [`classes/${A}`]: { name: "3 Kindness", institution: "awwa-school-napiri", status: "active", latest: null, createdAt: past, updatedAt: past },
    [`classes/${P}`]: { name: "4 Care", institution: "awwa-school-napiri", status: "suspended", latest: null, createdAt: past, updatedAt: past },
    // a coach waiting for (or refused by) the admin is refused even when listed
    [`classCoaches/${A}`]: { uids: ["coachA", "coachS", "coachC", "coachP", "coachD", "coachL"] },
    [`classCoaches/${P}`]: { uids: ["coachA"] },
    [`classes/${A}/pictures/busstop1`]: { words: "Our bus stop", file: "pictures/busstop1.jpg", width: 1600, height: 1200, createdAt: past, createdBy: "coachA" },
    [`classes/${A}/videos/wash1`]: { kind: "page", status: "approved", words: "Hands washing", title: "Hands", execution: "x", createdBy: "coachA", createdAt: past, updatedAt: past },
    [`classes/${A}/pages/pg1`]: { title: "The bus", markdown: "# The bus\nI wait at the bus stop.\n---\n![Our bus stop](pictures/busstop1.jpg)\nThe bus comes.", createdAt: past, updatedAt: past },
    [`classes/${A}/pages/empty1`]: { title: "Nothing yet", markdown: "  ", createdAt: past, updatedAt: past },
  };
  for (const [path, data] of Object.entries(seeds)) await db.doc(path).set(data);
  // the shelf picture's file (the overlay planner sends it to Flash; the fake only needs it there)
  await bucket().file(`classes/${A}/pictures/busstop1.jpg`).save(Buffer.from([0xff, 0xd8, 0xff, 0xd9]), { contentType: "image/jpeg" });

  // ---------- who may call ----------

  section("who may call (writePage stands for all six)");
  const W = fns.writePageHandler;
  const write = (uid, data) => call(W, uid, { classCode: A, instruction: "Write a story about the bus", markdown: "", ...data });
  check("not signed in", (await write(null)).error, "unauthenticated");
  check("signed in, no coach profile", await write("stranger"), { error: "permission-denied", message: "Fill in About you first." });
  check("suspended coach", await write("coachS"), { error: "permission-denied", message: "Your account is paused. Ask the admin." });
  check("coach waiting for the admin", await write("coachP"), { error: "permission-denied", message: "Your application is waiting for the admin's approval." });
  check("coach the admin declined", await write("coachD"), { error: "permission-denied", message: "Your application was not approved. Please contact the admin." });
  check("coach from before approvals (no status)", await write("coachL"), { error: "permission-denied", message: "Your application is waiting for the admin's approval." });
  check("coach of another class", await write("coachB"), { error: "permission-denied", message: "You are not a coach of this class." });
  check("class that does not exist", (await write("coachA", { classCode: "ZZZZZZZZZ" })).message, "You are not a coach of this class.");
  check("paused class", await write("coachA", { classCode: P }), { error: "failed-precondition", message: "This class is paused by the admin." });
  check("a code with dashes and lower case is fine", (await write("coachA", { classCode: "k7m-3rq-p9t" })).action, "write");
  check("a code that is too short", (await write("coachA", { classCode: "K7M" })).error, "invalid-argument");
  check("an instruction over 1000 characters", (await write("coachA", { instruction: "x".repeat(1001) })).error, "invalid-argument");
  check("a page over 20000 characters", (await write("coachA", { markdown: "x".repeat(20001) })).error, "invalid-argument");
  for (const [name, handler, data] of [
    ["planOverlay", fns.planOverlayHandler, { pictureId: "busstop1", request: "an arrow to the sign" }],
    ["makeVideo", fns.makeVideoHandler, { pageId: "pg1" }],
    ["checkVideo", fns.checkVideoHandler, { videoId: "nope" }],
    ["approveVideo", fns.approveVideoHandler, { videoId: "nope" }],
    ["discardVideo", fns.discardVideoHandler, { videoId: "nope" }],
  ]) {
    check(`${name}: coach of another class`, (await call(handler, "coachB", { classCode: A, ...data })).error, "permission-denied");
    check(`${name}: suspended coach`, (await call(handler, "coachS", { classCode: A, ...data })).error, "permission-denied");
    check(`${name}: coach waiting for the admin`, await call(handler, "coachP", { classCode: A, ...data }),
      { error: "permission-denied", message: "Your application is waiting for the admin's approval." });
    check(`${name}: coach the admin declined`, (await call(handler, "coachD", { classCode: A, ...data })).error, "permission-denied");
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
  check("the 6th → limit reached", r, { error: "resource-exhausted", message: "You have used all 5 AI requests for this month." });
  r = await write("coachA", { instruction: "" });
  check("an empty instruction still gets its free question", [r.action, r.used, r.limit], ["ask", 5, 5]);
  await db.doc("config/limits").set({ flashPerMonth: 8 });
  const parallel = await Promise.all(Array.from({ length: 6 }, () => write("coachA")));
  check("6 at once with 3 left → exactly 3 written", parallel.filter((x) => x.action === "write").length, 3);
  check("... the other 3 refused", parallel.filter((x) => x.error === "resource-exhausted").length, 3);
  check("... and the count is exactly the limit", (await usage("coachA")).flash, 8);
  await db.doc("config/limits").set({ flashPerMonth: "lots", videosPerMonth: -1 });
  r = await call(fns.writePageHandler, "coachA", { classCode: A, instruction: "" });
  check("a broken limits doc falls back to the defaults (200)", r.limit, 200);
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

  // ---------- planOverlay ----------

  section("planOverlay: marks over a picture, placed by code");
  await db.doc(`usage/coachA_${monthKey()}`).delete();
  const mark = (data) => call(fns.planOverlayHandler, "coachA", { classCode: A, pictureId: "busstop1", ...data });
  r = await mark({ request: "" });
  check("nothing asked → a free answer, not counted", [r.action, r.shapes.length, r.used], ["none", 0, 0]);
  r = await mark({ request: "an arrow to the sign", pictureId: "nope" });
  check("a picture not on the shelf", r.error, "not-found");
  r = await mark({ request: "an arrow to the sign" });
  check("marked → shapes, one AI request", [r.action, r.shapes.map((x) => x.type), r.used], ["draw", ["circle", "arrow"], 1]);
  check("... a ring round the thing found, sized on the photo's shorter side (1600×1200)", r.shapes[0], { type: "circle", at: [500, 500], r: 230 });
  check("marks → shapes: a ring on a square picture", fns.markToShape({ kind: "circle", target: [350, 350, 650, 650] }), { type: "circle", at: [500, 500], r: 173 });
  check("marks → shapes: a tall thing on a wide photo gets a ring that fits it", fns.markToShape({ kind: "circle", target: [100, 450, 900, 550] }, { width: 1920, height: 1080 }).r, 460);
  check("... an arrow ending just outside it", r.shapes[1].to, (to) => to.every((v) => v >= 0 && v <= 1000) && (to[0] < 350 || to[0] > 650 || to[1] < 350 || to[1] > 650));
  r = await mark({ request: "nothing here" });
  check("not found → none, with a plain note", [r.action, r.shapes.length, !!r.note], ["none", 0, true]);
  r = await mark({ request: "a beer bottle" });
  check("out of scope → decline, counted", [r.action, (await usage("coachA")).declined], ["decline", 1]);
  r = await mark({ request: "[fail] the sign" });
  check("the model fails → unavailable, given back", [r.error, (await usage("coachA")).flash], ["unavailable", 3]);
  check("marks → shapes: a box, padded", fns.markToShape({ kind: "box", target: [100, 200, 300, 400] }), { type: "box", from: [180, 80], to: [420, 320] });
  check("marks → shapes: a label above the thing", fns.markToShape({ kind: "label", target: [400, 400, 600, 600], text: "The tap" }), { type: "label", at: [500, 340], text: "The tap" });
  check("marks → shapes: a bad box is dropped", fns.markToShape({ kind: "arrow", target: [1, 2] }), null);

  // ---------- videos ----------

  section("makeVideo → checkVideo → approveVideo / discardVideo");
  const makeV = (data = {}, uid = "coachA") => call(fns.makeVideoHandler, uid, { classCode: A, pageId: "pg1", ...data });
  const checkV = (videoId) => call(fns.checkVideoHandler, "coachA", { classCode: A, videoId });
  const video = async (id) => (await db.doc(`classes/${A}/videos/${id}`).get()).data();
  const fileExists = async (path) => (await bucket().file(path).exists())[0];
  const withPage = async (markdown) => {
    await db.doc(`classes/${A}/pages/pgx`).set({ title: "Test", markdown, createdAt: past, updatedAt: past });
    return makeV({ pageId: "pgx" });
  };

  check("a page that does not exist", (await makeV({ pageId: "nope" })).error, "not-found");
  check("an empty page", (await makeV({ pageId: "empty1" })).message, "The page is empty. Write it first, then make its video.");
  r = await makeV({ readAloud: false, overlays: {
    busstop1: [{ type: "arrow", from: [900, 100], to: [500, 400] }, { type: "star", at: [1, 2] }],
    other: [{ type: "circle", at: [500, 500], r: 100 }],
  } });
  check("make → one video, rendering", [r.used, r.limit, (await video(r.videoId)).status], [1, 20, "rendering"]);
  const okVideo = r.videoId;
  const made = await video(okVideo);
  check("... the run's name is stored", made.execution, (id) => /^fake-ok-/.test(id));
  check("... what to make: the page as it is now, its title, the class", [made.kind, made.title, made.className, made.markdown.startsWith("# The bus")], ["page", "The bus", "3 Kindness", true]);
  check("... read aloud off, music on (not asked)", [made.readAloud, made.music], [false, true]);
  check("... only good marks, only for the page's pictures", made.overlays, { busstop1: [{ type: "arrow", from: [900, 100], to: [500, 400] }] });
  check("... words for screen readers", made.words, "Video of the page: The bus");
  check("a video cannot be approved while being made", (await call(fns.approveVideoHandler, "coachA", { classCode: A, videoId: okVideo })).error, "failed-precondition");
  check("nor discarded", (await call(fns.discardVideoHandler, "coachA", { classCode: A, videoId: okVideo })).error, "failed-precondition");
  r = await checkV(okVideo);
  check("check → ready (the stand-in renderer's draft)", r, { videoId: okVideo, status: "ready" });
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
  check("... and the video is not given back", (await usage("coachA")).video, 1);
  check("discard again → discarded (idempotent)", (await call(fns.discardVideoHandler, "coachA", { classCode: A, videoId: okVideo })).status, "discarded");
  const orphan = await makeV();
  await checkV(orphan.videoId);
  await bucket().file(`classes/${A}/video-drafts/${orphan.videoId}.mp4`).delete();
  check("a draft whose file is gone → a plain message", (await call(fns.approveVideoHandler, "coachA", { classCode: A, videoId: orphan.videoId })).message, "The video's file is missing. Discard it and make it again.");
  check("... and it can be discarded", (await call(fns.discardVideoHandler, "coachA", { classCode: A, videoId: orphan.videoId })).status, "discarded");

  // from here on, videos are counted from what was used before each step
  let credits = (await usage("coachA")).video;

  r = await withPage("# Bus\n[fail-start]");
  check("the renderer cannot start → unavailable, not counted", [r.error, (await usage("coachA")).video], ["unavailable", credits]);
  check("... the message says so", r.message, (m) => m.includes("It was not counted"));
  r = await withPage("# Bus\n[fail-render]");
  check("a render that fails", (await checkV(r.videoId)).status, "failed");
  check("... gives the video back", (await usage("coachA")).video, credits);
  check("... and says why", (await video(r.videoId)).error, "The video could not be made.");
  r = await makeV();
  await db.doc(`classes/${A}/videos/${r.videoId}`).update({ renderError: "the page is empty" });
  check("the renderer wrote why it stopped → failed", (await checkV(r.videoId)).status, "failed");
  check("... the video back", (await usage("coachA")).video, credits);
  r = await withPage("# Bus\n[slow]");
  const slow = r.videoId;
  check("a slow render stays rendering", (await checkV(slow)).status, "rendering");
  await db.doc(`classes/${A}/videos/${slow}`).update({ createdAt: Timestamp.fromMillis(Date.now() - 31 * 60 * 1000) });
  check("... after 30 minutes it fails", (await checkV(slow)).status, "failed");
  check("... and gives the video back", (await usage("coachA")).video, credits);
  await db.doc(`classes/${A}/videos/lost1`).set({
    kind: "page", status: "rendering", words: "x", markdown: "# x", execution: null, usageMonth: monthKey(),
    createdBy: "coachA", createdAt: Timestamp.fromMillis(Date.now() - 11 * 60 * 1000), updatedAt: past,
  });
  await db.doc(`usage/coachA_${monthKey()}`).update({ video: FieldValue.increment(1) });
  check("makeVideo died before the run's name → fails after 10 min", (await checkV("lost1")).status, "failed");
  check("... the video back", (await usage("coachA")).video, credits);
  await db.doc(`classes/${A}/videos/old1`).set({
    kind: "page", status: "rendering", words: "x", markdown: "# x", execution: "fake-slow-x", usageMonth: "2026-08",
    createdBy: "coachA", createdAt: Timestamp.fromMillis(Date.now() - 40 * 60 * 1000), updatedAt: past,
  });
  await db.doc("usage/coachA_2026-08").set({ video: 1 });
  await checkV("old1");
  check("a video given back goes to the month it came from", [(await db.doc("usage/coachA_2026-08").get()).get("video"), (await usage("coachA")).video], [0, credits]);

  section("makeVideo: monthly video limit, and a coach's own");
  const usedVideos = (await usage("coachA")).video;
  await db.doc("config/limits").set({ videosPerMonth: usedVideos + 1 });
  r = await makeV();
  check("the last video of the month", [r.used, r.limit], [usedVideos + 1, usedVideos + 1]);
  await checkV(r.videoId);
  r = await makeV();
  check("one more → limit reached, and how to get more", r, { error: "resource-exhausted", message: `You have made all ${usedVideos + 1} videos for this month. You can ask the admin for more.` });
  await db.doc("coaches/coachA").update({ limits: { videosPerMonth: usedVideos + 3 } });
  r = await makeV();
  check("the admin gave this coach more → made", [r.used, r.limit], [usedVideos + 2, usedVideos + 3]);
  await checkV(r.videoId);
  check("... others still have everyone's limit", (await call(fns.makeVideoHandler, "coachC", { classCode: A, pageId: "pg1" })).limit, usedVideos + 1);
  await db.doc("coaches/coachA").update({ limits: { videosPerMonth: "lots" } });
  check("a broken own limit → everyone's", (await makeV()).error, "resource-exhausted");
  await db.doc("coaches/coachA").update({ limits: FieldValue.delete() });
  await db.doc("config/limits").delete();

  // ---------- over HTTP, as the coach app calls ----------

  section("classSignal: the push signal learners' devices listen to");
  const S = "SGNKHS234";
  const at = Timestamp.fromDate(new Date("2026-09-26T01:02:03.456Z"));
  const page = (extra = {}) => ({ pageId: "p1", title: "Bus", markdown: "# Bus", publishedAt: at, publishedBy: "coachA", ...extra });
  const cls = (extra = {}) => ({ name: "7 Joy", institution: "awwa-school-napiri", status: "active", latest: page(), createdAt: past, updatedAt: past, ...extra });
  check("a published page → its time, not forced", signalFor(cls()), { at: at.toMillis(), force: false });
  check("a forced page → force: true", signalFor(cls({ latest: page({ force: true }) })), { at: at.toMillis(), force: true });
  check("nothing published → none", signalFor(cls({ latest: null })), null);
  check("a paused class → none", signalFor(cls({ status: "suspended" })), null);
  check("no class → none", signalFor(undefined), null);
  check("force must be exactly true", signalFor(cls({ latest: page({ force: "yes" }) })).force, false);
  // the handler, called directly, as the trigger calls it
  const event = (before, after, code = S) => ({ params: { code }, data: { before: { data: () => before }, after: { data: () => after } } });
  await db.doc(`classes/${S}`).set(cls({ latest: page({ force: true }) }));
  check("publishing sets signals/<code>", await classSignalHandler(event(cls({ latest: null }), cls({ latest: page({ force: true }) }))), { at: at.toMillis(), force: true });
  check("... which is exactly { at, force }", await signalNow(S), { at: at.toMillis(), force: true });
  check("a new name alone writes nothing", await classSignalHandler(event(cls({ latest: page({ force: true }) }), cls({ name: "8 Joy", latest: page({ force: true }) }))), null);
  await db.doc(`classes/${S}`).set(cls({ latest: null }));
  check("unpublishing removes the signal", await classSignalHandler(event(cls(), cls({ latest: null }))), null);
  check("... it is gone", await signalNow(S), null);
  await db.doc(`classes/${S}`).set(cls());
  await classSignalHandler(event(cls({ latest: null }), cls({ latest: page({ force: true }) })));
  check("out of order: the signal follows the class as it is now", await signalNow(S), { at: at.toMillis(), force: false });
  check("a code that is not a class code writes nothing", await classSignalHandler(event(null, cls(), "bad")), null);

  section("classSignal through the emulators: a publish reaches the signal by itself");
  const T = "TRGKHS234";
  await db.doc(`classes/${T}`).set(cls({ latest: null }));
  const published = Timestamp.now();
  await db.doc(`classes/${T}`).update({ latest: page({ publishedAt: published, force: true }), updatedAt: published });
  let seen = null;
  for (const end = Date.now() + 20000; Date.now() < end && !seen; await new Promise((r) => setTimeout(r, 250))) seen = await signalNow(T);
  check("the trigger set signals/<code> after the publish", seen, { at: published.toMillis(), force: true });
  await db.doc(`classes/${T}`).update({ status: "suspended" });
  for (const end = Date.now() + 20000; Date.now() < end && seen; await new Promise((r) => setTimeout(r, 250))) seen = await signalNow(T);
  check("the admin pausing the class removes it", seen, null);

  // ---------- email: what coachMail and requestMail queue for the extension ----------

  section("email: coachMail and requestMail (called directly)");
  const { ADMIN_MAILS_PER_DAY, adminAddresses, coachMailHandler, dayKey, escapeHtml, requestMailHandler } =
    await import(pathToFileURL(join(ROOT, "functions", "mail.js")).href);
  const mailDoc = async (id) => (await db.doc(`mail/${id}`).get()).data() ?? null;
  const mailIds = async (prefix) => (await db.collection("mail").get()).docs.map((d) => d.id).filter((id) => id.startsWith(prefix));
  const sentToday = async () => (await db.doc(`mailCounts/${dayKey()}`).get()).get("admin") ?? 0;
  const written = (params, before, after) => ({ id: "evt", params, data: { before: { data: () => before }, after: { data: () => after } } });
  // two admins with a coach profile each, and one with none yet (no address)
  await db.doc(`mailCounts/${dayKey()}`).delete();
  for (const [uid, name] of [["adm1", "Admin One"], ["adm2", "Admin Two"]]) {
    await db.doc(`coaches/${uid}`).set({ name, email: `${uid}@example.com`, institutions: ["awwa-school-napiri"], status: "approved", createdAt: past });
  }
  for (const uid of ["adm1", "adm2", "adm3"]) await db.doc(`admins/${uid}`).set({ note: "test" });

  check("the Singapore day: 00:30 on the 27th", dayKey(Date.parse("2026-09-26T16:30:00Z")), "2026-09-27");
  check("... and 23:59 on the 26th", dayKey(Date.parse("2026-09-26T15:59:00Z")), "2026-09-26");
  check("text is escaped for the HTML", escapeHtml(`<b>"Tom" & 'Jerry'</b>`), "&lt;b&gt;&quot;Tom&quot; &amp; &#039;Jerry&#039;&lt;/b&gt;");
  check("admins' addresses come from their coach profiles", await adminAddresses(),
    [{ uid: "adm1", email: "adm1@example.com" }, { uid: "adm2", email: "adm2@example.com" }]);

  const signedUp = Timestamp.fromDate(new Date("2026-09-27T01:00:00Z"));
  const lim = { name: "Mr <Lim>", email: "lim@example.com", note: "Call me on 9123 4567", institutions: ["awwa-school-napiri"], status: "pending", createdAt: signedUp };
  const coachChange = (before, after, uid = "lim1") => written({ uid }, before, after);
  // every email to admins is counted: the day's count equals the admin emails queued since it was reset
  const adminMails = async () => (await db.collection("mail").get()).docs.filter((d) => /^(coach|request)-/.test(d.id)).length;
  check("a new coach profile → an email to each admin", await coachMailHandler(coachChange(null, lim)), { kind: "coach-waiting", queued: 2 });
  check("... counted for the day, one per email", await sentToday(), await adminMails());
  const waiting = await mailDoc(`coach-lim1-${signedUp.toMillis()}-adm1`);
  check("... to the admin's own address", waiting?.to, "adm1@example.com");
  check("... a subject without the coach's own words", waiting?.message?.subject, "A coach is waiting for your approval");
  check("... the name quoted and escaped in the HTML", waiting?.message?.html.includes(`"Mr &lt;Lim&gt;"`), true);
  check("... with the Admin screen's address", waiting?.message?.html.includes("https://simplify.whiz.coach/coach/#admin"), true);
  check("... but not what the coach wrote about themself", waiting?.message?.html.includes("9123"), false);
  check("the same event again queues nothing more", await coachMailHandler(coachChange(null, lim)), { kind: "coach-waiting", queued: 0 });
  check("... one email for each admin, not counted again", [(await mailIds("coach-lim1-")).length, (await sentToday()) === (await adminMails())], [2, true]);
  const flip = String.fromCodePoint(0x202e); // RIGHT-TO-LEFT OVERRIDE: would show what follows backwards
  await coachMailHandler(coachChange(null, { ...lim, name: `Mr ${flip}miL` }, "lim3"));
  check("a direction-changing character in a name is dropped", (await mailDoc(`coach-lim3-${signedUp.toMillis()}-adm1`))?.message?.html.includes(flip), false);
  check("an edit while waiting sends nothing", await coachMailHandler(coachChange(lim, { ...lim, name: "Mr Lim" })), null);
  check("an admin's decision on a coach sends nothing", await coachMailHandler(coachChange(lim, { ...lim, status: "approved" })), null);
  check("an approved coach put back to waiting sends nothing", await coachMailHandler(coachChange({ ...lim, status: "approved" }, lim)), null);
  const legacy = { name: "Coach L", email: "coachL@example.com", createdAt: past };
  check("a profile from before approvals put to waiting sends nothing", await coachMailHandler(coachChange(legacy, { ...legacy, status: "pending" }, "coachL")), null);
  check("a profile deleted sends nothing", await coachMailHandler(coachChange(lim, null)), null);
  const declined = { ...lim, status: "declined", decisionMessage: "Please add a work email I can check." };
  check("an admin putting a declined coach back to waiting sends nothing", await coachMailHandler(coachChange(declined, { ...declined, status: "pending" })), null);
  const askedAgain = Timestamp.fromDate(new Date("2026-09-27T03:00:00Z"));
  check("a declined coach asking again → each admin again",
    await coachMailHandler(coachChange(declined, { ...declined, status: "pending", reappliedAt: askedAgain })), { kind: "coach-asked-again", queued: 2 });
  check("... in a new email that says so", (await mailDoc(`coach-lim1-${askedAgain.toMillis()}-adm2`))?.message?.subject, "A coach asked again to be approved");
  await db.doc(`mailCounts/${dayKey()}`).set({ admin: ADMIN_MAILS_PER_DAY - 1 });
  check("past the day's cap → no email, and each admin is told once",
    await coachMailHandler(coachChange(null, lim, "lim2")), { kind: "coach-waiting", queued: 0, capped: true, notified: true });
  check("... nothing was queued about it", (await mailIds("coach-lim2-")).length, 0);
  check("... the notice", (await mailDoc(`capped-${dayKey()}-adm2`))?.message?.subject, "More is waiting on Simplify");
  check("the next one past the cap: no second notice",
    await coachMailHandler(coachChange(null, lim, "lim4")), { kind: "coach-waiting", queued: 0, capped: true, notified: false });
  check("... still one notice for each admin", (await mailIds(`capped-${dayKey()}-`)).length, 2);
  await db.doc(`mailCounts/${dayKey()}`).delete();

  const requestChange = (before, after, id) => written({ id }, before, after);
  const askJoin = { uid: "coachA", kind: "join-class", classCode: A, note: "I teach it with Ms Tan", status: "pending", createdAt: signedUp };
  check("a request to join a class → each admin", await requestMailHandler(requestChange(null, askJoin, "rq1")), { kind: "join-class-waiting", queued: 2 });
  const joinMail = await mailDoc("request-rq1-adm2");
  check("... the coach and the code, in the body", [joinMail?.message?.subject, joinMail?.message?.html.includes(`"Coach A" asked to join the class K7M-3RQ-P9T`)], ["A coach asked to join a class", true]);
  check("... not the coach's note", joinMail?.message?.html.includes("Ms Tan"), false);
  check("the same request again queues nothing more", (await requestMailHandler(requestChange(null, askJoin, "rq1"))).queued, 0);
  const more = { uid: "coachB", kind: "more-videos", note: "", status: "pending", createdAt: signedUp };
  check("a request for more videos → each admin", await requestMailHandler(requestChange(null, more, "rq2")), { kind: "more-videos-waiting", queued: 2 });
  check("an old 'new class' request sends nothing",
    await requestMailHandler(requestChange(null, { uid: "coachA", kind: "new-class", className: "5 Joy", status: "pending", createdAt: signedUp }, "rq3")), null);

  const decided = (request, status, extra = {}) => ({ ...request, status, decidedAt: signedUp, decidedBy: "adm1", decisionLog: "log1", ...extra });
  check("a join approved → the coach", await requestMailHandler(requestChange(askJoin, decided(askJoin, "approved", { resultCode: A }), "rq1")), { kind: "join-class-approved", queued: 1 });
  const joined = await mailDoc("decided-rq1");
  check("... to the coach's own address", joined?.to, "coachA@example.com");
  check("... naming the class", [joined?.message?.subject, joined?.message?.html.includes("3 Kindness (K7M-3RQ-P9T)")], ["You can now open 3 Kindness", true]);
  check("the same decision again queues nothing more",
    (await requestMailHandler(requestChange(askJoin, decided(askJoin, "approved", { resultCode: A }), "rq1"))).queued, 0);
  const joinB = { ...askJoin, uid: "coachB" };
  check("a join declined → the coach", await requestMailHandler(requestChange(joinB, decided(joinB, "declined"), "rq4")), { kind: "join-class-declined", queued: 1 });
  const refused = await mailDoc("decided-rq4");
  check("... names the code they typed, not the class", [refused?.message?.html.includes("K7M-3RQ-P9T"), refused?.message?.html.includes("3 Kindness")], [true, false]);
  check("more videos given → the coach", await requestMailHandler(requestChange(more, decided(more, "approved", { videosPerMonth: 60 }), "rq2")), { kind: "more-videos-approved", queued: 1 });
  check("... with the number", (await mailDoc("decided-rq2"))?.message?.subject, "You can make 60 videos a month now");
  check("more videos declined → the coach", (await requestMailHandler(requestChange(more, decided(more, "declined"), "rq5"))).kind, "more-videos-declined");
  check("... says so", (await mailDoc("decided-rq5"))?.message?.subject, "Your request for more videos was not approved");
  check("more videos approved without a number → still approved",
    (await requestMailHandler(requestChange(more, decided(more, "approved"), "rq9"))).kind, "more-videos-approved");
  check("... in general words", (await mailDoc("decided-rq9"))?.message?.subject, "You can make more videos a month now");
  check("a coach with no profile gets nothing (no address)",
    await requestMailHandler(requestChange({ ...more, uid: "ghost" }, decided({ ...more, uid: "ghost" }, "declined"), "rq6")), { kind: "more-videos-declined", queued: 0 });
  check("a decision changed later sends nothing", await requestMailHandler(requestChange(decided(more, "declined"), decided(more, "approved"), "rq7")), null);
  check("a request deleted sends nothing", await requestMailHandler(requestChange(askJoin, null, "rq8")), null);

  section("email through the emulators: the triggers queue it by themselves");
  const waitForMail = async (id) => {
    let found = null;
    for (const end = Date.now() + 20000; Date.now() < end && !found; await new Promise((r) => setTimeout(r, 250))) found = await mailDoc(id);
    return found;
  };
  const joinedAt = Timestamp.now();
  await db.doc("coaches/ong1").set({ name: "Ms Ong", email: "ong@example.com", institutions: ["awwa-school-napiri"], status: "pending", createdAt: joinedAt });
  check("a new coach profile → the admins' emails", (await waitForMail(`coach-ong1-${joinedAt.toMillis()}-adm1`))?.to, "adm1@example.com");
  await db.doc("requests/trig1").set({ uid: "coachA", kind: "more-videos", note: "", status: "pending", createdAt: Timestamp.now() });
  check("a new request → the admins' emails", (await waitForMail("request-trig1-adm2"))?.to, "adm2@example.com");
  await db.doc("requests/trig1").update({ status: "declined", decidedAt: Timestamp.now(), decidedBy: "adm1", decisionLog: "log9" });
  check("the admin's decision → the coach's email", (await waitForMail("decided-trig1"))?.to, "coachA@example.com");

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
  h = await http("writePage", "coachP", { classCode: A, instruction: "A page" });
  check("a coach waiting for the admin → the plain message", [h.error?.status, h.error?.message], ["PERMISSION_DENIED", "Your application is waiting for the admin's approval."]);
  h = await http("planOverlay", "coachA", { classCode: A, pictureId: "busstop1", request: "a ring round the sign" });
  check("planOverlay → shapes", [h.result?.action, h.result?.shapes?.length], ["draw", 2]);
  h = await http("makeVideo", "coachA", { classCode: A, pageId: "pg1" });
  check("makeVideo → being made", !!h.result?.videoId, true);
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
