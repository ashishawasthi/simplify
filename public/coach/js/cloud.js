// Everything the coach app asks of Firebase, in one place: sign-in, the
// Firestore documents and Storage files of docs/platform/data-model.md
// (firestore.rules and storage.rules say who may do what), and the Cloud
// Functions (functions/). The screens never touch the SDK themselves — and a
// smoke test swaps this one file for a stand-in (tools/smoke/coach.mjs).
//
// Every error thrown from here is a CloudError: .code, and a .message in
// plain words a coach can be shown as it is.
//
// Dates come back as Date objects; a server time not yet confirmed reads as
// the device's estimate of it.

import { initializeApp } from "../vendor/firebase/12.19.0/firebase-app.js";
import {
  initializeAuth, browserSessionPersistence, browserPopupRedirectResolver, connectAuthEmulator,
  GoogleAuthProvider, signInWithPopup, signOut as authSignOut, onAuthStateChanged,
} from "../vendor/firebase/12.19.0/firebase-auth.js";
import {
  initializeFirestore, connectFirestoreEmulator, Timestamp, doc, collection, query, where, orderBy, limit,
  getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, onSnapshot, writeBatch, runTransaction,
  serverTimestamp, arrayUnion, arrayRemove, deleteField,
} from "../vendor/firebase/12.19.0/firebase-firestore.js";
import {
  getStorage, connectStorageEmulator, ref, uploadBytesResumable, deleteObject, getBlob,
} from "../vendor/firebase/12.19.0/firebase-storage.js";
import {
  getFunctions, connectFunctionsEmulator, httpsCallable,
} from "../vendor/firebase/12.19.0/firebase-functions.js";
import { FIREBASE_CONFIG, FUNCTIONS_REGION, emulators } from "./firebase-config.js";
import { newClassCode, formatCode } from "./class-code.js";
import { sgMonthKey } from "./format.js";
import { sameList } from "./institutions.js";

const app = initializeApp(FIREBASE_CONFIG);
// Signed in for this tab only: class iPads are shared, and closing the tab
// (or Sign out) is the end of it.
const auth = initializeAuth(app, {
  persistence: browserSessionPersistence,
  popupRedirectResolver: browserPopupRedirectResolver,
});
const db = initializeFirestore(app, { ignoreUndefinedProperties: true });
const storage = getStorage(app);
const functions = getFunctions(app, FUNCTIONS_REGION);

const EMULATORS = emulators();
if (EMULATORS) {
  const { host } = EMULATORS;
  connectAuthEmulator(auth, `http://${host}:${EMULATORS.auth}`, { disableWarnings: true });
  connectFirestoreEmulator(db, host, EMULATORS.firestore);
  connectStorageEmulator(storage, host, EMULATORS.storage);
  connectFunctionsEmulator(functions, host, EMULATORS.functions);
}
export const usingEmulators = Boolean(EMULATORS);

// ---------- errors, in plain words ----------

export class CloudError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CloudError";
    this.code = code;
  }
}

const OFFLINE = "No connection. Check the internet, then try again.";
const PLAIN = {
  "permission-denied": "You can't do this. The admin may have paused your account or this class.",
  unauthenticated: "You are signed out. Sign in again.",
  unauthorized: "You can't do this. The admin may have paused your account or this class.",
  unavailable: OFFLINE,
  "network-request-failed": OFFLINE,
  "retry-limit-exceeded": OFFLINE,
  "deadline-exceeded": "That took too long. Try again.",
  "not-found": "It isn't there any more. Someone may have deleted it.",
  "object-not-found": "The file isn't there any more. Someone may have deleted it.",
  "resource-exhausted": "Too many requests just now. Try again in a minute.",
  "quota-exceeded": "The class's storage is full. Ask the admin.",
  canceled: "Stopped.",
  // sign-in
  "popup-blocked": "The sign-in window was blocked. Allow pop-ups for this site, then try again.",
  "operation-not-supported-in-this-environment": "Sign-in doesn't work in this browser. Open this page in Chrome or Safari.",
  "web-storage-unsupported": "Sign-in doesn't work in this browser. Open this page in Chrome or Safari.",
  "unauthorized-domain": "Sign-in isn't set up for this web address yet.",
  "operation-not-allowed": "Google sign-in isn't switched on for Simplify yet.",
  "configuration-not-found": "Google sign-in isn't switched on for Simplify yet.",
  "user-disabled": "This Google account can't sign in here.",
};
const CANCELLED = new Set(["popup-closed-by-user", "cancelled-popup-request", "user-cancelled"]);

export function friendly(err, fallback = "Something went wrong. Try again in a minute.") {
  if (err instanceof CloudError) return err;
  const code = String(err?.code ?? "").replace(/^(firestore|functions|storage|auth)\//, "");
  if (CANCELLED.has(code)) return new CloudError("cancelled", "");
  // a Cloud Function's own refusal: its message is already written for coaches
  // (the SDK adds the HTTP status, " [403]", which is not)
  const own = String(err?.message ?? "").replace(/ \[\d{3}\]$/, "");
  if (String(err?.code ?? "").startsWith("functions/") && !["internal", "unknown", "unavailable",
    "deadline-exceeded", "not-found", "unauthenticated"].includes(code) && own && own !== code) {
    return new CloudError(code, own);
  }
  return new CloudError(code || "unknown", PLAIN[code] ?? fallback);
}

// ---------- documents as plain objects ----------

function plainValue(value) {
  if (value instanceof Timestamp) return value.toDate();
  if (Array.isArray(value)) return value.map(plainValue);
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plainValue(v)]));
  }
  return value;
}
const plain = (snap) => ({ id: snap.id, ...plainValue(snap.data({ serverTimestamps: "estimate" })) });
const byTime = (key, order = -1) => (a, b) => order * ((a[key]?.getTime?.() ?? 0) - (b[key]?.getTime?.() ?? 0));

async function attempt(fn, fallback) {
  try {
    return await fn();
  } catch (err) {
    throw friendly(err, fallback);
  }
}

// a live query: onData(list or doc) now and after every change; onError once
function watch(target, onData, onError, many) {
  return onSnapshot(target, (snap) => {
    if (many) onData(snap.docs.map(plain));
    else onData(snap.exists() ? plain(snap) : null);
  }, (err) => onError?.(friendly(err)));
}

// ---------- signing in ----------

// fn(user) now and on every change: { uid, email, name } or null
export function onUserChange(fn) {
  return onAuthStateChanged(auth, (user) => {
    fn(user ? { uid: user.uid, email: user.email ?? "", name: user.displayName ?? "" } : null);
  });
}

export async function signIn() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" }); // a shared iPad: always ask whose
  await attempt(() => signInWithPopup(auth, provider), "Sign-in didn't work. Try again.");
}

export async function signOut() {
  await attempt(() => authSignOut(auth));
}

// ---------- the coach ----------

// The profile, live: onData(profile or null) now and whenever it changes —
// the admin's approval reaches the coach's screen as it happens.
// A profile "not found" only in the device's cache means no connection, not
// "no profile": that is an error, so nobody is sent to About you by mistake.
export function watchProfile(uid, onData, onError) {
  return onSnapshot(doc(db, "coaches", uid), (snap) => {
    if (!snap.exists() && snap.metadata.fromCache) return onError?.(new CloudError("unavailable", OFFLINE));
    return onData(snap.exists() ? plain(snap) : null);
  }, (err) => onError?.(friendly(err)));
}

// A new profile waits for the admin (status "pending"). Where they work is
// institutions from the list and/or otherPlace, a place not in the list yet
// in their own words ("" for none). A change of either is stamped, so the
// admin can see it came after approval.
export async function saveProfile(user, { name, note, institutions, otherPlace = "" }, { isNew, before }) {
  const samePlaces = sameList(before?.institutions, institutions) && (before?.otherPlace ?? "") === otherPlace;
  await attempt(() => (isNew
    ? setDoc(doc(db, "coaches", user.uid), {
      name, note, institutions, ...(otherPlace ? { otherPlace } : {}), email: user.email, status: "pending", createdAt: serverTimestamp(),
    })
    : updateDoc(doc(db, "coaches", user.uid), {
      name, note, institutions, otherPlace: otherPlace || deleteField(),
      ...(samePlaces ? {} : { institutionsChangedAt: serverTimestamp() }),
    })));
}

// A coach the admin declined asks again, once they have changed About you:
// back to waiting, stamped.
export async function askAgain(uid) {
  await attempt(() => updateDoc(doc(db, "coaches", uid), { status: "pending", reappliedAt: serverTimestamp() }));
}

// Every institution (the admin's list, retired ones too): [{ id, name, org, type, area, active }]
export async function listInstitutions() {
  return attempt(async () => {
    const snap = await getDocs(collection(db, "institutions"));
    return snap.docs.map(plain).sort((a, b) => String(a.org).localeCompare(String(b.org)) || String(a.name).localeCompare(String(b.name)));
  }, "The list of institutions could not be loaded. Try again.");
}

export async function isAdmin(uid) {
  try {
    return (await getDoc(doc(db, "admins", uid))).exists();
  } catch {
    return false;
  }
}

// The classes this coach is a coach of: [{ id: code, name, status, latest … }]
// — { id, unreadable: true } for one the rules won't show (and never an
// error for the whole list because of one).
export async function myClasses(uid) {
  return attempt(async () => {
    const links = await getDocs(query(collection(db, "classCoaches"), where("uids", "array-contains", uid)));
    const list = await Promise.all(links.docs.map(async (link) => {
      try {
        const snap = await getDoc(doc(db, "classes", link.id));
        return snap.exists() ? plain(snap) : { id: link.id, unreadable: true };
      } catch {
        return { id: link.id, unreadable: true };
      }
    }));
    return list.sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")));
  });
}

export async function myRequests(uid) {
  return attempt(async () => {
    const snap = await getDocs(query(collection(db, "requests"), where("uid", "==", uid)));
    return snap.docs.map(plain).sort(byTime("createdAt"));
  });
}

// An approved coach makes a class of their own: a new random code, the class
// (for one of their institutions) and its coaches list with only them, in one
// transaction — firestore.rules allow exactly that. Returns the code.
export async function createClass(uid, { name, institution }) {
  for (let tries = 0; tries < 5; tries++) {
    const code = newClassCode();
    try {
      await runTransaction(db, async (tx) => {
        if ((await tx.get(doc(db, "classes", code))).exists()) throw new CloudError("code-taken", "");
        tx.set(doc(db, "classes", code), {
          name, institution, status: "active", latest: null, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        });
        tx.set(doc(db, "classCoaches", code), { uids: [uid] });
      });
      return code;
    } catch (err) {
      if (err?.code !== "code-taken") throw friendly(err, "The class could not be made. Try again.");
    }
  }
  throw new CloudError("code-taken", "No free class code was found. Try again.");
}

// Joining a colleague's class is a request the admin approves.
export async function askToJoinClass(uid, { classCode, note }) {
  await attempt(() => addDoc(collection(db, "requests"), {
    uid, kind: "join-class", classCode, note, status: "pending", createdAt: serverTimestamp(),
  }));
}

// More videos a month than everyone gets: a request the admin decides.
export async function askForMoreVideos(uid, { note }) {
  await attempt(() => addDoc(collection(db, "requests"), {
    uid, kind: "more-videos", note, status: "pending", createdAt: serverTimestamp(),
  }), "The request could not be sent. Try again.");
}

// ---------- one class ----------

export async function getClass(code) {
  return attempt(async () => {
    const snap = await getDoc(doc(db, "classes", code));
    return snap.exists() ? plain(snap) : null;
  });
}

export const watchClass = (code, onData, onError) => watch(doc(db, "classes", code), onData, onError, false);
export const watchPages = (code, onData, onError) =>
  watch(collection(db, "classes", code, "pages"), onData, onError, true);
export const watchPictures = (code, onData, onError) =>
  watch(collection(db, "classes", code, "pictures"), onData, onError, true);
export const watchVideos = (code, onData, onError) =>
  watch(collection(db, "classes", code, "videos"), onData, onError, true);

// ---- pages ----

export const newPageId = (code) => doc(collection(db, "classes", code, "pages")).id;

export async function createPage(code, id, uid, { title, markdown }) {
  await attempt(() => setDoc(doc(db, "classes", code, "pages", id), {
    title, markdown, createdAt: serverTimestamp(), createdBy: uid, updatedAt: serverTimestamp(), updatedBy: uid,
  }));
}

export async function savePage(code, id, uid, { title, markdown }) {
  await attempt(() => updateDoc(doc(db, "classes", code, "pages", id), {
    title, markdown, updatedAt: serverTimestamp(), updatedBy: uid,
  }));
}

export async function deletePage(code, id) {
  await attempt(() => deleteDoc(doc(db, "classes", code, "pages", id)));
}

// The page, saved, becomes what learners see: both writes or neither.
// force: also open it at once on learners' screens that have Simplify open
// (a Cloud Function passes that on — functions/signal.js)
export async function publishPage(code, id, uid, { title, markdown }, { force = false } = {}) {
  await attempt(async () => {
    const batch = writeBatch(db);
    batch.update(doc(db, "classes", code, "pages", id), {
      title, markdown, updatedAt: serverTimestamp(), updatedBy: uid, publishedAt: serverTimestamp(),
    });
    batch.update(doc(db, "classes", code), {
      latest: { pageId: id, title, markdown, publishedAt: serverTimestamp(), publishedBy: uid, ...(force ? { force: true } : {}) },
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  });
}

// Unpublish (latest null), or put back what learners saw before (an undo):
// published again now, by this coach — never forced onto open screens.
export async function setLatest(code, uid, latest) {
  await attempt(() => updateDoc(doc(db, "classes", code), {
    latest: latest
      ? { pageId: latest.pageId, title: latest.title, markdown: latest.markdown, publishedAt: serverTimestamp(), publishedBy: uid }
      : null,
    updatedAt: serverTimestamp(),
  }));
}

// ---- pictures ----

const picturePath = (code, id) => `classes/${code}/pictures/${id}.jpg`;
const STORAGE_ORIGIN = EMULATORS ? `http://${EMULATORS.host}:${EMULATORS.storage}` : "https://firebasestorage.googleapis.com";

// Where anyone (a learner's device, this preview) GETs a shelf picture or an
// approved video: the exact path, no token — storage.rules allow a GET.
export function mediaUrl(code, kind, id) {
  const path = kind === "video" ? `classes/${code}/videos/${id}.mp4` : picturePath(code, id);
  return `${STORAGE_ORIGIN}/v0/b/${FIREBASE_CONFIG.storageBucket}/o/${encodeURIComponent(path)}?alt=media`;
}

// Upload a JPEG (already made small by image.js), then put it on the shelf.
// onProgress(0…1) while it goes. Returns the picture's id.
export async function addPicture(code, uid, { blob, width, height, words }, onProgress) {
  const id = doc(collection(db, "classes", code, "pictures")).id;
  const file = ref(storage, picturePath(code, id));
  await attempt(() => new Promise((resolve, reject) => {
    // a new id every time, so a picture never changes: a day's caching is safe
    const task = uploadBytesResumable(file, blob, { contentType: "image/jpeg", cacheControl: "public, max-age=86400" });
    task.on("state_changed", (s) => onProgress?.(s.totalBytes ? s.bytesTransferred / s.totalBytes : 0), reject, resolve);
  }), "The picture could not be uploaded. Try again.");
  try {
    await setDoc(doc(db, "classes", code, "pictures", id), {
      words, file: `pictures/${id}.jpg`, width, height, createdAt: serverTimestamp(), createdBy: uid,
    });
  } catch (err) {
    deleteObject(file).catch(() => {}); // not on the shelf, so not kept either
    throw friendly(err);
  }
  return id;
}

export async function setPictureWords(code, id, words) {
  await attempt(() => updateDoc(doc(db, "classes", code, "pictures", id), { words }));
}

// Off the shelf first (so it can't be placed again), then the file itself.
export async function deletePicture(code, id) {
  await attempt(() => deleteDoc(doc(db, "classes", code, "pictures", id)));
  await deleteObject(ref(storage, picturePath(code, id))).catch((err) => {
    console.warn(`picture ${id}: the file stayed`, err);
  });
}

// ---- videos ----

// A finished video waiting for a coach's check is private to the class's
// coaches: fetched with this coach's sign-in, shown from a blob: URL.
export async function draftVideoUrl(code, id) {
  return attempt(async () => {
    const blob = await getBlob(ref(storage, `classes/${code}/video-drafts/${id}.mp4`));
    return URL.createObjectURL(new Blob([blob], { type: "video/mp4" }));
  }, "The video could not be loaded. Try again.");
}

// ---- the Cloud Functions ----

const TIMEOUTS = {
  writePage: 120_000, planOverlay: 120_000, makeVideo: 70_000,
  checkVideo: 70_000, approveVideo: 180_000, discardVideo: 60_000,
};
export async function callFunction(name, data) {
  return attempt(async () => {
    const result = await httpsCallable(functions, name, { timeout: TIMEOUTS[name] ?? 70_000 })(data);
    return result.data;
  }, "The AI could not answer. Try again in a minute.");
}

// ---- monthly use ----

export const DEFAULT_LIMITS = Object.freeze({ flashPerMonth: 200, videosPerMonth: 20 });

// Everyone's monthly limits — and, given a coach's uid, theirs: an admin may
// have given them more videos a month (coaches/{uid}.limits), as the
// functions count them (functions/lib.js limitsFrom).
export async function getLimits(uid = null) {
  const all = await getDoc(doc(db, "config", "limits")).then((snap) => (snap.exists() ? snap.data() : {}), () => ({}));
  const own = uid ? await getDoc(doc(db, "coaches", uid)).then((snap) => snap.data()?.limits ?? {}, () => ({})) : {};
  const count = (...values) => values.find((v) => Number.isInteger(v) && v >= 0);
  return {
    flashPerMonth: count(own.flashPerMonth, all.flashPerMonth, DEFAULT_LIMITS.flashPerMonth),
    videosPerMonth: count(own.videosPerMonth, all.videosPerMonth, DEFAULT_LIMITS.videosPerMonth),
    ownVideos: Number.isInteger(own.videosPerMonth), // this coach's own limit, not everyone's
  };
}

// this coach's use this month (Singapore time): { flash, video }
export async function getUsage(uid) {
  try {
    const snap = await getDoc(doc(db, "usage", `${uid}_${sgMonthKey()}`));
    const data = snap.exists() ? snap.data() : {};
    return { flash: data.flash ?? 0, video: data.video ?? 0 };
  } catch {
    return { flash: 0, video: 0 };
  }
}

// ---------- the admin ----------
//
// Every admin action is written together with an adminLog entry: who (the
// signed-in admin's uid and Google email), what, when, and a note — for an
// approval, how the admin checked. firestore.rules refuse a decision on a
// coach or a request, or a suspension, without its entry. `admin` below is
// the signed-in user, { uid, email }.

const cut = (value, max) => String(value ?? "").slice(0, max);
const coachFacts = (coach) => ({ coach: coach.id, coachName: cut(coach.name, 60), coachEmail: cut(coach.email, 200) });
const classFacts = (cls) => ({ classCode: cls.id, className: cut(cls.name, 30) });
const institutionFacts = (id, inst) => ({ institution: id, institutionName: cut(inst.name, 80) });

// a new entry's reference and its fields (the undefined ones are left out)
function logEntry(admin, action, fields = {}) {
  const ref = doc(collection(db, "adminLog"));
  return [ref, {
    action, adminUid: admin.uid, adminEmail: admin.email, at: serverTimestamp(), ...fields, note: cut(fields.note, 500),
  }];
}

// one admin action and its entry, together; returns the entry's id
async function logged(admin, action, fields, write) {
  const [ref, entry] = logEntry(admin, action, fields);
  await attempt(async () => {
    const batch = writeBatch(db);
    batch.set(ref, entry);
    write?.(batch, ref.id);
    await batch.commit();
  });
  return ref.id;
}

// The log, newest first (the latest `max` entries): [{ id, action, adminUid, adminEmail, at, note, … }]
export async function adminLog(max = 300) {
  return attempt(async () => {
    const snap = await getDocs(query(collection(db, "adminLog"), orderBy("at", "desc"), limit(max)));
    return snap.docs.map(plain);
  }, "The admin history could not be loaded. Try again.");
}

// Entries by id (older ones than the latest loaded): the ones found
export async function logEntries(ids) {
  const found = await Promise.all(ids.map(async (id) => {
    try {
      const snap = await getDoc(doc(db, "adminLog", id));
      return snap.exists() ? plain(snap) : null;
    } catch {
      return null;
    }
  }));
  return found.filter(Boolean);
}

// How many are waiting for an admin (coaches, and requests to join a class),
// live: onCount(n) now and whenever it changes. Returns a stop function.
export function watchWaiting(onCount) {
  const counts = { coaches: null, requests: null };
  const tell = () => {
    if (counts.coaches != null && counts.requests != null) onCount(counts.coaches + counts.requests);
  };
  const stops = [
    onSnapshot(query(collection(db, "coaches"), where("status", "==", "pending")), (snap) => {
      counts.coaches = snap.size;
      tell();
    }, (err) => console.warn("waiting coaches", err)),
    onSnapshot(query(collection(db, "requests"), where("status", "==", "pending")), (snap) => {
      counts.requests = snap.size;
      tell();
    }, (err) => console.warn("waiting requests", err)),
  ];
  return () => stops.forEach((stop) => stop());
}

export async function pendingRequests() {
  return attempt(async () => {
    const snap = await getDocs(query(collection(db, "requests"), where("status", "==", "pending")));
    return snap.docs.map(plain).sort(byTime("createdAt", 1));
  });
}

export async function allCoaches() {
  return attempt(async () => {
    const snap = await getDocs(collection(db, "coaches"));
    return snap.docs.map(plain).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  });
}

export async function allClasses() {
  return attempt(async () => {
    const [classes, links] = await Promise.all([getDocs(collection(db, "classes")), getDocs(collection(db, "classCoaches"))]);
    const uids = new Map(links.docs.map((d) => [d.id, d.data().uids ?? []]));
    return classes.docs.map((d) => ({ ...plain(d), uids: uids.get(d.id) ?? [] }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  });
}

// "approved", "declined", or back to "pending": stamped with who and when,
// and logged. note: how the admin checked (an approval needs 10 characters
// or more) or why; message: what a declined coach is told (they see it).
// Returns the entry's id.
export async function decideCoach(coach, status, admin, { note = "", message = "" } = {}) {
  return logged(admin, `coach-${status}`, { ...coachFacts(coach), note }, (batch, id) => {
    batch.update(doc(db, "coaches", coach.id), {
      status, decidedAt: serverTimestamp(), decidedBy: admin.uid, decisionLog: id,
      decisionMessage: status === "declined" && message ? cut(message, 300) : deleteField(),
    });
  });
}

// note: why (kept in the history; the coach only sees that they are paused).
// Returns the entry's id.
export async function setCoachSuspended(coach, suspended, admin, note = "") {
  return logged(admin, suspended ? "coach-suspended" : "coach-unsuspended", { ...coachFacts(coach), note }, (batch, id) => {
    batch.update(doc(db, "coaches", coach.id), { suspended, suspendLog: id });
  });
}

// The coach wrote a place not in the list (otherPlace): the admin puts a
// listed one on their profile in its place.
export async function addPlaceToCoach(coach, instId, inst, admin) {
  await logged(admin, "coach-place-added", { ...coachFacts(coach), ...institutionFacts(instId, inst), detail: cut(coach.otherPlace, 200) }, (batch) => {
    batch.update(doc(db, "coaches", coach.id), { institutions: arrayUnion(instId), otherPlace: deleteField() });
  });
}

// Add (id null: a new id) or change an institution; returns its id. forCoach:
// the coach who named it (otherPlace) — it goes on their profile in its place.
export async function saveInstitution(id, { name, org, type, area, active }, admin, { forCoach } = {}) {
  const ref = id ? doc(db, "institutions", id) : doc(collection(db, "institutions"));
  const data = { name, org, type, area, active };
  await logged(admin, id ? "institution-edited" : "institution-added", {
    ...institutionFacts(ref.id, data), ...(forCoach ? coachFacts(forCoach) : {}),
    detail: cut([org, type, area].filter(Boolean).join(" · "), 200),
  }, (batch) => {
    batch.set(ref, { ...data, updatedAt: serverTimestamp() });
    if (forCoach) batch.update(doc(db, "coaches", forCoach.id), { institutions: arrayUnion(ref.id), otherPlace: deleteField() });
  });
  return ref.id;
}

// Retire (false) or bring back (true); never deleted — profiles and classes point at it
export async function setInstitutionActive(inst, active, admin, note = "") {
  await logged(admin, active ? "institution-restored" : "institution-retired", { ...institutionFacts(inst.id, inst), note }, (batch) => {
    batch.update(doc(db, "institutions", inst.id), { active, updatedAt: serverTimestamp() });
  });
}

export async function setClassStatus(cls, status, admin, note = "") {
  await logged(admin, status === "active" ? "class-restored" : "class-suspended", { ...classFacts(cls), note }, (batch) => {
    batch.update(doc(db, "classes", cls.id), { status, updatedAt: serverTimestamp() });
  });
}

// null takes the page down; an earlier latest (as it was) puts it back
export async function adminSetLatest(cls, latest, admin, note = "") {
  const title = latest ?? cls.latest;
  await logged(admin, latest ? "page-put-back" : "page-taken-down", {
    ...classFacts(cls), note, detail: cut(title?.title || "Untitled page", 200),
  }, (batch) => {
    batch.update(doc(db, "classes", cls.id), { latest, updatedAt: serverTimestamp() });
  });
}

// A coach off one class (or back on it: an undo)
export async function setCoachOfClass(cls, coach, on, admin, note = "") {
  await logged(admin, on ? "coach-added" : "coach-removed", { ...classFacts(cls), ...coachFacts(coach), note }, (batch) => {
    batch.update(doc(db, "classCoaches", cls.id), { uids: on ? arrayUnion(coach.id) : arrayRemove(coach.id) });
  });
}

function stillPending(snap) {
  if (!snap.exists() || snap.data().status !== "pending") {
    throw new CloudError("decided", "This request has already been decided.");
  }
}

// Approve a request to join a class: the coach is added to the class, the
// request says which class, and the log says how the admin checked (10
// characters or more). All or nothing. Returns the class's code.
export async function approveRequest(request, admin, { note, coach, cls }) {
  const requestDoc = doc(db, "requests", request.id);
  const code = request.classCode;
  const [logRef, entry] = logEntry(admin, "join-approved", {
    request: request.id, ...(coach ? coachFacts(coach) : { coach: request.uid }), ...(cls ? classFacts(cls) : { classCode: code }), note,
  });
  await attempt(() => runTransaction(db, async (tx) => {
    stillPending(await tx.get(requestDoc));
    const link = await tx.get(doc(db, "classCoaches", code));
    if (!link.exists()) {
      throw new CloudError("no-class", `There is no class with the code ${formatCode(code)}. Decline this request instead.`);
    }
    tx.set(logRef, entry);
    tx.update(doc(db, "classCoaches", code), { uids: arrayUnion(request.uid) });
    tx.update(requestDoc, { status: "approved", decidedAt: serverTimestamp(), decidedBy: admin.uid, decisionLog: logRef.id, resultCode: code });
  }));
  return code;
}

// More videos a month for one coach: their own limit, the request decided,
// and the log entry — all or nothing.
export async function approveMoreVideos(request, admin, { videosPerMonth, note, coach }) {
  await attempt(() => runTransaction(db, async (tx) => {
    const requestDoc = doc(db, "requests", request.id);
    stillPending(await tx.get(requestDoc));
    const [logRef, entry] = logEntry(admin, "more-videos-approved", {
      request: request.id, ...(coach ? coachFacts(coach) : { coach: request.uid }), note, detail: `${videosPerMonth} videos a month`,
    });
    tx.set(logRef, entry);
    tx.update(doc(db, "coaches", request.uid), { limits: { videosPerMonth }, limitsLog: logRef.id });
    tx.update(requestDoc, { status: "approved", decidedAt: serverTimestamp(), decidedBy: admin.uid, decisionLog: logRef.id, videosPerMonth });
  }));
}

export async function declineRequest(request, admin, { note = "", coach, cls } = {}) {
  const code = request.classCode;
  await logged(admin, request.kind === "more-videos" ? "more-videos-declined" : "join-declined", {
    request: request.id, ...(coach ? coachFacts(coach) : { coach: request.uid }),
    ...(cls ? classFacts(cls) : code ? { classCode: code } : {}), note,
  }, (batch, id) => {
    batch.update(doc(db, "requests", request.id), {
      status: "declined", decidedAt: serverTimestamp(), decidedBy: admin.uid, decisionLog: id,
    });
  });
}

export async function saveLimits(admin, { flashPerMonth, videosPerMonth }) {
  await logged(admin, "limits-changed", { detail: `${flashPerMonth} AI requests and ${videosPerMonth} videos a month` }, (batch) => {
    batch.set(doc(db, "config", "limits"), {
      flashPerMonth, videosPerMonth, updatedAt: serverTimestamp(), updatedBy: admin.uid,
    }, { merge: true });
  });
}
