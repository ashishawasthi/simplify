// Time sums' arithmetic: plain functions, no DOM, so node tools/test-time-sums.mjs
// can pin every answer. The screen is in time-sums.js, beside this file.
//
// A time of day is a number of minutes after midnight, 0–1439, and is read
// from and written to an <input type="time"> as "HH:MM" (24-hour, which is
// what the input's value always is, whatever the device shows). A time that
// can't be read is null: the screen then gives no answer, never an error.
//
// Times are said as Singapore says them: "3:30 pm", "12:05 am", "12 noon"
// stays "12:00 pm" (literal, as a clock shows it). An amount of time is
// "1 hour 20 minutes", "45 minutes", "2 hours", "0 minutes".

export const DAY = 24 * 60;
export const MAX_ADD = 24 * 60 - 1; // what can be added: under a day ("tomorrow" at most)

// "HH:MM" (or "H:MM", seconds ignored) → minutes, or null
export function parseTime(value) {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(String(value ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

// minutes → "HH:MM", for the input's value
export function inputValue(minutes) {
  const t = ((Math.round(minutes) % DAY) + DAY) % DAY;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

// a Date → minutes after midnight, in the device's own time
export function minutesOf(date) {
  return date.getHours() * 60 + date.getMinutes();
}

// minutes → "3:30 pm"
export function clockText(minutes) {
  const t = ((Math.round(minutes) % DAY) + DAY) % DAY;
  const h = Math.floor(t / 60);
  return `${h % 12 || 12}:${String(t % 60).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

// minutes → "1 hour 20 minutes"
export function durationText(minutes) {
  const t = Math.max(0, Math.round(minutes));
  const h = Math.floor(t / 60);
  const m = t % 60;
  const hours = h ? `${h} ${h === 1 ? "hour" : "hours"}` : "";
  const mins = m || !h ? `${m} ${m === 1 ? "minute" : "minutes"}` : "";
  return [hours, mins].filter(Boolean).join(" ");
}

// A number typed into the hours or minutes box: digits only, forgiven —
// "", "abc" → 0; never below 0.
export function wholeNumber(value) {
  const digits = String(value ?? "").replace(/\D/g, "").slice(0, 4);
  return digits ? Number(digits) : 0;
}

// How long from start until end (both minutes of a day). An end earlier than
// the start is tomorrow's. → { minutes, tomorrow }, or null if either is missing.
export function howLongUntil(start, end) {
  if (start == null || end == null) return null;
  const minutes = (end - start + DAY) % DAY;
  return { minutes, tomorrow: end < start };
}

// What time it will be after adding minutes to start. → { minutes (of the
// day), tomorrow }, or null if start is missing. The amount is capped at a
// day less a minute, so the answer is today or tomorrow, never further.
export function timeAfter(start, add) {
  if (start == null) return null;
  const amount = Math.min(MAX_ADD, Math.max(0, Math.round(add || 0)));
  const total = start + amount;
  return { minutes: total % DAY, tomorrow: total >= DAY, added: amount };
}

// The answer panel for "How long until?" (the result.js shape), or null
export function untilAnswer(start, end) {
  const r = howLongUntil(start, end);
  if (!r) return null;
  return {
    tone: "answer",
    headline: durationText(r.minutes),
    subline: `${clockText(start)} to ${clockText(end)}${r.tomorrow ? " tomorrow" : ""}`,
    badge: durationText(r.minutes),
  };
}

// The answer panel for "What time after?", or null
export function afterAnswer(start, add) {
  const r = timeAfter(start, add);
  if (!r) return null;
  return {
    tone: "answer",
    headline: `${clockText(r.minutes)}${r.tomorrow ? " tomorrow" : ""}`,
    subline: `${durationText(r.added)} after ${clockText(start)}`,
    badge: clockText(r.minutes),
  };
}

// The quick amounts for "What time after?", in minutes
export const QUICK = Object.freeze([5, 10, 15, 30, 60, 120]);
export const quickText = (m) => (m < 60 ? `${m} min` : durationText(m));
