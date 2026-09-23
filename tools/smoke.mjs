// Smoke tests: the real app in real Chrome, one short scene at a time.
//
//   node tools/smoke.mjs               every scene file in tools/smoke/
//   node tools/smoke.mjs wait i-need   only tools/smoke/wait.mjs and i-need.mjs
//
// A scene file's default export is an array of scenes:
//   { name, path, viewport?, media?, init?, stubs?, setup?, expect }
//     path      where the app opens: "/" is the menu, "/#wait?m=2" a tool
//     viewport  { width, height } — a 375 × 812 phone unless it says otherwise
//     media     CSS media features to emulate, e.g.
//               [{ name: "prefers-reduced-motion", value: "reduce" }]
//     init      JS run before the page's own scripts, on every load of the
//               scene's page: seed localStorage, stand in for speechSynthesis
//     stubs     { "/js/tools/wait.js": "source" }: served in place of those
//               files, for this scene only — a stand-in tool that writes down
//               what the shell does to it
//     setup     JS run once the page has loaded; it may await
//     expect    a JS expression, polled until it is true (5 s at most)
//
// Every scene gets a fresh page in a browser context of its own, so storage
// starts empty, and fails on any console error, uncaught exception or failed
// request — a 404, or an inline style the site's Content-Security-Policy
// blocks: pages are served with the headers firebase.json gives them.
//
// There is no service worker in a smoke run (the prelude below removes it),
// so every load comes straight from public/ and an edit is always what runs.
// SMOKE_ROOT=<folder> serves another folder instead of public/.
//
// Like tools/shoot-guide.mjs there is nothing to install — Node 22 (built-in
// WebSocket) and Chrome (CHROME=<path> to use another). Each run has its own
// server port, Chrome profile and DevTools port, so runs can go in parallel.

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createReadStream, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(process.env.SMOKE_ROOT ?? join(HERE, "..", "public"));
const SCENE_DIR = join(HERE, "smoke");
const CHROME =
  process.env.CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const JOBS = 4; // scenes running at once, each in its own browser context
const EXPECT_MS = 5000;
const SCENE_MS = 30000; // a scene that hangs longer than this has failed

// Before any of the page's own scripts: no service worker (update.js sees a
// browser without one). A scene's init may put a stand-in back.
const PRELUDE = "delete Navigator.prototype.serviceWorker;\n";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- which scenes ----------

const available = readdirSync(SCENE_DIR).filter((f) => f.endsWith(".mjs")).map((f) => f.slice(0, -4)).sort();
const asked = process.argv.slice(2).map((a) => a.replace(/^.*[\\/]/, "").replace(/\.mjs$/, ""));
for (const file of asked) {
  if (!available.includes(file)) {
    console.error(`no scene file tools/smoke/${file}.mjs (there are: ${available.join(", ")})`);
    process.exit(1);
  }
}
const scenes = [];
for (const file of asked.length ? asked : available) {
  const { default: list } = await import(pathToFileURL(join(SCENE_DIR, `${file}.mjs`)).href);
  if (!Array.isArray(list)) throw new Error(`tools/smoke/${file}.mjs must export an array of scenes`);
  for (const scene of list) {
    if (!scene.name || !scene.path || !scene.expect) {
      throw new Error(`tools/smoke/${file}.mjs: every scene needs name, path and expect`);
    }
    scenes.push({ ...scene, label: `${file} › ${scene.name}` });
  }
}

// ---------- the server: public/, as Hosting serves it ----------

const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript",
  ".mjs": "text/javascript", ".png": "image/png", ".svg": "image/svg+xml",
  ".json": "application/json", ".webmanifest": "application/manifest+json",
  ".txt": "text/plain; charset=utf-8",
};

// the headers firebase.json gives every response: CSP, nosniff, Permissions-Policy …
const firebase = JSON.parse(readFileSync(join(HERE, "..", "firebase.json"), "utf8"));
const SITE_HEADERS = Object.fromEntries(
  (firebase.hosting.headers.find((rule) => rule.source === "**")?.headers ?? [])
    .map(({ key, value }) => [key, value]),
);

async function fileFor(urlPath) {
  let wanted;
  try {
    wanted = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  // normalize() keeps a ".." in the URL from escaping the root
  const path = join(ROOT, normalize(wanted));
  if (path !== ROOT && !path.startsWith(ROOT + sep)) return null;
  const found = await stat(path).catch(() => null);
  if (found?.isDirectory()) return join(path, "index.html");
  if (found?.isFile()) return path;
  // Hosting's cleanUrls: /guide/speak is guide/speak.html
  if (await stat(`${path}.html`).then((s) => s.isFile(), () => false)) return `${path}.html`;
  return null;
}

const server = createServer(async (req, res) => {
  const path = await fileFor(new URL(req.url, "http://localhost").pathname);
  const headers = { ...SITE_HEADERS, "cache-control": "no-store" };
  if (!path) return res.writeHead(404, { ...headers, "content-type": "text/plain" }).end("not found");
  createReadStream(path)
    .on("error", () => res.writeHead(404, headers).end())
    .on("open", () => res.writeHead(200, { ...headers, "content-type": TYPES[extname(path)] ?? "application/octet-stream" }))
    .pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/`;

// ---------- Chrome, over the DevTools Protocol ----------

// A throwaway profile, and port 0 so Chrome picks a free DevTools port and
// writes it into the profile — several runs never collide.
const profile = mkdtempSync(join(tmpdir(), "simplify-smoke-"));
const chrome = spawn(CHROME, [
  "--headless=new",
  "--remote-debugging-port=0",
  `--user-data-dir=${profile}`,
  "--no-first-run",
  "--no-default-browser-check",
  "--hide-scrollbars",
  "--mute-audio",
  // several scenes run at once: none may be slowed down as a background tab
  "--disable-background-timer-throttling",
  "--disable-renderer-backgrounding",
  "--disable-backgrounding-occluded-windows",
  "about:blank",
], { stdio: "ignore" });

let ws;
async function shutdown(code) {
  try { ws?.close(); } catch { /* already closed */ }
  server.close();
  if (chrome.pid && chrome.exitCode === null) {
    const exited = new Promise((r) => chrome.once("exit", r));
    chrome.kill();
    await Promise.race([exited, sleep(3000)]);
  }
  rmSync(profile, { recursive: true, force: true });
  process.exit(code);
}
chrome.on("error", (err) => {
  console.error(`smoke: could not start Chrome at ${CHROME} (${err.message}) — set CHROME=<path to Chrome>`);
  shutdown(1);
});
setTimeout(() => {
  console.error("\nsmoke: still running after 10 minutes — giving up");
  shutdown(1);
}, 10 * 60 * 1000).unref();

let devtools;
for (let i = 0; i < 100 && !devtools; i++) {
  try {
    const [port, path] = readFileSync(join(profile, "DevToolsActivePort"), "utf8").split("\n");
    if (port && path) devtools = `ws://127.0.0.1:${port}${path}`;
  } catch { /* not written yet */ }
  if (!devtools) await sleep(100);
}
if (!devtools) {
  console.error(`smoke: Chrome never reported a DevTools port (is it at ${CHROME}?)`);
  await shutdown(1);
}

ws = new WebSocket(devtools);
await new Promise((res, rej) => {
  ws.addEventListener("open", res, { once: true });
  ws.addEventListener("error", rej, { once: true });
});

let nextId = 0;
const replies = new Map(); // command id → { resolve, reject, method }
const listeners = new Map(); // session id → fn(event)
ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id == null) return void listeners.get(msg.sessionId)?.(msg);
  const reply = replies.get(msg.id);
  replies.delete(msg.id);
  if (msg.error) reply?.reject(new Error(`${reply.method}: ${msg.error.message}`));
  else reply?.resolve(msg.result);
});

// one command; with a session id it goes to that page, without to the browser
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = ++nextId;
    replies.set(id, { resolve, reject, method });
    ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
  });

// ---------- one scene ----------

const firstLines = (text, n = 3) => String(text ?? "").split("\n").slice(0, n).join(" / ");
const exceptionText = (d) => firstLines(d.exception?.description ?? d.exception?.value ?? d.text);
const argText = (a) => firstLines(a.value !== undefined ? a.value : a.description ?? a.type, 2);

// userGesture: a scene's setup stands in for someone tapping, so it runs as a
// user's action — otherwise what only a tap may do (vibrate, speak, keep the
// screen awake) is blocked, and Chrome logs it as an error.
async function evaluate(page, expression, { userGesture = false } = {}) {
  const r = await page("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture });
  if (r.exceptionDetails) throw new Error(exceptionText(r.exceptionDetails));
  return r.result.value;
}

// polls until fn() is true; false at the deadline. An error (the page is
// mid-reload, an element isn't there yet) counts as "not yet".
async function until(fn, ms) {
  const deadline = Date.now() + ms;
  let last = null;
  for (;;) {
    try {
      if (await fn()) return { ok: true };
      last = null;
    } catch (err) {
      last = err.message;
    }
    if (Date.now() > deadline) return { ok: false, last };
    await sleep(50);
  }
}

async function runScene(scene) {
  const problems = []; // everything that went wrong, in order
  const { browserContextId } = await send("Target.createBrowserContext");
  const { targetId } = await send("Target.createTarget", { url: "about:blank", browserContextId });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const page = (method, params) => send(method, params, sessionId);

  listeners.set(sessionId, ({ method, params }) => {
    if (method === "Runtime.exceptionThrown") {
      problems.push(`uncaught: ${exceptionText(params.exceptionDetails)}`);
    } else if (method === "Runtime.consoleAPICalled" && (params.type === "error" || params.type === "assert")) {
      problems.push(`console.${params.type}: ${params.args.map(argText).join(" ")}`);
    } else if (method === "Log.entryAdded" && params.entry.level === "error") {
      const { source, text, url } = params.entry;
      problems.push(`${source}: ${text}${url ? ` (${url.replace(base, "/")})` : ""}`);
    } else if (method === "Inspector.targetCrashed") {
      problems.push("the page crashed");
    } else if (method === "Fetch.requestPaused") {
      // only the stubs' own URLs are paused (Fetch.enable below)
      const path = new URL(params.request.url).pathname;
      page("Fetch.fulfillRequest", {
        requestId: params.requestId,
        responseCode: 200,
        responseHeaders: Object.entries({ ...SITE_HEADERS, "cache-control": "no-store",
          "content-type": TYPES[extname(path)] ?? "text/plain" }).map(([name, value]) => ({ name, value })),
        body: Buffer.from(scene.stubs[path] ?? "").toString("base64"),
      }).catch((err) => problems.push(`stub ${path}: ${err.message}`));
    }
  });

  try {
    await page("Page.enable");
    await page("Runtime.enable");
    await page("Log.enable");
    const { width = 375, height = 812 } = scene.viewport ?? {};
    await page("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: true });
    // as if the window had focus, so focus() and :focus behave as on a phone
    await page("Emulation.setFocusEmulationEnabled", { enabled: true });
    if (scene.media) await page("Emulation.setEmulatedMedia", { features: scene.media });
    if (scene.stubs) {
      await page("Fetch.enable", {
        patterns: Object.keys(scene.stubs).map((path) => ({ urlPattern: new URL(path, base).href })),
      });
    }
    await page("Page.addScriptToEvaluateOnNewDocument", { source: PRELUDE + (scene.init ?? "") });

    const url = new URL(scene.path, base).href;
    const nav = await page("Page.navigate", { url });
    if (nav.errorText) throw new Error(`could not open ${scene.path}: ${nav.errorText}`);
    const loaded = await until(
      () => evaluate(page, `location.origin === ${JSON.stringify(new URL(base).origin)} && document.readyState === "complete"`),
      10000,
    );
    if (!loaded.ok) throw new Error(`${scene.path} never finished loading`);

    if (scene.setup) await evaluate(page, `(async () => {\n${scene.setup}\n})()`, { userGesture: true });
    const passed = await until(() => evaluate(page, `(async () => Boolean(await (${scene.expect})))()`), EXPECT_MS);
    if (!passed.ok) {
      const where = await evaluate(page, "location.hash + ' — ' + document.title").catch(() => "?");
      problems.unshift(`never true (at ${where}): ${scene.expect.trim().replace(/\s+/g, " ")}` +
        (passed.last ? `\n        last error: ${passed.last}` : ""));
    }
    await sleep(100); // an error just after the expected state counts too
  } catch (err) {
    problems.unshift(err.message);
  } finally {
    listeners.delete(sessionId);
    await send("Target.closeTarget", { targetId }).catch(() => {});
    await send("Target.disposeBrowserContext", { browserContextId }).catch(() => {});
  }
  return problems;
}

function withDeadline(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((resolve) => {
      timer = setTimeout(() => resolve([`took longer than ${ms / 1000} s`]), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

// ---------- run them: a few at a time, reported in order ----------

const results = new Array(scenes.length);
let cursor = 0;
async function worker() {
  while (cursor < scenes.length) {
    const i = cursor++;
    results[i] = withDeadline(runScene(scenes[i]), SCENE_MS).catch((err) => [err.message]);
    await results[i];
  }
}
const workers = Array.from({ length: Math.min(JOBS, scenes.length) }, worker);

let failed = 0;
for (let i = 0; i < scenes.length; i++) {
  while (!results[i]) await sleep(20);
  const problems = await results[i];
  if (problems.length) failed++;
  console.log(`${problems.length ? "FAIL" : "ok  "}  ${scenes[i].label}`);
  for (const p of problems) console.log(`      ${p}`);
}
await Promise.all(workers);

console.log(failed ? `\n${failed} of ${scenes.length} failed` : `\nall ${scenes.length} passed`);
await shutdown(failed ? 1 : 0);
