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
    coachA: token("coachA"), // approved; coach of the active class and of the paused class
    coachB: token("coachB"), // approved, but a coach of neither class
    coachS: token("coachS"), // approved and listed for the active class, but suspended
    coachP: token("coachP"), // listed for the active class, but still waiting for the admin
    coachD: token("coachD"), // the admin declined them
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
    return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== NOW && v !== undefined).map(([k, v]) => [k, value(v)]));
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
  // one write, for a batch of several (all or nothing, as a transaction commits)
  const W = {
    create: (path, data) => ({
      update: { name: docName(path), fields: fields(data) }, currentDocument: { exists: false }, updateTransforms: transforms(data),
    }),
    set: (path, data) => ({ update: { name: docName(path), fields: fields(data) }, updateTransforms: transforms(data) }),
  };
  const batch = lazy((who, writes) => commit(who, writes));
  // create (fails if it exists), set (replace), update (merge the given fields; mask = their paths)
  const create = lazy((who, path, data) => commit(who, [W.create(path, data)]));
  const set = lazy((who, path, data) => commit(who, [W.set(path, data)]));
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
  const approved = { status: "approved", decidedAt: past, decidedBy: "admin1" };
  const seeds = {
    "admins/admin1": {},
    "institutions/awwa-school-napiri": { name: "AWWA School @ Napiri", org: "AWWA", type: "SPED school", area: "Hougang", active: true, updatedAt: past },
    "institutions/awwa-school-bedok": { name: "AWWA School @ Bedok", org: "AWWA", type: "SPED school", area: "Bedok", active: true, updatedAt: past },
    // retired by the admin (for the tests; the real one is not)
    "institutions/awwa-eic-hougang": { name: "AWWA Early Intervention Centre @ Hougang", org: "AWWA", type: "Early intervention", area: "Hougang", active: false, updatedAt: past },
    "coaches/coachA": { name: "Coach A", note: "Ask the principal", institutions: ["awwa-school-napiri", "awwa-eic-hougang"], email: "coachA@example.com", createdAt: past, ...approved },
    "coaches/coachB": { name: "Coach B", note: "", institutions: ["awwa-school-bedok"], email: "coachB@example.com", createdAt: past, ...approved },
    "coaches/coachS": { name: "Coach S", note: "", institutions: ["awwa-school-napiri"], email: "coachS@example.com", createdAt: past, ...approved, suspended: true },
    "coaches/coachP": { name: "Coach P", note: "New", institutions: ["awwa-school-napiri"], email: "coachP@example.com", createdAt: past, status: "pending" },
    "coaches/legacy": { name: "Old Coach", org: "AWWA School @ Napiri", note: "", email: "legacy@example.com", createdAt: past },
    "coaches/coachD": { name: "Coach D", note: "", institutions: ["awwa-school-napiri"], email: "coachD@example.com", createdAt: past, status: "declined", decidedAt: past, decidedBy: "admin1" },
    [`classes/${A}`]: { name: "3 Kindness", institution: "awwa-school-napiri", status: "active", latest, createdAt: past, updatedAt: past },
    // made before institutions existed: it still has the free-text org
    [`classes/${P}`]: { name: "4 Care", org: "AWWA School @ Napiri", status: "suspended", latest: null, createdAt: past, updatedAt: past },
    [`classCoaches/${A}`]: { uids: ["coachA", "coachS", "coachP"] },
    // a coaches list with no class (never made by the app): its code can't be taken
    "classCoaches/ZZZZZZZZ2": { uids: ["coachB"] },
    [`classCoaches/${P}`]: { uids: ["coachA"] },
    [`classes/${A}/pages/page1`]: { title: "Waiting for the bus", markdown: "# Bus", createdAt: past, createdBy: "coachA", updatedAt: past, updatedBy: "coachA" },
    [`classes/${P}/pages/page1`]: { title: "Old", markdown: "Old", createdAt: past, createdBy: "coachA", updatedAt: past, updatedBy: "coachA" },
    [`classes/${A}/pictures/pic1`]: { words: "Our bus stop", file: "pictures/pic1.jpg", width: 1600, height: 1200, createdAt: past, createdBy: "coachA" },
    [`classes/${A}/videos/vid1`]: { status: "approved", prompt: "hands", words: "Hands washing", seconds: 8, interactionId: "x", createdBy: "coachA", createdAt: past, updatedAt: past },
    [`classes/${A}/videoPlans/plan1`]: { request: "hands", prompt: "hands", words: "Hands", seconds: 8, createdBy: "coachA", createdAt: past },
    "usage/coachA_2026-09": { flash: 3, video: 1, declined: 0 },
    "usage/coachB_2026-09": { flash: 1, video: 0, declined: 0 },
    "config/limits": { flashPerMonth: 200, videosPerMonth: 5 },
    // an older request, from when coaches asked the admin for new classes
    "requests/reqA": { uid: "coachA", kind: "new-class", className: "5 Joy", org: "AWWA School @ Napiri", note: "", status: "pending", createdAt: past },
    "requests/reqB": { uid: "coachB", kind: "join-class", classCode: A, note: "", status: "pending", createdAt: past },
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
  // an approved coach making a class: the class and its coaches list, in one commit
  const newClass = (extra = {}) => ({ name: "6 Hope", institution: "awwa-school-napiri", status: "active", latest: null, createdAt: NOW, updatedAt: NOW, ...extra });
  const makeClass = (who, code, { cls = {}, uids = [who], how = "create", only } = {}) => batch(who, [
    ...(only === "coaches" ? [] : [W[how](`classes/${code}`, newClass(cls))]),
    ...(only === "class" ? [] : [W[how](`classCoaches/${code}`, { uids })]),
  ]);
  const profile = (uid, extra = {}) => ({ name: "New Coach", note: "Ask Ms Tan", institutions: ["awwa-school-napiri"], email: `${uid}@example.com`, status: "pending", createdAt: NOW, ...extra });
  const joinRequest = (uid, extra = {}) => ({ uid, kind: "join-class", classCode: A, note: "", status: "pending", createdAt: NOW, ...extra });

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
    ["cannot list coaches", list("learner", "coaches"), NO],
    ["cannot read an institution", get("learner", "institutions/awwa-school-napiri"), NO],
    ["cannot list institutions", list("learner", "institutions"), NO],
    ["cannot read requests", get("learner", "requests/reqA"), NO],
    ["cannot write a class", update("learner", `classes/${A}`, { name: "Hacked" }), NO],

    "— an approved coach, a class's coach (coachA)",
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
    ["cannot change its own status", update("coachA", "coaches/coachA", { status: "pending" }), NO],
    ["cannot stamp its own decision", update("coachA", "coaches/coachA", { decidedAt: NOW }), NO],
    ["cannot change institutions without stamping when",
      update("coachA", "coaches/coachA", { institutions: ["awwa-school-napiri", "awwa-school-bedok"] }), NO],
    ["changes its institutions, stamped (stays approved)",
      update("coachA", "coaches/coachA", { institutions: ["awwa-school-napiri", "awwa-eic-hougang", "not-listed-yet"], institutionsChangedAt: NOW }), OK],
    ["cannot stamp a change it did not make", update("coachA", "coaches/coachA", { institutionsChangedAt: NOW }), NO],
    ["cannot choose no institution", update("coachA", "coaches/coachA", { institutions: [], institutionsChangedAt: NOW }), NO],
    ["cannot choose 11 institutions",
      update("coachA", "coaches/coachA", { institutions: Array.from({ length: 11 }, (_, i) => `i${i}`), institutionsChangedAt: NOW }), NO],
    ["cannot choose one institution twice",
      update("coachA", "coaches/coachA", { institutions: ["awwa-school-napiri", "awwa-school-napiri"], institutionsChangedAt: NOW }), NO],
    ["cannot choose an institution id with a comma or slash",
      update("coachA", "coaches/coachA", { institutions: ["awwa-school-napiri", "a/b,c"], institutionsChangedAt: NOW }), NO],
    ["cannot choose a non-string institution",
      update("coachA", "coaches/coachA", { institutions: ["awwa-school-napiri", 7], institutionsChangedAt: NOW }), NO],
    ["reads an institution", get("coachA", "institutions/awwa-school-napiri"), OK],
    ["lists institutions", list("coachA", "institutions"), OK],
    ["cannot add an institution", create("coachA", "institutions/mine", { name: "Mine", org: "Me", type: "", area: "", active: true, updatedAt: NOW }), NO],
    ["cannot retire an institution", update("coachA", "institutions/awwa-school-bedok", { active: false, updatedAt: NOW }), NO],
    ["cannot read another coach", get("coachA", "coaches/coachB"), NO],
    ["cannot list coaches", list("coachA", "coaches"), NO],
    ["looks for its own admin doc (there is none)", get("coachA", "admins/coachA"), NF],
    ["cannot read someone else's admin doc", get("coachA", "admins/admin1"), NO],
    ["cannot make itself an admin", create("coachA", "admins/coachA", {}), NO],
    ["cannot ask the admin for a new class (it makes its own)",
      create("coachA", "requests/r1", { uid: "coachA", kind: "new-class", className: "6 Hope", note: "", status: "pending", createdAt: NOW }), NO],
    ["asks to join a class by code", create("coachA", "requests/r2", joinRequest("coachA", { classCode: P, note: "Ms Tan's class" })), OK],
    ["cannot ask with an organisation (institutions now)", create("coachA", "requests/r2b", joinRequest("coachA", { org: "AWWA School @ Napiri" })), NO],
    ["cannot ask with a bad class code", create("coachA", "requests/r3", joinRequest("coachA", { classCode: "K7M-3RQ-P9T" })), NO],
    ["cannot ask with a note over 300", create("coachA", "requests/r4", joinRequest("coachA", { note: long(301) })), NO],
    ["cannot file a request already approved", create("coachA", "requests/r5", joinRequest("coachA", { status: "approved" })), NO],
    ["cannot file a request for someone else", create("coachA", "requests/r6", joinRequest("coachB")), NO],
    ["lists its own requests (uid ==)", query("coachA", "", where("requests", "uid", "EQUAL", "coachA")), OK],
    ["cannot list every request", list("coachA", "requests"), NO],
    ["cannot read another coach's request", get("coachA", "requests/reqB"), NO],
    ["cannot approve its own request", update("coachA", "requests/reqA", { status: "approved", decidedAt: NOW, decidedBy: "coachA" }), NO],

    "— an approved coach makes a class (coachA works at AWWA School @ Napiri, and at a retired place)",
    ["looks for a code nobody has (not found)", get("coachA", "classes/H4W9NEK3R"), NF],
    ["makes a class for its institution, listing itself", makeClass("coachA", "H4W9NEK3R"), OK],
    ["then works in it: lists its pages", list("coachA", "classes/H4W9NEK3R/pages"), OK],
    ["... and reads its coaches", get("coachA", "classCoaches/H4W9NEK3R"), OK],
    ["learners can read the new class", get("learner", "classes/H4W9NEK3R"), OK],
    ["cannot make a class under a code already taken", makeClass("coachA", A, { how: "set" }), NO],
    ["cannot take a code whose coaches list exists", makeClass("coachA", "ZZZZZZZZ2", { how: "set" }), NO],
    ["cannot make a class without its coaches list", makeClass("coachA", "H4W9NEK3S", { only: "class" }), NO],
    ["cannot make a coaches list without a class", makeClass("coachA", "H4W9NEK3T", { only: "coaches" }), NO],
    ["cannot list another coach in its new class", makeClass("coachA", "H4W9NEK3U", { uids: ["coachA", "coachB"] }), NO],
    ["cannot make a class for someone else", makeClass("coachA", "H4W9NEK3V", { uids: ["coachB"] }), NO],
    ["cannot make a class for an institution not its own", makeClass("coachA", "H4W9NEK3W", { cls: { institution: "awwa-school-bedok" } }), NO],
    ["cannot make a class for a retired institution", makeClass("coachA", "H4W9NEK3X", { cls: { institution: "awwa-eic-hougang" } }), NO],
    ["cannot make a class for an institution that doesn't exist", makeClass("coachA", "H4W9NEK3Y", { cls: { institution: "nowhere" } }), NO],
    ["cannot make a class with no institution", makeClass("coachA", "H4W9NEK3Z", { cls: { institution: undefined } }), NO],
    ["cannot make a class with an organisation", makeClass("coachA", "H4W9NEK32", { cls: { org: "AWWA School @ Napiri" } }), NO],
    ["cannot make a paused class", makeClass("coachA", "H4W9NEK33", { cls: { status: "suspended" } }), NO],
    ["cannot make a class already published", makeClass("coachA", "H4W9NEK34", { cls: { latest: { pageId: "p", title: "t", markdown: "m", publishedAt: NOW, publishedBy: "coachA" } } }), NO],
    ["cannot make a class with a name over 30", makeClass("coachA", "H4W9NEK35", { cls: { name: long(31) } }), NO],
    ["cannot make a class with a look-alike code", makeClass("coachA", "O0IL1Q2W3"), NO],
    ["cannot make a class dated in the past", makeClass("coachA", "H4W9NEK36", { cls: { createdAt: past } }), NO],

    "— a coach of another class (coachB)",
    ["reads the active class like anyone", get("coachB", `classes/${A}`), OK],
    ["cannot read the class's pages", list("coachB", `classes/${A}/pages`), NO],
    ["cannot publish to the class", publish("coachB", A), NO],
    ["cannot put a picture on the shelf", create("coachB", `classes/${A}/pictures/pic7`, picture("pic7", { createdBy: "coachB" })), NO],
    ["cannot read the class's coaches", get("coachB", `classCoaches/${A}`), NO],
    ["cannot read the video shelf", list("coachB", `classes/${A}/videos`), NO],

    "— a coach waiting for the admin (coachP, even though listed for the active class)",
    ["reads its own profile", get("coachP", "coaches/coachP"), OK],
    ["reads the institutions (for About you)", list("coachP", "institutions"), OK],
    ["changes its name and institutions", update("coachP", "coaches/coachP", { name: "Coach Pat", institutions: ["awwa-school-bedok"], institutionsChangedAt: NOW }), OK],
    ["cannot approve itself", update("coachP", "coaches/coachP", { status: "approved", decidedAt: NOW, decidedBy: "coachP" }), NO],
    ["cannot read the class's pages", list("coachP", `classes/${A}/pages`), NO],
    ["cannot create a page", create("coachP", `classes/${A}/pages/pageP`, page({ createdBy: "coachP", updatedBy: "coachP" })), NO],
    ["cannot publish", publish("coachP", A), NO],
    ["cannot shelve a picture", create("coachP", `classes/${A}/pictures/picP`, picture("picP", { createdBy: "coachP" })), NO],
    ["cannot read the video shelf", list("coachP", `classes/${A}/videos`), NO],
    ["cannot read the class's coaches", get("coachP", `classCoaches/${A}`), NO],
    ["cannot make a class", makeClass("coachP", "H4W9NEK37", { cls: { institution: "awwa-school-bedok" } }), NO],
    ["cannot look for a free code", get("coachP", "classes/H4W9NEK37"), NO],
    ["cannot ask to join a class", create("coachP", "requests/rP", joinRequest("coachP")), NO],

    "— a coach the admin declined (coachD)",
    ["cannot make a class", makeClass("coachD", "H4W9NEK38"), NO],
    ["cannot ask to join a class", create("coachD", "requests/rD", joinRequest("coachD")), NO],
    ["cannot undo the decision", update("coachD", "coaches/coachD", { status: "pending", decidedAt: NOW, decidedBy: "coachD" }), NO],
    ["may still change its profile", update("coachD", "coaches/coachD", { note: "I teach at Centre North, call Ms Tan" }), OK],

    "— a suspended coach (coachS, approved, still listed)",
    ["cannot read the class's pages", list("coachS", `classes/${A}/pages`), NO],
    ["cannot create a page", create("coachS", `classes/${A}/pages/page7`, page({ createdBy: "coachS", updatedBy: "coachS" })), NO],
    ["cannot publish", publish("coachS", A), NO],
    ["cannot shelve a picture", create("coachS", `classes/${A}/pictures/pic8`, picture("pic8", { createdBy: "coachS" })), NO],
    ["cannot ask to join a class", create("coachS", "requests/r7", joinRequest("coachS")), NO],
    ["cannot make a class", makeClass("coachS", "H4W9NEK39"), NO],
    ["cannot lift its suspension", update("coachS", "coaches/coachS", { suspended: false }), NO],

    "— signed in, no coach profile yet (newbie)",
    ["cannot ask to join a class before saying who it is", create("newbie", "requests/r8", joinRequest("newbie")), NO],
    ["reads the institutions", list("newbie", "institutions"), OK],
    ["cannot write a profile with someone else's email", create("newbie", "coaches/newbie", profile("newbie", { email: "boss@example.com" })), NO],
    ["cannot write a profile that is already approved", create("newbie", "coaches/newbie", profile("newbie", { status: "approved" })), NO],
    ["cannot write a profile with no status", create("newbie", "coaches/newbie", profile("newbie", { status: undefined })), NO],
    ["cannot write a profile that says suspended: false", create("newbie", "coaches/newbie", profile("newbie", { suspended: false })), NO],
    ["cannot write a profile with an empty name", create("newbie", "coaches/newbie", profile("newbie", { name: " " })), NO],
    ["cannot write a profile with a note over 300", create("newbie", "coaches/newbie", profile("newbie", { note: long(301) })), NO],
    ["cannot write a profile with no institution", create("newbie", "coaches/newbie", profile("newbie", { institutions: [] })), NO],
    ["cannot write a profile with an organisation", create("newbie", "coaches/newbie", profile("newbie", { org: "Centre" })), NO],
    ["cannot write someone else's profile", create("newbie", "coaches/other", profile("newbie")), NO],
    ["writes its profile, waiting for the admin", create("newbie", "coaches/newbie", profile("newbie")), OK],
    ["then still cannot ask to join a class", create("newbie", "requests/r9", joinRequest("newbie")), NO],
    ["nor make a class", makeClass("newbie", "Q2W3E4R5V"), NO],
    ["cannot read the limits' neighbours", get("newbie", "config/other"), NO],

    "— admin",
    ["lists coaches waiting (status == pending)", query("admin", "", where("coaches", "status", "EQUAL", "pending")), OK],
    ["cannot approve a coach in someone else's name", update("admin", "coaches/newbie", { status: "approved", decidedAt: NOW, decidedBy: "coachA" }), NO],
    ["cannot approve a coach without stamping when", update("admin", "coaches/newbie", { status: "approved", decidedBy: "admin1" }), NO],
    ["cannot give a coach a made-up status", update("admin", "coaches/newbie", { status: "boss", decidedAt: NOW, decidedBy: "admin1" }), NO],
    ["cannot approve and suspend in one go", update("admin", "coaches/newbie", { status: "approved", decidedAt: NOW, decidedBy: "admin1", suspended: false }), NO],
    ["cannot change a coach's institutions", update("admin", "coaches/newbie", { institutions: ["awwa-school-bedok"], institutionsChangedAt: NOW }), NO],
    ["approves a coach", update("admin", "coaches/newbie", { status: "approved", decidedAt: NOW, decidedBy: "admin1" }), OK],
    ["... who then makes a class", makeClass("newbie", "Q2W3E4R5T"), OK],
    ["declines a coach", update("admin", "coaches/coachP", { status: "declined", decidedAt: NOW, decidedBy: "admin1" }), OK],
    ["puts a decision back to waiting (Undo)", update("admin", "coaches/coachP", { status: "pending", decidedAt: NOW, decidedBy: "admin1" }), OK],
    ["approves a declined coach later", update("admin", "coaches/coachD", { status: "approved", decidedAt: NOW, decidedBy: "admin1" }), OK],
    ["approves a coach made before approvals (no status)", update("admin", "coaches/legacy", { status: "approved", decidedAt: NOW, decidedBy: "admin1" }), OK],
    ["adds an institution", create("admin", "institutions/awwa-eic-fernvale-link", { name: "AWWA Early Intervention Centre @ Fernvale Link", org: "AWWA", type: "Early intervention", area: "Sengkang", active: true, updatedAt: NOW }), OK],
    ["cannot add one with a name over 80", create("admin", "institutions/x1", { name: long(81), org: "A", type: "", area: "", active: true, updatedAt: NOW }), NO],
    ["cannot add one with no organisation", create("admin", "institutions/x2", { name: "X", org: " ", type: "", area: "", active: true, updatedAt: NOW }), NO],
    ["cannot add one with an extra field", create("admin", "institutions/x3", { name: "X", org: "A", type: "", area: "", active: true, updatedAt: NOW, source: "web" }), NO],
    ["cannot add one with a bad id", create("admin", "institutions/a.b", { name: "X", org: "A", type: "", area: "", active: true, updatedAt: NOW }), NO],
    ["edits an institution", update("admin", "institutions/awwa-eic-fernvale-link", { name: "AWWA EIC @ Fernvale Link", updatedAt: NOW }), OK],
    ["cannot edit one without stamping when", update("admin", "institutions/awwa-eic-fernvale-link", { area: "Pasir Ris" }), NO],
    ["retires an institution", update("admin", "institutions/awwa-eic-fernvale-link", { active: false, updatedAt: NOW }), OK],
    ["cannot delete an institution", remove("admin", "institutions/awwa-eic-fernvale-link"), NO],
    ["cannot make a class through the back door (no approved profile)", makeClass("admin", "Q2W3E4R5W", { uids: ["admin1"] }), NO],
    ["lists pending requests", query("admin", "", where("requests", "status", "EQUAL", "pending")), OK],
    ["approves a request", update("admin", "requests/reqA", { status: "approved", decidedAt: NOW, decidedBy: "admin1", resultCode: "Q2W3E4R5T" }), OK],
    ["cannot decide a request twice", update("admin", "requests/reqA", { status: "declined", decidedAt: NOW, decidedBy: "admin1" }), NO],
    ["cannot change who asked", update("admin", "requests/reqB", { uid: "coachA", status: "declined", decidedAt: NOW, decidedBy: "admin1" }), NO],
    ["declines a request", update("admin", "requests/reqB", { status: "declined", decidedAt: NOW, decidedBy: "admin1" }), OK],
    ["adds a coach to a class (approving a join request)", update("admin", "classCoaches/Q2W3E4R5T", { uids: ["newbie", "coachA"] }), OK],
    ["cannot list 51 coaches for a class", update("admin", "classCoaches/Q2W3E4R5T", { uids: Array.from({ length: 51 }, (_, i) => `c${i}`) }), NO],
    ["lists all classes", list("admin", "classes"), OK],
    ["reads a paused class", get("admin", `classes/${P}`), OK],
    ["takes a page down (latest: null)", update("admin", `classes/${A}`, { latest: null, updatedAt: NOW }), OK],
    ["pauses a class", update("admin", `classes/${A}`, { status: "suspended", updatedAt: NOW }), OK],
    ["un-pauses a class", update("admin", `classes/${A}`, { status: "active", updatedAt: NOW }), OK],
    ["un-pauses a class made before institutions (org)", update("admin", `classes/${P}`, { status: "active", updatedAt: NOW }), OK],
    ["cannot give a class a bad institution id", update("admin", `classes/${A}`, { institution: "a/b", updatedAt: NOW }), NO],
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
    ["a listed coach still waiting for the admin cannot upload", upload("coachP", `classes/${A}/pictures/new8b.jpg`), NO],
    ["learner cannot upload", upload("learner", `classes/${A}/pictures/new9.jpg`), NO],
    ["another class's coach cannot delete a picture", deleteFile("coachB", `classes/${A}/pictures/new1.jpg`), NO],
    ["a suspended coach cannot delete a picture", deleteFile("coachS", `classes/${A}/pictures/new1.jpg`), NO],
    ["a listed coach waiting for the admin cannot delete a picture", deleteFile("coachP", `classes/${A}/pictures/new1.jpg`), NO],
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
    ["a listed coach waiting for the admin cannot see a draft", download("coachP", `classes/${A}/video-drafts/vid2.mp4`), NO],
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
