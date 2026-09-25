// The coach guide's screenshots (public/coach/guide.html), from the real coach
// app with cloud.js swapped for the in-memory stand-in the smoke tests use
// (STUBS in tools/smoke/coach.mjs) — no network, no sign-in, no emulators.
//
//   node tools/shoot-coach-guide.mjs              every scene
//   node tools/shoot-coach-guide.mjs editor poster   only these
//   SHOOT_DIR=<folder> node tools/shoot-coach-guide.mjs   write there instead,
//                                                  to look before replacing
//   SHOOT_DIR=<folder> SHOOT_VIEWPORT=820x1180 node tools/shoot-coach-guide.mjs
//                              every scene at another size, the whole window,
//                              no crop — to review the screens, e.g. on an iPad
//
// Each scene seeds the stand-in (window.FAKE), opens a coach app address,
// drives it to the state to show (setup), waits for it (expect), and captures
// either the whole viewport or a crop around some elements (clip). Desktop
// shots are 1280 × 800 at 1×, phone shots 390 × 844 at 2×. The smoke tests run
// the same scenes (tools/smoke/coach-guide.mjs), so a scene that no longer
// reaches its state fails there before a stale picture ships.
//
// Like tools/shoot-guide.mjs: Node 22 (built-in WebSocket) and Chrome
// (CHROME=<path> for another), nothing to install.

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createReadStream, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { STUBS } from "./smoke/coach.mjs";

// ---------- the sample class ----------

const PICTURES = [
  ["pic-tap", "tap-water.svg", "Water running from the tap"],
  ["pic-soap", "soap.svg", "Soap on my hands"],
  ["pic-rub", "rub-hands.svg", "Rubbing my hands together"],
  ["pic-dry", "dry-hands.svg", "Drying my hands with a towel"],
];
const HANDS = [
  "# Washing my hands",
  "I wash my hands before I eat.",
  "---",
  "![Water running from the tap](pictures/pic-tap.jpg)",
  "I turn on the tap. I wet my hands.",
  "---",
  "![Soap on my hands](pictures/pic-soap.jpg)",
  "I put soap on my hands.",
  "---",
  "![Rubbing my hands together](pictures/pic-rub.jpg)",
  "I rub my hands together. I count to 20.",
  "---",
  "![Drying my hands with a towel](pictures/pic-dry.jpg)",
  "I rinse my hands. I dry them with a towel.",
].join("\n");
const SPORTS = "# Sports day\nSports day is on Friday.\nI wear my PE shirt.";

const js = JSON.stringify;
const at = (daysAgo, h, m) => `new Date(new Date().setHours(${h}, ${m}, 0, 0) - ${daysAgo} * 86400000)`;
const pictures = `{ K7M3RQP9T: [${PICTURES.map(([id, , words], i) =>
  `{ id: ${js(id)}, words: ${js(words)}, file: "pictures/${id}.jpg", width: 800, height: 600, createdAt: new Date(Date.now() - ${i} * 60000) }`).join(", ")}] }`;
const pictureFiles = js(Object.fromEntries(PICTURES.map(([id, file]) => [id, file])));
const pages = (markdown = HANDS) => `{ K7M3RQP9T: [
  { id: "page1", title: "Washing my hands", markdown: ${js(markdown)}, createdAt: ${at(3, 9, 0)}, updatedAt: ${at(0, 8, 5)} },
  { id: "page2", title: "Sports day", markdown: ${js(SPORTS)}, createdAt: ${at(1, 16, 30)}, updatedAt: ${at(1, 16, 40)} }] }`;
const klass = (latest) => `{ K7M3RQP9T: { name: "3 Kindness", institution: "awwa-school-napiri", status: "active", createdAt: ${at(20, 9, 0)}, latest: ${latest} } }`;
// coaches, as the admin sees them (the stand-in's institutions are tools/seed/institutions.json)
const TAN = `{ name: "Ms Tan", institutions: ["awwa-school-napiri"], note: "Form teacher of 3 Kindness", email: "coach@example.com",
  status: "approved", createdAt: ${at(40, 9, 0)}, decidedAt: ${at(39, 10, 0)} }`;
const LIM_NOTE = "Form teacher of 5 Joy. School office: 6123 4567.";
const LIVE = `{ pageId: "page1", title: "Washing my hands", markdown: ${js(HANDS)}, publishedAt: ${at(0, 8, 5)}, publishedBy: "coach-1" }`;
const CLASS = `pages: ${pages()}, pictures: ${pictures}, pictureFiles: ${pictureFiles}`;

// run in the page before the app: small helpers for the setups, and the seed
const HELPERS = `
  window.$ = (sel) => document.querySelector(sel);
  window.$$ = (sel) => [...document.querySelectorAll(sel)];
  window.pause = (ms) => new Promise((r) => setTimeout(r, ms));
  window.waitFor = async (fn, ms = 3000) => {
    const end = Date.now() + ms;
    for (;;) { try { const v = await fn(); if (v) return v; } catch {} if (Date.now() > end) throw new Error("waited too long: " + fn); await pause(25); }
  };
  window.byText = (sel, text) => [...document.querySelectorAll(sel)].find((el) => el.textContent.trim().includes(text));
  window.type = (el, value) => { el.focus(); el.value = value; el.dispatchEvent(new Event("input", { bubbles: true })); };
  // the page scrolled so an element's top is near the top of the window
  window.scrollToEl = (el, gap = 12) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - gap);
`;

const DESKTOP = { width: 1280, height: 800, scale: 1 };
const PHONE = { width: 390, height: 844, scale: 2 };

// The key is the file name (public/coach/img/guide/<key>.png). clip: every
// element the selectors match, the box around them all is captured (pad
// around it; wide: the full width of the window; maxWidth: no wider than
// this, for blocks that stretch across an empty window).
export const SCENES = {
  signin: {
    ...DESKTOP, path: "/coach/", seed: "{ user: null }",
    expect: `byText("button", "Sign in with Google")`,
    clip: { selectors: [".signin"], pad: 20 },
  },
  "signin-in-app": {
    ...PHONE, path: "/coach/", seed: "{ user: null }",
    init: `Object.defineProperty(Navigator.prototype, "userAgent", { get: () =>
      "Mozilla/5.0 (Linux; Android 15; SM-A556E; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36 WhatsApp/2.25" });`,
    expect: `byText(".notice", "Open this page in Chrome or Safari")`,
  },
  "about-you": {
    ...DESKTOP, path: "/coach/",
    seed: `{ profiles: {}, coachesOf: {} }`,
    setup: `
      await waitFor(() => $("h1")?.textContent === "About you" && $(".pick-option"));
      byText(".pick-option", "AWWA School @ Napiri").querySelector("input").click();
      type($("textarea"), "Form teacher of 3 Kindness. School office: 6123 4567.");
      $("input[autocomplete=name]").focus();`,
    expect: `$("textarea").value.includes("Form teacher") && byText(".pick-chip", "AWWA School @ Napiri")`,
    clip: { selectors: ["main h1", "main .lead", "main form"], pad: 16, maxWidth: 720 },
  },
  waiting: {
    ...PHONE, path: "/coach/",
    seed: `{ profiles: { "coach-1": { name: "Ms Tan", institutions: ["awwa-school-napiri"], note: "Form teacher of 3 Kindness. School office: 6123 4567.",
      email: "coach@example.com", status: "pending", createdAt: ${at(0, 8, 0)} } } }`,
    setup: `await waitFor(() => byText(".facts dd li", "AWWA School @ Napiri"));`,
    expect: `$("h1")?.textContent === "Waiting for approval"`,
  },
  "my-classes": {
    ...DESKTOP, path: "/coach/#classes",
    seed: `{ classes: ${klass(LIVE)},
      requests: [{ id: "r1", uid: "coach-1", kind: "join-class", classCode: "H4W9NEK3R", status: "pending", createdAt: ${at(0, 7, 50)} }] }`,
    setup: `
      await waitFor(() => $(".class-card") && $(".request-line"));
      byText("summary", "New class").click();
      await waitFor(() => $("select option"));
      const name = $$("input").find((i) => i.maxLength === 30);
      type(name, "5 Joy");
      name.blur();`,
    expect: `byText("select option", "AWWA School @ Napiri") && !byText("button", "Make the class").disabled`,
    clip: { selectors: ["main h1", ".class-card", ".request-line", "#get-h", "details.fold"], pad: 16, maxWidth: 800 },
  },
  poster: {
    ...DESKTOP, path: "/coach/#poster/K7M3RQP9T",
    expect: `byText(".poster-class", "3 Kindness")`,
    clip: { selectors: [".poster-tools", ".poster"], pad: 20 },
  },
  class: {
    ...DESKTOP, path: "/coach/#class/K7M3RQP9T",
    seed: `{ ${CLASS}, classes: ${klass(LIVE)} }`,
    setup: `
      await waitFor(() => $(".md-input").value.includes("Washing") && $(".phone-screen .cm-h1"));
      const text = $(".md-input");
      const at = text.value.indexOf("I put soap");
      text.focus({ preventScroll: true });
      text.setSelectionRange(at, at);
      text.dispatchEvent(new Event("click"));
      scrollTo(0, 0);
      await waitFor(() => byText(".phone-where", "Screen 3 of 5") && $(".phone-screen img")?.complete);`,
    expect: `byText(".publish-state", "Learners see this page")`,
  },
  toolbar: {
    ...DESKTOP, path: "/coach/#class/K7M3RQP9T",
    seed: `{ ${CLASS}, classes: ${klass(LIVE)} }`,
    setup: `await waitFor(() => $(".md-input").value.includes("Washing"));`,
    expect: `byText(".save-state", "Saved")`,
    clip: { selectors: [".ws-editor .toolbar"], pad: 10 },
  },
  publish: {
    ...DESKTOP, path: "/coach/#class/K7M3RQP9T",
    seed: `{ ${CLASS}, classes: ${klass("null")} }`,
    setup: `
      await waitFor(() => $(".md-input").value.includes("Washing") && $(".phone-screen .cm-h1"));
      byText("button", "Publish this page").click();
      await waitFor(() => byText(".publish-state", "Learners see this page."));
      $(".toast-btn").focus();`,
    expect: `byText(".toast", "Published") && !$(".toast").hidden`,
  },
  "public-warning": {
    ...DESKTOP, path: "/coach/#class/K7M3RQP9T",
    seed: `{ ${CLASS}, classes: ${klass(LIVE)} }`,
    expect: `byText(".publish-state", "Learners see this page")`,
    clip: { selectors: [".publish"], pad: 12 },
  },
  pictures: {
    ...DESKTOP, path: "/coach/#class/K7M3RQP9T",
    seed: `{ ${CLASS}, classes: ${klass(LIVE)} }`,
    setup: `await waitFor(() => $$(".shelf-item[data-picture] img").length === 4 && $$(".shelf-item img").every((i) => i.complete));`,
    expect: `$$(".shelf-words").length === 4`,
    clip: { selectors: [".ws-pictures"], pad: 12 },
  },
  "picture-chooser": {
    ...DESKTOP, path: "/coach/#class/K7M3RQP9T",
    seed: `{ ${CLASS}, classes: ${klass(LIVE)} }`,
    setup: `
      await waitFor(() => $$(".shelf-item[data-picture]").length === 4);
      byText(".tool-btn", "Picture").click();
      await waitFor(() => $$("dialog[open] .chooser-item img").length === 4 && $$("dialog[open] img").every((i) => i.complete));`,
    expect: `$("dialog[open]")`,
    clip: { selectors: ["dialog[open]"], pad: 16 },
  },
  youtube: {
    ...DESKTOP, path: "/coach/#class/K7M3RQP9T",
    seed: `{ ${CLASS}, classes: ${klass(LIVE)} }`,
    setup: `
      await waitFor(() => $(".md-input").value.includes("Washing"));
      byText(".tool-btn", "YouTube").click();
      await waitFor(() => $("dialog[open]"));
      const [link, words] = $$("dialog[open] input");
      type(link, "https://youtu.be/AbCdEfGhIjK");
      type(words, "How to wash hands");
      words.blur();`,
    expect: `byText(".link-check", "A YouTube video")`,
    clip: { selectors: ["dialog[open]"], pad: 16 },
  },
  "youtube-card": {
    ...PHONE, path: "/coach/#class/K7M3RQP9T",
    seed: `{ pages: { K7M3RQP9T: [{ id: "page1", title: "Washing my hands",
      markdown: "# Washing my hands\\nWatch the video. Then we wash our hands together.\\n[How to wash hands](https://youtu.be/AbCdEfGhIjK)",
      createdAt: ${at(1, 9, 0)}, updatedAt: ${at(0, 8, 5)} }] }, classes: ${klass("null")} }`,
    setup: `
      await waitFor(() => $(".phone-screen .cm-youtube-card"));
      scrollToEl($(".preview"));`,
    expect: `byText(".cm-youtube-card", "How to wash hands")`,
    clip: { selectors: [".preview .phone"], pad: 12 },
  },
  "helper-write": {
    ...DESKTOP, path: "/coach/#class/K7M3RQP9T",
    seed: `{ pictures: ${pictures}, pictureFiles: ${pictureFiles}, classes: ${klass("null")}, usage: { flash: 11, video: 1 },
      pages: { K7M3RQP9T: [{ id: "page1", title: "Washing my hands", markdown: "", createdAt: ${at(0, 8, 0)}, updatedAt: ${at(0, 8, 0)} }] },
      replies: { writePage: { action: "write",
        understood: "I understood: a picture story about washing hands before eating, for the learners, using the 4 pictures on the shelf.",
        questions: [], title: "Washing my hands", markdown: ${js(HANDS)},
        note: "I used 5 screens, one picture on each of the last four.", used: 12, limit: 200 } } }`,
    setup: `
      await waitFor(() => $(".phone-empty"));
      type($("#helper-input"), "Write a picture story about washing hands before eating, with my 4 pictures");
      byText("button", "Ask the AI").click();
      await waitFor(() => $(".understood") && $(".md-input").value.includes("Washing"));
      $("#helper-input").blur();
      scrollToEl($(".ws-helper"), 20);`,
    expect: `byText(".usage-line", "12 of 200")`,
    clip: { selectors: [".ws-helper"], pad: 12 },
  },
  "helper-ask": {
    ...DESKTOP, path: "/coach/#class/K7M3RQP9T",
    seed: `{ classes: ${klass("null")}, usage: { flash: 12, video: 1 }, pages: { K7M3RQP9T: [] },
      replies: { writePage: { action: "ask", understood: "I understood: a page about the class trip to the zoo.",
        questions: [
          { question: "Who is the page for?", answers: ["The learners", "Their parents", "Both"] },
          { question: "What should it cover?", answers: ["What will happen", "What to bring", "Both"] }],
        title: "", markdown: "", note: "", used: 13, limit: 200 } } }`,
    setup: `
      await waitFor(() => $(".phone-empty"));
      type($("#helper-input"), "zoo trip next week");
      byText("button", "Ask the AI").click();
      await waitFor(() => $(".question"));
      byText(".answer-btn", "The learners").click();
      $("#helper-input").blur();`,
    expect: `$$(".question").length === 2`,
    clip: { selectors: [".ws-helper"], pad: 12 },
  },
  "helper-decline": {
    ...DESKTOP, path: "/coach/#class/K7M3RQP9T",
    seed: `{ classes: ${klass("null")}, usage: { flash: 13, video: 1 }, pages: { K7M3RQP9T: [] },
      replies: { writePage: { action: "decline", understood: "I understood: a speech for a colleague's wedding.",
        questions: [], title: "", markdown: "",
        note: "I can only write pages for your learners and their class, such as a picture story, steps for a task or class news.", used: 14, limit: 200 } } }`,
    setup: `
      await waitFor(() => $(".phone-empty"));
      type($("#helper-input"), "Write a speech for my colleague's wedding");
      byText("button", "Ask the AI").click();
      await waitFor(() => $(".helper-result .notice"));
      $("#helper-input").blur();`,
    expect: `byText(".helper-result", "I can only write pages")`,
    clip: { selectors: [".ws-helper"], pad: 12 },
  },
  "video-plan": {
    ...DESKTOP, path: "/coach/#class/K7M3RQP9T",
    seed: `{ classes: ${klass("null")}, pages: { K7M3RQP9T: [] }, usage: { flash: 14, video: 1 },
      replies: { planVideo: { action: "write",
        understood: "I understood: a short clip of hands being washed with soap at a sink, step by step.",
        questions: [], planId: "plan1",
        prompt: "One calm, continuous shot at hand level of a pair of hands at a white sink in a tidy HDB flat kitchen. The tap turns on, the hands are wet, pump soap is pressed once, the hands rub palms, backs and between the fingers, then rinse under the water. Soft natural light, steady camera, no faces. No text, captions, logos or brands. No music or voice, only the soft sound of running water.",
        seconds: 8, words: "Hands washing with soap at a sink", note: "", used: 15, limit: 200 } } }`,
    setup: `
      await waitFor(() => $(".phone-empty"));
      byText("summary", "Make a short video").click();
      type($("#video-request"), "hands washing with soap at a sink, step by step");
      byText("button", "Plan the video").click();
      await waitFor(() => $(".plan-card"));
      $("#video-request").blur();
      scrollToEl($(".ws-videos"), 20);`,
    expect: `byText(".plan-cost", "You have 4 left")`,
    clip: { selectors: [".ws-videos"], pad: 12 },
  },
  "video-shelf": {
    ...DESKTOP, path: "/coach/#class/K7M3RQP9T",
    seed: `{ classes: ${klass("null")}, pages: { K7M3RQP9T: [] }, usage: { flash: 15, video: 3 }, slowVideos: true,
      videos: { K7M3RQP9T: [
        { id: "vid-bus", status: "rendering", words: "Tapping a card at a bus reader", prompt: "One calm shot of a hand tapping a travel card on a bus card reader.", seconds: 6, createdAt: ${at(0, 9, 12)} },
        { id: "vid-hands", status: "ready", words: "Hands washing with soap at a sink", prompt: "One calm, continuous shot at hand level of a pair of hands at a white sink.", seconds: 8, createdAt: ${at(0, 8, 40)} },
        { id: "vid-tray", status: "approved", words: "Returning a tray at a hawker centre", prompt: "One calm shot of hands placing a tray on a tray-return rack.", seconds: 7, createdAt: ${at(2, 15, 5)} }] } }`,
    setup: `
      await waitFor(() => byText(".video-item .chip", "Ready to check"));
      byText(".video-item button", "Watch it").click();
      await waitFor(() => $$(".video-item video").length === 2);
      await waitFor(() => $$(".video-item video").every((v) => v.readyState >= 1), 4000);
      // a frame from the middle of each clip, not a black box
      await Promise.all($$(".video-item video").map((v) => new Promise((r) => { v.addEventListener("seeked", r, { once: true }); v.currentTime = 1.5; })));
      await waitFor(() => $$(".video-item video").every((v) => v.readyState >= 3), 4000).catch(() => {});
      await pause(800);
      scrollToEl($(".ws-videos"), 20);`,
    expect: `byText(".video-item .chip", "Being made") && byText(".video-item .chip", "On the shelf")`,
    clip: { selectors: [".ws-videos"], pad: 12 },
  },
  "admin-requests": {
    ...DESKTOP, path: "/coach/#admin",
    seed: `{ admins: ["coach-1"], classes: ${klass(LIVE)}, profiles: { "coach-1": ${TAN},
        "coach-2": { name: "Mr Lim", institutions: ["awwa-school-napiri"], note: ${js(LIM_NOTE)}, email: "lim@example.com",
          status: "pending", createdAt: ${at(0, 7, 55)} },
        "coach-3": { name: "Ms Wong", institutions: ["awwa-school-napiri"], note: "Co-teacher of 3 Kindness.", email: "wong@example.com",
          status: "approved", createdAt: ${at(9, 9, 0)}, decidedAt: ${at(8, 9, 0)} } },
      requests: [{ id: "r2", uid: "coach-3", kind: "join-class", classCode: "K7M3RQP9T", note: "Ms Tan's class", status: "pending", createdAt: ${at(0, 7, 58)} }] }`,
    setup: `await waitFor(() => $$(".admin-card").length >= 4);`,
    expect: `byText("h2", "Coaches waiting for approval (1)") && byText("h2", "Requests to join a class (1)")`,
    clip: { selectors: [".coach-header .brand", ".header-nav", "main h1", "main .lead", "#adm-wait-h", "#adm-wait-h ~ .admin-list .admin-card",
      "#adm-req-h", "#adm-req-h ~ .admin-list .admin-card"], pad: 16, maxWidth: 880 },
  },
  "admin-classes": {
    ...DESKTOP, path: "/coach/#admin",
    seed: `{ admins: ["coach-1"], classes: ${klass(LIVE)}, coachesOf: { K7M3RQP9T: ["coach-1", "coach-2"] }, profiles: { "coach-1": ${TAN},
        "coach-2": { name: "Mr Lim", institutions: ["awwa-school-napiri", "awwa-school-bedok"], note: ${js(LIM_NOTE)}, email: "lim@example.com",
          status: "approved", createdAt: ${at(30, 9, 0)}, decidedAt: ${at(29, 9, 0)}, institutionsChangedAt: ${at(1, 16, 20)} } } }`,
    setup: `await waitFor(() => $("#adm-limits-h"));`,
    expect: `byText(".admin-card", "Take the page down") && byText(".admin-card .chip", "after approval")`,
    clip: { selectors: ["#adm-coach-h", "#adm-coach-h + .admin-list", "#adm-class-h + .admin-list", "#adm-limits-h + form"], pad: 16, maxWidth: 880 },
  },
  "admin-institutions": {
    ...DESKTOP, path: "/coach/#admin",
    seed: `{ admins: ["coach-1"], profiles: { "coach-1": ${TAN} } }`,
    setup: `
      await waitFor(() => $("#adm-inst-h"));
      byText("button", "Add an institution").click();
      await waitFor(() => $(".inst-form"));
      const [name, org, type_, area] = $$(".inst-form input");
      type(name, "AWWA Home and Day Activity Centre");
      type(org, "AWWA");
      type(type_, "Day activity centre");
      type(area, "Pasir Ris");
      area.blur();
      scrollToEl($("#adm-inst-h"), 20);`,
    expect: `byText("h2", "Institutions (4 in the list)") && $$(".inst-row").length === 4`,
    clip: { selectors: ["#adm-inst-h", "#adm-inst-h ~ *"], pad: 16, maxWidth: 880 },
  },
  "phone-class": {
    ...PHONE, path: "/coach/#class/K7M3RQP9T",
    seed: `{ ${CLASS}, classes: ${klass(LIVE)} }`,
    setup: `await waitFor(() => $(".md-input").value.includes("Washing") && $(".phone-screen .cm-h1"));`,
    expect: `byText(".save-state", "Saved")`,
  },
  "phone-preview": {
    ...PHONE, path: "/coach/#class/K7M3RQP9T",
    seed: `{ ${CLASS}, classes: ${klass(LIVE)} }`,
    setup: `
      await waitFor(() => $(".phone-screen .cm-h1"));
      $(".phone-btn.is-next").click();
      await waitFor(() => $(".phone-screen img")?.complete);
      scrollToEl($(".preview"), 8);`,
    expect: `byText(".phone-where", "Screen 2 of 5")`,
  },
};

// SHOOT_VIEWPORT=<w>x<h>: a scene at that size, the whole window, uncropped
function reviewing(s) {
  const size = /^(\d+)x(\d+)$/.exec(process.env.SHOOT_VIEWPORT ?? "");
  if (!size) return s;
  const { clip, ...rest } = s;
  return { ...rest, width: Number(size[1]), height: Number(size[2]), scale: 1 };
}

// ---------- the smoke-test form of a scene (tools/smoke/coach-guide.mjs) ----------

export function smokeScene(name) {
  const s = SCENES[name];
  return {
    name: `guide shot ${name}`,
    path: s.path,
    viewport: { width: s.width, height: s.height },
    stubs: STUBS,
    init: initFor(s),
    setup: s.setup ? `await (async () => {${s.setup}\n})();` : undefined,
    expect: s.expect,
  };
}

function initFor(s) {
  return HELPERS + (s.seed ? `window.FAKE = ${s.seed};\n` : "") + (s.init ?? "");
}

// ---------- taking them ----------

async function main() {
  const HERE = fileURLToPath(new URL(".", import.meta.url));
  const ROOT = resolve(join(HERE, "..", "public"));
  const OUT = process.env.SHOOT_DIR ? resolve(process.env.SHOOT_DIR) : join(ROOT, "coach", "img", "guide");
  const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const asked = process.argv.slice(2);
  for (const name of asked) {
    if (!SCENES[name]) {
      console.error(`no scene "${name}" (there are: ${Object.keys(SCENES).join(", ")})`);
      process.exit(1);
    }
  }
  const names = asked.length ? asked : Object.keys(SCENES);
  mkdirSync(OUT, { recursive: true });

  const TYPES = {
    ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript",
    ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json", ".webmanifest": "application/manifest+json",
  };
  const server = createServer(async (req, res) => {
    let wanted;
    try {
      wanted = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    } catch {
      return res.writeHead(400).end();
    }
    let path = join(ROOT, normalize(wanted));
    if (path !== ROOT && !path.startsWith(ROOT + sep)) return res.writeHead(403).end();
    if (await stat(path).then((s) => s.isDirectory(), () => false)) path = join(path, "index.html");
    createReadStream(path)
      .on("error", () => res.writeHead(404).end())
      .on("open", () => res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream", "cache-control": "no-store" }))
      .pipe(res);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}/`;

  const profile = mkdtempSync(join(tmpdir(), "shoot-coach-guide-"));
  const chrome = spawn(CHROME, [
    "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run",
    "--no-default-browser-check", "--hide-scrollbars", "--mute-audio", "--force-color-profile=srgb", "--disable-lcd-text",
    "about:blank",
  ], { stdio: "ignore" });

  let devtools;
  for (let i = 0; i < 100 && !devtools; i++) {
    try {
      const [port, path] = readFileSync(join(profile, "DevToolsActivePort"), "utf8").split("\n");
      if (port && path) devtools = `ws://127.0.0.1:${port}${path}`;
    } catch { /* not yet */ }
    if (!devtools) await sleep(100);
  }
  if (!devtools) throw new Error(`Chrome never reported a DevTools port (is it at ${CHROME}?)`);
  const ws = new WebSocket(devtools);
  await new Promise((res, rej) => {
    ws.addEventListener("open", res, { once: true });
    ws.addEventListener("error", rej, { once: true });
  });

  let nextId = 0;
  const replies = new Map();
  const listeners = new Map();
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id == null) return void listeners.get(msg.sessionId)?.(msg);
    const reply = replies.get(msg.id);
    replies.delete(msg.id);
    if (msg.error) reply?.reject(new Error(`${reply.method}: ${msg.error.message}`));
    else reply?.resolve(msg.result);
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++nextId;
    replies.set(id, { resolve, reject, method });
    ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
  });

  let failed = 0;
  for (const name of names) {
    const s = reviewing(SCENES[name]);
    const problems = [];
    const { browserContextId } = await send("Target.createBrowserContext");
    const { targetId } = await send("Target.createTarget", { url: "about:blank", browserContextId });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    const page = (method, params) => send(method, params, sessionId);
    const evaluate = async (expression) => {
      const r = await page("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value;
    };
    listeners.set(sessionId, ({ method, params }) => {
      if (method === "Runtime.exceptionThrown") problems.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text);
      else if (method === "Runtime.consoleAPICalled" && params.type === "error") problems.push(params.args.map((a) => a.value ?? a.description).join(" "));
      else if (method === "Fetch.requestPaused") {
        const path = new URL(params.request.url).pathname;
        page("Fetch.fulfillRequest", {
          requestId: params.requestId, responseCode: 200,
          responseHeaders: [{ name: "content-type", value: "text/javascript" }, { name: "cache-control", value: "no-store" }],
          body: Buffer.from(STUBS[path] ?? "").toString("base64"),
        }).catch((err) => problems.push(err.message));
      }
    });
    try {
      await page("Page.enable");
      await page("Runtime.enable");
      await page("Emulation.setDeviceMetricsOverride", { width: s.width, height: s.height, deviceScaleFactor: s.scale, mobile: s.width < 768 });
      await page("Emulation.setFocusEmulationEnabled", { enabled: true });
      await page("Fetch.enable", { patterns: Object.keys(STUBS).map((p) => ({ urlPattern: new URL(p, base).href })) });
      await page("Page.addScriptToEvaluateOnNewDocument", { source: `delete Navigator.prototype.serviceWorker;\n${initFor(s)}` });
      await page("Page.navigate", { url: new URL(s.path, base).href });
      for (let i = 0; i < 100; i++) {
        if (await evaluate(`document.readyState === "complete"`).catch(() => false)) break;
        await sleep(100);
      }
      if (s.setup) await evaluate(`(async () => {${s.setup}\n})()`);
      let reached = false;
      for (let i = 0; i < 50 && !reached; i++) {
        reached = Boolean(await evaluate(`(async () => Boolean(await (${s.expect})))()`).catch(() => false));
        if (!reached) await sleep(100);
      }
      if (!reached) throw new Error(`never reached: ${s.expect}`);
      await evaluate("document.fonts.ready.then(() => true)");
      await sleep(400);

      let clip;
      if (s.clip) {
        clip = await evaluate(`(() => {
          const sels = ${js(s.clip.selectors)};
          const missing = sels.filter((sel) => !document.querySelector(sel));
          if (missing.length) throw new Error("clip: nothing matches " + missing.join(", "));
          const r = sels.flatMap((sel) => [...document.querySelectorAll(sel)]).map((e) => e.getBoundingClientRect());
          const pad = ${s.clip.pad ?? 12};
          const top = Math.max(0, Math.min(...r.map((b) => b.top)) + scrollY - pad);
          const bottom = Math.max(...r.map((b) => b.bottom)) + scrollY + pad;
          const left = ${s.clip.wide ? 0 : `Math.max(0, Math.min(...r.map((b) => b.left)) - pad)`};
          const right = Math.min(${s.clip.wide ? "innerWidth" : `innerWidth, Math.max(...r.map((b) => b.right)) + pad`}, left + ${s.clip.maxWidth ?? "innerWidth"});
          return { x: Math.round(left), y: Math.round(top), width: Math.round(right - left), height: Math.round(bottom - top), scale: 1 };
        })()`);
      }
      const { data } = await page("Page.captureScreenshot", clip ? { format: "png", clip, captureBeyondViewport: true } : { format: "png" });
      const out = join(OUT, `${name}.png`);
      writeFileSync(out, Buffer.from(data, "base64"));
      const size = clip ? `${clip.width * s.scale}x${clip.height * s.scale}` : `${s.width * s.scale}x${s.height * s.scale}`;
      if (problems.length) throw new Error(problems.join("\n"));
      console.log(`ok    ${name}.png  ${size}`);
    } catch (err) {
      failed++;
      console.log(`FAIL  ${name}: ${err.message}`);
    } finally {
      listeners.delete(sessionId);
      await send("Target.closeTarget", { targetId }).catch(() => {});
      await send("Target.disposeBrowserContext", { browserContextId }).catch(() => {});
    }
  }

  ws.close();
  chrome.kill();
  server.close();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
  console.log(failed ? `\n${failed} of ${names.length} failed` : `\nwrote ${names.length} to ${OUT}`);
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
