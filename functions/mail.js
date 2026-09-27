// Email to coaches and admins (docs/platform/security.md#email), sent the way
// whiz.coach sends its own: a function writes one document per message,
//
//   mail/{id} = { to, message: { subject, html }, createdAt }
//
// and the Firebase extension "Trigger Email from Firestore"
// (firestore-send-email, set up by hand: docs/operations/cloud-project.md#email)
// sends it through Gmail as contact@whiz.coach, then writes back
// delivery.state (SUCCESS or ERROR). Only the functions write mail/: the rules
// refuse every client, or anyone could send email in Simplify's name.
//
// Two triggers use it:
//   coachMailHandler    a coach now waits for approval → each admin
//   requestMailHandler  a coach's request is new → each admin;
//                       an admin decided it → that coach
//
// Learners have no account and no address, so they are never emailed. What an
// admin wrote about how they checked someone, or why, is never in an email:
// the coach is told the decision only, as in the coach app.

import { db, FieldValue, isClassCode } from "./lib.js";

export const SITE = "https://simplify.whiz.coach";
const COACH_APP = `${SITE}/coach/`;
const ADMIN_SCREEN = `${SITE}/coach/#admin`;

// Anyone with a Google account can fill in About you, so the emails a sign-up
// sets off are capped each day: the Gmail account that sends them is shared
// with whiz.coach (about 2,000 recipients a day for all of it). Past the cap
// each admin is told once that day, and the count on the Admin link is always right.
export const ADMIN_MAILS_PER_DAY = 50;

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// The Singapore day (UTC+8, no daylight saving) as "YYYY-MM-DD"
export function dayKey(now = Date.now()) {
  return new Date(now + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

const isAddress = (value) => typeof value === "string" && /^[^\s@]+@[^\s@]+$/.test(value);
// one line of someone's own text: no control or direction-changing characters
// (they could reorder what an admin reads), spaces collapsed
const plain = (text, max) => String(text ?? "").replace(/[\p{Cc}\p{Bidi_Control}]/gu, " ").replace(/\s+/g, " ").trim().slice(0, max);
const millis = (stamp) => (typeof stamp?.toMillis === "function" ? stamp.toMillis() : null);
const alreadyQueued = (err) => err?.code === 6 || err?.code === "already-exists";
const letter = (to, subject, html) => ({ to, message: { subject, html }, createdAt: FieldValue.serverTimestamp() });

// "K7M3RQP9T" → "K7M-3RQ-P9T", as the coach app shows a code
const showCode = (code) => (isClassCode(code) ? code.match(/.{3}/g).join("-") : "");
const link = (url) => `<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`;
const paragraphs = (...lines) => lines.map((line) => `<p>${line}</p>`).join("\n");
const FOR_ADMINS = "You get this email because you are an admin of Simplify.";
const FOR_COACHES = "You get this email because you asked the admin in the Simplify coach app.";

// Queue one email once: `id` names the event it tells about, so a trigger that
// runs twice for one event (Eventarc can deliver it again) still sends one.
// True when queued; false with no address, or when it was queued before.
export async function queueEmailOnce(id, to, subject, html) {
  if (!isAddress(to)) return false;
  try {
    await db.doc(`mail/${id}`).create(letter(to, subject, html));
    return true;
  } catch (err) {
    if (alreadyQueued(err)) return false;
    throw err;
  }
}

// Every admin's address. admins/{uid} holds none, but every admin has a coach
// profile (About you comes first for everyone), and its email is their Google one.
export async function adminAddresses() {
  const admins = await db.collection("admins").get();
  if (admins.empty) return [];
  const profiles = await db.getAll(...admins.docs.map((admin) => db.doc(`coaches/${admin.id}`)));
  return profiles.filter((p) => p.exists && isAddress(p.get("email"))).map((p) => ({ uid: p.id, email: p.get("email") }));
}

const CAPPED_SUBJECT = "More is waiting on Simplify";
const CAPPED_HTML = paragraphs(
  "So many coaches and requests are waiting today that Simplify has stopped emailing about them until tomorrow.",
  `Everything that waits is on the Admin screen:<br />${link(ADMIN_SCREEN)}`,
  FOR_ADMINS,
);

// One email to each admin about one thing that waits: to all of them or to
// none, once (`key` names the thing), and only within the day's cap. The
// first time the cap stops one, each admin is told instead, once that day, so
// a quiet inbox is not taken to mean that nothing waits.
async function tellAdmins(key, subject, html) {
  const admins = await adminAddresses();
  if (!admins.length) return { queued: 0 };
  const day = dayKey();
  const count = db.doc(`mailCounts/${day}`);
  try {
    return await db.runTransaction(async (tx) => {
      const today = await tx.get(count);
      const sent = today.get("admin") ?? 0;
      if (sent + admins.length > ADMIN_MAILS_PER_DAY) {
        const notified = today.get("capped") !== true;
        if (notified) {
          for (const admin of admins) tx.create(db.doc(`mail/capped-${day}-${admin.uid}`), letter(admin.email, CAPPED_SUBJECT, CAPPED_HTML));
          tx.set(count, { capped: true, day }, { merge: true });
        }
        console.warn(JSON.stringify({ event: "mail capped", key, day, sent, notified }));
        return { queued: 0, capped: true, notified };
      }
      for (const admin of admins) tx.create(db.doc(`mail/${key}-${admin.uid}`), letter(admin.email, subject, html));
      tx.set(count, { admin: sent + admins.length, day }, { merge: true });
      return { queued: admins.length };
    });
  } catch (err) {
    if (alreadyQueued(err)) return { queued: 0 };
    throw err;
  }
}

// ---------- a coach waits for approval ----------

// onDocumentWritten("coaches/{uid}"): a coach now waits for the admin, in
// exactly the coach's own two ways into "pending" (firestore.rules): a new
// profile, or a declined coach asking again (a new reappliedAt). Anything else,
// including an admin, a console edit or a migration putting someone back to
// waiting, sends nothing.
export async function coachMailHandler(event) {
  const uid = event.params?.uid;
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!uid || after?.status !== "pending") return null;
  const again = !!before;
  const askedAgain = before?.status === "declined" && millis(after.reappliedAt) !== millis(before.reappliedAt);
  const asked = again ? (askedAgain ? millis(after.reappliedAt) : null) : millis(after.createdAt);
  if (asked == null) return null;
  // the name is the coach's own words, so it is quoted in the body and kept
  // out of the subject, where it could pass for a message from Simplify
  const name = plain(after.name, 60) || "A coach";
  const result = await tellAdmins(
    `coach-${uid}-${asked}`,
    again ? "A coach asked again to be approved" : "A coach is waiting for your approval",
    paragraphs(
      again
        ? `"${escapeHtml(name)}" was not approved before, and has asked again.`
        : `"${escapeHtml(name)}" filled in About you and is waiting for an admin's approval.`,
      `Approve only after checking who they are and where they work:<br />${link(ADMIN_SCREEN)}`,
      FOR_ADMINS,
    ),
  );
  console.log(JSON.stringify({ event: "coachMail", uid, again, ...result }));
  return { kind: again ? "coach-asked-again" : "coach-waiting", ...result };
}

// ---------- a coach's request ----------

async function coachOf(uid) {
  const snap = typeof uid === "string" && uid ? await db.doc(`coaches/${uid}`).get() : null;
  return { name: plain(snap?.get("name"), 60) || "A coach", email: snap?.get("email") };
}

// a new request → each admin (a request from before coaches made their own
// classes, "new-class", is never made any more, so it sends nothing)
async function requestWaiting(id, request) {
  const { name } = await coachOf(request.uid);
  let subject;
  let what;
  if (request.kind === "join-class") {
    subject = "A coach asked to join a class";
    what = `"${escapeHtml(name)}" asked to join the class ${escapeHtml(showCode(request.classCode))}. `
      + "Check that they really coach that class before you approve.";
  } else if (request.kind === "more-videos") {
    subject = "A coach asked for more videos a month";
    what = `"${escapeHtml(name)}" asked for more videos a month.`;
  } else {
    return null;
  }
  const result = await tellAdmins(`request-${id}`, subject, paragraphs(what, `Decide on the Admin screen:<br />${link(ADMIN_SCREEN)}`, FOR_ADMINS));
  console.log(JSON.stringify({ event: "requestMail", request: id, to: "admins", ...result }));
  return { kind: `${request.kind}-waiting`, ...result };
}

// an admin's decision → the coach who asked. A declined join names only the
// code the coach typed, not the class, which may be someone else's.
async function requestDecided(id, request) {
  const approved = request.status === "approved";
  let subject;
  let lines;
  if (request.kind === "join-class") {
    const code = approved ? request.resultCode ?? request.classCode : request.classCode;
    if (approved) {
      const klass = isClassCode(code) ? await db.doc(`classes/${code}`).get() : null;
      const className = plain(klass?.get("name"), 30) || "the class";
      subject = `You can now open ${className}`;
      lines = [
        `The admin approved your request to join ${escapeHtml(className)} (${escapeHtml(showCode(code))}). It is on My classes now:<br />${link(COACH_APP)}`,
      ];
    } else {
      subject = "Your request to join a class was not approved";
      lines = [
        `The admin did not approve your request to join the class ${escapeHtml(showCode(code))}.`,
        "If you think something was missed, please contact the admin.",
      ];
    }
  } else if (request.kind === "more-videos") {
    if (approved) {
      // the coach app always writes the number; a decision made another way may not
      const perMonth = Number.isInteger(request.videosPerMonth) ? request.videosPerMonth : null;
      subject = perMonth == null ? "You can make more videos a month now" : `You can make ${perMonth} videos a month now`;
      lines = [
        perMonth == null
          ? "The admin approved your request for more videos a month."
          : `The admin gave you ${perMonth} videos a month. It stays that way every month until the admin changes it.`,
        link(COACH_APP),
      ];
    } else {
      subject = "Your request for more videos was not approved";
      lines = [
        "The admin did not give you more videos a month this time.",
        "You can ask again from the video panel when you have 3 or fewer videos left in a month.",
      ];
    }
  } else {
    return null;
  }
  const coach = await coachOf(request.uid);
  const queued = await queueEmailOnce(`decided-${id}`, coach.email, subject, paragraphs("Hello,", ...lines, FOR_COACHES));
  console.log(JSON.stringify({ event: "requestMail", request: id, to: "coach", status: request.status, queued }));
  return { kind: `${request.kind}-${request.status}`, queued: queued ? 1 : 0 };
}

// onDocumentWritten("requests/{id}"): a coach's new request → each admin; an
// admin's decision on it (a request is decided once) → that coach.
export async function requestMailHandler(event) {
  const id = event.params?.id;
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!id || !after) return null;
  if (!before && after.status === "pending") return requestWaiting(id, after);
  if (before?.status === "pending" && (after.status === "approved" || after.status === "declined")) {
    return requestDecided(id, after);
  }
  return null;
}
