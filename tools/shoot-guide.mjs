// Regenerate a guide screenshot from the running app.
//
//   node tools/shoot-guide.mjs speak
//
// The guide's pictures are the one part of the docs that cannot be checked by
// reading the code, so they quietly go stale — public/img/guide/screen-speak.png
// still showed a "Cancel" button for a while after the button was gone. Driving
// the real app means a regenerated shot cannot disagree with the shipped markup.
//
// Serves public/ itself and talks to Chrome over the DevTools Protocol, so
// there is nothing to install: Node 22 (built-in WebSocket) and Chrome.
//
// To add a scene: give it the viewport the guide's <img> declares and a setup
// expression that leaves the app in the state to capture.

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createReadStream, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "public");
const CHROME =
  process.env.CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const SCENES = {
  // 375x812 at 2x is the 750x1624 the guide's <img> declares.
  speak: {
    out: "img/guide/screen-speak.png",
    width: 375,
    height: 812,
    // Open it the way a user does: openSpeak() focuses the field itself, which
    // is what puts the ring on the box in the captured image.
    setup: `
      document.getElementById('speak-money').click();
      const i = document.getElementById('speak-input');
      i.value = 'ten dollars fifty';
      i.dispatchEvent(new Event('input', { bubbles: true }));
    `,
    // Cheap guard against capturing a page that silently failed to set up.
    expect: `document.getElementById('speak-heard').textContent.trim() === 'That is $10.50'`,
  },
};

const name = process.argv[2];
const scene = SCENES[name];
if (!scene) {
  console.error(`usage: node tools/shoot-guide.mjs <${Object.keys(SCENES).join("|")}>`);
  process.exit(1);
}

const TYPES = {
  ".html": "text/html", ".css": "text/css", ".js": "text/javascript",
  ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json",
  ".webmanifest": "application/manifest+json",
};

const server = createServer(async (req, res) => {
  // normalize() keeps a ".." in the URL from escaping public/
  let path = join(ROOT, normalize(decodeURI(req.url.split("?")[0])));
  if (!path.startsWith(ROOT)) return res.writeHead(403).end();
  if (await stat(path).then((s) => s.isDirectory(), () => false)) path = join(path, "index.html");
  createReadStream(path)
    .on("error", () => res.writeHead(404).end())
    .on("open", () => res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" }))
    .pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/`;

// A throwaway profile means no service worker from an earlier run can serve us
// stale HTML or CSS — the exact trap this script exists to avoid.
const profile = mkdtempSync(join(tmpdir(), "shoot-guide-"));
const chrome = spawn(CHROME, [
  "--headless=new",
  "--remote-debugging-port=0",
  `--user-data-dir=${profile}`,
  "--no-first-run",
  "--no-default-browser-check",
  "--hide-scrollbars",
  "--force-color-profile=srgb",
  "--disable-lcd-text", // grayscale AA, matching the other guide shots
  "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Chrome writes the port it actually chose here once it is listening.
let port;
for (let i = 0; i < 100 && !port; i++) {
  try {
    port = readFileSync(join(profile, "DevToolsActivePort"), "utf8").split("\n")[0];
  } catch { await sleep(100); }
}
if (!port) throw new Error("Chrome never reported a debugging port");

const targets = await (async () => {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (r.ok) return await r.json();
    } catch { /* not up yet */ }
    await sleep(100);
  }
  throw new Error("Chrome never exposed a debuggable page");
})();

const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.addEventListener("open", res, { once: true });
  ws.addEventListener("error", rej, { once: true });
});

let nextId = 0;
const pending = new Map();
const seen = new Set();
ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id == null) return void seen.add(msg.method);
  const { resolve, reject } = pending.get(msg.id) ?? {};
  pending.delete(msg.id);
  msg.error ? reject?.(new Error(JSON.stringify(msg.error))) : resolve?.(msg.result);
});
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

async function evaluate(expression) {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? "eval failed");
  return r.result.value;
}

await send("Page.enable");
await send("Runtime.enable");
// Without this the page renders unfocused, so :focus never matches and the
// money box loses the ring a real user sees while the keyboard is up.
await send("Emulation.setFocusEmulationEnabled", { enabled: true });
await send("Emulation.setDeviceMetricsOverride", {
  width: scene.width,
  height: scene.height,
  deviceScaleFactor: 2,
  mobile: true,
});

await send("Page.navigate", { url });
for (let i = 0; i < 100 && !seen.has("Page.loadEventFired"); i++) await sleep(100);

await evaluate(`(() => { ${scene.setup} })()`);
await evaluate(`document.fonts.ready.then(() => true)`);
await sleep(500); // let emoji/webfont paint settle

if (scene.expect && !(await evaluate(scene.expect))) {
  throw new Error(`scene "${name}" did not reach its expected state; nothing written`);
}

const { data } = await send("Page.captureScreenshot", { format: "png" });
const out = join(ROOT, scene.out);
writeFileSync(out, Buffer.from(data, "base64"));
console.log(`wrote ${scene.out} (${scene.width * 2}x${scene.height * 2})`);
console.log("remember to bump CACHE in public/sw.js before pushing");

ws.close();
chrome.kill();
server.close();
