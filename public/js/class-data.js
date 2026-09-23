// The class this device follows, for My class: its code, the coach's latest
// page read from Firestore with one plain HTTPS request (no SDK, no account),
// and a copy on the device — the page, its pictures and its videos — so it
// opens offline too. docs/daily-life-tools.md section 8 has the design.
//
// ---- The class code ----
// 9 characters from ALPHABET (no 0, 1, I, L or O to mix up), kept without
// dashes and shown as "K7M-3RQ-P9T". Whatever is typed is forgiven: made
// upper case, and every character not in ALPHABET dropped.
//
// ---- Reading a class ----
// GET <Firestore>/v1/projects/simplify-special/databases/(default)/documents/classes/<code>
// Anyone may get an active class by its exact code, and nothing else (no
// listing): a suspended class or a wrong code are both 403/404, "missing".
// Pictures and videos: GET <Storage>/v0/b/<bucket>/o/classes%2F<code>%2Fpictures%2F<id>.jpg?alt=media
// (videos%2F<id>.mp4), CORS allowed. Only the class code leaves the device.
//
// Where: https://firestore.googleapis.com and https://firebasestorage.googleapis.com.
// On localhost or 127.0.0.1 — development and the smoke tests — the app
// makes no requests at all, unless localStorage "simplify-class-emulator"
// asks for the emulators: "on" for Firestore at http://127.0.0.1:8085 and
// Storage at http://127.0.0.1:9199, or JSON naming others,
// {"firestore":"http://127.0.0.1:8185","storage":"http://127.0.0.1:9299"}.
// (A page served with the site's CSP may only connect to Google's two, so a
// run against the emulators needs a server that sends another policy.)
//
// ---- What the device keeps ----
// localStorage "simplify-class-v1": { code, name, latest, checkedAt } — the
// class as last read, latest being { pageId, title, markdown, publishedAt }
// or null (nothing published, or taken down). Cache Storage
// "simplify-class-media": the files the latest page uses, and nothing else,
// under keys <origin>/class-media/<code>/<picture|video>/<id>; the reader
// shows them as blob: URLs (the CSP allows blob: images and media).
// A refresh (refreshClass) happens when the menu shows or the app comes to
// the front, at most every 10 minutes, and whenever My class opens; it
// downloads the files a new page needs and drops the rest. What is on
// screen is never replaced here: the reader decides when to take the new
// page (js/tools/my-class.js).

import { getDevice, setDevice } from "./device.js";
import { pageMedia, parseClassMarkdown } from "./class-markdown.js";

export const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const CODE_LENGTH = 9;

const PROJECT = "simplify-special";
const BUCKET = "simplify-special.firebasestorage.app";
const GOOGLE = Object.freeze({
  firestore: "https://firestore.googleapis.com",
  storage: "https://firebasestorage.googleapis.com",
});
const EMULATORS = Object.freeze({ firestore: "http://127.0.0.1:8085", storage: "http://127.0.0.1:9199" });
const EMULATOR_KEY = "simplify-class-emulator";

const SAVED_KEY = "simplify-class-v1";
export const MEDIA_CACHE = "simplify-class-media";

const REFRESH_EVERY = 10 * 60 * 1000; // menu shown, app to the front
const REFRESH_AGAIN = 15 * 1000; // My class opened: always, but not twice in a moment
const PAGE_MS = 20 * 1000; // a request that takes longer has failed
const FILE_MS = 120 * 1000; // a video on a slow connection

// ---------- the code ----------

const IN_ALPHABET = new RegExp(`^[${ALPHABET}]{${CODE_LENGTH}}$`);

// upper case, and every character not in ALPHABET dropped: "k7m-3rq p9t" → "K7M3RQP9T"
export function normalizeClassCode(text) {
  return [...String(text ?? "").toUpperCase()].filter((c) => ALPHABET.includes(c)).join("");
}

export function isClassCode(code) {
  return typeof code === "string" && IN_ALPHABET.test(code);
}

// "K7M3RQP9T" → "K7M-3RQ-P9T" (a shorter one in threes too)
export function formatClassCode(code) {
  return (normalizeClassCode(code).match(/.{1,3}/g) ?? []).join("-");
}

// What someone typed or pasted in the code box — a code, or the class's
// whole link (…/#join=K7M3RQP9T) — as a code, normalised.
export function codeFromText(text) {
  const s = String(text ?? "");
  const join = /join=([^&\s]*)/i.exec(s);
  return normalizeClassCode(join ? join[1] : s);
}

// A new random code. Rejection sampling: 256 isn't a multiple of 31, so the
// bytes from 248 up are thrown away rather than favour the first characters.
export function newClassCode(getRandomValues = (bytes) => globalThis.crypto.getRandomValues(bytes)) {
  const limit = 256 - (256 % ALPHABET.length);
  let code = "";
  while (code.length < CODE_LENGTH) {
    for (const byte of getRandomValues(new Uint8Array(16))) {
      if (byte < limit && code.length < CODE_LENGTH) code += ALPHABET[byte % ALPHABET.length];
    }
  }
  return code;
}

// ---------- where to ask ----------

const LOCAL = new Set(["localhost", "127.0.0.1", "[::1]"]);
const LOCAL_ORIGIN = /^http:\/\/(?:127\.0\.0\.1|localhost):\d{2,5}$/;

// { firestore, storage } origins, or null: ask nobody (see the header)
export function endpoints(where = globalThis.location, storage = globalThis.localStorage) {
  if (!LOCAL.has(where?.hostname)) return GOOGLE;
  let asked = null;
  try {
    asked = storage?.getItem(EMULATOR_KEY) ?? null;
  } catch {
    return null;
  }
  if (!asked) return null;
  if (asked.trim() === "on") return EMULATORS;
  try {
    const { firestore, storage: files } = JSON.parse(asked);
    if (LOCAL_ORIGIN.test(firestore) && LOCAL_ORIGIN.test(files)) return { firestore, storage: files };
  } catch {
    // not JSON: as good as not asked
  }
  return null;
}

export function classDocUrl(code, ep) {
  return `${ep.firestore}/v1/projects/${PROJECT}/databases/(default)/documents/classes/${code}`;
}

export function mediaFileUrl(code, kind, id, ep) {
  const path = kind === "video" ? `classes/${code}/videos/${id}.mp4` : `classes/${code}/pictures/${id}.jpg`;
  return `${ep.storage}/v0/b/${BUCKET}/o/${encodeURIComponent(path)}?alt=media`;
}

// ---------- Firestore's typed JSON ----------

// One Firestore value ({ stringValue: "…" }, { mapValue: { fields } } …) as
// plain data; timestamps stay ISO strings. Anything unknown is undefined.
export function fromFirestore(value) {
  if (!value || typeof value !== "object") return undefined;
  if ("nullValue" in value) return null;
  if ("stringValue" in value) return String(value.stringValue);
  if ("booleanValue" in value) return value.booleanValue === true;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("timestampValue" in value) return String(value.timestampValue);
  if ("mapValue" in value) return fromFields(value.mapValue?.fields);
  if ("arrayValue" in value) return (value.arrayValue?.values ?? []).map(fromFirestore);
  if ("referenceValue" in value) return String(value.referenceValue);
  return undefined;
}

// a document's (or a map's) fields as an object — own keys only, so not
// even "__proto__" reaches a prototype
export function fromFields(fields) {
  if (!fields || typeof fields !== "object") return {};
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, fromFirestore(value)]));
}

// The class in a Firestore document, as the device keeps it — or null for
// one that isn't active.
export function classFromDocument(code, doc) {
  const f = fromFields(doc?.fields);
  if (f.status !== "active") return null;
  return cleanClass({ code, name: f.name, latest: f.latest });
}

// Whatever is stored or read, as { code, name, latest, checkedAt }: a bad
// value falls back to nothing, never an error.
function cleanClass(raw, checkedAt = 0) {
  const r = raw && typeof raw === "object" ? raw : {};
  const l = r.latest && typeof r.latest === "object" ? r.latest : null;
  const text = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "");
  const time = typeof l?.publishedAt === "string" && !Number.isNaN(Date.parse(l.publishedAt)) ? l.publishedAt : null;
  return {
    code: isClassCode(r.code) ? r.code : null,
    name: text(r.name, 60),
    latest: l && typeof l.markdown === "string"
      ? { pageId: text(l.pageId, 200), title: text(l.title, 200), markdown: l.markdown.slice(0, 40000), publishedAt: time }
      : null,
    checkedAt: Number.isFinite(r.checkedAt) ? r.checkedAt : checkedAt,
  };
}

// ---------- asking the server ----------

// fetch() that gives up after ms, or when signal aborts
async function fetchFor(url, ms, { signal, ...options } = {}) {
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), ms);
  const onAbort = () => stop.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    return await fetch(url, { ...options, credentials: "omit", signal: stop.signal });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

const offline = () => globalThis.navigator?.onLine === false;

// The class with this code, from the server:
//   { ok: true, cls }             found, and active
//   { ok: false, reason: "missing" }   no such class, or not active
//   { ok: false, reason: "offline" }   no answer: no internet, a server
//                                      error, or no server to ask (localhost)
export async function fetchClass(code, { signal } = {}) {
  if (!isClassCode(code)) return { ok: false, reason: "missing" };
  const ep = endpoints();
  if (!ep || offline()) return { ok: false, reason: "offline" };
  try {
    const res = await fetchFor(classDocUrl(code, ep), PAGE_MS, { signal, cache: "no-store" });
    if (res.status === 403 || res.status === 404) return { ok: false, reason: "missing" };
    if (!res.ok) return { ok: false, reason: "offline" };
    const cls = classFromDocument(code, await res.json());
    return cls ? { ok: true, cls } : { ok: false, reason: "missing" };
  } catch {
    return { ok: false, reason: "offline" };
  }
}

// ---------- the copy on the device ----------

function readSaved() {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVED_KEY));
    return raw && typeof raw === "object" ? cleanClass(raw) : null;
  } catch {
    return null;
  }
}

// The saved copy of the class this device follows, or null (none yet, or
// the copy is of another class).
export function savedClass() {
  const code = getDevice().classCode;
  const saved = code ? readSaved() : null;
  return saved?.code === code ? saved : null;
}

function writeSaved(cls) {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(cls));
  } catch {
    // storage full or blocked: it still shows until the app closes
  }
}

// the stored copy exactly as it is, and putting it back — for an undo
export function savedSnapshot() {
  try {
    return localStorage.getItem(SAVED_KEY);
  } catch {
    return null;
  }
}
export function restoreSnapshot(raw) {
  try {
    if (raw == null) localStorage.removeItem(SAVED_KEY);
    else localStorage.setItem(SAVED_KEY, raw);
  } catch {
    // as above
  }
}

// Follow this class (from fetchClass): the device's code and name, the copy
// of its page, and its files, fetched now in the background.
export function followClass(cls) {
  const saved = cleanClass(cls, Date.now());
  saved.checkedAt = Date.now();
  writeSaved(saved);
  setDevice({ classCode: saved.code, className: saved.name || null });
  keepClassMedia(saved).catch(() => {});
  return saved;
}

// Nothing kept for a device that follows no class (after a Leave, at the
// next start: until then the toast's undo can still want it).
export async function forgetClassIfNone() {
  if (getDevice().classCode) return;
  try {
    localStorage.removeItem(SAVED_KEY);
  } catch {
    // as above
  }
  try {
    await globalThis.caches?.delete(MEDIA_CACHE);
  } catch {
    // no Cache Storage here
  }
}

// is b a different page from a (or none where there was one)?
export function samePage(a, b) {
  const x = a?.latest ?? null;
  const y = b?.latest ?? null;
  if (!x || !y) return x === y;
  return x.pageId === y.pageId && x.publishedAt === y.publishedAt && x.markdown === y.markdown;
}

let inFlight = null; // { code, promise }

// Read the class again, if it is time: force for My class opening (then
// only "not twice in a moment"), otherwise at most every 10 minutes. Saves
// what it finds and fetches the files it needs. Resolves to
//   { changed, cls }      changed: the page is not the one saved before
//   { changed: false }    not asked (too soon, no class, offline)
export function refreshClass({ force = false } = {}) {
  const code = getDevice().classCode;
  if (!code) return Promise.resolve({ changed: false });
  if (inFlight?.code === code) return inFlight.promise;
  const before = savedClass();
  const age = Date.now() - (before?.checkedAt ?? 0);
  if (age >= 0 && age < (force ? REFRESH_AGAIN : REFRESH_EVERY)) {
    if (before) keepClassMedia(before).catch(() => {}); // a file an earlier try missed
    return Promise.resolve({ changed: false, cls: before });
  }
  const promise = (async () => {
    const found = await fetchClass(code);
    if (getDevice().classCode !== code) return { changed: false }; // another class meanwhile
    if (!found.ok && found.reason === "offline") return { changed: false, cls: before };
    // missing: taken away (suspended, or no such class) — nothing to show from it
    const cls = found.ok ? found.cls : cleanClass({ code, name: before?.name, latest: null });
    cls.checkedAt = Date.now();
    const changed = !samePage(before, cls);
    writeSaved(cls);
    if (cls.name && cls.name !== getDevice().className) setDevice({ className: cls.name });
    await keepClassMedia(cls).catch(() => {});
    return { changed, cls };
  })().finally(() => {
    inFlight = null;
  });
  inFlight = { code, promise };
  return promise;
}

// ---------- pictures and videos ----------

export function classMedia(cls) {
  return pageMedia(parseClassMarkdown(cls?.latest?.markdown ?? ""));
}

const mediaKey = (code, { kind, id }) => new URL(`/class-media/${code}/${kind}/${id}`, globalThis.location.href).href;

async function mediaCache() {
  try {
    return (await globalThis.caches?.open(MEDIA_CACHE)) ?? null;
  } catch {
    return null; // no Cache Storage here (a private window, an old browser)
  }
}

const downloads = new Map(); // key → promise of { state, blob }, while one is on its way

// One file, as { state, blob }:
//   "ready"    blob: from the device's copy, or fetched now (and kept)
//   "gone"     the server has no such file (not on the shelf any more)
//   "missing"  not on the device, and no internet to fetch it now
export async function getMedia(code, item, { fetchIfMissing = true } = {}) {
  const key = mediaKey(code, item);
  const cache = await mediaCache();
  try {
    const hit = await cache?.match(key);
    if (hit) return { state: "ready", blob: await hit.blob() };
  } catch {
    // a broken copy: fetch it again
  }
  if (!fetchIfMissing) return { state: "missing", blob: null };
  if (!downloads.has(key)) {
    downloads.set(key, download(code, item, key, cache).finally(() => downloads.delete(key)));
  }
  return downloads.get(key);
}

async function download(code, item, key, cache) {
  const ep = endpoints();
  if (!ep || offline()) return { state: "missing", blob: null };
  try {
    const res = await fetchFor(mediaFileUrl(code, item.kind, item.id, ep), FILE_MS, { mode: "cors" });
    if (res.status === 403 || res.status === 404) return { state: "gone", blob: null };
    if (!res.ok) return { state: "missing", blob: null };
    const blob = await res.blob();
    // a picture is an image and a video a video, or it isn't shown
    if (!blob.type.startsWith(item.kind === "video" ? "video/" : "image/")) return { state: "gone", blob: null };
    try {
      await cache?.put(key, new Response(blob, { headers: { "content-type": blob.type } }));
    } catch {
      // the device is full: shown now, fetched again next time
    }
    return { state: "ready", blob };
  } catch {
    return { state: "missing", blob: null };
  }
}

// Keep exactly the files this class's latest page uses: fetch the missing
// ones, drop every other (another page's, another class's).
export async function keepClassMedia(cls) {
  const cache = await mediaCache();
  if (!cache || !cls?.code) return;
  const wanted = classMedia(cls);
  const keys = new Set(wanted.map((item) => mediaKey(cls.code, item)));
  for (const request of await cache.keys()) {
    if (!keys.has(request.url)) await cache.delete(request);
  }
  for (const item of wanted) {
    if (getDevice().classCode !== cls.code) return; // the device moved on
    await getMedia(cls.code, item);
  }
}

// The page's files as blob: URLs for a reader: onItem(item, { state, url })
// as each is found — url only when state is "ready". retry() asks again for
// the ones that were "missing" (the internet is back); release() revokes the
// URLs and ignores whatever arrives after.
export function loadClassMedia(cls, onItem) {
  const urls = [];
  const missing = new Set();
  let released = false;
  const load = (item) => {
    getMedia(cls.code, item).then(({ state, blob }) => {
      if (released) return;
      const url = blob ? URL.createObjectURL(blob) : null;
      if (url) urls.push(url);
      if (state === "missing") missing.add(item);
      onItem(item, { state: url ? "ready" : state, url });
    }).catch(() => {});
  };
  for (const item of classMedia(cls)) load(item);
  return {
    retry() {
      const again = [...missing];
      missing.clear();
      for (const item of again) load(item);
    },
    release() {
      released = true;
      for (const url of urls) URL.revokeObjectURL(url);
      urls.length = 0;
    },
  };
}

// ---------- "Updated Tue 8:05 am" ----------

// When a page was published, in words for its reader: "today 8:05 am", "Tue
// 8:05 am" within the week, then "22 Sept", and "22 Sept 2025" in another
// year. "" for no time.
export function publishedWords(iso, now = new Date(), timeZone = undefined) {
  const when = new Date(iso ?? NaN);
  if (Number.isNaN(when.getTime())) return "";
  const fmt = (options) => new Intl.DateTimeFormat("en-SG", { timeZone, ...options }).format(when);
  const day = (d) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const time = fmt({ hour: "numeric", minute: "2-digit" });
  const ago = now.getTime() - when.getTime();
  if (day(when) === day(now) || ago < 0) return `today ${time}`;
  if (ago < 6 * 24 * 60 * 60 * 1000) return `${fmt({ weekday: "short" })} ${time}`;
  const year = (d) => new Intl.DateTimeFormat("en-SG", { timeZone, year: "numeric" }).format(d);
  return year(when) === year(now) ? fmt({ day: "numeric", month: "short" }) : fmt({ day: "numeric", month: "short", year: "numeric" });
}
