// Brings the generated parts of public/ up to date after any change there:
//
//   - public/sw.js's ASSETS: every file the learner app keeps offline, each
//     with its revision (a short hash of its bytes). The service worker names
//     its cache after them, so a changed file is a new version by itself — no
//     CACHE to bump — and at install it fetches only the files whose revision
//     changed, copying the rest from the version already on the device.
//   - each app page's modulepreload list: every module its entry script
//     reaches by static import, so the browser asks for them all at once
//     instead of discovering them one import level at a time (eight levels
//     deep in the learner app: a round trip each on a slow first visit).
//
//   node tools/stamp.mjs           write them
//   node tools/stamp.mjs --check   change nothing: exit 1 if one is stale
//                                  (tools/test-assets.mjs runs this check)
//
// No dependencies. Pages are listed by their clean URLs, as Hosting serves
// them: public/index.html is "/", public/guide.html "/guide" and
// public/guide/speak.html "/guide/speak" (Hosting 301s the .html forms, and a
// cached redirect breaks offline navigation).

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const PUBLIC = join(fileURLToPath(new URL(".", import.meta.url)), "..", "public");
const SW_FILE = join(PUBLIC, "sw.js");

// Served, but no device needs a copy.
export const NOT_PRECACHED = {
  "/sw.js": "the service worker itself — the browser fetches it on its own",
  "/img/og-card.png": "the link-preview card, fetched only by WhatsApp and the like",
  "/img/qr-poster.png": "a poster to print, never shown in the app",
  "/img/pic/LICENSE.txt": "the pictures' licence, served beside them for anyone who looks — no screen shows it",
};

// The coach app (/coach/) is served from the same site but is not part of the
// learner app: the service worker never caches or serves it.
export const COACH = "coach";

// The pages whose entry module imports others, and so carry a modulepreload
// list. The guide pages' one small script imports nothing.
export const PRELOADED_PAGES = ["index.html", "coach/index.html"];

// A file's revision: the first 8 hex digits of the SHA-256 of its bytes.
// sw.js works it out the same way (crypto.subtle) for every copy it keeps.
export const revision = (bytes) => createHash("sha256").update(bytes).digest("hex").slice(0, 8);

const urlOf = (path) => `/${relative(PUBLIC, path).split(sep).join("/")}`;

// every file Hosting serves from public/ (firebase.json ignores dotfiles), as
// { url, path } — the coach app's files aside
export function servedFiles(dir = PUBLIC) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    if (dir === PUBLIC && entry.name === COACH) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...servedFiles(path));
      continue;
    }
    const url = urlOf(path);
    if (url === "/index.html") files.push({ url: "/", path });
    else if (url.endsWith(".html")) files.push({ url: url.slice(0, -".html".length), path });
    else files.push({ url, path });
  }
  return files;
}

// ---------- sw.js's ASSETS ----------

const SW_BEGIN = "// >>> every file the learner app keeps offline, and its revision: written by node tools/stamp.mjs — don't edit by hand";
const SW_END = "// <<< every file the learner app keeps offline";

export function precached() {
  return servedFiles()
    .filter((f) => !(f.url in NOT_PRECACHED))
    .map((f) => ({ url: f.url, rev: revision(readFileSync(f.path)) }))
    .sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0));
}

export function renderSw(src, entries = precached()) {
  const start = src.indexOf(SW_BEGIN);
  const end = src.indexOf(SW_END);
  if (start < 0 || end < start) throw new Error(`public/sw.js: no "${SW_BEGIN}" … "${SW_END}" block`);
  const rows = entries.map((e) => `  ${JSON.stringify(e.url)}: "${e.rev}",`);
  return `${src.slice(0, start)}${SW_BEGIN}\nconst ASSETS = {\n${rows.join("\n")}\n};\n${src.slice(end)}`;
}

// ---------- the modulepreload lists ----------

// The specifiers of a module's static imports and re-exports (`import … from
// "x"`, `import "x"`, `export … from "x"`), minified code included. import()
// is not followed: what a page loads later is not needed at start.
const IMPORT = /(?:^|[;}\s])(?:import|export)\s*(?:[\w$*{}\s,]*?\s*from\s*)?["']((?:\.{1,2})?\/[^"']+)["']/g;

function importsOf(file) {
  const src = readFileSync(file, "utf8").replace(/^\s*\/\/.*$/gm, "");
  return [...src.matchAll(IMPORT)].map((m) => m[1]);
}

// every module the entry reaches, as URLs, nearest first (the entry itself
// aside)
export function moduleGraph(entryUrl) {
  const seen = new Set([entryUrl]);
  const queue = [entryUrl];
  for (let i = 0; i < queue.length; i++) {
    const url = queue[i];
    const file = join(PUBLIC, url);
    for (const spec of importsOf(file)) {
      const target = spec.startsWith("/") ? spec : urlOf(resolve(dirname(file), spec));
      if (!existsSync(join(PUBLIC, target))) throw new Error(`${url} imports ${spec}, and there is no ${target}`);
      if (seen.has(target)) continue;
      seen.add(target);
      queue.push(target);
    }
  }
  return queue.slice(1);
}

const PRELOAD_BEGIN = "<!-- >>> every module the page's script imports, asked for at once: written by node tools/stamp.mjs — don't edit by hand -->";
const PRELOAD_END = "<!-- <<< every module the page's script imports -->";

export function renderPreloads(html, page) {
  const entry = html.match(/<script type="module" src="([^"]+)"><\/script>/)?.[1];
  if (!entry) throw new Error(`public/${page}: no <script type="module" src="…">`);
  const start = html.indexOf(PRELOAD_BEGIN);
  const end = html.indexOf(PRELOAD_END);
  if (start < 0 || end < start) throw new Error(`public/${page}: no "${PRELOAD_BEGIN}" … "${PRELOAD_END}" block`);
  const indent = html.slice(html.lastIndexOf("\n", start) + 1, start);
  const links = moduleGraph(entry).map((url) => `${indent}<link rel="modulepreload" href="${url}">`);
  return `${html.slice(0, start)}${PRELOAD_BEGIN}\n${links.join("\n")}\n${indent}${html.slice(end)}`;
}

// ---------- the run ----------

// [file, what it holds now, what it should hold] for every generated part.
// The pages come first: the sw.js revisions are of the pages as written.
export function stamps() {
  const out = [];
  for (const page of PRELOADED_PAGES) {
    const file = join(PUBLIC, page);
    const now = readFileSync(file, "utf8");
    out.push([file, now, renderPreloads(now, page)]);
  }
  return out;
}

function main() {
  const check = process.argv.includes("--check");
  let stale = 0;
  for (const [file, now, want] of stamps()) {
    if (now === want) continue;
    stale++;
    if (check) console.log(`${relative(PUBLIC, file)}'s modulepreload list is out of date`);
    else writeFileSync(file, want);
  }
  // after the pages are written, so their revisions are of what is there now
  const sw = readFileSync(SW_FILE, "utf8");
  const swWant = renderSw(sw);
  if (sw !== swWant) {
    stale++;
    if (check) console.log("public/sw.js's ASSETS is out of date");
    else writeFileSync(SW_FILE, swWant);
  }
  if (check) {
    console.log(stale ? "\nrun: node tools/stamp.mjs" : "sw.js and the modulepreload lists are up to date");
    process.exit(stale ? 1 : 0);
  }
  console.log(stale ? `stamped ${stale} file${stale === 1 ? "" : "s"}` : "nothing to stamp");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
