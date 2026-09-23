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
  initializeFirestore, connectFirestoreEmulator, Timestamp, doc, collection, query, where,
  getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, onSnapshot, writeBatch, runTransaction,
  serverTimestamp, arrayUnion,
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
  if (String(err?.code ?? "").startsWith("functions/") && !["internal", "unknown", "unavailable",
    "deadline-exceeded", "not-found", "unauthenticated"].includes(code) && err.message && err.message !== code) {
    return new CloudError(code, err.message);
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

export async function getProfile(uid) {
  return attempt(async () => {
    const snap = await getDoc(doc(db, "coaches", uid));
    return snap.exists() ? plain(snap) : null;
  });
}

export async function saveProfile(user, { name, org, note }, { isNew }) {
  await attempt(() => (isNew
    ? setDoc(doc(db, "coaches", user.uid), { name, org, note, email: user.email, createdAt: serverTimestamp() })
    : updateDoc(doc(db, "coaches", user.uid), { name, org, note })));
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

export async function askForNewClass(uid, { className, org, note }) {
  await attempt(() => addDoc(collection(db, "requests"), {
    uid, kind: "new-class", className, org, note, status: "pending", createdAt: serverTimestamp(),
  }));
}

export async function askToJoinClass(uid, { classCode, org, note }) {
  await attempt(() => addDoc(collection(db, "requests"), {
    uid, kind: "join-class", classCode, org, note, status: "pending", createdAt: serverTimestamp(),
  }));
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
export async function publishPage(code, id, uid, { title, markdown }) {
  await attempt(async () => {
    const batch = writeBatch(db);
    batch.update(doc(db, "classes", code, "pages", id), {
      title, markdown, updatedAt: serverTimestamp(), updatedBy: uid, publishedAt: serverTimestamp(),
    });
    batch.update(doc(db, "classes", code), {
      latest: { pageId: id, title, markdown, publishedAt: serverTimestamp(), publishedBy: uid },
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  });
}

// Unpublish (latest null), or put back what learners saw before (an undo):
// published again now, by this coach.
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

// startVideo can take two minutes or more before Gemini accepts the job
const TIMEOUTS = {
  writePage: 120_000, planVideo: 120_000, startVideo: 540_000,
  checkVideo: 120_000, approveVideo: 180_000, discardVideo: 60_000,
};
export async function callFunction(name, data) {
  return attempt(async () => {
    const result = await httpsCallable(functions, name, { timeout: TIMEOUTS[name] ?? 70_000 })(data);
    return result.data;
  }, "The helper could not answer. Try again in a minute.");
}

// ---- monthly use ----

export const DEFAULT_LIMITS = Object.freeze({ flashPerMonth: 200, videosPerMonth: 5 });

export async function getLimits() {
  try {
    const snap = await getDoc(doc(db, "config", "limits"));
    const data = snap.exists() ? snap.data() : {};
    return {
      flashPerMonth: Number.isInteger(data.flashPerMonth) ? data.flashPerMonth : DEFAULT_LIMITS.flashPerMonth,
      videosPerMonth: Number.isInteger(data.videosPerMonth) ? data.videosPerMonth : DEFAULT_LIMITS.videosPerMonth,
    };
  } catch {
    return { ...DEFAULT_LIMITS };
  }
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

export async function setCoachSuspended(uid, suspended) {
  await attempt(() => updateDoc(doc(db, "coaches", uid), { suspended }));
}

export async function setClassStatus(code, status) {
  await attempt(() => updateDoc(doc(db, "classes", code), { status, updatedAt: serverTimestamp() }));
}

// null takes the page down; an earlier latest (as it was) puts it back
export async function adminSetLatest(code, latest) {
  await attempt(() => updateDoc(doc(db, "classes", code), { latest, updatedAt: serverTimestamp() }));
}

function stillPending(snap) {
  if (!snap.exists() || snap.data().status !== "pending") {
    throw new CloudError("decided", "This request has already been decided.");
  }
}

// Approve: a new class gets a new random code, its coach, and the request
// says which code; joining adds the coach to the class. All or nothing.
// Returns the class's code.
export async function approveRequest(request, adminUid) {
  const decided = (code) => ({ status: "approved", decidedAt: serverTimestamp(), decidedBy: adminUid, resultCode: code });
  const requestDoc = doc(db, "requests", request.id);
  if (request.kind === "join-class") {
    const code = request.classCode;
    await attempt(() => runTransaction(db, async (tx) => {
      stillPending(await tx.get(requestDoc));
      const link = await tx.get(doc(db, "classCoaches", code));
      if (!link.exists()) {
        throw new CloudError("no-class", `There is no class with the code ${formatCode(code)}. Decline this request instead.`);
      }
      tx.update(doc(db, "classCoaches", code), { uids: arrayUnion(request.uid) });
      tx.update(requestDoc, decided(code));
    }));
    return code;
  }
  for (let tries = 0; tries < 5; tries++) {
    const code = newClassCode();
    try {
      await runTransaction(db, async (tx) => {
        stillPending(await tx.get(requestDoc));
        if ((await tx.get(doc(db, "classes", code))).exists()) throw new CloudError("code-taken", "");
        tx.set(doc(db, "classes", code), {
          name: request.className, org: request.org ?? "", status: "active", latest: null,
          createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        });
        tx.set(doc(db, "classCoaches", code), { uids: [request.uid] });
        tx.update(requestDoc, decided(code));
      });
      return code;
    } catch (err) {
      if (err?.code !== "code-taken") throw friendly(err);
    }
  }
  throw new CloudError("code-taken", "No free class code was found. Try again.");
}

export async function declineRequest(request, adminUid) {
  await attempt(() => updateDoc(doc(db, "requests", request.id), {
    status: "declined", decidedAt: serverTimestamp(), decidedBy: adminUid,
  }));
}

export async function saveLimits(uid, { flashPerMonth, videosPerMonth }) {
  await attempt(() => setDoc(doc(db, "config", "limits"), {
    flashPerMonth, videosPerMonth, updatedAt: serverTimestamp(), updatedBy: uid,
  }, { merge: true }));
}
