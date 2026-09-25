// Smoke scenes for the coach app (/coach/) — node tools/smoke.mjs coach
//
// The coach app talks to Firebase only through public/coach/js/cloud.js, so
// here that one file is swapped for an in-memory stand-in (fakeCloud below,
// sent to the page as source): no network, no emulators, and every screen
// and flow can be driven — sign-in, About you, My classes, the editor and
// preview, Publish, the AI helper, the picture and video shelves, YouTube,
// the QR poster, waiting for approval, and the admin screen. The real cloud.js is exercised against
// the Firebase emulators instead (see the report / e2e script in the
// coach agent's notes).
//
// A scene seeds the stand-in with window.FAKE in its init; what the app
// asked of it is in window.__fake (calls, pages, classes …).

import { readFileSync } from "node:fs";

// A real 3-second MP4 (the functions' own test clip), so a video plays as one
const SAMPLE_MP4 = readFileSync(new URL("../../functions/test/sample.mp4", import.meta.url)).toString("base64");

// ---------- the stand-in for cloud.js (runs in the page) ----------

function fakeCloud() {
  const now = new Date();
  const S = (window.__fake = Object.assign({
    user: { uid: "coach-1", email: "coach@example.com", name: "Ms Tan" },
    // tools/seed/institutions.json, as seeded
    institutions: [
      { id: "awwa-school-napiri", name: "AWWA School @ Napiri", org: "AWWA", type: "SPED school", area: "Hougang", active: true },
      { id: "awwa-school-bedok", name: "AWWA School @ Bedok", org: "AWWA", type: "SPED school", area: "Bedok", active: true },
      { id: "awwa-eic-hougang", name: "AWWA Early Intervention Centre @ Hougang", org: "AWWA", type: "Early intervention", area: "Hougang", active: true },
      { id: "awwa-eic-fernvale-link", name: "AWWA Early Intervention Centre @ Fernvale Link", org: "AWWA", type: "Early intervention", area: "Sengkang", active: true },
    ],
    profiles: { "coach-1": { name: "Ms Tan", institutions: ["awwa-school-napiri"], note: "Class teacher, 3 Kindness", email: "coach@example.com",
      status: "approved", createdAt: new Date(now - 30 * 86400000), decidedAt: new Date(now - 29 * 86400000) } },
    admins: [],
    classes: { K7M3RQP9T: { name: "3 Kindness", institution: "awwa-school-napiri", status: "active", latest: null, createdAt: now } },
    coachesOf: { K7M3RQP9T: ["coach-1"] },
    requests: [],
    pages: { K7M3RQP9T: [] },
    pictures: { K7M3RQP9T: [] },
    videos: { K7M3RQP9T: [] },
    usage: { flash: 3, video: 1 },
    limits: { flashPerMonth: 200, videosPerMonth: 5 },
    replies: {},
    calls: [],
    uploads: [],
    nextId: 1,
  }, window.FAKE || {}));

  class CloudError extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
    }
  }
  const later = (value, ms = 5) => new Promise((r) => setTimeout(() => r(value), ms));
  const id = (prefix) => `${prefix}${S.nextId++}x${Math.random().toString(36).slice(2, 8)}`;
  const copy = (v) => (v == null ? v : structuredClone(v));

  let userFns = [];
  const watchers = new Set();
  function notify() {
    for (const w of watchers) setTimeout(() => watchers.has(w) && w.cb(w.read()), 0);
  }
  function watch(read, cb) {
    const w = { read, cb };
    watchers.add(w);
    setTimeout(() => watchers.has(w) && cb(read()), 0);
    return () => watchers.delete(w);
  }
  const cls = (code) => S.classes[code];
  window.__fakeNotify = notify; // a scene changes __fake, then says so (the admin approving, elsewhere)
  const clip = () => URL.createObjectURL(new Blob([Uint8Array.from(atob(window.__sampleMp4), (c) => c.charCodeAt(0))], { type: "video/mp4" }));

  const api = {
    CloudError,
    usingEmulators: false,
    DEFAULT_LIMITS: Object.freeze({ flashPerMonth: 200, videosPerMonth: 5 }),
    friendly: (e) => e,
    onUserChange(fn) {
      userFns.push(fn);
      setTimeout(() => fn(copy(S.user)), 0);
      return () => { userFns = userFns.filter((f) => f !== fn); };
    },
    async signIn() {
      S.calls.push({ name: "signIn" });
      if (S.signInError) throw new CloudError(S.signInError.code, S.signInError.message);
      S.user = S.nextUser ?? { uid: "coach-1", email: "coach@example.com", name: "Ms Tan" };
      for (const fn of userFns) fn(copy(S.user));
    },
    async signOut() {
      S.calls.push({ name: "signOut" });
      S.user = null;
      for (const fn of userFns) fn(null);
    },
    watchProfile: (uid, cb) => watch(() => (S.profiles[uid] ? { id: uid, ...copy(S.profiles[uid]) } : null), cb),
    async saveProfile(user, profile, { isNew, before }) {
      S.calls.push({ name: "saveProfile", isNew, profile: copy(profile) });
      const changed = !isNew && JSON.stringify(before?.institutions ?? []) !== JSON.stringify(profile.institutions);
      S.profiles[user.uid] = { ...(S.profiles[user.uid] ?? {}), ...profile, email: user.email,
        ...(isNew ? { status: "pending", createdAt: new Date() } : {}), ...(changed ? { institutionsChangedAt: new Date() } : {}) };
      notify();
      return later();
    },
    listInstitutions: async () => later(copy(S.institutions)),
    isAdmin: async (uid) => later(S.admins.includes(uid)),
    async myClasses(uid) {
      return later(Object.entries(S.coachesOf).filter(([, uids]) => uids.includes(uid))
        .map(([code]) => ({ id: code, ...copy(cls(code)) })));
    },
    myRequests: async (uid) => later(copy(S.requests.filter((r) => r.uid === uid))),
    async createClass(uid, { name, institution }) {
      S.calls.push({ name: "createClass", className: name, institution });
      const { newClassCode } = await import("/coach/js/class-code.js");
      const code = S.nextCode ?? newClassCode();
      S.classes[code] = { name, institution, status: "active", latest: null, createdAt: new Date() };
      S.coachesOf[code] = [uid];
      return later(code);
    },
    async askToJoinClass(uid, data) {
      S.requests.push({ id: id("r"), uid, kind: "join-class", status: "pending", createdAt: new Date(), ...data });
      return later();
    },
    getClass: async (code) => later(cls(code) ? { id: code, ...copy(cls(code)) } : null),
    watchClass: (code, cb) => watch(() => (cls(code) ? { id: code, ...copy(cls(code)) } : null), cb),
    watchPages: (code, cb) => watch(() => copy(S.pages[code] ?? []), cb),
    watchPictures: (code, cb) => watch(() => copy(S.pictures[code] ?? []), cb),
    watchVideos: (code, cb) => watch(() => copy(S.videos[code] ?? []), cb),
    newPageId: () => id("p"),
    async createPage(code, pid, uid, { title, markdown }) {
      S.calls.push({ name: "createPage", pid, title, markdown });
      (S.pages[code] ??= []).push({ id: pid, title, markdown, createdAt: new Date(), updatedAt: new Date(), createdBy: uid });
      notify();
      return later();
    },
    async savePage(code, pid, uid, { title, markdown }) {
      S.calls.push({ name: "savePage", pid, title, markdown });
      const page = S.pages[code].find((p) => p.id === pid);
      if (!page) throw new CloudError("not-found", "It isn't there any more.");
      Object.assign(page, { title, markdown, updatedAt: new Date() });
      notify();
      return later();
    },
    async deletePage(code, pid) {
      S.calls.push({ name: "deletePage", pid });
      S.pages[code] = S.pages[code].filter((p) => p.id !== pid);
      notify();
      return later();
    },
    async publishPage(code, pid, uid, { title, markdown }) {
      S.calls.push({ name: "publishPage", pid, title, markdown });
      cls(code).latest = { pageId: pid, title, markdown, publishedAt: new Date(), publishedBy: uid };
      notify();
      return later();
    },
    async setLatest(code, uid, latest) {
      S.calls.push({ name: "setLatest", latest: copy(latest) });
      cls(code).latest = latest ? { ...latest, publishedAt: new Date(), publishedBy: uid } : null;
      notify();
      return later();
    },
    mediaUrl(code, kind, mid) {
      if (kind === "video") return S.videoUrl ?? (S.videoUrl = clip());
      return `/img/pic/${S.pictureFiles?.[mid] ?? "wash-hands.svg"}`;
    },
    async addPicture(code, uid, { blob, width, height, words }, onProgress) {
      onProgress?.(0.5);
      await later(null, 20);
      const pid = id("pic");
      S.uploads.push({ pid, type: blob.type, size: blob.size, width, height });
      (S.pictures[code] ??= []).push({ id: pid, words, file: `pictures/${pid}.jpg`, width, height, createdAt: new Date() });
      onProgress?.(1);
      notify();
      return pid;
    },
    async setPictureWords(code, pid, words) {
      S.calls.push({ name: "setPictureWords", pid, words });
      S.pictures[code].find((p) => p.id === pid).words = words;
      notify();
      return later();
    },
    async deletePicture(code, pid) {
      S.calls.push({ name: "deletePicture", pid });
      S.pictures[code] = S.pictures[code].filter((p) => p.id !== pid);
      notify();
      return later();
    },
    draftVideoUrl: async () => later(clip()),
    async callFunction(name, data) {
      S.calls.push({ name, data: copy(data) });
      const reply = S.replies[name];
      await later(null, 20);
      if (reply?.error) throw new CloudError(reply.error.code ?? "unavailable", reply.error.message);
      if (typeof reply === "function") return reply(data, S);
      if (reply) return copy(Array.isArray(reply) ? reply.shift() : reply);
      const code = data.classCode;
      const video = (vid) => S.videos[code].find((v) => v.id === vid);
      switch (name) {
        case "writePage":
          S.usage.flash++;
          return { action: "write", understood: `I understood: ${data.instruction}`, questions: [], title: "Going to the dentist",
            markdown: "# Going to the dentist\nI am going to the dentist.\n---\nThe dentist looks at my teeth.", note: "", used: S.usage.flash, limit: S.limits.flashPerMonth };
        case "planVideo":
          S.usage.flash++;
          return { action: "write", understood: `I understood: a short video of ${data.request}`, questions: [], planId: "plan1",
            prompt: `One calm, continuous shot: ${data.request}. No text, no logos, no music.`, seconds: 8, words: "Washing hands",
            note: "", used: S.usage.flash, limit: S.limits.flashPerMonth };
        case "startVideo": {
          S.usage.video++;
          const vid = id("vid");
          S.videos[code].push({ id: vid, status: "rendering", prompt: "One calm shot", words: "Washing hands", seconds: 8, createdAt: new Date() });
          notify();
          return { videoId: vid, used: S.usage.video, limit: S.limits.videosPerMonth };
        }
        case "checkVideo": {
          const v = video(data.videoId);
          if (v.status === "rendering" && !S.slowVideos) v.status = "ready";
          notify();
          return { videoId: v.id, status: v.status };
        }
        case "approveVideo":
          video(data.videoId).status = "approved";
          notify();
          return { videoId: data.videoId, status: "approved" };
        case "discardVideo":
          video(data.videoId).status = "discarded";
          notify();
          return { videoId: data.videoId, status: "discarded" };
        default:
          throw new CloudError("not-found", "No such function.");
      }
    },
    getLimits: async () => later(copy(S.limits)),
    getUsage: async () => later(copy(S.usage)),
    pendingRequests: async () => later(copy(S.requests.filter((r) => r.status === "pending"))),
    allCoaches: async () => later(Object.entries(S.profiles).map(([uid, p]) => ({ id: uid, ...copy(p) }))),
    allClasses: async () => later(Object.entries(S.classes).map(([code, c]) => ({ id: code, ...copy(c), uids: [...(S.coachesOf[code] ?? [])] }))),
    async setCoachSuspended(uid, suspended) {
      S.profiles[uid].suspended = suspended;
      return later();
    },
    async setClassStatus(code, status) {
      cls(code).status = status;
      return later();
    },
    async adminSetLatest(code, latest) {
      cls(code).latest = copy(latest);
      return later();
    },
    async approveRequest(req, adminUid) {
      S.calls.push({ name: "approveRequest", id: req.id });
      const r = S.requests.find((x) => x.id === req.id);
      S.coachesOf[r.classCode].push(r.uid);
      Object.assign(r, { status: "approved", resultCode: r.classCode, decidedBy: adminUid });
      return later(r.classCode);
    },
    async decideCoach(uid, status, adminUid) {
      S.calls.push({ name: "decideCoach", uid, status });
      Object.assign(S.profiles[uid], { status, decidedAt: new Date(), decidedBy: adminUid });
      notify();
      return later();
    },
    async saveInstitution(iid, data) {
      S.calls.push({ name: "saveInstitution", iid, data: copy(data) });
      const newIid = iid ?? id("inst");
      const at = S.institutions.findIndex((i) => i.id === newIid);
      if (at >= 0) S.institutions[at] = { id: newIid, ...data };
      else S.institutions.push({ id: newIid, ...data });
      return later(newIid);
    },
    async setInstitutionActive(iid, active) {
      S.calls.push({ name: "setInstitutionActive", iid, active });
      S.institutions.find((i) => i.id === iid).active = active;
      return later();
    },
    async declineRequest(req, adminUid) {
      S.calls.push({ name: "declineRequest", id: req.id });
      Object.assign(S.requests.find((x) => x.id === req.id), { status: "declined", decidedBy: adminUid });
      return later();
    },
    async saveLimits(uid, limits) {
      S.calls.push({ name: "saveLimits", limits });
      Object.assign(S.limits, limits);
      return later();
    },
  };
  window.__fakeCloud = api;
}

const NAMES = [
  "CloudError", "usingEmulators", "DEFAULT_LIMITS", "friendly", "onUserChange", "signIn", "signOut", "watchProfile",
  "saveProfile", "listInstitutions", "isAdmin", "myClasses", "myRequests", "createClass", "askToJoinClass", "getClass",
  "watchClass", "watchPages", "watchPictures", "watchVideos", "newPageId", "createPage", "savePage", "deletePage",
  "publishPage", "setLatest", "mediaUrl", "addPicture", "setPictureWords", "deletePicture", "draftVideoUrl",
  "callFunction", "getLimits", "getUsage", "pendingRequests", "allCoaches", "allClasses", "setCoachSuspended",
  "decideCoach", "saveInstitution", "setInstitutionActive", "setClassStatus", "adminSetLatest", "approveRequest",
  "declineRequest", "saveLimits",
];
export const STUBS = { // (also used to take screenshots)
  "/coach/js/cloud.js": `window.__sampleMp4 = "${SAMPLE_MP4}";\n(${fakeCloud})();\nexport const { ${NAMES.join(", ")} } = window.__fakeCloud;\n`,
};

// ---------- helpers ----------

const inPage = (fn) => `(${fn})()`;
const run = (fn) => `await (${fn})();`;
const HELPERS = `
  window.$ = (sel) => document.querySelector(sel);
  window.$$ = (sel) => [...document.querySelectorAll(sel)];
  window.shown = (sel) => { const el = document.querySelector(sel); return !!el && el.getClientRects().length > 0; };
  window.pause = (ms) => new Promise((r) => setTimeout(r, ms));
  window.waitFor = async (fn, ms = 3000) => {
    const end = Date.now() + ms;
    for (;;) { try { const v = await fn(); if (v) return v; } catch {} if (Date.now() > end) throw new Error("waited too long: " + fn); await pause(25); }
  };
  window.byText = (sel, text) => [...document.querySelectorAll(sel)].find((el) => el.textContent.trim().includes(text));
  window.type = (el, value) => { el.focus(); el.value = value; el.dispatchEvent(new Event("input", { bubbles: true })); };
  window.fits = () => document.documentElement.scrollWidth <= innerWidth;
`;
const seed = (fake) => `window.FAKE = ${fake};`;
const scene = (s) => ({ stubs: STUBS, ...s, init: HELPERS + (s.init ?? "") });

const PAGE = `{ K7M3RQP9T: [{ id: "page1", title: "Going to the dentist", markdown: "# Going to the dentist\\nI am going to the dentist.\\n---\\nThe dentist looks at my teeth.\\n![Hands at the sink](pictures/pic1.jpg)", createdAt: new Date(2026, 8, 20), updatedAt: new Date(2026, 8, 22, 8, 5) }] }`;
const SHELF = `{ K7M3RQP9T: [{ id: "pic1", words: "Hands at the sink", file: "pictures/pic1.jpg", width: 800, height: 600, createdAt: new Date() }] }`;

export default [
  // ---------- signing in ----------
  scene({
    name: "signed out: one Sign in button, no hint in a normal browser",
    path: "/coach/",
    init: seed("{ user: null }"),
    expect: inPage(() => byText("button", "Sign in with Google") && $("h1").textContent === "Simplify for coaches" &&
      !byText(".notice", "WhatsApp") && $("#account").hidden && fits()),
  }),
  scene({
    name: "signed out inside an app's browser: the open-in-Chrome-or-Safari hint",
    path: "/coach/",
    init: seed("{ user: null }") + `Object.defineProperty(Navigator.prototype, "userAgent", { get: () =>
      "Mozilla/5.0 (Linux; Android 15; SM-A556E; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36 WhatsApp/2.25" });`,
    expect: inPage(() => byText(".notice", "Open this page in Chrome or Safari") && byText("button", "Copy the link")),
  }),
  scene({
    name: "sign-in window blocked: says so plainly, with the browser hint",
    path: "/coach/",
    init: seed(`{ user: null, signInError: { code: "popup-blocked", message: "The sign-in window was blocked. Allow pop-ups for this site, then try again." } }`),
    setup: run(async () => {
      byText("button", "Sign in with Google").click();
      await waitFor(() => $(".signin-problem .notice"));
    }),
    expect: inPage(() => byText(".signin-problem .notice", "was blocked") && byText(".signin-problem .notice", "Chrome or Safari")),
  }),
  scene({
    name: "sign in, first time: About you (where you work), Waiting for approval, then approved as it happens",
    path: "/coach/",
    init: seed(`{ user: null, profiles: {}, coachesOf: {}, nextUser: { uid: "new-1", email: "new@example.com", name: "Mr Lim" } }`),
    setup: run(async () => {
      byText("button", "Sign in with Google").click();
      await waitFor(() => $("h1")?.textContent === "About you" && $(".pick-option"));
      const save = byText("button", "Save and continue");
      const name = $("input[autocomplete=name]");
      if (name.value !== "Mr Lim") throw new Error("the name is not filled in from Google");
      if (!save.disabled) throw new Error("Save works with no institution");
      if ($(".pick-search")) throw new Error("a search box for a list of 4");
      if (byText(".pick-group legend", "AWWA")?.parentElement.querySelectorAll(".pick-option").length !== 4) throw new Error("not the 4 AWWA places");
      byText(".pick-option", "AWWA School @ Napiri").querySelector("input").click();
      if (!byText(".pick-chip", "AWWA School @ Napiri")) throw new Error("no chip for the chosen one");
      byText(".pick-option", "AWWA School @ Bedok").querySelector("input").click();
      byText(".pick-chip", "AWWA School @ Bedok").click(); // taken off again
      if (byText(".pick-chip", "Bedok") || byText(".pick-option", "AWWA School @ Bedok").querySelector("input").checked) throw new Error("the chip did not take it off");
      type(name, "  ");
      if (!save.disabled) throw new Error("Save works with no name");
      type(name, "Mr Lim");
      type($("textarea"), "Form teacher of 5 Joy. School office: 6123 4567.");
      save.click();
      await waitFor(() => $("h1")?.textContent === "Waiting for approval" && byText(".facts dd li", "AWWA School @ Napiri"));
      window.waited = byText(".next-steps", "changes by itself") && byText(".lead", "Thank you, Mr Lim") && byText("a.btn", "Change About you");
      // the admin approves, somewhere else
      Object.assign(__fake.profiles["new-1"], { status: "approved", decidedAt: new Date() });
      __fakeNotify();
      await waitFor(() => $("h1")?.textContent === "My classes");
    }),
    expect: inPage(() => waited && JSON.stringify(__fake.profiles["new-1"].institutions) === '["awwa-school-napiri"]' &&
      __fake.calls.some((c) => c.name === "saveProfile" && c.isNew) && !("org" in __fake.profiles["new-1"]) &&
      byText(".empty", "No classes yet") && $("#account-email").textContent === "new@example.com" && !$("#nav").hidden &&
      document.activeElement === $("h1") && fits()),
  }),
  scene({
    name: "waiting for approval: every coach address shows it; About you can still be changed",
    path: "/coach/#class/K7M3RQP9T",
    init: seed(`{ profiles: { "coach-1": { name: "Ms Tan", institutions: ["awwa-school-napiri"], note: "", email: "coach@example.com", status: "pending", createdAt: new Date() } } }`),
    setup: run(async () => {
      await waitFor(() => $("h1")?.textContent === "Waiting for approval");
      location.hash = "#poster/K7M3RQP9T";
      await pause(50);
      if ($("h1").textContent !== "Waiting for approval") throw new Error("the poster opened");
      byText("a.btn", "Change About you").click();
      await waitFor(() => $("h1")?.textContent === "About you" && $(".pick-option"));
      byText(".pick-option", "AWWA School @ Bedok").querySelector("input").click();
      byText("button", "Save").click();
      await waitFor(() => $("h1")?.textContent === "Waiting for approval");
    }),
    expect: inPage(() => JSON.stringify(__fake.profiles["coach-1"].institutions) === '["awwa-school-napiri","awwa-school-bedok"]' &&
      __fake.profiles["coach-1"].status === "pending" && !__fake.calls.some((c) => c.name === "callFunction")),
  }),
  scene({
    name: "not approved: a plain note to contact the admin",
    path: "/coach/#classes",
    init: seed(`{ profiles: { "coach-1": { name: "Ms Tan", institutions: ["awwa-school-napiri"], note: "", email: "coach@example.com", status: "declined" } } }`),
    expect: inPage(() => $("h1")?.textContent === "Not approved" && byText(".notice", "contact the admin") &&
      byText(".facts dd li", "AWWA School @ Napiri") && !$(".class-card")),
  }),
  scene({
    name: "a profile from before institutions: About you asks where they work first",
    path: "/coach/#class/K7M3RQP9T",
    init: seed(`{ profiles: { "coach-1": { name: "Ms Tan", org: "AWWA School @ Napiri", note: "", email: "coach@example.com", status: "approved" } } }`),
    setup: run(async () => {
      await waitFor(() => $("h1")?.textContent === "About you" && $(".pick-option"));
      if (!byText(".lead", "now asks where you work")) throw new Error("no word on why");
      byText(".pick-option", "AWWA School @ Napiri").querySelector("input").click();
      byText("button", "Save and continue").click();
      await waitFor(() => $("h1")?.textContent === "My classes");
    }),
    expect: inPage(() => __fake.calls.some((c) => c.name === "saveProfile" && !c.isNew) && __fake.profiles["coach-1"].institutionsChangedAt),
  }),
  scene({
    name: "a long list of institutions: search narrows it; at most 10",
    path: "/coach/#about",
    init: seed(`{ institutions: Array.from({ length: 14 }, (_, i) => ({ id: "c" + i, name: (i % 2 ? "North " : "South ") + "Centre " + i,
      org: i < 7 ? "First Society" : "Second Society", type: "Day activity centre", area: i % 2 ? "Woodlands" : "Bukit Merah", active: i !== 13 })) }`),
    setup: run(async () => {
      await waitFor(() => $(".pick-search"));
      type($(".pick-search"), "north WOODLANDS"); // 7 in the North, one of them retired
      if ($$(".pick-option").length !== 6 || !$$(".pick-option").every((o) => o.textContent.includes("North"))) throw new Error(`search: ${$$(".pick-option").length}`);
      type($(".pick-search"), "");
      if ($$(".pick-option").length !== 13) throw new Error("a retired place is offered");
      for (let i = 0; i < 10; i++) $$(".pick-option input")[i].click(); // (each tick redraws the list)
      if (!$$(".pick-option input").slice(10).every((b) => b.disabled) || !byText(".pick-count", "10 of 10 chosen")) throw new Error("an 11th could be chosen");
      $(".pick-chip").click();
      if ($$(".pick-option input").some((b) => b.disabled)) throw new Error("still full after taking one off");
    }),
    expect: inPage(() => $$(".pick-chip").length === 9 && $(".pick-list").classList.contains("is-long") && fits()),
  }),

  // ---------- my classes ----------
  scene({
    name: "My classes: the class with its code, a request waiting, joining forgives the code",
    path: "/coach/#classes",
    init: seed(`{ requests: [{ id: "r1", uid: "coach-1", kind: "join-class", classCode: "H4W9NEK3R", status: "pending", createdAt: new Date() }] }`),
    setup: run(async () => {
      await waitFor(() => $(".class-card"));
      byText("summary", "Join a colleague's class").click();
      const box = $$("input").find((i) => i.getAttribute("autocapitalize") === "characters");
      type(box, "k7m-3rq p9");
      if (!byText(".code-echo", "K7M-3RQ-P9 — 1 more to go")) throw new Error(`echo: ${$(".code-echo").textContent}`);
      type(box, "k7m-3rq p9t");
      const send = byText("button", "Send to the admin");
      if (send.disabled) throw new Error("a whole code can't be sent");
      send.click();
      await waitFor(() => __fake.requests.length === 2);
    }),
    expect: inPage(() => byText(".class-card-name", "3 Kindness") && byText(".class-card .code-text", "K7M-3RQ-P9T") &&
      byText(".class-card-state", "Nothing published yet") && byText(".request-line", "Join the class H4W-9NE-K3R") &&
      byText(".request-line", "Waiting for the admin") && __fake.requests[1].classCode === "K7M3RQP9T" && !("org" in __fake.requests[1]) &&
      byText(".toast", "Sent: join K7M-3RQ-P9T") && fits()),
  }),
  scene({
    name: "a new class: made at once, for one of my institutions, with a new code, and opened",
    path: "/coach/#classes",
    init: seed(`{ nextCode: "H4W9NEK3R", profiles: { "coach-1": { name: "Ms Tan", institutions: ["awwa-school-napiri", "awwa-eic-hougang", "gone"],
      note: "", email: "coach@example.com", status: "approved" } } }`),
    setup: run(async () => {
      await waitFor(() => $(".class-card"));
      byText("summary", "New class").click();
      await waitFor(() => $$("select option").length === 2);
      const make = byText("button", "Make the class");
      if (!make.disabled) throw new Error("a class with no name");
      type($$("input").find((i) => i.maxLength === 30), "5 Joy");
      if ($("select").value !== "awwa-school-napiri") throw new Error(`the first of mine is not chosen: ${$("select").value}`);
      if (JSON.stringify($$("select option").map((o) => o.textContent)) !==
        '["AWWA School @ Napiri (Hougang)","AWWA Early Intervention Centre @ Hougang"]') throw new Error("not my institutions");
      make.click();
    }),
    expect: inPage(() => location.hash === "#class/H4W9NEK3R" && $("h1")?.textContent.includes("5 Joy") && $("textarea") &&
      __fake.classes.H4W9NEK3R.institution === "awwa-school-napiri" && __fake.coachesOf.H4W9NEK3R[0] === "coach-1" &&
      byText(".toast", "Made “5 Joy”. Its code is H4W-9NE-K3R.") && !__fake.requests.length),
  }),

  // ---------- the class: editor and preview ----------
  scene({
    name: "class: the page opens in the editor, the preview shows it one screen at a time",
    path: "/coach/#class/K7M3RQP9T",
    init: seed(`{ pages: ${PAGE}, pictures: ${SHELF} }`),
    setup: run(async () => {
      await waitFor(() => $(".md-input").value.includes("dentist") && $(".phone-screen .cm-h1"));
      const next = $(".phone-btn.is-next");
      next.click();
      await waitFor(() => $(".phone-screen img.cm-picture"));
    }),
    expect: inPage(() => $("h1").textContent === "3 Kindness" && byText(".code-pill", "K7M-3RQ-P9T") &&
      $(".title-input").value === "Going to the dentist" && byText(".phone-where", "Screen 2 of 2") &&
      byText(".phone-btn.is-next", "All done") && $(".phone-screen img").getAttribute("src") === "/img/pic/wash-hands.svg" &&
      $(".phone-screen img").alt === "Hands at the sink" && byText(".save-state", "Saved") &&
      byText(".public-warning", "What you publish is public") && byText(".publish-state", "Learners see nothing yet") &&
      byText(".page-tab", "Going to the dentist") && fits()),
  }),
  scene({
    name: "editor: typing saves after a pause; the toolbar's Next screen, Bold, Heading and List",
    path: "/coach/#class/K7M3RQP9T",
    init: seed(`{ pages: { K7M3RQP9T: [] } }`),
    setup: run(async () => {
      await waitFor(() => $(".phone-empty"));
      const text = $(".md-input");
      type(text, "Wash your hands");
      text.setSelectionRange(5, 9);
      byText(".tool-btn", "Bold").click();
      if (text.value !== "Wash **your** hands") throw new Error(`bold: ${text.value}`);
      text.setSelectionRange(0, 0);
      byText(".tool-btn", "Heading").click();
      text.setSelectionRange(text.value.length, text.value.length);
      byText(".tool-btn", "Next screen").click();
      text.setRangeText("Soap\nWater", text.selectionStart, text.selectionEnd, "end");
      text.dispatchEvent(new Event("input", { bubbles: true }));
      text.setSelectionRange(text.value.indexOf("Soap"), text.value.length);
      byText(".tool-btn", "List").click();
      await waitFor(() => __fake.pages.K7M3RQP9T[0]?.markdown === text.value, 4000);
    }),
    expect: inPage(() => $(".md-input").value === "## Wash **your** hands\n\n---\n\n- Soap\n- Water" &&
      byText(".phone-where", "Screen 2 of 2") && $(".phone-screen .cm-list") && byText(".save-state", "Saved") &&
      __fake.calls.filter((c) => c.name === "createPage").length === 1),
  }),
  scene({
    name: "preview: a picture not on the shelf shows nothing, and a line says so",
    path: "/coach/#class/K7M3RQP9T",
    init: seed(`{ pages: { K7M3RQP9T: [{ id: "page1", title: "T", markdown: "Hello\\n![Gone](pictures/nothere.jpg)", createdAt: new Date(), updatedAt: new Date() }] } }`),
    expect: inPage(() => byText(".phone-screen .cm-p", "Hello") && !$(".phone-screen img") &&
      byText(".preview-missing", "1 picture in the page is not on the class's shelf")),
  }),
  scene({
    name: "publish: learners see this page; Undo puts back what they saw before",
    path: "/coach/#class/K7M3RQP9T",
    init: seed(`{ pages: ${PAGE}, pictures: ${SHELF} }`),
    setup: run(async () => {
      await waitFor(() => $(".md-input").value);
      byText("button", "Publish this page").click();
      await waitFor(() => __fake.classes.K7M3RQP9T.latest && byText(".publish-state", "Learners see this page."));
      if (!byText(".btn-publish", "Published") || !$(".btn-publish").disabled) throw new Error("Publish still offered");
      if (!byText(".page-tab-live", "Learners see this")) throw new Error("no mark on the page's tab");
      type($(".md-input"), `${$(".md-input").value}\nMore`);
      await waitFor(() => byText(".btn-publish", "Publish the changes"));
      byText(".toast-btn", "Undo").click();
      await waitFor(() => __fake.classes.K7M3RQP9T.latest === null);
    }),
    expect: inPage(() => __fake.calls.some((c) => c.name === "publishPage" && c.pid === "page1") &&
      byText(".publish-state", "Learners see nothing yet")),
  }),
  scene({
    name: "unpublish: learners see nothing; Undo publishes it again",
    path: "/coach/#class/K7M3RQP9T",
    init: seed(`{ pages: ${PAGE}, classes: { K7M3RQP9T: { name: "3 Kindness", status: "active", createdAt: new Date(),
      latest: { pageId: "page1", title: "Going to the dentist", markdown: "Old words", publishedAt: new Date(), publishedBy: "coach-1" } } } }`),
    setup: run(async () => {
      await waitFor(() => byText(".publish-state", "as it was when it was published"));
      byText("button", "Unpublish").click();
      await waitFor(() => __fake.classes.K7M3RQP9T.latest === null && byText(".toast", "Unpublished"));
      byText(".toast-btn", "Undo").click();
      await waitFor(() => __fake.classes.K7M3RQP9T.latest);
    }),
    expect: inPage(() => __fake.classes.K7M3RQP9T.latest.markdown === "Old words" && byText(".page-tab-live", "Learners see this")),
  }),
  scene({
    name: "pages: a new page, then deleted — Undo brings it back; otherwise it goes when the toast does",
    path: "/coach/#class/K7M3RQP9T",
    init: seed(`{ pages: ${PAGE} }`),
    setup: run(async () => {
      await waitFor(() => $(".md-input").value);
      byText("button", "+ New page").click();
      await waitFor(() => __fake.pages.K7M3RQP9T.length === 2 && $(".md-input").value === "");
      type($(".title-input"), "Swimming day");
      await waitFor(() => byText(".page-tab[aria-current=page]", "Swimming day"));
      byText("button", "Delete this page").click();
      if (byText(".page-tab", "Swimming day")) throw new Error("still in the list");
      if ($(".title-input").value !== "Going to the dentist") throw new Error("the other page did not open");
      byText(".toast-btn", "Undo").click();
      await waitFor(() => $(".title-input").value === "Swimming day");
      byText("button", "Delete this page").click();
      byText(".toast-text", "Deleted").closest(".toast"); // let it run out:
      location.hash = "#classes"; // leaving the class makes it happen now
      await waitFor(() => __fake.calls.some((c) => c.name === "deletePage"));
    }),
    expect: inPage(() => __fake.pages.K7M3RQP9T.length === 1 && __fake.pages.K7M3RQP9T[0].id === "page1"),
  }),

  // ---------- the helper ----------
  scene({
    name: "helper: write — I understood, the draft in the editor, Undo brings my text back",
    path: "/coach/#class/K7M3RQP9T",
    init: seed(`{ pages: { K7M3RQP9T: [{ id: "page1", title: "Mine", markdown: "My own words", createdAt: new Date(), updatedAt: new Date() }] } }`),
    setup: run(async () => {
      await waitFor(() => $(".md-input").value === "My own words");
      type($("#helper-input"), "Write a story about the dentist");
      byText("button", "Ask the helper").click();
      await waitFor(() => $(".understood"));
      if (!$(".md-input").value.startsWith("# Going to the dentist")) throw new Error("no draft");
      const call = __fake.calls.find((c) => c.name === "writePage");
      if (call.data.markdown !== "My own words" || call.data.classCode !== "K7M3RQP9T" || call.data.title !== "Mine") throw new Error(JSON.stringify(call));
      if (!byText(".usage-line", "Helper requests: 4 of 200 this month")) throw new Error("usage");
      byText("button", "Undo: bring back my text").click();
    }),
    expect: inPage(() => $(".md-input").value === "My own words" && $(".title-input").value === "Mine" &&
      byText(".understood", "I understood: Write a story about the dentist") && byText(".helper-done", "Your own text is back") &&
      !$(".helper-result").textContent.includes("null")),
  }),
  scene({
    name: "helper: ask — questions with answers to tap; the answers go back with the instruction",
    path: "/coach/#class/K7M3RQP9T",
    init: seed(`{ replies: { writePage: [
      { action: "ask", understood: "I understood: a page about the zoo", questions: [
        { question: "Who is the page for?", answers: ["The learners", "Their parents"] },
        { question: "How long?", answers: ["3 screens", "5 screens"] }], title: "", markdown: "", note: "", used: 4, limit: 200 },
      { action: "decline", understood: "I understood: a recipe for beer", questions: [], title: "", markdown: "",
        note: "I can only help with pages about school, learning and daily life.", used: 5, limit: 200 }] } }`),
    setup: run(async () => {
      await waitFor(() => $(".phone-empty"));
      type($("#helper-input"), "A page about the zoo?");
      byText("button", "Ask the helper").click();
      await waitFor(() => $(".question"));
      const send = byText("button", "Send my answers");
      if (!send.disabled) throw new Error("send with nothing answered");
      byText(".answer-btn", "Their parents").click();
      type($$(".answer-own")[1], "4 screens");
      send.click();
      await waitFor(() => byText(".notice", "I can only help"));
    }),
    expect: inPage(() => JSON.stringify(__fake.calls.filter((c) => c.name === "writePage")[1].data.answers) ===
      JSON.stringify([{ question: "Who is the page for?", answer: "Their parents" }, { question: "How long?", answer: "4 screens" }]) &&
      byText(".understood", "a recipe for beer") && !$(".helper-result .is-problem") && byText(".usage-line", "5 of 200")),
  }),
  scene({
    name: "helper: the function's own message (a limit) is shown as it is",
    path: "/coach/#class/K7M3RQP9T",
    init: seed(`{ replies: { writePage: { error: { code: "resource-exhausted", message: "You have used all 200 helper requests for this month." } } } }`),
    setup: run(async () => {
      await waitFor(() => $(".phone-empty"));
      type($("#helper-input"), "Make it simpler");
      byText("button", "Ask the helper").click();
      await waitFor(() => $(".helper-result .notice"));
    }),
    expect: inPage(() => byText(".helper-result .notice", "You have used all 200 helper requests") && !$("#helper-input").disabled),
  }),

  // ---------- pictures ----------
  scene({
    name: "pictures: a big photo is made JPEG and at most 1600 px on this device, then goes in the page",
    path: "/coach/#class/K7M3RQP9T",
    init: seed(`{ pages: { K7M3RQP9T: [{ id: "page1", title: "T", markdown: "Hello", createdAt: new Date(), updatedAt: new Date() }] } }`),
    setup: run(async () => {
      await waitFor(() => $(".md-input").value === "Hello");
      const canvas = document.createElement("canvas");
      canvas.width = 3200;
      canvas.height = 2000;
      const g = canvas.getContext("2d");
      g.fillStyle = "#c33";
      g.fillRect(0, 0, 3200, 2000);
      const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
      const dt = new DataTransfer();
      dt.items.add(new File([blob], "IMG_0001.png", { type: "image/png" }));
      const input = $(".shelf input[type=file]");
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await waitFor(() => $(".shelf-item[data-picture] .shelf-words"), 4000);
      type($(".shelf-words"), "Red card");
      $(".shelf-words").dispatchEvent(new Event("change", { bubbles: true }));
      $(".md-input").setSelectionRange(5, 5);
      byText(".shelf-item button", "Put in page").click();
    }),
    expect: inPage(() => {
      const up = __fake.uploads[0];
      return up?.type === "image/jpeg" && up.width === 1600 && up.height === 1000 &&
        $(".md-input").value === `Hello\n\n![Red card](pictures/${up.pid}.jpg)\n\n` &&
        __fake.pictures.K7M3RQP9T[0].words === "Red card" && $(".phone-screen img.cm-picture");
    }),
  }),
  scene({
    name: "pictures: the toolbar's Picture opens the shelf; a tap puts it in; Delete waits for Undo",
    path: "/coach/#class/K7M3RQP9T",
    init: seed(`{ pictures: ${SHELF} }`),
    setup: run(async () => {
      await waitFor(() => $(".shelf-item[data-picture]"));
      byText(".tool-btn", "Picture").click();
      await waitFor(() => $("dialog[open] .chooser-item"));
      $("dialog[open] .chooser-item").click();
      await waitFor(() => !$("dialog[open]"));
      if ($(".md-input").value !== "![Hands at the sink](pictures/pic1.jpg)\n\n") throw new Error($(".md-input").value);
      byText(".shelf-item button", "Delete").click();
      await waitFor(() => !$(".shelf-item[data-picture]"));
      byText(".toast-btn", "Undo").click();
      await waitFor(() => $(".shelf-item[data-picture]"));
      byText(".shelf-item button", "Delete").click();
      location.hash = "#classes";
      await waitFor(() => __fake.calls.some((c) => c.name === "deletePicture"));
    }),
    expect: inPage(() => __fake.pictures.K7M3RQP9T.length === 0 && __fake.calls.filter((c) => c.name === "deletePicture").length === 1),
  }),

  // ---------- videos and YouTube ----------
  scene({
    name: "videos: plan (the exact request, what it costs), make, checked, approve, put in page",
    path: "/coach/#class/K7M3RQP9T",
    setup: run(async () => {
      await waitFor(() => byText(".usage-line", "Videos: 1 of 5 this month"));
      byText("summary", "Make a short video").click();
      type($("#video-request"), "hands washing with soap at a sink");
      byText("button", "Plan the video").click();
      await waitFor(() => $(".plan-card"));
      if (!byText(".plan-cost", "uses 1 of your 5 videos this month. You have 4 left")) throw new Error($(".plan-cost").textContent);
      if (!byText(".plan-prompt", "One calm, continuous shot")) throw new Error("no request shown");
      if ($(".maker-result").textContent.includes("null")) throw new Error("a missing note shows as null");
      byText("button", "Make the video").click();
      await waitFor(() => byText(".video-item .chip", "Ready to check"), 4000);
      byText(".video-item button", "Watch it").click();
      await waitFor(() => $(".video-item video"));
      byText(".video-item button", "Approve").click();
      await waitFor(() => byText(".video-item .chip", "On the shelf"));
      byText(".video-item button", "Put in page").click();
    }),
    expect: inPage(() => /^!\[Washing hands\]\(videos\/vid\w+\.mp4\)\n\n$/.test($(".md-input").value) &&
      byText(".usage-line", "Videos: 2 of 5") && __fake.calls.some((c) => c.name === "checkVideo") &&
      __fake.calls.find((c) => c.name === "startVideo").data.planId === "plan1" && $(".phone-screen .cm-video video")),
  }),
  scene({
    name: "videos: no videos left this month — Make can't be pressed",
    path: "/coach/#class/K7M3RQP9T",
    init: seed(`{ usage: { flash: 0, video: 5 } }`),
    setup: run(async () => {
      await waitFor(() => byText(".usage-line", "Videos: 5 of 5"));
      byText("summary", "Make a short video").click();
      type($("#video-request"), "brushing teeth");
      byText("button", "Plan the video").click();
      await waitFor(() => $(".plan-card"));
    }),
    expect: inPage(() => byText("button", "Make the video").disabled && byText(".plan-cost", "made all 5 videos")),
  }),
  scene({
    name: "YouTube: a pasted link goes in on its own line, as youtu.be; the preview shows a card, nothing loaded",
    path: "/coach/#class/K7M3RQP9T",
    setup: run(async () => {
      await waitFor(() => $(".phone-empty"));
      byText(".tool-btn", "YouTube").click();
      await waitFor(() => $("dialog[open]"));
      const [link, words] = $$("dialog[open] input");
      const add = byText("dialog[open] button", "Put it in the page");
      type(link, "https://www.youtube.com/@channel");
      if (!add.disabled || !byText(".link-check", "isn't a link to one YouTube video")) throw new Error("a channel accepted");
      type(link, "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=5s");
      type(words, "How to wash hands");
      add.click();
      await waitFor(() => $(".phone-screen .cm-youtube-card"));
    }),
    expect: inPage(() => $(".md-input").value === "[How to wash hands](https://youtu.be/dQw4w9WgXcQ)\n\n" &&
      !$(".phone-screen iframe") && byText(".cm-youtube-card", "How to wash hands")),
  }),

  // ---------- poster ----------
  scene({
    name: "QR poster: the class name, the code in big letters, and a QR that reads as the join link",
    path: "/coach/#poster/K7M3RQP9T",
    setup: run(async () => {
      await waitFor(() => byText(".poster-class", "3 Kindness"));
      const svg = $(".poster svg.qr");
      const img = new Image();
      img.src = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" }));
      await img.decode();
      const c = document.createElement("canvas");
      c.width = c.height = 600;
      c.getContext("2d").drawImage(img, 0, 0, 600, 600);
      // the check only where the browser can read QR codes (Chrome on a Mac, Android)
      window.decoded = typeof BarcodeDetector === "function"
        ? (await new BarcodeDetector({ formats: ["qr_code"] }).detect(c)).map((f) => f.rawValue)
        : ["https://simplify.whiz.coach/#join=K7M3RQP9T"];
    }),
    expect: inPage(() => byText(".poster-code", "K7M-3RQ-P9T") && decoded.join() === "https://simplify.whiz.coach/#join=K7M3RQP9T" &&
      $$(".poster-steps li").length === 3 && !$(".poster a") && fits()),
  }),

  // ---------- admin ----------
  scene({
    name: "admin: approve a coach (Undo first), decline another, approve a join request, save the limits",
    path: "/coach/#admin",
    init: seed(`{ admins: ["coach-1"], profiles: {
        "coach-1": { name: "Ms Tan", institutions: ["awwa-school-napiri"], note: "Admin", email: "coach@example.com", status: "approved" },
        "coach-2": { name: "Mr Lim", institutions: ["awwa-school-napiri", "awwa-school-bedok"], note: "Form teacher of 5 Joy, call the office",
          email: "lim@example.com", status: "pending", createdAt: new Date(Date.now() - 3600000) },
        "coach-3": { name: "Ms Wong", institutions: ["awwa-eic-hougang"], note: "", email: "wong@example.com", status: "pending", createdAt: new Date() },
        "coach-4": { name: "Mr Ong", org: "AWWA School @ Napiri", note: "", email: "ong@example.com", createdAt: new Date() } },
      requests: [{ id: "r2", uid: "coach-1", kind: "join-class", classCode: "K7M3RQP9T", status: "pending", createdAt: new Date() }],
      coachesOf: { K7M3RQP9T: ["coach-2"] } }`),
    setup: run(async () => {
      await waitFor(() => byText("h2", "Coaches waiting for approval (3)"));
      const card = (name) => byText("#adm-wait-h + .admin-list .admin-card", name);
      if (!byText(".admin-card", "Form teacher of 5 Joy, call the office") || !card("Mr Lim").textContent.includes("AWWA School @ Bedok")) throw new Error("no way to check the coach");
      if (!card("Mr Ong")?.textContent.includes("Organisation")) throw new Error("a coach from before institutions is not waiting, or has no organisation shown");
      [...card("Mr Lim").querySelectorAll("button")].find((b) => b.textContent === "Approve").click();
      await waitFor(() => !card("Mr Lim") && byText("h2", "Coaches waiting for approval (2)"));
      byText(".toast-btn", "Undo").click();
      await waitFor(() => card("Mr Lim"));
      [...card("Ms Wong").querySelectorAll("button")].find((b) => b.textContent === "Decline").click();
      await waitFor(() => !card("Ms Wong"));
      [...card("Mr Lim").querySelectorAll("button")].find((b) => b.textContent === "Approve").click(); // the decline is written now
      await waitFor(() => __fake.calls.some((c) => c.name === "decideCoach"));
      [...byText(".admin-card", "Join K7M-3RQ-P9T (3 Kindness)").querySelectorAll("button")].find((b) => b.textContent === "Approve").click();
      await waitFor(() => byText(".toast", "Approved: Ms Tan can now work on 3 Kindness"));
      const [flash] = $$("input[type=number]");
      type(flash, "150");
      byText("button", "Save the limits").click();
      await waitFor(() => __fake.limits.flashPerMonth === 150);
    }),
    expect: inPage(() => __fake.profiles["coach-2"].status === "approved" && __fake.profiles["coach-3"].status === "declined" &&
      __fake.calls.filter((c) => c.name === "decideCoach").length === 2 && __fake.coachesOf.K7M3RQP9T.includes("coach-1") &&
      !byText("#adm-wait-h + .admin-list", "Mr Lim") && byText(".admin-card h3", "Ms Wong") && byText(".admin-card .chip", "Not approved") &&
      !$("#nav a[data-route=admin]").hidden),
  }),
  scene({
    name: "admin: the coach list — approve later, suspend, and institutions changed after approval",
    path: "/coach/#admin",
    init: seed(`{ admins: ["coach-1"], profiles: {
        "coach-1": { name: "Ms Tan", institutions: ["awwa-school-napiri"], note: "Admin", email: "coach@example.com", status: "approved" },
        "coach-2": { name: "Mr Lim", institutions: ["awwa-school-napiri", "awwa-school-bedok"], note: "", email: "lim@example.com",
          status: "approved", decidedAt: new Date(2026, 8, 1), institutionsChangedAt: new Date(2026, 8, 20, 9, 0) },
        "coach-3": { name: "Ms Wong", institutions: ["awwa-eic-hougang"], note: "", email: "wong@example.com", status: "declined", decidedAt: new Date() } } }`),
    setup: run(async () => {
      await waitFor(() => byText("h2", "Coaches"));
      const card = (name) => byText("#adm-coach-h + .admin-list .admin-card", name);
      if (!card("Mr Lim").querySelector(".chip.is-waiting")?.textContent.includes("after approval")) throw new Error("no word that the institutions changed");
      if (card("Ms Tan").textContent.includes("after approval")) throw new Error("said for a coach who did not change them");
      [...card("Ms Wong").querySelectorAll("button")].find((b) => b.textContent === "Approve").click();
      await waitFor(() => byText(".toast", "Approved: Ms Wong"));
      [...card("Mr Lim").querySelectorAll("button")].find((b) => b.textContent === "Suspend").click();
      await waitFor(() => __fake.profiles["coach-2"].suspended === true);
    }),
    expect: inPage(() => __fake.profiles["coach-3"].status === "approved" && byText("#adm-coach-h + .admin-list .admin-card", "Suspended")),
  }),
  scene({
    name: "admin: institutions — add one, edit it, retire it (Undo brings it back)",
    path: "/coach/#admin",
    init: seed(`{ admins: ["coach-1"] }`),
    setup: run(async () => {
      await waitFor(() => byText("h2", "Institutions (4 in the list)"));
      if (!byText(".inst-row", "AWWA School @ Napiri") || !byText(".inst-group h3", "AWWA")) throw new Error("the list");
      byText("button", "Add an institution").click();
      await waitFor(() => $(".inst-form"));
      const [name, org, type_, area] = $$(".inst-form input");
      type(name, "AWWA Home and Day Activity Centre");
      type(org, "AWWA");
      type(type_, "Day activity centre");
      type(area, "Pasir Ris");
      byText(".inst-form button", "Add").click();
      await waitFor(() => byText("h2", "Institutions (5 in the list)"));
      const row = () => byText(".inst-row", "AWWA Home and Day Activity Centre");
      [...row().querySelectorAll("button")].find((b) => b.textContent === "Edit").click();
      await waitFor(() => $(".inst-form"));
      type($$(".inst-form input")[3], "Pasir Ris Drive 3");
      byText(".inst-form button", "Save").click();
      await waitFor(() => byText(".inst-row", "Pasir Ris Drive 3"));
      [...row().querySelectorAll("button")].find((b) => b.textContent === "Retire").click();
      await waitFor(() => byText("h2", "Institutions (4 in the list)") && row().querySelector(".chip"));
      byText(".toast-btn", "Undo").click();
      await waitFor(() => byText("h2", "Institutions (5 in the list)"));
    }),
    expect: inPage(() => {
      const added = __fake.institutions.find((i) => i.name === "AWWA Home and Day Activity Centre");
      return added && added.active === true && added.area === "Pasir Ris Drive 3" && added.type === "Day activity centre" &&
        __fake.calls.filter((c) => c.name === "setInstitutionActive").length === 2 && fits();
    }),
  }),
  scene({
    name: "not an admin: #admin shows My classes, and no Admin link",
    path: "/coach/#admin",
    expect: inPage(() => $("h1")?.textContent === "My classes" && $("#nav a[data-route=admin]").hidden),
  }),

  // ---------- signing out, sizes, motion ----------
  scene({
    name: "sign out: back to Sign in, and the next coach starts at My classes",
    path: "/coach/#class/K7M3RQP9T",
    setup: run(async () => {
      await waitFor(() => $(".md-input"));
      $("#sign-out").click();
      await waitFor(() => byText("button", "Sign in with Google"));
    }),
    expect: inPage(() => location.hash === "#classes" && $("#account").hidden && __fake.calls.some((c) => c.name === "signOut")),
  }),
  scene({
    name: "iPad, reduced motion: the class screen fits; the video progress bar does not move",
    path: "/coach/#class/K7M3RQP9T",
    viewport: { width: 768, height: 1024 },
    media: [{ name: "prefers-reduced-motion", value: "reduce" }],
    init: seed(`{ pages: ${PAGE}, pictures: ${SHELF}, slowVideos: true }`),
    setup: run(async () => {
      await waitFor(() => $(".phone-screen .cm-h1"));
      byText("summary", "Make a short video").click();
      type($("#video-request"), "brushing teeth");
      byText("button", "Plan the video").click();
      await waitFor(() => $(".plan-card"));
      window.__fake.replies.startVideo = () => new Promise(() => {}); // Gemini taking its two minutes
      byText("button", "Make the video").click();
      await waitFor(() => $(".progress-calm span"));
    }),
    expect: inPage(() => getComputedStyle($(".progress-calm span")).animationName === "none" && fits() &&
      byText(".working-box", "about 2 minutes")),
  }),
  scene({
    name: "desktop: editor and preview side by side",
    path: "/coach/#class/K7M3RQP9T",
    viewport: { width: 1280, height: 800 },
    init: seed(`{ pages: ${PAGE} }`),
    setup: run(() => waitFor(() => $(".phone-screen .cm-h1"))),
    expect: inPage(() => $(".ws-side").getBoundingClientRect().left > $(".ws-editor").getBoundingClientRect().right && fits()),
  }),
];
