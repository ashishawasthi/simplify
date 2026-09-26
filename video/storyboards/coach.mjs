// The coach video: getting a class, then writing and publishing a page, on
// an Android-sized phone. The coach app runs against the same in-memory
// stand-in for Firebase as the coach guide's screenshots
// (tools/smoke/coach.mjs STUBS, seeded as tools/shoot-coach-guide.mjs does),
// so filming needs no sign-in, network or emulator.

import { STUBS } from "../../tools/smoke/coach.mjs";
import { at, COACH_HELPERS, HANDS, klass, LIVE, pictureFiles, pictures, SAMPLE_CLASS } from "../../tools/shoot-coach-guide.mjs";

const PHONE = { width: 390, height: 844 };
const CODE = "K7M3RQP9T";

// the coach app, with window.FAKE = seed, and cloud.js served from the stand-in
const coachApp = (seed) => async (page, origin) => {
  const { identifier } = await page.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `delete Navigator.prototype.serviceWorker;\n${COACH_HELPERS}\nwindow.FAKE = ${seed};`,
  });
  await page.send("Fetch.enable", { patterns: Object.keys(STUBS).map((p) => ({ urlPattern: new URL(p, origin).href })) });
  const off = page.on("Fetch.requestPaused", (params) => {
    const path = new URL(params.request.url).pathname;
    page.send("Fetch.fulfillRequest", {
      requestId: params.requestId, responseCode: 200,
      responseHeaders: [{ name: "content-type", value: "text/javascript" }, { name: "cache-control", value: "no-store" }],
      body: Buffer.from(STUBS[path] ?? "").toString("base64"),
    }).catch(() => {});
  });
  return async () => {
    off();
    await page.send("Fetch.disable");
    await page.send("Page.removeScriptToEvaluateOnNewDocument", { identifier });
  };
};

const shot = (path, seed, rest) => ({ viewport: PHONE, path: `/coach/${path}`, intercept: coachApp(seed), ...rest });
const WITH_CLASS = `{ ${SAMPLE_CLASS}, classes: ${klass(LIVE)} }`;

export default {
  helpers: "",
  intro: {
    title: "Simplify for coaches",
    line: "Pages for your class, on every learner's phone",
    logo: "/img/icons/icon-512.png",
    icons: ["/img/pic/school.svg", "/img/pic/photo.svg", "/img/pic/tablet.svg", "/img/pic/read.svg"],
    say: "Simplify for coaches. Make pages for your class.",
  },
  chapters: [
    {
      title: "Get started", icon: "👋", color: "#455a64",
      shots: [
        {
          title: "Sign in", icon: "🔑", line: "Sign in with your Google account.",
          shot: shot("", "{ user: null }", {
            expect: `!!byText("button", "Sign in with Google")`,
            steps: [{ wait: 400 }, { focus: "button", has: "Sign in with Google", zoom: 1.15, after: 1000 }],
          }),
        },
        {
          title: "About you", icon: "🏫", line: "Pick your school. An admin checks, then approves you.",
          shot: shot("", "{ profiles: {}, coachesOf: {} }", {
            expect: `$("h1")?.textContent === "About you" && !!$(".pick-option")`,
            steps: [
              { tap: ".pick-option", has: "AWWA School @ Napiri", after: 500 },
              { type: "textarea", text: "Form teacher of 3 Kindness.", every: 40 },
              { js: "document.activeElement.blur()", after: 600 },
            ],
          }),
        },
        {
          title: "Make a class", icon: "➕", line: "Make a class, or ask to join one.",
          shot: shot("#classes", `{ classes: ${klass(LIVE)} }`, {
            expect: `!!$(".class-card")`,
            steps: [
              { tap: "summary", has: "New class", after: 500 },
              { type: `input[maxlength="30"]`, text: "5 Joy", every: 90 },
              { js: "document.activeElement.blur()", after: 300 },
              { focus: "button", has: "Make the class", zoom: 1.15, after: 900 },
            ],
          }),
        },
        {
          title: "QR poster", icon: "📷", line: "Print the QR code. Each device scans it once.",
          shot: shot(`#poster/${CODE}`, WITH_CLASS, {
            expect: `!!byText(".poster-class", "3 Kindness")`,
            steps: [{ wait: 400 }, { focus: ".poster", zoom: 1, after: 1200 }],
          }),
        },
      ],
    },
    {
      title: "Write a page", icon: "/img/pic/read.svg", color: "#1565c0",
      shots: [
        {
          title: "Write", icon: "✏️", line: "Write the page. The phone shows what learners see.",
          shot: shot(`#class/${CODE}`, WITH_CLASS, {
            expect: `$(".md-input")?.value.includes("Washing") && !!$(".phone-screen .cm-h1")`,
            steps: [
              { scroll: ".ws-editor", block: "start", after: 500 },
              // the preview follows the caret: it shows the screen being written
              { type: ".md-input", atEnd: true, text: "\n\nNow I can eat.", every: 70, blur: false },
              { scroll: ".preview .phone", block: "center", after: 500, blur: false },
              { focus: ".preview .phone", zoom: 1, after: 1000, blur: false },
            ],
          }),
        },
        {
          title: "Pictures", icon: "/img/pic/photo.svg", line: "Add photos from your phone or gallery.",
          shot: shot(`#class/${CODE}`, WITH_CLASS, {
            expect: `$$(".shelf-item[data-picture] img").length === 4`,
            steps: [
              { scroll: ".ws-pictures", block: "start", after: 800 },
              { focus: ".ws-pictures label", has: "Add pictures", zoom: 1.15, after: 1000 },
            ],
          }),
        },
        {
          title: "Picture in the page", icon: "🖼️", line: "Tap Picture, then choose one from the shelf.",
          shot: shot(`#class/${CODE}`, WITH_CLASS, {
            expect: `$$(".shelf-item[data-picture]").length === 4 && $(".md-input")?.value.includes("Washing")`,
            steps: [
              { scroll: ".ws-editor", block: "start", after: 500 },
              { tap: ".tool-btn", has: "Picture", after: 800 },
              { tap: "dialog[open] .chooser-item", after: 900 },
            ],
          }),
        },
        {
          title: "Write with AI", icon: "✨", line: "Or tell the AI what you need.",
          shot: shot(`#class/${CODE}`, `{ pictures: ${pictures}, pictureFiles: ${pictureFiles}, classes: ${klass("null")}, usage: { flash: 11, video: 1 },
            pages: { ${CODE}: [{ id: "page1", title: "Washing my hands", markdown: "", createdAt: ${at(0, 8, 0)}, updatedAt: ${at(0, 8, 0)} }] },
            replies: { writePage: { action: "write",
              understood: "I understood: a picture story about washing hands before eating, using the 4 pictures on the shelf.",
              questions: [], title: "Washing my hands", markdown: ${JSON.stringify(HANDS)},
              note: "I used 5 screens, one picture on each of the last four.", used: 12, limit: 200 } } }`, {
            // an empty page opens with Write with AI already unfolded
            expect: `!!$(".phone-empty") && $(".helper").open`,
            steps: [
              { scroll: ".helper", block: "start", after: 400 },
              { type: "#helper-input", text: "A picture story about washing hands, with my 4 pictures", every: 30 },
              { tap: ".helper .actions .btn-primary", after: 300 },
              { until: `!!$(".understood")`, after: 700 },
              { focus: ".understood", zoom: 1.1, after: 900 },
            ],
          }),
        },
        {
          title: "A video of the page", icon: "🎬", line: "Make a video of the page, read aloud. Point things out.",
          shot: shot(`#class/${CODE}`, `{ ${SAMPLE_CLASS}, classes: ${klass(LIVE)}, usage: { flash: 3, video: 1 } }`, {
            expect: `$(".md-input")?.value.includes("Washing") && !!$(".phone-screen .cm-h1")`,
            steps: [
              { scroll: "#video-maker", block: "center", after: 500 },
              { tap: "#video-maker > summary", after: 700 },
              { until: `!!$('.mark-row[data-picture="pic-tap"]')`, after: 200 },
              { scroll: '.mark-row[data-picture="pic-tap"]', block: "center", after: 400 },
              { type: '.mark-row[data-picture="pic-tap"] .mark-input', text: "an arrow to the tap", every: 35 },
              { tap: '.mark-row[data-picture="pic-tap"] button', has: "Draw it", after: 300 },
              { until: `$('.mark-row[data-picture="pic-tap"] .mark-layer')?.hidden === false`, after: 300 },
              { focus: '.mark-row[data-picture="pic-tap"] .mark-picture', zoom: 1.35, after: 1100 },
            ],
          }),
        },
        {
          title: "Publish", icon: "📢", line: "Publish. Learners see it straight away.",
          shot: shot(`#class/${CODE}`, `{ ${SAMPLE_CLASS}, classes: ${klass("null")} }`, {
            expect: `$(".md-input")?.value.includes("Washing") && !!$(".phone-screen .cm-h1")`,
            steps: [
              { scroll: ".publish", block: "center", after: 600 },
              { tap: "button", has: "Publish this page", after: 1000 },
              { focus: ".publish-state", zoom: 1.15, after: 900 },
            ],
          }),
        },
      ],
    },
  ],
  end: {
    title: "Help for coaches",
    line: "simplify.whiz.coach/coach/guide",
    logo: "/img/icons/icon-512.png",
    say: "For more help, open Help for coaches.",
  },
};
