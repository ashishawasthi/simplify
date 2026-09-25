// The push signal for My class (docs/learner/my-class.md#hearing-about-a-new-page):
// whenever a class document changes, the Realtime Database node
// signals/<code> is set to what learners' devices need to know — that the
// page changed, and whether the coach asked for it to be shown at once:
//
//   { at: <latest.publishedAt in ms>, force: <true | false> }
//
// or removed, when the class has no page (unpublished, taken down) or is
// paused. Nothing else is ever in it: no page, no name, nothing about a
// learner. Devices listen to their own class's node with a plain
// EventSource (anyone may read one node by its exact code, nobody may list
// them or write — database.rules.json) and read the page itself from
// Firestore as before.

import { getDatabaseWithUrl } from "firebase-admin/database";
import { db, isClassCode } from "./lib.js";

export const DATABASE_URL = process.env.SIMPLIFY_DATABASE_URL
  || "https://simplify-special-default-rtdb.asia-southeast1.firebasedatabase.app";

// the signal for a class document's data (as the Admin SDK reads it), or null
export function signalFor(data) {
  const latest = data?.latest;
  if (data?.status !== "active" || !latest || typeof latest.publishedAt?.toMillis !== "function") return null;
  return { at: latest.publishedAt.toMillis(), force: latest.force === true };
}

export const sameSignal = (a, b) => (a?.at ?? null) === (b?.at ?? null) && (a?.force ?? false) === (b?.force ?? false);

// onDocumentWritten("classes/{code}"). A change that leaves the signal as it
// was (a new name, the admin's own fields) writes nothing. Otherwise the
// class is read again, so two quick changes whose triggers run out of order
// still end with the signal of the class as it is now.
export async function classSignalHandler(event) {
  const code = event.params?.code;
  if (!isClassCode(code)) return null;
  const before = signalFor(event.data?.before?.data());
  const after = signalFor(event.data?.after?.data());
  if (sameSignal(before, after)) return null;
  const now = signalFor((await db.doc(`classes/${code}`).get()).data());
  await getDatabaseWithUrl(DATABASE_URL).ref(`signals/${code}`).set(now);
  console.log(JSON.stringify({ event: "classSignal", code, at: now?.at ?? null, force: now?.force ?? false }));
  return now;
}
