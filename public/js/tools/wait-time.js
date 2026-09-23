// Wait's time maths, apart from the screen so it can be tested on its own
// (node tools/test-wait.mjs): what a saved wait means at a given moment, the
// time left in words, the disc's shape, and when the screen should look again.
// No DOM here, and no clock of its own: every function is given `now`.
//
// A wait is kept as the moment it ends, never as a countdown. A phone slows
// down or freezes a page in the background, so counted ticks would drift; the
// end time is right whenever the screen next looks, even after a reload.
//
// The saved state (localStorage "simplify-wait-v1"):
//   { endAt, pausedRemaining, total, sound, waitPics }
//     endAt            when a running wait ends (ms since 1970); after it,
//                      the wait is Done. null when idle or paused
//     pausedRemaining  ms left on a paused wait, else null
//     total            the whole wait in ms: the disc's full circle
//     sound            one soft chime at the end — off until someone turns it on
//     waitPics         up to 3 { picture, words } for "While I wait"

export const SECOND = 1000;
export const MINUTE = 60 * SECOND;

// the buttons, in order; their places never change
export const MINUTE_CHOICES = Object.freeze([1, 2, 5, 10, 15]);
export const MAX_MINUTES = 60; // the longest wait a link (#wait?m=) can ask for
export const MAX_PICS = 3;
export const MAX_WORDS = 40; // as the picture picker allows

// A Done shows when the wait is reopened — unless it ended longer ago than
// this, when it means nothing any more and the buttons show instead.
export const DONE_FOR = 60 * MINUTE;
// The chime and the buzz belong to the moment of the end: if the screen only
// sees the end later (the phone was in a pocket), Done shows without them.
export const SIGNAL_WITHIN = 3 * SECOND;

const IDLE = Object.freeze({ endAt: null, pausedRemaining: null, total: null });
export const EMPTY = Object.freeze({ ...IDLE, sound: false, waitPics: Object.freeze([]) });

const isNumber = (v) => typeof v === "number" && Number.isFinite(v);
const inRange = (v) => isNumber(v) && v > 0 && v <= MAX_MINUTES * MINUTE;

// ---------- the minutes asked for ----------

// "2" → 2. Out of range is brought into it (0 → 1, 90 → 60), a fraction is
// rounded; anything that isn't a number at all → null (no wait is started).
export function clampMinutes(value) {
  if (value == null || (typeof value === "string" && value.trim() === "")) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(MAX_MINUTES, Math.max(1, Math.round(n)));
}

// ---------- what a wait is doing ----------

// "idle" | "running" | "paused" | "done". A Done older than DONE_FOR is idle.
export function phaseOf(state, now) {
  if (state.pausedRemaining != null) return "paused";
  if (state.endAt == null) return "idle";
  if (state.endAt > now) return "running";
  return now - state.endAt < DONE_FOR ? "done" : "idle";
}

// ms left: never less than 0, never more than the whole wait (a clock put
// back must not make the disc bigger than full)
export function remainingOf(state, now) {
  if (state.pausedRemaining != null) return Math.min(state.pausedRemaining, state.total ?? Infinity);
  if (state.endAt == null) return 0;
  return Math.max(0, Math.min(state.endAt - now, state.total ?? Infinity));
}

// how much of the disc is still coloured: 1 at the start, 0 at the end
export function fractionOf(state, now) {
  const total = state.total;
  if (!(total > 0)) return 0;
  return Math.min(1, Math.max(0, remainingOf(state, now) / total));
}

// ---------- changing it (each returns a new state) ----------

export function startWait(state, minutes, now) {
  const total = minutes * MINUTE;
  return { ...state, endAt: now + total, pausedRemaining: null, total };
}

export function pauseWait(state, now) {
  if (phaseOf(state, now) !== "running") return state;
  // at least 1 ms, so a pause right at the end is still a pause
  return { ...state, endAt: null, pausedRemaining: Math.max(1, remainingOf(state, now)) };
}

export function resumeWait(state, now) {
  if (phaseOf(state, now) !== "paused") return state;
  return { ...state, endAt: now + state.pausedRemaining, pausedRemaining: null };
}

// idle again; sound and pictures stay
export function stopWait(state) {
  return { ...state, ...IDLE };
}

// What the header ✕ took away, so "Put it back" can restore it: the time
// that was left then (not the old end time — the seconds the toast was up
// don't count), and whether it was paused.
export function keptForUndo(state, now) {
  return { left: remainingOf(state, now), paused: phaseOf(state, now) === "paused", total: state.total };
}

export function restoreWait(state, kept, now) {
  if (!(kept?.left > 0) || !(kept.total > 0)) return state;
  return kept.paused
    ? { ...state, endAt: null, pausedRemaining: kept.left, total: kept.total }
    : { ...state, endAt: now + kept.left, pausedRemaining: null, total: kept.total };
}

// ---------- the time left, in words ----------

// Rounded up, so it never says less than is left: above a minute, whole
// minutes ("5 minutes" until exactly 4:00 is left); the last minute says
// "1 minute", then 10-second steps ("50 seconds" … "10 seconds").
// { number, unit, words }: the disc under reduced motion shows the number
// big and the unit under it; the line under the disc shows the words.
export function timeLeft(ms) {
  if (!(ms > 0)) return { number: 0, unit: "seconds", words: "0 seconds" }; // Done shows instead
  if (ms > MINUTE) {
    const n = Math.ceil(ms / MINUTE);
    return { number: n, unit: "minutes", words: `${n} minutes` };
  }
  const s = Math.ceil(ms / (10 * SECOND)) * 10;
  if (s >= 60) return { number: 1, unit: "minute", words: "1 minute" };
  return { number: s, unit: "seconds", words: `${s} seconds` };
}

// A screen reader hears the time left at most once a minute (a little
// early is allowed: timers fire a few ms either side of the minute).
export function mayAnnounce(lastAt, now) {
  return lastAt == null || now - lastAt >= MINUTE - SECOND;
}

// ---------- the disc ----------

// The coloured part, as an SVG path on a 200 × 200 box: a wedge from where
// the "hand" is now, clockwise round to 12 o'clock. As time goes the hand
// moves clockwise, like a clock's, and the colour ahead of it shrinks.
// Full: the whole circle. Nothing left: "" (no path).
export const DISC = Object.freeze({ cx: 100, cy: 100, r: 96 });

const round = (n) => Math.round(n * 100) / 100;

export function wedgePath(fraction, { cx, cy, r } = DISC) {
  if (!(fraction > 0)) return "";
  if (fraction >= 0.9999) {
    // two half circles: an arc can't start and end at the same point
    return `M${cx} ${cy - r}A${r} ${r} 0 1 1 ${cx} ${cy + r}A${r} ${r} 0 1 1 ${cx} ${cy - r}Z`;
  }
  const from = (1 - fraction) * 2 * Math.PI; // angle of the hand, clockwise from 12 o'clock
  const x = round(cx + r * Math.sin(from));
  const y = round(cy - r * Math.cos(from));
  const large = fraction > 0.5 ? 1 : 0;
  return `M${cx} ${cy}L${x} ${y}A${r} ${r} 0 ${large} 1 ${cx} ${cy - r}Z`;
}

// ---------- when to look again ----------

// ms until the screen should update: just after the words next change (a
// minute boundary above a minute, a 10-second one below, and the end), and
// often enough for the disc to move smoothly — about half a degree a step,
// 10 times a second at most. Under reduced motion only the words change.
// Never more than a second, so a changed clock or a late timer is soon put
// right. null once the wait is over.
export function nextDelay(ms, total, { still = false } = {}) {
  if (!(ms > 0)) return null;
  const step = ms > MINUTE ? MINUTE : 10 * SECOND;
  const toWords = ((ms - 1) % step) + 1 + 10; // just past the boundary
  const toMove = still ? SECOND : Math.min(SECOND, Math.max(100, (total || 0) / 720));
  return Math.round(Math.max(20, Math.min(toWords, toMove, SECOND)));
}

// Whether the end should chime and buzz: only when it is seen as it happens.
export function signalNow(state, now) {
  return state.endAt != null && now >= state.endAt && now - state.endAt <= SIGNAL_WITHIN;
}

// ---------- what was saved ----------

// Whatever is stored — an older shape, a hand edit, junk — comes back as a
// usable state; a bad part falls back to idle, never an error.
// isPicture(id): whether the picture set has that id (pictures.js).
export function cleanState(raw, isPicture = () => false) {
  const s = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  let total = inRange(s.total) ? s.total : null;
  let endAt = isNumber(s.endAt) ? s.endAt : null;
  let pausedRemaining = inRange(s.pausedRemaining) ? s.pausedRemaining : null;
  if (pausedRemaining != null) endAt = null; // paused wins over a stray end time
  const waiting = endAt != null || pausedRemaining != null;
  if (!waiting || total == null || (pausedRemaining != null && pausedRemaining > total)) {
    total = null;
    endAt = null;
    pausedRemaining = null;
  }
  const waitPics = (Array.isArray(s.waitPics) ? s.waitPics : [])
    .map((p) => cleanPic(p, isPicture))
    .filter(Boolean)
    .slice(0, MAX_PICS);
  return { endAt, pausedRemaining, total, sound: s.sound === true, waitPics };
}

// { picture, words } with a known picture or some words (or both), or null
export function cleanPic(p, isPicture = () => false) {
  if (!p || typeof p !== "object") return null;
  const picture = typeof p.picture === "string" && isPicture(p.picture) ? p.picture : null;
  const words = typeof p.words === "string" ? p.words.trim().replace(/\s+/g, " ").slice(0, MAX_WORDS) : "";
  return picture || words ? { picture, words } : null;
}
