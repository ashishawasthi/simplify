// Makes a video from a storyboard: the real app, filmed as it is used,
// inside a phone on a branded stage, with a caption and a spoken line for each
// shot and quiet music underneath. The guide videos, and the page videos
// coaches make (video/page.mjs), come from here.
//
//   node video/render.mjs learner-basics            → video/out/learner-basics.mp4 (+ .jpg poster)
//   node video/render.mjs learner-basics --upload   (also to the public guide-videos bucket)
//   node video/render.mjs all --upload
//   node video/render.mjs page <classCode> <videoId>   a coach's page video (the Cloud Run job's other use)
//   node video/render.mjs page --local <spec.json>     the same from a file, to try a page out
//
// Needs Node 22, Chrome (CHROME=<path> for another) and ffmpeg; the voice is
// Google Text-to-Speech, signed in with gcloud locally or the job's own
// account on Cloud Run. Nothing to npm install. See docs/operations/guide-videos.md.

import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { launch, serve, sleep } from "./lib/chrome.mjs";
import { recordShot } from "./lib/record.mjs";
import { speak } from "./lib/voice.mjs";
import { music } from "./lib/music.mjs";
import { upload } from "./lib/upload.mjs";
import { renderPageVideo } from "./page.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(HERE, "..");
const OUT = process.env.VIDEO_OUT ?? join(HERE, "out");
const CACHE = process.env.VIDEO_CACHE ?? join(HERE, ".cache");
const FPS = 30;
export const BOARDS = ["learner-basics", "learner-more", "coach"];

// how long each kind of segment lasts at least, and the gaps around the voice
const MIN_SHOT = 1.8;
const LEAD = 0.4; // the swipe in, before the recording plays
const TAIL = 0.45; // the result stays a moment before the next swipe
const MAX_SPEED = 2.8; // a long recording plays up to this much faster

// board → { mp4, jpg, duration }. `name` names the files; `extraFiles` serves
// more files to the app while filming (a page's pictures), path → [type, bytes].
export async function renderBoard(board, { name, outDir = OUT, extraFiles = new Map() }) {
  const t0 = Date.now();
  const frames = new Map(); // /frames/<n>.jpg → JPEG
  const { server, origin } = await serve(
    { "/": join(ROOT, "public") + "/", "/stage/": join(HERE, "stage") + "/" },
    (req, res) => {
      const url = req.url.split("?")[0];
      if (url === "/video-blank.html") return res.writeHead(200, { "content-type": "text/html" }).end("<!doctype html><title>blank</title>"), true;
      if (extraFiles.has(url)) {
        const [type, bytes] = extraFiles.get(url);
        return res.writeHead(200, { "content-type": type }).end(bytes), true;
      }
      if (url.startsWith("/frames/")) {
        const jpg = frames.get(url);
        if (!jpg) return res.writeHead(404).end(), true;
        return res.writeHead(200, { "content-type": "image/jpeg", "cache-control": "max-age=3600" }).end(jpg), true;
      }
      return false;
    },
  );
  const chrome = await launch();
  try {
    // 1. film every shot in the real app
    const app = await chrome.page();
    await board.before?.(app, origin);
    const segments = [];
    let n = 0;
    const add = (seg) => segments.push(seg);
    if (board.intro) add({ kind: "intro", ...board.intro, say: board.intro.say });
    // VIDEO_SHOTS=3: only the first three shots, for a quick look while editing a board
    let left = Number(process.env.VIDEO_SHOTS) || Infinity;
    for (const chapter of board.chapters) {
      if (left <= 0) break;
      if (chapter.title) add({ kind: "chapter", title: chapter.title, line: chapter.line, icon: chapter.icon, color: chapter.color, say: chapter.say ?? chapter.title });
      for (const shot of chapter.shots) {
        if (left-- <= 0) break;
        process.stdout.write(`  filming ${shot.title} … `);
        const rec = await recordShot(app, origin, shot.shot, board.helpers ?? "");
        const srcs = rec.frames.map((f) => {
          const url = `/frames/${n++}.jpg`;
          frames.set(url, f.data);
          return { t: f.t, src: url };
        });
        console.log(`${rec.frames.length} frames, ${rec.duration.toFixed(1)} s`);
        add({ kind: "shot", title: shot.title, line: shot.line, icon: shot.icon, say: shot.say ?? shot.line,
          joined: !!shot.joined, fit: shot.fit, voiceAt: shot.voiceAt, voice: shot.voice,
          screen: { w: rec.width, h: rec.height }, frames: srcs, events: rec.events, recDuration: rec.duration });
      }
    }
    if (board.end) add({ kind: "end", ...board.end, say: board.end.say });
    app.close();

    // 2. the voice, one line per segment; it sets how long each lasts
    for (const s of segments) {
      if (s.say && !s.voice) s.voice = await speak(s.say, join(CACHE, "voice"));
    }
    let t = 0;
    for (const s of segments) {
      const voice = s.voice?.seconds ?? 0;
      if (s.kind === "shot" && s.fit === "recording") {
        // filmed at its own pace, the voice already fitted in (a page read aloud)
        s.dur = s.recDuration;
        s.rec = { lead: 0, duration: s.recDuration, speed: 1 };
        s.voiceAt ??= 0.3;
      } else if (s.kind === "shot") {
        const byVoice = 0.25 + voice + 0.3;
        const byRec = LEAD + s.recDuration / MAX_SPEED + TAIL;
        s.dur = Math.max(MIN_SHOT, byVoice, byRec);
        s.rec = { lead: LEAD, duration: s.recDuration, speed: Math.max(1, s.recDuration / (s.dur - LEAD - TAIL)) };
        s.voiceAt = 0.25;
      } else {
        s.dur = Math.max(s.kind === "chapter" ? 1.1 : 2.4, voice + (s.kind === "chapter" ? 0.45 : 0.8));
        s.voiceAt = s.kind === "chapter" ? 0.15 : 0.35;
      }
      s.start = t;
      t += s.dur;
    }
    const duration = t;

    // 3. the sound: voice lines on a track of their own, music ducked under them
    mkdirSync(outDir, { recursive: true });
    const work = join(CACHE, "work", name);
    mkdirSync(work, { recursive: true });
    writeFileSync(join(work, "voice.wav"), voiceTrack(segments, duration));
    writeFileSync(join(work, "music.wav"), music(duration, { seed: name.length, volume: board.music === false ? 0 : 1 }));

    // 4. the pictures: the stage, frame by frame, straight into ffmpeg
    const stage = await chrome.page();
    await stage.send("Emulation.setDeviceMetricsOverride", { width: 720, height: 1280, deviceScaleFactor: 1, mobile: false });
    await stage.goto(`${origin}/stage/index.html`);
    await stage.until(`typeof window.loadTimeline === "function"`);
    const timeline = { duration, segments: segments.map(({ voice, say, recDuration, ...s }) => s) };
    await stage.evaluate(`loadTimeline(${JSON.stringify(timeline)})`);

    const mp4 = join(outDir, `${name}.mp4`);
    const ff = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y",
      "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "pipe:0",
      "-i", join(work, "music.wav"), "-i", join(work, "voice.wav"),
      "-filter_complex",
      "[1:a]volume=0.5[m];[2:a]aresample=44100,pan=stereo|c0=c0|c1=c0,asplit[v1][v2];" +
      "[m][v1]sidechaincompress=threshold=0.02:ratio=8:attack=15:release=450[duck];" +
      "[duck][v2]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.9[a]",
      "-map", "0:v", "-map", "[a]",
      "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-pix_fmt", "yuv420p", "-r", String(FPS),
      "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "-shortest", mp4,
    ], { stdio: ["pipe", "inherit", "inherit"] });
    const total = Math.round(duration * FPS);
    let poster = null;
    const first = segments.find((s) => s.kind === "shot");
    const posterFrame = Math.min(total - 1, Math.round(((first?.start ?? 0) + Math.min(1.4, (first?.dur ?? 2) / 2)) * FPS));
    for (let f = 0; f < total; f++) {
      await stage.evaluate(`renderAt(${f / FPS})`);
      const { data } = await stage.send("Page.captureScreenshot", { format: "jpeg", quality: 92, optimizeForSpeed: true });
      const jpg = Buffer.from(data, "base64");
      if (f === posterFrame) poster = jpg;
      if (!ff.stdin.write(jpg)) await new Promise((r) => ff.stdin.once("drain", r));
      if (f % (FPS * 5) === 0) process.stdout.write(`\r  drawing ${Math.round((100 * f) / total)}%`);
    }
    ff.stdin.end();
    const code = await new Promise((r) => ff.on("close", r));
    if (code !== 0) throw new Error(`ffmpeg exited ${code}`);
    const jpgPath = join(outDir, `${name}.jpg`);
    writeFileSync(jpgPath, poster);
    stage.close();
    console.log(`\r  wrote ${mp4} — ${duration.toFixed(1)} s, ${(readFileSync(mp4).length / 1e6).toFixed(1)} MB, in ${Math.round((Date.now() - t0) / 1000)} s`);
    return { mp4, jpg: jpgPath, duration };
  } finally {
    chrome.close();
    server.close();
  }
}

// every segment's line, placed at its moment, on one 24 kHz mono track
function voiceTrack(segments, duration) {
  const RATE = 24000;
  const out = new Int16Array(Math.ceil(duration * RATE));
  for (const s of segments) {
    if (!s.voice) continue;
    const wav = readFileSync(s.voice.file);
    const data = wav.indexOf("data", 12) + 8;
    const at = Math.round((s.start + s.voiceAt) * RATE);
    for (let i = 0; data + i * 2 + 1 < wav.length && at + i < out.length; i++) {
      out[at + i] = Math.max(-32768, Math.min(32767, out[at + i] + wav.readInt16LE(data + i * 2)));
    }
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + out.length * 2, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(out.length * 2, 40);
  return Buffer.concat([header, Buffer.from(out.buffer)]);
}

// ---------- the command line (and the Cloud Run job's arguments) ----------

async function guideVideo(name, { uploadIt }) {
  const board = (await import(`./storyboards/${name}.mjs`)).default;
  const { mp4, jpg } = await renderBoard(board, { name });
  if (uploadIt) {
    for (const [file, type] of [[mp4, "video/mp4"], [jpg, "image/jpeg"]]) console.log(`  uploaded ${await upload(file, type)}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const which = args.find((a) => !a.startsWith("--"));
  if (which === "page") {
    await renderPageVideo(args.slice(1), { renderBoard, outDir: OUT, cacheDir: CACHE });
  } else if (!which || (which !== "all" && !BOARDS.includes(which))) {
    console.error(`usage: node video/render.mjs <${BOARDS.join("|")}|all> [--upload]\n       node video/render.mjs page <classCode> <videoId> | page --local <spec.json>`);
    process.exit(1);
  } else {
    for (const name of which === "all" ? BOARDS : [which]) {
      console.log(`${name}:`);
      await guideVideo(name, { uploadIt: args.includes("--upload") });
    }
  }
  await sleep(10);
}
