// Every file the app serves must be in ASSETS in public/sw.js, or it won't
// work offline — and every ASSETS entry must exist, or the service worker's
// install fails (sw.js refuses a 404 rather than caching it, so the old
// version stays on every device). No dependencies, no runner:
//
//   node tools/test-assets.mjs
//
// Pages are listed by their clean URLs, as Hosting serves them:
// public/index.html is "/", public/guide.html "/guide" and
// public/guide/speak.html "/guide/speak".

import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const PUBLIC = join(fileURLToPath(new URL(".", import.meta.url)), "..", "public");

// Served, but no device needs a copy: each must still exist, and must not be
// in ASSETS as well.
const NOT_PRECACHED = {
  "/sw.js": "the service worker itself — the browser fetches it on its own",
  "/img/og-card.png": "the link-preview card, fetched only by WhatsApp and the like",
  "/img/qr-poster.png": "a poster to print, never shown in the app",
  "/img/pic/LICENSE.txt": "the pictures' licence, served beside them for anyone who looks — no screen shows it",
};

// ASSETS as written in sw.js: the quoted strings of its array, comments aside
function readAssets() {
  const src = readFileSync(join(PUBLIC, "sw.js"), "utf8");
  const body = src.match(/const ASSETS = \[([\s\S]*?)\];/)?.[1];
  if (body == null) throw new Error("no `const ASSETS = [ … ];` in public/sw.js");
  return [...body.replace(/\/\/.*$/gm, "").matchAll(/"([^"]*)"|'([^']*)'/g)].map((m) => m[1] ?? m[2]);
}

// The coach app (/coach/) is served from the same site but is not part of the
// learner app: the service worker never caches or serves it, so none of its
// files belong in ASSETS (and none may be there).
const COACH = "coach";

// every file Hosting serves from public/ (firebase.json ignores dotfiles),
// by the URL it is served at — the coach app's files aside
function servedUrls(dir = PUBLIC) {
  const urls = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    if (dir === PUBLIC && entry.name === COACH) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      urls.push(...servedUrls(path));
      continue;
    }
    const url = `/${relative(PUBLIC, path).split(sep).join("/")}`;
    if (url === "/index.html") urls.push("/");
    else if (url.endsWith(".html")) urls.push(url.slice(0, -".html".length));
    else urls.push(url);
  }
  return urls;
}

const assets = readAssets();
const served = new Set(servedUrls());
const listed = new Set(assets);
const problems = [];

const twice = assets.filter((url, i) => assets.indexOf(url) !== i);
for (const url of new Set(twice)) problems.push(`listed twice in ASSETS: ${url}`);

for (const url of assets) {
  if (url === `/${COACH}` || url.startsWith(`/${COACH}/`)) problems.push(`the coach app is never precached: ${url}`);
  else if (url.endsWith(".html")) problems.push(`list the page by its clean URL, without .html: ${url}`);
  else if (!served.has(url)) problems.push(`in ASSETS, but there is no such file: ${url}`);
}

for (const url of [...served].sort()) {
  if (listed.has(url) || url in NOT_PRECACHED) continue;
  problems.push(`not in ASSETS in public/sw.js (so it won't work offline): ${url}`);
}

for (const url of Object.keys(NOT_PRECACHED)) {
  if (!served.has(url)) problems.push(`NOT_PRECACHED names a file that isn't there: ${url}`);
  if (listed.has(url)) problems.push(`both in ASSETS and in NOT_PRECACHED: ${url}`);
}

for (const p of problems) console.log(`FAIL  ${p}`);
console.log(problems.length
  ? `\n${problems.length} problem${problems.length === 1 ? "" : "s"} (${served.size} files served, ${assets.length} in ASSETS)`
  : `\nall ${served.size} served files accounted for: ${assets.length} in ASSETS, ${Object.keys(NOT_PRECACHED).length} deliberately not`);
process.exit(problems.length ? 1 : 0);
