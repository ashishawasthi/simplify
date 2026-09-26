// A coach's page video: one of their class's pages, read one screen at a time
// in the real learner reader (My class) — its words spoken in the app's voice,
// the coach's marks drawn over its pictures, Next tapped between screens —
// then saved as a private draft for the coach to check (docs/coach/videos.md).
//
// The Cloud Run job runs it for the makeVideo callable:
//   node video/render.mjs page <classCode> <videoId>
// It reads classes/{code}/videos/{id} (status "rendering", kind "page"),
// writes the MP4 to classes/{code}/video-drafts/{id}.mp4 and sets "ready";
// if it cannot, it writes renderError, and the next checkVideo marks the
// video failed and gives the coach's video back.
//
// To try a page out locally, without Firestore or Storage:
//   node video/render.mjs page --local spec.json
//   spec: { classCode, className, title, markdown, readAloud, music,
//           overlays: { <pictureId>: [shapes] }, pictureFiles: { <pictureId>: "photo.jpg" } }
//   (a picture file's path is from the spec's folder)

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseClassMarkdown, plainText } from "../public/js/class-markdown.js";
import { cleanShapes } from "../public/coach/js/overlay.js";
import { HELPERS } from "../tools/guide-scenes.mjs";
import { PROJECT, token } from "./lib/auth.mjs";
import { speak } from "./lib/voice.mjs";
import { CLASS_BUCKET, upload } from "./lib/upload.mjs";

const FIRESTORE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const MAX_SCREENS = 20; // a longer page is cut here: a video should stay short
const QUIET = 2.2; // seconds on a screen with nothing to read aloud

// ---------- Firestore's typed JSON, both ways (only what a video doc holds) ----------

function plain(v) {
  if (!v) return undefined;
  if ("stringValue" in v) return v.stringValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values ?? []).map(plain);
  if ("mapValue" in v) return Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, plain(x)]));
  return undefined;
}

async function firestore(method, path, body) {
  const res = await fetch(`${FIRESTORE}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
    body: body && JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

async function readVideo(code, id) {
  const { ok, status, json } = await firestore("GET", `classes/${code}/videos/${id}`);
  if (!ok) throw new Error(`reading the video: ${status} ${json.error?.message ?? ""}`);
  return { data: plain({ mapValue: { fields: json.fields } }), updateTime: json.updateTime };
}

// set some fields — only while the video is still "rendering" as we read it
async function updateVideo(code, id, updateTime, fields) {
  const mask = Object.keys(fields).map((f) => `updateMask.fieldPaths=${f}`).join("&");
  const typed = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k,
    typeof v === "number" ? { integerValue: String(v) } : k.endsWith("At") ? { timestampValue: v } : { stringValue: String(v) }]));
  return firestore("PATCH", `classes/${code}/videos/${id}?${mask}&currentDocument.updateTime=${encodeURIComponent(updateTime)}`, { fields: typed });
}

// a class's file, as anyone may GET it by its exact path (storage.rules)
async function classFile(code, kind, id) {
  const path = kind === "video" ? `classes/${code}/videos/${id}.mp4` : `classes/${code}/pictures/${id}.jpg`;
  const res = await fetch(`https://firebasestorage.googleapis.com/v0/b/${CLASS_BUCKET}/o/${encodeURIComponent(path)}?alt=media`);
  if (!res.ok) return null; // not on the shelf any more: the reader leaves it out
  return Buffer.from(await res.arrayBuffer());
}

// ---------- the storyboard ----------

// what a screen says aloud: its headings, sentences and list items, in order
export function screenWords(blocks) {
  const out = [];
  for (const b of blocks) {
    if (b.type === "heading" || b.type === "paragraph") out.push(plainText(b.inline));
    else if (b.type === "list") out.push(...(b.items ?? []).map((item) => plainText(item)));
  }
  return out.map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean)
    .map((t) => (/[.!?:]$/.test(t) ? t : `${t}.`)).join(" ").slice(0, 600);
}

export async function pageBoard(spec, { cacheDir, mediaIds }) {
  const screens = parseClassMarkdown(spec.markdown ?? "").screens.slice(0, MAX_SCREENS);
  if (!screens.length) throw new Error("the page is empty");
  const code = spec.classCode;
  const saved = JSON.stringify({
    code, name: spec.className ?? "", checkedAt: Date.now(),
    latest: { pageId: "video", title: spec.title ?? "", markdown: spec.markdown, publishedAt: new Date().toISOString() },
  });
  // the page and its files on this device, as if the class's QR code had been
  // scanned and the page downloaded: My class shows it with no internet
  const seed = `
    localStorage.setItem("simplify-class-v1", ${JSON.stringify(saved)});
    deviceSettings({ classCode: ${JSON.stringify(code)}, className: ${JSON.stringify(spec.className ?? "")} });
    const cache = await caches.open("simplify-class-media");
    for (const [kind, id] of ${JSON.stringify(mediaIds)}) {
      const res = await fetch("/page-media/" + kind + "/" + id);
      if (!res.ok) continue;
      await cache.put(new URL("/class-media/${code}/" + kind + "/" + id, location.href).href,
        new Response(await res.blob(), { headers: { "content-type": kind === "video" ? "video/mp4" : "image/jpeg" } }));
    }
    location.hash = "#my-class";
    await pause(900);
  `;
  const overlays = spec.overlays ?? {};
  const shots = [];
  for (const [i, blocks] of screens.entries()) {
    const words = spec.readAloud === false ? "" : screenWords(blocks);
    const voice = words ? await speak(words, join(cacheDir, "voice")) : null;
    const steps = [{ wait: 500 }];
    let marked = 0;
    for (const b of blocks) {
      const shapes = b.type === "picture" ? cleanShapes(overlays[b.id]) : [];
      if (!shapes.length) continue;
      steps.push({ overlay: `#tool-my-class [data-file="picture/${b.id}"] img`, shapes, after: 1100 });
      marked++;
    }
    const heard = voice ? voice.seconds + 0.6 : QUIET;
    steps.push({ wait: Math.max(300, Math.round(heard * 1000) - 500 - marked * 1100) });
    if (i < screens.length - 1) steps.push({ tap: "#tool-my-class .mc-next", after: 150 });
    shots.push({
      title: spec.title || "Our class page", line: spec.className ?? "", icon: "/img/pic/school.svg",
      joined: i > 0, fit: "recording", voice, voiceAt: 0.5, say: "",
      shot: {
        path: "/",
        prep: `${seed}
          for (let n = 0; n < ${i}; n++) { $("#tool-my-class .mc-next").click(); await pause(700); }`,
        // every picture in its place (not the quiet frame it waits in) and drawn
        expect: `!!document.querySelector("#tool-my-class .mc-screen")?.childElementCount
          && !document.querySelector("#tool-my-class .mc-block.is-waiting")
          && [...document.querySelectorAll("#tool-my-class .mc-screen img")].every((img) => img.complete && img.naturalWidth > 0)`,
        steps,
        tail: 60,
      },
    });
  }
  return {
    helpers: HELPERS,
    music: spec.music !== false,
    intro: { title: spec.title || "Our class page", line: spec.className ?? "", logo: "/img/pic/school.svg", say: spec.readAloud === false ? "" : spec.title },
    chapters: [{ shots }],
    end: { title: "All done", line: spec.className ?? "", logo: "/img/pic/reader-tick.svg" },
  };
}

// ---------- the job ----------

export async function renderPageVideo(args, { renderBoard, outDir, cacheDir }) {
  const local = args[0] === "--local";
  let code;
  let videoId;
  let spec;
  let updateTime;
  const files = new Map(); // "/page-media/<kind>/<id>" → [type, bytes]
  if (local) {
    spec = JSON.parse(readFileSync(args[1], "utf8"));
    code = spec.classCode ??= "K7M3RQP9T";
    videoId = "local";
  } else {
    [code, videoId] = args;
    if (!/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{9}$/.test(code ?? "") || !/^[A-Za-z0-9_-]{1,40}$/.test(videoId ?? "")) {
      throw new Error("usage: page <classCode> <videoId>");
    }
    const read = await readVideo(code, videoId);
    if (read.data.status !== "rendering" || read.data.kind !== "page") {
      console.log(`video ${code}/${videoId} is ${read.data.status} (${read.data.kind}): nothing to do`);
      return;
    }
    spec = { ...read.data, classCode: code };
    updateTime = read.updateTime;
  }

  try {
    const media = [];
    for (const screen of parseClassMarkdown(spec.markdown ?? "").screens) {
      for (const b of screen) if (b.type === "picture" || b.type === "video") media.push([b.type, b.id]);
    }
    for (const [kind, id] of media) {
      const bytes = local
        ? (spec.pictureFiles?.[id] ? readFileSync(resolve(dirname(args[1]), spec.pictureFiles[id])) : null)
        : await classFile(code, kind, id);
      if (bytes) files.set(`/page-media/${kind}/${id}`, [kind === "video" ? "video/mp4" : "image/jpeg", bytes]);
    }
    // a file no longer on the shelf is left out, as a learner's device leaves
    // it out ("gone"); here there is no server to tell gone from offline
    const missing = media.filter(([k, id]) => !files.has(`/page-media/${k}/${id}`));
    if (missing.length) {
      const gone = new Set(missing.map(([k, id]) => `${k === "video" ? "videos" : "pictures"}/${id}.${k === "video" ? "mp4" : "jpg"}`));
      spec.markdown = spec.markdown.split("\n")
        .filter((line) => !/^\s*!\[[^\]]*\]\(([^)\s]+)[^)]*\)\s*$/.test(line) || !gone.has(/\(([^)\s]+)/.exec(line)[1]))
        .join("\n");
    }
    const board = await pageBoard(spec, { cacheDir, mediaIds: media.filter(([k, id]) => files.has(`/page-media/${k}/${id}`)) });
    const { mp4 } = await renderBoard(board, { name: `page-${videoId}`, outDir, extraFiles: files });
    if (local) return;

    const size = readFileSync(mp4).length;
    await upload(mp4, "video/mp4", `classes/${code}/video-drafts/${videoId}.mp4`, { bucket: CLASS_BUCKET, cacheControl: "private, max-age=0" });
    // read again: makeVideo saves the run's name after starting it, so the doc
    // may have changed since it was first read — only its status matters
    const now = await readVideo(code, videoId);
    if (now.data.status !== "rendering") {
      console.log(`not marked ready: the video is ${now.data.status} now`); // given up on meanwhile: the draft is not used
      return;
    }
    const done = await updateVideo(code, videoId, now.updateTime, { status: "ready", bytes: size, updatedAt: new Date().toISOString() });
    console.log(done.ok ? `ready: ${code}/${videoId} (${size} bytes)` : `not marked ready (${done.status}): the video changed meanwhile`);
  } catch (err) {
    console.error(`page video ${code}/${videoId} failed: ${err.stack ?? err}`);
    if (!local && updateTime) {
      const why = String(err.message ?? err).slice(0, 300);
      await readVideo(code, videoId)
        .then((now) => now.data.status === "rendering" && updateVideo(code, videoId, now.updateTime, { renderError: why, updatedAt: new Date().toISOString() }))
        .catch(() => {});
    }
    process.exitCode = 1;
  }
}
