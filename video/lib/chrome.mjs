// Headless Chrome over the DevTools Protocol, and a static server for public/,
// with nothing to install: Node 22 (built-in WebSocket) and a Chrome binary.
// The same pattern as tools/shoot-guide.mjs, made reusable for the video
// renderer, which opens several pages (the app, the stage) in one run.

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createReadStream, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MAC_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export const CHROME = process.env.CHROME
  ?? [MAC_CHROME, "/usr/bin/chromium", "/usr/bin/google-chrome"].find((p) => existsSync(p))
  ?? MAC_CHROME;

const TYPES = {
  ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript",
  ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".json": "application/json",
  ".mp3": "audio/mpeg", ".webmanifest": "application/manifest+json",
};

// Serves each mount ("/" → public/, "/stage/" → video/stage/) from its folder.
// `extra(req, res)` may answer a request first (the stage's frames).
export async function serve(mounts, extra) {
  const entries = Object.entries(mounts).sort((a, b) => b[0].length - a[0].length);
  const server = createServer(async (req, res) => {
    if (extra && (await extra(req, res))) return;
    const url = decodeURI(req.url.split("?")[0]);
    const [prefix, root] = entries.find(([p]) => url.startsWith(p)) ?? [];
    if (!root) return res.writeHead(404).end();
    // normalize() keeps a ".." in the URL from escaping the folder
    let path = join(root, normalize(url.slice(prefix.length - 1)));
    if (!path.startsWith(root)) return res.writeHead(403).end();
    if (await stat(path).then((s) => s.isDirectory(), () => false)) path = join(path, "index.html");
    // the app's clean URLs: /guide/wait → guide/wait.html
    if (!extname(path) && existsSync(`${path}.html`)) path = `${path}.html`;
    createReadStream(path)
      .on("error", () => res.writeHead(404).end())
      .on("open", () => res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" }))
      .pipe(res);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

// One Chrome, throwaway profile (no service worker from an earlier run).
export async function launch() {
  const profile = mkdtempSync(join(tmpdir(), "simplify-video-"));
  const args = [
    "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--hide-scrollbars",
    "--force-color-profile=srgb", "--disable-lcd-text", "--mute-audio",
    // the stage paints on request; nothing may be throttled while it waits
    "--disable-background-timer-throttling", "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
  ];
  if (process.getuid?.() === 0) args.push("--no-sandbox"); // the Cloud Run container runs as root
  const proc = spawn(CHROME, [...args, "about:blank"], { stdio: "ignore" });
  let port;
  for (let i = 0; i < 150 && !port; i++) {
    try { port = readFileSync(join(profile, "DevToolsActivePort"), "utf8").split("\n")[0]; } catch { await sleep(100); }
  }
  if (!port) throw new Error(`Chrome (${CHROME}) never reported a debugging port`);
  const base = `http://127.0.0.1:${port}`;
  return {
    // a new tab, with its own DevTools connection
    async page() {
      const r = await fetch(`${base}/json/new?about:blank`, { method: "PUT" });
      const target = await r.json();
      return connect(target.webSocketDebuggerUrl);
    },
    close() {
      proc.kill();
      try { rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome may still hold it */ }
    },
  };
}

async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    ws.addEventListener("open", res, { once: true });
    ws.addEventListener("error", rej, { once: true });
  });
  let nextId = 0;
  const pending = new Map();
  const listeners = new Map();
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id == null) {
      for (const fn of listeners.get(msg.method) ?? []) fn(msg.params);
      return;
    }
    const { resolve, reject } = pending.get(msg.id) ?? {};
    pending.delete(msg.id);
    msg.error ? reject?.(new Error(`${JSON.stringify(msg.error)}`)) : resolve?.(msg.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const on = (method, fn) => {
    if (!listeners.has(method)) listeners.set(method, new Set());
    listeners.get(method).add(fn);
    return () => listeners.get(method).delete(fn);
  };
  // userGesture: a step stands in for someone tapping, as in the smoke tests
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text ?? "eval failed");
    return r.result.value;
  };
  const once = (method, ms = 15_000) => new Promise((resolve, reject) => {
    const t = setTimeout(() => { off(); reject(new Error(`timed out waiting for ${method}`)); }, ms);
    const off = on(method, (p) => { clearTimeout(t); off(); resolve(p); });
  });
  await send("Page.enable");
  await send("Runtime.enable");
  return {
    send, on, once, evaluate,
    async goto(url) {
      const loaded = once("Page.loadEventFired", 30_000);
      await send("Page.navigate", { url });
      await loaded;
    },
    // true once `expression` is, polled like the smoke tests' expect
    async until(expression, ms = 8000) {
      for (const end = Date.now() + ms; Date.now() < end;) {
        if (await evaluate(expression)) return;
        await sleep(100);
      }
      throw new Error(`never true: ${expression.slice(0, 120)}`);
    },
    close: () => ws.close(),
  };
}
