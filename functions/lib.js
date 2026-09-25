// Shared by every callable: the Admin SDK, plain-message errors, the "is this a
// coach of this class?" check, input cleaning, and the monthly usage counters.

import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { HttpsError } from "firebase-functions/v2/https";

export const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "simplify-special";
export const BUCKET = process.env.SIMPLIFY_BUCKET || "simplify-special.firebasestorage.app";

if (!getApps().length) initializeApp();
export const db = getFirestore();
export const bucket = () => getStorage().bucket(BUCKET);
export { FieldValue };

// ---------- errors the coach app shows as they are ----------

export function fail(code, message) {
  throw new HttpsError(code, message);
}

// ---------- class codes ----------

// 31 characters, no look-alikes (0 1 I L O); stored without dashes
export const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

// forgiving: upper-case, then drop every character that is not in ALPHABET
export function normaliseCode(input) {
  return [...String(input ?? "").toUpperCase()].filter((c) => ALPHABET.includes(c)).join("");
}

// exactly 9 characters from ALPHABET, as stored
export const isClassCode = (code) => typeof code === "string" && new RegExp(`^[${ALPHABET}]{9}$`).test(code);

// ids the functions accept for pages, pictures, videos and plans (also safe in paths)
export function cleanId(input, what) {
  const id = String(input ?? "");
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) fail("invalid-argument", `That ${what} was not found.`);
  return id;
}

// ---------- who is calling ----------

// Signed in; has a coach profile the admin has approved and not suspended;
// listed for the class; and the class is active. Returns what the callable needs.
export async function requireClassCoach(request, rawCode) {
  const uid = request.auth?.uid;
  if (!uid) fail("unauthenticated", "Please sign in again.");
  const code = normaliseCode(rawCode);
  if (code.length !== 9) fail("invalid-argument", "That class code is not right.");
  const [coach, members, klass] = await db.getAll(
    db.doc(`coaches/${uid}`),
    db.doc(`classCoaches/${code}`),
    db.doc(`classes/${code}`),
  );
  if (!coach.exists) fail("permission-denied", "Fill in About you first.");
  if (coach.get("suspended") === true) fail("permission-denied", "Your account is paused. Ask the admin.");
  if (coach.get("status") !== "approved") {
    fail("permission-denied", coach.get("status") === "declined"
      ? "The admin has not approved you as a coach. Contact the admin."
      : "The admin has not approved you yet.");
  }
  const uids = members.get("uids");
  if (!klass.exists || !Array.isArray(uids) || !uids.includes(uid)) {
    fail("permission-denied", "You are not a coach of this class.");
  }
  if (klass.get("status") !== "active") fail("failed-precondition", "This class is paused by the admin.");
  return { uid, code };
}

// ---------- input from the coach app ----------

// A string field: trimmed; over `max` characters is refused with a plain message
// (the coach app limits its boxes, so this only stops a misbehaving client).
export function cleanText(input, max, tooLong) {
  const text = typeof input === "string" ? input.replace(/\r\n?/g, "\n").trim() : "";
  if (text.length > max) fail("invalid-argument", tooLong);
  return text;
}

// Answers to the helper's earlier questions: up to 3, each { question, answer }
// (or just the answer as a string). Anything else is dropped, never refused.
export function cleanAnswers(input) {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 3).map((a) => {
    if (typeof a === "string") return { question: "", answer: a.trim().slice(0, 300) };
    if (a && typeof a === "object") {
      return {
        question: String(a.question ?? "").trim().slice(0, 200),
        answer: String(a.answer ?? "").trim().slice(0, 300),
      };
    }
    return null;
  }).filter((a) => a && a.answer);
}

// how many letters and digits: "", "?" and "ok" are too short to act on
export const meaningfulLength = (text) => (String(text).match(/[\p{L}\p{N}]/gu) ?? []).length;

// ---------- monthly limits and usage ----------

export const DEFAULT_LIMITS = { flashPerMonth: 200, videosPerMonth: 5 };

// The Singapore month (UTC+8, no daylight saving) as "YYYY-MM"
export function monthKey(now = Date.now()) {
  return new Date(now + 8 * 3600 * 1000).toISOString().slice(0, 7);
}

export const usageRef = (uid, month) => db.doc(`usage/${uid}_${month}`);
const limitsRef = () => db.doc("config/limits");

// config/limits, with the defaults for a missing doc or a missing / bad field
export function limitsFrom(snap) {
  const count = (v, fallback) => (Number.isInteger(v) && v >= 0 ? v : fallback);
  const d = snap?.exists ? snap.data() : {};
  return {
    flashPerMonth: count(d.flashPerMonth, DEFAULT_LIMITS.flashPerMonth),
    videosPerMonth: count(d.videosPerMonth, DEFAULT_LIMITS.videosPerMonth),
  };
}

const LIMIT_FIELD = { flash: "flashPerMonth", video: "videosPerMonth" };
export const LIMIT_REACHED = {
  flash: (limit) => `You have used all ${limit} AI requests for this month.`,
  video: (limit) => `You have made all ${limit} videos for this month.`,
};

// This month's count and limit, without using anything (for answers that cost nothing).
export async function peekUsage(uid, kind) {
  const month = monthKey();
  const [usage, limits] = await db.getAll(usageRef(uid, month), limitsRef());
  return { used: usage.get(kind) ?? 0, limit: limitsFrom(limits)[LIMIT_FIELD[kind]] };
}

// Count one use BEFORE the model is called, inside a transaction, so two requests
// at once can never both take the last one. Returns a ticket for refund().
export async function reserve(uid, kind) {
  const month = monthKey();
  const ref = usageRef(uid, month);
  return db.runTransaction(async (tx) => {
    const [usage, limits] = await tx.getAll(ref, limitsRef());
    const limit = limitsFrom(limits)[LIMIT_FIELD[kind]];
    const used = usage.get(kind) ?? 0;
    if (used >= limit) fail("resource-exhausted", LIMIT_REACHED[kind](limit));
    tx.set(ref, { [kind]: used + 1, uid, month }, { merge: true });
    return { ref, kind, used: used + 1, limit };
  });
}

// Give a use back (the model call failed): to the same month it was taken from.
export async function refund(ticket) {
  await ticket.ref.set({ [ticket.kind]: FieldValue.increment(-1) }, { merge: true });
  ticket.used -= 1;
}

// A declined request still counts as a Flash request; it is also counted here.
export async function countDecline(ticket) {
  await ticket.ref.set({ declined: FieldValue.increment(1) }, { merge: true });
}
