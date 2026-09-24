// public/sw.js's ASSETS and the pages' modulepreload lists are what
// tools/stamp.mjs writes — every file the app serves is kept offline, with the
// revision of its bytes as they are now, and every module a page's script
// imports is asked for up front — and the service worker's install keeps
// exactly those bytes, asking the network only for what changed. No
// dependencies, no runner:
//
//   node tools/test-assets.mjs
//
// A failure of the first checks after any change under public/ means: run
// node tools/stamp.mjs.

import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { runInNewContext } from "node:vm";

import { NOT_PRECACHED, PUBLIC, precached, renderSw, revision, servedFiles, stamps } from "./stamp.mjs";

const problems = [];

// ---------- the generated parts are up to date ----------

for (const [file, now, want] of stamps()) {
  if (now !== want) problems.push(`${relative(PUBLIC, file)}'s modulepreload list is out of date — run node tools/stamp.mjs`);
}
const swSrc = readFileSync(join(PUBLIC, "sw.js"), "utf8");
if (renderSw(swSrc) !== swSrc) problems.push("public/sw.js's ASSETS is out of date — run node tools/stamp.mjs");

const served = new Map(servedFiles().map((f) => [f.url, f.path]));
for (const url of Object.keys(NOT_PRECACHED)) {
  if (!served.has(url)) problems.push(`NOT_PRECACHED names a file that isn't there: ${url}`);
}
const assets = precached();
for (const { url } of assets) {
  if (url === "/coach" || url.startsWith("/coach/")) problems.push(`the coach app is never precached: ${url}`);
  if (url.endsWith(".html")) problems.push(`a page is kept by its clean URL, without .html: ${url}`);
}

// ---------- the install, in a sandbox ----------

// Cache Storage, kept in memory. A cached answer is stored as its bytes, as
// the browser's is.
function cacheStorage() {
  const stores = new Map();
  const open = async (name) => {
    if (!stores.has(name)) {
      const entries = new Map();
      stores.set(name, {
        entries,
        match: async (url) => {
          const hit = entries.get(String(url));
          return hit && new Response(hit.body.slice(0), { status: hit.status });
        },
        put: async (url, response) => {
          entries.set(String(url), { status: response.status, body: await response.arrayBuffer() });
        },
      });
    }
    return stores.get(name);
  };
  return {
    stores,
    open,
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
  };
}

const files = new Map([...served].map(([url, path]) => [url, readFileSync(path)]));

// A fresh worker from sw.js on a device with these caches. `network(url)`
// answers each fetch (bytes, or a Response); every URL asked for is noted.
function worker(caches, network = (url) => files.get(url), src = swSrc) {
  const handlers = {};
  const fetched = [];
  const sandbox = {
    self: {
      addEventListener: (type, fn) => { handlers[type] = fn; },
      location: new URL("https://simplify.whiz.coach/sw.js"),
      skipWaiting: async () => {},
      clients: { claim: async () => {} },
    },
    caches,
    fetch: async (url) => {
      fetched.push(url);
      const answer = network(url);
      return answer instanceof Response ? answer : new Response(answer);
    },
    crypto,
    Response,
    URL,
  };
  runInNewContext(src, sandbox);
  const run = (type) => {
    let done;
    handlers[type]({ waitUntil: (p) => { done = p; } });
    return done;
  };
  return { fetched, install: () => run("install"), activate: () => run("activate") };
}

async function outcome(promise) {
  try {
    await promise;
    return "ok";
  } catch (err) {
    return `refused: ${err.message}`;
  }
}

const results = [];
const check = (name, got, want) => results.push({ name, got, want, ok: JSON.stringify(got) === JSON.stringify(want) });

// the first install: everything from the network, under a revision-named cache
const device = cacheStorage();
{
  // what an older version left: a cache by the old name, and My class's own
  await (await device.open("simplify-v39")).put("/js/app.js", new Response(files.get("/js/app.js")));
  await (await device.open("simplify-class-media")).put("/class-media/K7M3RQP9T/picture/a", new Response("a"));
  const sw = worker(device);
  check("first install: kept", await outcome(sw.install()), "ok");
  const names = [...device.stores.keys()].filter((k) => /^simplify-[0-9a-f]{8}$/.test(k));
  check("first install: one cache named after the revisions", names.length, 1);
  check("first install: the old version's copy of app.js is used, the rest fetched",
    [sw.fetched.includes("/js/app.js"), sw.fetched.length], [false, assets.length - 1]);
  const cache = device.stores.get(names[0]);
  check("first install: every file kept", cache.entries.size, assets.length);
  check("first install: kept byte for byte",
    [...cache.entries].filter(([url, hit]) => !files.get(url).equals(Buffer.from(hit.body))).map(([url]) => url), []);
  await sw.activate();
  check("activate: the old version's cache deleted, My class's left alone",
    [device.stores.has("simplify-v39"), device.stores.has("simplify-class-media"), device.stores.has(names[0])],
    [false, true, true]);
}

// the next release changes one script: only that one is fetched
const changed = "/js/tools/wait.js";
const next = new Map(files);
next.set(changed, Buffer.concat([files.get(changed), Buffer.from("\n// the next release\n")]));
const nextSrc = renderSw(swSrc, assets.map((a) => (a.url === changed ? { url: a.url, rev: revision(next.get(changed)) } : a)));
{
  const before = [...device.stores.keys()];
  const sw = worker(device, (url) => next.get(url), nextSrc);
  check("an update: kept", await outcome(sw.install()), "ok");
  check("an update: only the changed file is fetched", sw.fetched, [changed]);
  check("an update: a new cache name", [...device.stores.keys()].length, before.length + 1);
  await sw.activate();
  check("an update: the previous version's cache deleted after", [...device.stores.keys()].length, before.length);
}

// a CDN edge still serving the previous release's copy: refused, nothing baked in
{
  const phone = cacheStorage();
  const sw = worker(phone, (url) => (url === changed ? files.get(changed) : next.get(url)), nextSrc);
  check("a stale copy from the network: refused", (await outcome(sw.install())).startsWith(`refused: ${changed}: not revision`), true);
}

// a 404 or a redirect: refused
{
  const sw404 = worker(cacheStorage(), (url) => (url === "/guide/speak" ? new Response("gone", { status: 404 }) : files.get(url)));
  check("a 404: refused", await outcome(sw404.install()), "refused: /guide/speak: 404");
}

// an install cut short resumes: the next attempt fetches only what it missed
{
  const phone = cacheStorage();
  const first = worker(phone, (url) => {
    if (url.startsWith("/audio/")) throw new TypeError("Failed to fetch");
    return files.get(url);
  });
  check("an install cut short: refused", (await outcome(first.install())).startsWith("refused"), true);
  const second = worker(phone);
  check("the next attempt: kept", await outcome(second.install()), "ok");
  const clips = assets.filter((a) => a.url.startsWith("/audio/")).map((a) => a.url).sort();
  check("the next attempt: fetches only what the first did not keep", [...second.fetched].sort(), clips);
}

// ---------- the report ----------

for (const r of results) {
  const show = (v) => (JSON.stringify(v).length > 300 ? `${JSON.stringify(v).slice(0, 300)}…` : JSON.stringify(v));
  console.log(`${r.ok ? "ok  " : "FAIL"}  ${r.name}${r.ok ? "" : `\n      got      ${show(r.got)}\n      expected ${show(r.want)}`}`);
}
for (const p of problems) console.log(`FAIL  ${p}`);
const failed = problems.length + results.filter((r) => !r.ok).length;
console.log(failed
  ? `\n${failed} problem${failed === 1 ? "" : "s"}`
  : `\nall ${served.size} served files accounted for: ${assets.length} kept offline, ${Object.keys(NOT_PRECACHED).length} deliberately not`);
process.exit(failed ? 1 : 0);
