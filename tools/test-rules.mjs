// Security rules tests: firestore.rules and storage.rules, run in the Firebase
// emulators and driven over their REST APIs with unsigned test tokens (the
// emulators accept them). No dependencies beyond the Firebase CLI and Java:
//
//   node tools/test-rules.mjs
//
// It starts the Auth, Firestore and Storage emulators itself, from a temporary
// firebase.json with ports of its own (so it runs beside `firebase emulators:start`
// or another test), runs every case, and stops them. Each case says who asks,
// what they try, and whether the rules must let them.

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PROJECT = "simplify-special";
const BUCKET = "simplify-special.firebasestorage.app";

// ---------- outside: start the emulators and run this file again inside them ----------

if (process.env.SIMPLIFY_RULES_INSIDE !== "1") {
  const dir = mkdtempSync(join(tmpdir(), "simplify-rules-"));
  writeFileSync(join(dir, "firebase.json"), JSON.stringify({
    firestore: { rules: join(ROOT, "firestore.rules") },
    storage: { rules: join(ROOT, "storage.rules") },
    emulators: {
      auth: { port: 9311 },
      firestore: { port: 8311, websocketPort: 9511 },
      storage: { port: 9411 },
      hub: { port: 4411 },
      logging: { port: 4511 },
      ui: { enabled: false },
    },
  }, null, 2));
  // TMPDIR: the emulators keep their hub locator and Storage files in the OS temp
  // folder, shared by every emulator suite of the project — a run of its own
  // must not see (or clean up) another's
  const child = spawn("firebase", [
    "emulators:exec", "--only", "auth,firestore,storage",
    "--config", join(dir, "firebase.json"), "--project", PROJECT,
    `node "${fileURLToPath(import.meta.url)}"`,
  ], { cwd: dir, env: { ...process.env, SIMPLIFY_RULES_INSIDE: "1", TMPDIR: dir }, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  child.stdout.on("data", (d) => {
    log += d;
    // the test's own lines ("ok", "FAIL", the summary) as they come
    for (const line of String(d).split("\n")) if (/^(ok  |FAIL|all |\d+ of |—)/.test(line)) console.log(line);
  });
  child.stderr.on("data", (d) => { log += d; });
  child.on("exit", (code) => {
    if (code !== 0 && !/\d+ of \d+ failed/.test(log)) console.log(log); // the emulators did not start: show why
    rmSync(dir, { recursive: true, force: true });
    process.exit(code ?? 1);
  });
} else {
  await runInside();
}

// ---------- inside: the cases ----------

async function runInside() {
  const FS = `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;
  const ST = `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}/v0/b/${BUCKET}/o`;
  const NOW = Symbol("server time");

  // an unsigned ID token, as the Auth emulator would issue for a Google sign-in
  function token(uid, email = `${uid}@example.com`) {
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const t = Math.floor(Date.now() / 1000);
    return `${b64({ alg: "none", typ: "JWT" })}.${b64({
      iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT, sub: uid, user_id: uid,
      auth_time: t, iat: t, exp: t + 3600, email, email_verified: true,
      firebase: { identities: { "google.com": [uid], email: [email] }, sign_in_provider: "google.com" },
    })}.`;
  }

  // who is asking: a learner (nobody), coaches, an admin; "owner" skips the rules (seeding)
  const WHO = {
    learner: null,
    owner: "owner",
    admin: token("admin1"),
    coachA: token("coachA"), // coach of the active class and of the paused class
    coachB: token("coachB"), // a coach, but of neither class
    coachS: token("coachS"), // listed for the active class, but suspended
    newbie: token("newbie"), // signed in, no coach profile yet
  };

  // ---- Firestore REST ----

  function value(v) {
    if (v === null) return { nullValue: null };
    if (typeof v === "string") return { stringValue: v };
    if (typeof v === "boolean") return { booleanValue: v };
    if (Number.isInteger(v)) return { integerValue: String(v) };
    if (typeof v === "number") return { doubleValue: v };
    if (v instanceof Date) return { timestampValue: v.toISOString() };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(value) } };
    return { mapValue: { fields: fields(v) } };
  }
  function fields(obj) {
    return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== NOW).map(([k, v]) => [k, value(v)]));
  }
  // every NOW in the object, as "a.b" field paths, for REQUEST_TIME transforms (serverTimestamp)
  function nowPaths(obj, prefix = "") {
    return Object.entries(obj).flatMap(([k, v]) =>
      v === NOW ? [`${prefix}${k}`]
      : v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date) ? nowPaths(v, `${prefix}${k}.`)
      : []);
  }
  const docName = (path) => `projects/${PROJECT}/databases/(default)/documents/${path}`;
  const headers = (who) => ({
    "content-type": "application/json",
    ...(WHO[who] ? { authorization: `Bearer ${WHO[who]}` } : {}),
  });

  // Every helper below returns a thunk: a case's request is sent only when the
  // case runs, so the cases run strictly in order.
  const lazy = (fn) => (...args) => () => fn(...args);

  async function commit(who, writes) {
    const res = await fetch(`${FS}:commit`, { method: "POST", headers: headers(who), body: JSON.stringify({ writes }) });
    return res.status;
  }
  const transforms = (data) => nowPaths(data).map((fieldPath) => ({ fieldPath, setToServerValue: "REQUEST_TIME" }));
  // create (fails if it exists), set (replace), update (merge the given fields; mask = their paths)
  const create = lazy((who, path, data) => commit(who, [{
    update: { name: docName(path), fields: fields(data) }, currentDocument: { exists: false }, updateTransforms: transforms(data),
  }]));
  const set = lazy((who, path, data) => commit(who, [{
    update: { name: docName(path), fields: fields(data) }, updateTransforms: transforms(data),
  }]));
  const update = lazy((who, path, data, mask = Object.keys(data)) => commit(who, [{
    update: { name: docName(path), fields: fields(data) },
    updateMask: { fieldPaths: mask.filter((p) => !nowPaths(data).includes(p)) },
    currentDocument: { exists: true }, updateTransforms: transforms(data),
  }]));
  const remove = lazy((who, path) => commit(who, [{ delete: docName(path) }]));
  const get = lazy(async (who, path) => (await fetch(`${FS}/${path}`, { headers: headers(who) })).status);
  const list = get; // a GET of a collection path is a list
  const query = lazy(async (who, parent, structuredQuery) => {
    const res = await fetch(`${FS}${parent ? `/${parent}` : ""}:runQuery`, {
      method: "POST", headers: headers(who), body: JSON.stringify({ structuredQuery }),
    });
    return res.status;
  });
  const where = (collectionId, field, op, v) => ({
    from: [{ collectionId }],
    where: { fieldFilter: { field: { fieldPath: field }, op, value: value(v) } },
  });

  // ---- Storage REST (the Firebase Storage API the web SDK uses) ----

  const enc = (path) => encodeURIComponent(path);
  const storageAuth = (who) => (WHO[who] ? { authorization: `${who === "owner" ? "Bearer" : "Firebase"} ${WHO[who]}` } : {});
  // a multipart upload with the content type in the metadata, as the web SDK's
  // uploadBytes sends it (the emulator ignores Content-Type on a raw upload)
  const upload = lazy(async (who, path, { type = "image/jpeg", bytes = 2000 } = {}) => {
    const boundary = "simplify-test-boundary";
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=utf-8\r\n\r\n`
        + `${JSON.stringify({ name: path, contentType: type })}\r\n--${boundary}\r\nContent-Type: ${type}\r\n\r\n`),
      Buffer.alloc(bytes, 7),
      Buffer.from(`\r\n--${boundary}--`),
    ]);
    const res = await fetch(`${ST}?name=${enc(path)}`, {
      method: "POST",
      headers: { ...storageAuth(who), "content-type": `multipart/related; boundary=${boundary}`, "x-goog-upload-protocol": "multipart" },
      body,
    });
    return res.status;
  });
  const download = lazy(async (who, path) => (await fetch(`${ST}/${enc(path)}?alt=media`, { headers: storageAuth(who) })).status);
  const listFiles = lazy(async (who, prefix) => (await fetch(`${ST}?prefix=${enc(prefix)}`, { headers: storageAuth(who) })).status);
  const deleteFile = lazy(async (who, path) => (await fetch(`${ST}/${enc(path)}`, { method: "DELETE", headers: storageAuth(who) })).status);

  // ---------- seed (as owner, past the rules) ----------

  const A = "K7M3RQP9T"; // active class: coachA and coachS (suspended) listed
  const P = "P9TK7M3RQ"; // paused class: coachA listed
  const past = new Date("2026-09-01T02:00:00Z");
  const latest = { pageId: "page1", title: "Waiting for the bus", markdown: "# Bus\n\nI wait.", publishedAt: past, publishedBy: "coachA" };
  const seeds = {
    "admins/admin1": {},
    "coaches/coachA": { name: "Coach A", org: "School", note: "Ask the principal", email: "coachA@example.com", createdAt: past },
    "coaches/coachB": { name: "Coach B", org: "School", note: "", email: "coachB@example.com", createdAt: past },
    "coaches/coachS": { name: "Coach S", org: "School", note: "", email: "coachS@example.com", createdAt: past, suspended: true },
    [`classes/${A}`]: { name: "3 Kindness", org: "School", status: "active", latest, createdAt: past, updatedAt: past },
    [`classes/${P}`]: { name: "4 Care", org: "School", status: "suspended", latest: null, createdAt: past, updatedAt: past },
    [`classCoaches/${A}`]: { uids: ["coachA", "coachS"] },
    [`classCoaches/${P}`]: { uids: ["coachA"] },
    [`classes/${A}/pages/page1`]: { title: "Waiting for the bus", markdown: "# Bus", createdAt: past, createdBy: "coachA", updatedAt: past, updatedBy: "coachA" },
    [`classes/${P}/pages/page1`]: { title: "Old", markdown: "Old", createdAt: past, createdBy: "coachA", updatedAt: past, updatedBy: "coachA" },
    [`classes/${A}/pictures/pic1`]: { words: "Our bus stop", file: "pictures/pic1.jpg", width: 1600, height: 1200, createdAt: past, createdBy: "coachA" },
    [`classes/${A}/videos/vid1`]: { status: "approved", prompt: "hands", words: "Hands washing", seconds: 8, interactionId: "x", createdBy: "coachA", createdAt: past, updatedAt: past },
    [`classes/${A}/videoPlans/plan1`]: { request: "hands", prompt: "hands", words: "Hands", seconds: 8, createdBy: "coachA", createdAt: past },
    "usage/coachA_2026-09": { flash: 3, video: 1, declined: 0 },
    "usage/coachB_2026-09": { flash: 1, video: 0, declined: 0 },
    "config/limits": { flashPerMonth: 200, videosPerMonth: 5 },
    "requests/reqA": { uid: "coachA", kind: "new-class", className: "5 Joy", org: "School", note: "", status: "pending", createdAt: past },
    "requests/reqB": { uid: "coachB", kind: "join-class", classCode: A, org: "School", note: "", status: "pending", createdAt: past },
  };
  for (const [path, data] of Object.entries(seeds)) {
    const status = await set("owner", path, data)();
    if (status !== 200) throw new Error(`seeding ${path}: HTTP ${status}`);
  }
  for (const path of [`classes/${A}/pictures/pic1.jpg`, `classes/${A}/video-drafts/vid2.mp4`, `classes/${A}/videos/vid1.mp4`]) {
    const status = await upload("owner", path, { type: path.endsWith(".mp4") ? "video/mp4" : "image/jpeg" })();
    if (status !== 200) throw new Error(`seeding ${path}: HTTP ${status}`);
  }

  // ---------- the cases: [what, request (run when its turn comes), allowed?] ----------
  // allowed → 2xx; denied → 403; not found → 404 (a read that was allowed, of nothing)

  const OK = "allowed";
  const NO = "denied";
  const NF = "not found"; // allowed to look, but nothing is there
  const page = (extra = {}) => ({ title: "Page", markdown: "Hello", createdAt: NOW, createdBy: "coachA", updatedAt: NOW, updatedBy: "coachA", ...extra });
  const picture = (id, extra = {}) => ({ words: "Bus", file: `pictures/${id}.jpg`, width: 1600, height: 900, createdAt: NOW, createdBy: "coachA", ...extra });
  const publish = (who, code, extra = {}) => update(who, `classes/${code}`, {
    latest: { pageId: "page1", title: "Bus", markdown: "I wait.", publishedAt: NOW, publishedBy: who, ...extra },
    updatedAt: NOW,
  });
  const long = (n) => "x".repeat(n);

  const cases = [
    "— learner (not signed in)",
    ["reads an active class by its code", get("learner", `classes/${A}`), OK],
    ["cannot read a paused class", get("learner", `classes/${P}`), NO],
    ["cannot read a class that does not exist", get("learner", "classes/ZZZZZZZZZ"), NO],
    ["cannot list classes", list("learner", "classes"), NO],
    ["cannot query classes by name", query("learner", "", where("classes", "name", "EQUAL", "3 Kindness")), NO],
    ["cannot read pages", list("learner", `classes/${A}/pages`), NO],
    ["cannot read a page", get("learner", `classes/${A}/pages/page1`), NO],
    ["cannot read the picture shelf", list("learner", `classes/${A}/pictures`), NO],
    ["cannot read the video shelf", get("learner", `classes/${A}/videos/vid1`), NO],
    ["cannot read video plans", get("learner", `classes/${A}/videoPlans/plan1`), NO],
    ["cannot read usage", get("learner", "usage/coachA_2026-09"), NO],
    ["cannot read limits", get("learner", "config/limits"), NO],
    ["cannot read a class's coaches", get("learner", `classCoaches/${A}`), NO],
    ["cannot read coaches", get("learner", "coaches/coachA"), NO],
    ["cannot read requests", get("learner", "requests/reqA"), NO],
    ["cannot write a class", update("learner", `classes/${A}`, { name: "Hacked" }), NO],

    "— a class's coach (coachA)",
    ["lists the class's pages", list("coachA", `classes/${A}/pages`), OK],
    ["creates a page", create("coachA", `classes/${A}/pages/page2`, page()), OK],
    ["cannot create a page with an extra field", create("coachA", `classes/${A}/pages/page3`, page({ html: "<b>" })), NO],
    ["cannot create a page over 20000 characters", create("coachA", `classes/${A}/pages/page4`, page({ markdown: long(20001) })), NO],
    ["creates a page of exactly 20000 characters", create("coachA", `classes/${A}/pages/page5`, page({ markdown: long(20000) })), OK],
    ["cannot create a page in someone else's name", create("coachA", `classes/${A}/pages/page6`, page({ createdBy: "coachB" })), NO],
    ["cannot create a page with a bad id", create("coachA", `classes/${A}/pages/bad.id`, page()), NO],
    ["saves a page", update("coachA", `classes/${A}/pages/page1`, { title: "New", markdown: "New", updatedAt: NOW, updatedBy: "coachA" }), OK],
    ["cannot save a page without stamping updatedAt", update("coachA", `classes/${A}/pages/page1`, { markdown: "Newer" }), NO],
    ["cannot change who created a page", update("coachA", `classes/${A}/pages/page1`, { createdBy: "coachB", updatedAt: NOW, updatedBy: "coachA" }), NO],
    ["marks a page published", update("coachA", `classes/${A}/pages/page1`, { publishedAt: NOW }), OK],
    ["deletes a page", remove("coachA", `classes/${A}/pages/page5`), OK],
    ["publishes the class page", publish("coachA", A), OK],
    ["cannot publish in someone else's name", publish("coachA", A, { publishedBy: "coachB" }), NO],
    ["cannot publish over 20000 characters", publish("coachA", A, { markdown: long(20001) }), NO],
    ["cannot publish with an extra field", publish("coachA", A, { script: "x" }), NO],
    ["cannot publish without stamping updatedAt",
      update("coachA", `classes/${A}`, { latest: { pageId: "page1", title: "B", markdown: "B", publishedAt: NOW, publishedBy: "coachA" } }), NO],
    ["unpublishes (latest: null)", update("coachA", `classes/${A}`, { latest: null, updatedAt: NOW }), OK],
    ["cannot rename the class", update("coachA", `classes/${A}`, { name: "Mine", updatedAt: NOW }), NO],
    ["cannot un-pause a class", update("coachA", `classes/${P}`, { status: "active", updatedAt: NOW }), NO],
    ["cannot publish to a paused class", publish("coachA", P), NO],
    ["reads its paused class (to say it is paused)", get("coachA", `classes/${P}`), OK],
    ["cannot read a paused class's pages", list("coachA", `classes/${P}/pages`), NO],
    ["cannot list all classes", list("coachA", "classes"), NO],
    ["finds its classes (uids array-contains)", query("coachA", "", where("classCoaches", "uids", "ARRAY_CONTAINS", "coachA")), OK],
    ["cannot list every class's coaches", list("coachA", "classCoaches"), NO],
    ["cannot find another coach's classes", query("coachA", "", where("classCoaches", "uids", "ARRAY_CONTAINS", "coachB")), NO],
    ["reads its class's coaches", get("coachA", `classCoaches/${A}`), OK],
    ["cannot add a coach to its class", update("coachA", `classCoaches/${A}`, { uids: ["coachA", "coachS", "coachB"] }), NO],
    ["puts a picture on the shelf", create("coachA", `classes/${A}/pictures/pic2`, picture("pic2")), OK],
    ["cannot shelve a picture with another file path", create("coachA", `classes/${A}/pictures/pic3`, picture("pic3", { file: "pictures/pic1.jpg" })), NO],
    ["cannot shelve a picture wider than 1600 px", create("coachA", `classes/${A}/pictures/pic4`, picture("pic4", { width: 2000 })), NO],
    ["cannot shelve a picture with words over 80", create("coachA", `classes/${A}/pictures/pic5`, picture("pic5", { words: long(81) })), NO],
    ["cannot shelve a picture in a paused class", create("coachA", `classes/${P}/pictures/pic6`, picture("pic6")), NO],
    ["changes a picture's words", update("coachA", `classes/${A}/pictures/pic2`, { words: "The bus stop" }), OK],
    ["cannot change a picture's file", update("coachA", `classes/${A}/pictures/pic2`, { file: "pictures/pic1.jpg" }), NO],
    ["deletes a picture from the shelf", remove("coachA", `classes/${A}/pictures/pic2`), OK],
    ["reads the video shelf", list("coachA", `classes/${A}/videos`), OK],
    ["cannot write a video", create("coachA", `classes/${A}/videos/vid9`, { status: "approved" }), NO],
    ["cannot approve a video itself", update("coachA", `classes/${A}/videos/vid1`, { status: "approved" }), NO],
    ["cannot read video plans", get("coachA", `classes/${A}/videoPlans/plan1`), NO],
    ["cannot write a video plan", create("coachA", `classes/${A}/videoPlans/plan9`, { prompt: "x" }), NO],
    ["reads its own usage", get("coachA", "usage/coachA_2026-09"), OK],
    ["reads a month with no usage yet", get("coachA", "usage/coachA_2026-10"), NF],
    ["cannot read another coach's usage", get("coachA", "usage/coachB_2026-09"), NO],
    ["cannot change its usage", update("coachA", "usage/coachA_2026-09", { flash: 0 }), NO],
    ["reads the limits", get("coachA", "config/limits"), OK],
    ["cannot change the limits", update("coachA", "config/limits", { flashPerMonth: 9999 }), NO],
    ["reads its own profile", get("coachA", "coaches/coachA"), OK],
    ["changes its name", update("coachA", "coaches/coachA", { name: "Coach Ann" }), OK],
    ["cannot suspend or unsuspend itself", update("coachA", "coaches/coachA", { suspended: false }), NO],
    ["cannot change its email", update("coachA", "coaches/coachA", { email: "other@example.com" }), NO],
    ["cannot read another coach", get("coachA", "coaches/coachB"), NO],
    ["cannot list coaches", list("coachA", "coaches"), NO],
    ["looks for its own admin doc (there is none)", get("coachA", "admins/coachA"), NF],
    ["cannot read someone else's admin doc", get("coachA", "admins/admin1"), NO],
    ["cannot make itself an admin", create("coachA", "admins/coachA", {}), NO],
    ["asks for a new class", create("coachA", "requests/r1", { uid: "coachA", kind: "new-class", className: "6 Hope", org: "School", note: "Call the office", status: "pending", createdAt: NOW }), OK],
    ["asks to join a class by code", create("coachA", "requests/r2", { uid: "coachA", kind: "join-class", classCode: P, org: "School", note: "", status: "pending", createdAt: NOW }), OK],
    ["cannot ask with a bad class code", create("coachA", "requests/r3", { uid: "coachA", kind: "join-class", classCode: "K7M-3RQ-P9T", status: "pending", createdAt: NOW }), NO],
    ["cannot ask for a class with a name over 30", create("coachA", "requests/r4", { uid: "coachA", kind: "new-class", className: long(31), status: "pending", createdAt: NOW }), NO],
    ["cannot file a request already approved", create("coachA", "requests/r5", { uid: "coachA", kind: "new-class", className: "7", status: "approved", createdAt: NOW }), NO],
    ["cannot file a request for someone else", create("coachA", "requests/r6", { uid: "coachB", kind: "new-class", className: "7", status: "pending", createdAt: NOW }), NO],
    ["lists its own requests (uid ==)", query("coachA", "", where("requests", "uid", "EQUAL", "coachA")), OK],
    ["cannot list every request", list("coachA", "requests"), NO],
    ["cannot read another coach's request", get("coachA", "requests/reqB"), NO],
    ["cannot approve its own request", update("coachA", "requests/reqA", { status: "approved", decidedAt: NOW, decidedBy: "coachA" }), NO],

    "— a coach of another class (coachB)",
    ["reads the active class like anyone", get("coachB", `classes/${A}`), OK],
    ["cannot read the class's pages", list("coachB", `classes/${A}/pages`), NO],
    ["cannot publish to the class", publish("coachB", A), NO],
    ["cannot put a picture on the shelf", create("coachB", `classes/${A}/pictures/pic7`, picture("pic7", { createdBy: "coachB" })), NO],
    ["cannot read the class's coaches", get("coachB", `classCoaches/${A}`), NO],
    ["cannot read the video shelf", list("coachB", `classes/${A}/videos`), NO],

    "— a suspended coach (coachS, still listed)",
    ["cannot read the class's pages", list("coachS", `classes/${A}/pages`), NO],
    ["cannot create a page", create("coachS", `classes/${A}/pages/page7`, page({ createdBy: "coachS", updatedBy: "coachS" })), NO],
    ["cannot publish", publish("coachS", A), NO],
    ["cannot shelve a picture", create("coachS", `classes/${A}/pictures/pic8`, picture("pic8", { createdBy: "coachS" })), NO],
    ["cannot ask for a class", create("coachS", "requests/r7", { uid: "coachS", kind: "new-class", className: "8", status: "pending", createdAt: NOW }), NO],
    ["cannot lift its suspension", update("coachS", "coaches/coachS", { suspended: false }), NO],

    "— signed in, no coach profile yet (newbie)",
    ["cannot ask for a class before saying who it is", create("newbie", "requests/r8", { uid: "newbie", kind: "new-class", className: "9", status: "pending", createdAt: NOW }), NO],
    ["cannot write a profile with someone else's email", create("newbie", "coaches/newbie", { name: "New", email: "boss@example.com", createdAt: NOW }), NO],
    ["cannot write a profile that says suspended: false", create("newbie", "coaches/newbie", { name: "New", email: "newbie@example.com", createdAt: NOW, suspended: false }), NO],
    ["cannot write a profile with an empty name", create("newbie", "coaches/newbie", { name: " ", email: "newbie@example.com", createdAt: NOW }), NO],
    ["cannot write a profile with a note over 300", create("newbie", "coaches/newbie", { name: "New", note: long(301), email: "newbie@example.com", createdAt: NOW }), NO],
    ["cannot write someone else's profile", create("newbie", "coaches/other", { name: "New", email: "newbie@example.com", createdAt: NOW }), NO],
    ["writes its profile", create("newbie", "coaches/newbie", { name: "New Coach", org: "Centre", note: "Ask Ms Tan", email: "newbie@example.com", createdAt: NOW }), OK],
    ["then asks for a class", create("newbie", "requests/r9", { uid: "newbie", kind: "new-class", className: "9 Calm", org: "Centre", note: "", status: "pending", createdAt: NOW }), OK],
    ["cannot read the limits' neighbours", get("newbie", "config/other"), NO],

    "— admin",
    ["lists pending requests", query("admin", "", where("requests", "status", "EQUAL", "pending")), OK],
    ["approves a request", update("admin", "requests/reqA", { status: "approved", decidedAt: NOW, decidedBy: "admin1", resultCode: "Q2W3E4R5T" }), OK],
    ["cannot decide a request twice", update("admin", "requests/reqA", { status: "declined", decidedAt: NOW, decidedBy: "admin1" }), NO],
    ["cannot change who asked", update("admin", "requests/reqB", { uid: "coachA", status: "declined", decidedAt: NOW, decidedBy: "admin1" }), NO],
    ["declines a request", update("admin", "requests/reqB", { status: "declined", decidedAt: NOW, decidedBy: "admin1" }), OK],
    ["creates a class", create("admin", "classes/Q2W3E4R5T", { name: "5 Joy", org: "School", status: "active", latest: null, createdAt: NOW, updatedAt: NOW }), OK],
    ["cannot create a class with a look-alike code", create("admin", "classes/O0IL1Q2W3", { name: "X", org: "", status: "active", latest: null, createdAt: NOW, updatedAt: NOW }), NO],
    ["cannot create a class with a name over 30", create("admin", "classes/Q2W3E4R5U", { name: long(31), status: "active", latest: null, createdAt: NOW, updatedAt: NOW }), NO],
    ["lists the class's coaches", create("admin", "classCoaches/Q2W3E4R5T", { uids: ["coachA"] }), OK],
    ["lists all classes", list("admin", "classes"), OK],
    ["reads a paused class", get("admin", `classes/${P}`), OK],
    ["takes a page down (latest: null)", update("admin", `classes/${A}`, { latest: null, updatedAt: NOW }), OK],
    ["pauses a class", update("admin", `classes/${A}`, { status: "suspended", updatedAt: NOW }), OK],
    ["un-pauses a class", update("admin", `classes/${A}`, { status: "active", updatedAt: NOW }), OK],
    ["cannot give a class a made-up status", update("admin", `classes/${A}`, { status: "deleted", updatedAt: NOW }), NO],
    ["suspends a coach", update("admin", "coaches/coachB", { suspended: true }), OK],
    ["cannot rename a coach", update("admin", "coaches/coachA", { name: "Someone" }), NO],
    ["lists coaches", list("admin", "coaches"), OK],
    ["reads any class's pages", list("admin", `classes/${A}/pages`), OK],
    ["cannot edit a class's page", update("admin", `classes/${A}/pages/page1`, { title: "Admin", markdown: "x", updatedAt: NOW, updatedBy: "admin1" }), NO],
    ["deletes a page", remove("admin", `classes/${A}/pages/page2`), OK],
    ["deletes a video from the shelf", remove("admin", `classes/${A}/videos/vid1`), OK],
    ["cannot read video plans", get("admin", `classes/${A}/videoPlans/plan1`), NO],
    ["lists usage", list("admin", "usage"), OK],
    ["cannot change usage", update("admin", "usage/coachA_2026-09", { flash: 0 }), NO],
    ["sets the limits", update("admin", "config/limits", { flashPerMonth: 300, videosPerMonth: 4 }), OK],
    ["cannot set a limit of 1000 videos", update("admin", "config/limits", { videosPerMonth: 1000 }), NO],
    ["cannot set a limit that is not a number", update("admin", "config/limits", { flashPerMonth: "lots" }), NO],
    ["reads its own admin doc", get("admin", "admins/admin1"), OK],
    ["cannot create another admin", create("admin", "admins/coachA", {}), NO],

    "— storage: pictures",
    ["learner downloads a shelf picture", download("learner", `classes/${A}/pictures/pic1.jpg`), OK],
    ["learner cannot list a class's pictures", listFiles("learner", `classes/${A}/pictures/`), NO],
    ["coach cannot list a class's pictures", listFiles("coachA", `classes/${A}/pictures/`), NO],
    ["coach uploads a JPEG", upload("coachA", `classes/${A}/pictures/new1.jpg`), OK],
    ["coach cannot overwrite a picture", upload("coachA", `classes/${A}/pictures/pic1.jpg`), NO],
    ["coach cannot upload a PNG", upload("coachA", `classes/${A}/pictures/new2.jpg`, { type: "image/png" }), NO],
    ["coach cannot upload a 2 MB picture", upload("coachA", `classes/${A}/pictures/new3.jpg`, { bytes: 2 * 1024 * 1024 }), NO],
    ["coach uploads a picture just under 2 MB", upload("coachA", `classes/${A}/pictures/new4.jpg`, { bytes: 2 * 1024 * 1024 - 1 }), OK],
    ["coach cannot upload a picture named .png", upload("coachA", `classes/${A}/pictures/new5.png`), NO],
    ["coach cannot upload into a sub-folder", upload("coachA", `classes/${A}/pictures/a/b.jpg`), NO],
    ["another class's coach cannot upload", upload("coachB", `classes/${A}/pictures/new6.jpg`), NO],
    ["a suspended coach cannot upload", upload("coachS", `classes/${A}/pictures/new7.jpg`), NO],
    ["someone with no profile cannot upload", upload("newbie", `classes/${A}/pictures/new8.jpg`), NO],
    ["learner cannot upload", upload("learner", `classes/${A}/pictures/new9.jpg`), NO],
    ["another class's coach cannot delete a picture", deleteFile("coachB", `classes/${A}/pictures/new1.jpg`), NO],
    ["a suspended coach cannot delete a picture", deleteFile("coachS", `classes/${A}/pictures/new1.jpg`), NO],
    ["coach deletes a picture", deleteFile("coachA", `classes/${A}/pictures/new1.jpg`), OK],
    ["admin deletes a picture", deleteFile("admin", `classes/${A}/pictures/new4.jpg`), OK],
    ["nobody may upload outside classes/", upload("coachA", "hello.jpg"), NO],
    // Storage rules may read only two Firestore documents, so they cannot also check
    // that the class is active; firestore.rules refuses the shelf doc instead (above:
    // "cannot shelve a picture in a paused class"), and only shelf pictures are used.
    ["coach's upload to its paused class is stored (never shelved)", upload("coachA", `classes/${P}/pictures/new10.jpg`), OK],

    "— storage: videos",
    ["learner cannot see a draft", download("learner", `classes/${A}/video-drafts/vid2.mp4`), NO],
    ["another class's coach cannot see a draft", download("coachB", `classes/${A}/video-drafts/vid2.mp4`), NO],
    ["a suspended coach cannot see a draft", download("coachS", `classes/${A}/video-drafts/vid2.mp4`), NO],
    ["the class's coach sees a draft", download("coachA", `classes/${A}/video-drafts/vid2.mp4`), OK],
    ["coach cannot upload a draft", upload("coachA", `classes/${A}/video-drafts/vid3.mp4`, { type: "video/mp4" }), NO],
    ["coach cannot upload a video", upload("coachA", `classes/${A}/videos/vid3.mp4`, { type: "video/mp4" }), NO],
    ["coach cannot delete an approved video", deleteFile("coachA", `classes/${A}/videos/vid1.mp4`), NO],
    ["learner downloads an approved video", download("learner", `classes/${A}/videos/vid1.mp4`), OK],
    ["learner cannot list videos", listFiles("learner", `classes/${A}/videos/`), NO],
  ];

  // run in order (later cases build on earlier writes)
  let failed = 0;
  let count = 0;
  for (const item of cases) {
    if (typeof item === "string") {
      console.log(item);
      continue;
    }
    const [what, run, want] = item;
    count++;
    const status = await run();
    const got = status === 403 || status === 401 ? NO : status >= 200 && status < 300 ? OK : status === 404 ? NF : `HTTP ${status}`;
    const ok = got === want;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${what.padEnd(56)} ${got}${ok ? "" : ` (expected ${want}, HTTP ${status})`}`);
  }
  console.log(failed ? `\n${failed} of ${count} failed` : `\nall ${count} passed`);
  process.exit(failed ? 1 : 0);
}
