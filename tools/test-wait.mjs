// Wait's time maths (public/js/tools/wait-time.js): the phases of a saved
// wait, the time left in words, the disc's shape, when the screen looks
// again, and what a junk saved state comes back as. No dependencies, no
// runner:
//
//   node tools/test-wait.mjs

import {
  SECOND, MINUTE, MINUTE_CHOICES, DONE_FOR, EMPTY,
  clampMinutes, phaseOf, remainingOf, fractionOf, startWait, pauseWait, resumeWait, stopWait,
  keptForUndo, restoreWait, timeLeft, mayAnnounce, wedgePath, nextDelay, signalNow, cleanState,
} from "../public/js/tools/wait-time.js";

const T = 1_800_000_000_000; // a fixed "now"
const words = (ms) => timeLeft(ms).words;
const big = (ms) => `${timeLeft(ms).number} ${timeLeft(ms).unit}`;
const running = (left, total = 5 * MINUTE) => ({ ...EMPTY, endAt: T + left, total });
const paused = (left, total = 5 * MINUTE) => ({ ...EMPTY, pausedRemaining: left, total });
const show = (s) => JSON.stringify(s);
const known = (id) => ["read", "music", "draw"].includes(id);

// the words, walked second by second through a whole 2-minute wait
function wordsOfWait(minutes) {
  const seen = [];
  for (let left = minutes * MINUTE; left > 0; left -= SECOND) {
    if (seen.at(-1) !== words(left)) seen.push(words(left));
  }
  return seen.join(" → ");
}

const cases = [
  // ---- the buttons ----
  ["the minute buttons", MINUTE_CHOICES.join(), "1,2,5,10,15"],

  // ---- m in the address (#wait?m=2) ----
  ["m=2", clampMinutes("2"), 2],
  ["m=15", clampMinutes("15"), 15],
  ["m=0 → 1", clampMinutes("0"), 1],
  ["m=-5 → 1", clampMinutes("-5"), 1],
  ["m=61 → 60", clampMinutes("61"), 60],
  ["m=1e9 → 60", clampMinutes("1e9"), 60],
  ["m=2.4 → 2", clampMinutes("2.4"), 2],
  ["m=2.6 → 3", clampMinutes("2.6"), 3],
  ["m=0.2 → 1", clampMinutes("0.2"), 1],
  ["m=abc: no wait", clampMinutes("abc"), null],
  ["m=: no wait", clampMinutes(""), null],
  ["m=  : no wait", clampMinutes("  "), null],
  ["m=Infinity: no wait", clampMinutes("Infinity"), null],
  ["no m: no wait", clampMinutes(null), null],
  ["a number, not a string", clampMinutes(5), 5],

  // ---- the time left in words: rounded up, never less than is left ----
  ["15:00", words(15 * MINUTE), "15 minutes"],
  ["14:59", words(15 * MINUTE - SECOND), "15 minutes"],
  ["4:01", words(4 * MINUTE + SECOND), "5 minutes"],
  ["4:00", words(4 * MINUTE), "4 minutes"],
  ["2:00", words(2 * MINUTE), "2 minutes"],
  ["1:00.001", words(MINUTE + 1), "2 minutes"],
  ["1:00 → 1 minute", words(MINUTE), "1 minute"],
  ["0:51", words(51 * SECOND), "1 minute"],
  ["0:50 → seconds", words(50 * SECOND), "50 seconds"],
  ["0:41", words(41 * SECOND), "50 seconds"],
  ["0:40", words(40 * SECOND), "40 seconds"],
  ["0:10", words(10 * SECOND), "10 seconds"],
  ["0:00.001", words(1), "10 seconds"],
  ["60:00", words(60 * MINUTE), "60 minutes"],
  ["big number, minutes", big(4 * MINUTE + 1), "5 minutes"],
  ["big number, 1 minute", big(MINUTE), "1 minute"],
  ["big number, seconds", big(35 * SECOND), "40 seconds"],
  ["a whole 2-minute wait", wordsOfWait(2),
    "2 minutes → 1 minute → 50 seconds → 40 seconds → 30 seconds → 20 seconds → 10 seconds"],
  ["a whole 5-minute wait", wordsOfWait(5),
    "5 minutes → 4 minutes → 3 minutes → 2 minutes → 1 minute → 50 seconds → 40 seconds → 30 seconds → " +
    "20 seconds → 10 seconds"],

  // ---- phases ----
  ["nothing saved: idle", phaseOf(EMPTY, T), "idle"],
  ["running", phaseOf(running(MINUTE), T), "running"],
  ["paused", phaseOf(paused(MINUTE), T), "paused"],
  ["just ended: done", phaseOf(running(0), T), "done"],
  ["ended 59 minutes ago: done", phaseOf(running(-59 * MINUTE), T), "done"],
  ["ended an hour ago: idle again", phaseOf(running(-DONE_FOR), T), "idle"],

  // ---- remaining and the disc's fraction ----
  ["remaining, running", remainingOf(running(90 * SECOND), T), 90 * SECOND],
  ["remaining, paused", remainingOf(paused(90 * SECOND), T), 90 * SECOND],
  ["remaining, done", remainingOf(running(-5 * SECOND), T), 0],
  ["remaining, idle", remainingOf(EMPTY, T), 0],
  ["clock put back: never more than the whole wait", remainingOf(running(9 * MINUTE, 5 * MINUTE), T), 5 * MINUTE],
  ["fraction at the start", fractionOf(running(5 * MINUTE), T), 1],
  ["fraction half way", fractionOf(running(150 * SECOND), T), 0.5],
  ["fraction at the end", fractionOf(running(-SECOND), T), 0],
  ["fraction, clock put back", fractionOf(running(9 * MINUTE), T), 1],

  // ---- start, pause, go on, stop, put it back ----
  ["start 2", show(startWait(EMPTY, 2, T)), show({ ...EMPTY, endAt: T + 2 * MINUTE, pausedRemaining: null, total: 2 * MINUTE })],
  ["start keeps sound and pictures",
    show(startWait({ ...EMPTY, sound: true, waitPics: [{ picture: "read", words: "Read" }] }, 1, T)),
    show({ endAt: T + MINUTE, pausedRemaining: null, total: MINUTE, sound: true, waitPics: [{ picture: "read", words: "Read" }] })],
  ["start over a running wait", show(startWait(running(MINUTE), 10, T)),
    show({ ...EMPTY, endAt: T + 10 * MINUTE, pausedRemaining: null, total: 10 * MINUTE })],
  ["pause", show(pauseWait(running(100 * SECOND), T)), show({ ...EMPTY, endAt: null, total: 5 * MINUTE, pausedRemaining: 100 * SECOND })],
  ["pause at the very end keeps 1 ms", pauseWait(running(0.4), T).pausedRemaining, 1],
  ["pause when paused: unchanged", show(pauseWait(paused(MINUTE), T)), show(paused(MINUTE))],
  ["pause when done: unchanged", show(pauseWait(running(-SECOND), T)), show(running(-SECOND))],
  ["go on", show(resumeWait(paused(100 * SECOND), T + 7 * SECOND)),
    show({ ...EMPTY, pausedRemaining: null, total: 5 * MINUTE, endAt: T + 107 * SECOND })],
  ["go on when running: unchanged", show(resumeWait(running(MINUTE), T)), show(running(MINUTE))],
  ["pause, wait, go on: the same time left", remainingOf(resumeWait(pauseWait(running(3 * MINUTE), T), T + 99 * SECOND), T + 99 * SECOND),
    3 * MINUTE],
  ["stop", show(stopWait({ ...running(MINUTE), sound: true })),
    show({ ...EMPTY, endAt: null, pausedRemaining: null, total: null, sound: true })],
  ["✕ keeps the time left", show(keptForUndo(running(200 * SECOND), T)), show({ left: 200 * SECOND, paused: false, total: 5 * MINUTE })],
  ["✕ on a paused wait", show(keptForUndo(paused(80 * SECOND), T)), show({ left: 80 * SECOND, paused: true, total: 5 * MINUTE })],
  ["put it back: the time that was left, from now",
    remainingOf(restoreWait(stopWait(running(200 * SECOND)), keptForUndo(running(200 * SECOND), T), T + 5 * SECOND), T + 5 * SECOND),
    200 * SECOND],
  ["put it back: running again", phaseOf(restoreWait(EMPTY, { left: 200 * SECOND, paused: false, total: 5 * MINUTE }, T), T), "running"],
  ["put it back: paused again", show(restoreWait(EMPTY, { left: 80 * SECOND, paused: true, total: 5 * MINUTE }, T)),
    show({ ...EMPTY, endAt: null, pausedRemaining: 80 * SECOND, total: 5 * MINUTE })],
  ["put back nothing: unchanged", show(restoreWait(EMPTY, { left: 0, paused: false, total: 5 * MINUTE }, T)), show(EMPTY)],

  // ---- screen readers: at most once a minute ----
  ["first time: yes", mayAnnounce(null, T), true],
  ["10 s later: no", mayAnnounce(T, T + 10 * SECOND), false],
  ["a minute later (a timer a little early): yes", mayAnnounce(T, T + MINUTE - 5), true],
  ["a minute later: yes", mayAnnounce(T, T + MINUTE), true],

  // ---- the disc ----
  ["full", wedgePath(1), "M100 4A96 96 0 1 1 100 196A96 96 0 1 1 100 4Z"],
  ["three quarters: from 3 o'clock round to 12", wedgePath(0.75), "M100 100L196 100A96 96 0 1 1 100 4Z"],
  ["half: from 6 o'clock", wedgePath(0.5), "M100 100L100 196A96 96 0 0 1 100 4Z"],
  ["a quarter: from 9 o'clock", wedgePath(0.25), "M100 100L4 100A96 96 0 0 1 100 4Z"],
  ["a sliver", wedgePath(0.01), "M100 100L93.97 4.19A96 96 0 0 1 100 4Z"],
  ["nothing left", wedgePath(0), ""],
  ["below nothing", wedgePath(-1), ""],
  ["not a number", wedgePath(NaN), ""],

  // ---- when the screen looks again ----
  ["1-minute wait: 10 times a second", nextDelay(MINUTE, MINUTE), 100],
  ["5-minute wait: half a degree", nextDelay(270 * SECOND, 5 * MINUTE), 417],
  ["15-minute wait: once a second", nextDelay(14 * MINUTE, 15 * MINUTE), 1000],
  ["just before a minute boundary", nextDelay(4 * MINUTE + 30, 15 * MINUTE), 40],
  ["just before a 10-second boundary", nextDelay(40 * SECOND + 5, 15 * MINUTE), 20],
  ["reduced motion: when the words change", nextDelay(4 * MINUTE + 300, 5 * MINUTE, { still: true }), 310],
  ["reduced motion: still once a second at most", nextDelay(270 * SECOND, 5 * MINUTE, { still: true }), 1000],
  ["over: no more", nextDelay(0, MINUTE), null],

  // ---- the end: chime and buzz only as it happens ----
  ["at the end", signalNow(running(0), T), true],
  ["2 s after", signalNow(running(-2 * SECOND), T), true],
  ["10 s after (back from a pocket)", signalNow(running(-10 * SECOND), T), false],
  ["before the end", signalNow(running(SECOND), T), false],
  ["paused", signalNow(paused(SECOND), T), false],

  // ---- what was saved ----
  ["nothing saved", show(cleanState(null, known)), show({ ...EMPTY, waitPics: [] })],
  ["junk", show(cleanState("junk", known)), show({ ...EMPTY, waitPics: [] })],
  ["an array", show(cleanState([1, 2], known)), show({ ...EMPTY, waitPics: [] })],
  ["a running wait comes back", show(cleanState({ endAt: T, total: MINUTE, sound: true }, known)),
    show({ endAt: T, pausedRemaining: null, total: MINUTE, sound: true, waitPics: [] })],
  ["a paused wait comes back", show(cleanState({ pausedRemaining: 5000, total: MINUTE, endAt: T }, known)),
    show({ endAt: null, pausedRemaining: 5000, total: MINUTE, sound: false, waitPics: [] })],
  ["no total: idle", show(cleanState({ endAt: T }, known)), show({ ...EMPTY, waitPics: [] })],
  ["a total alone: idle", show(cleanState({ total: MINUTE }, known)), show({ ...EMPTY, waitPics: [] })],
  ["a total over 60 minutes: idle", show(cleanState({ endAt: T, total: 61 * MINUTE }, known)), show({ ...EMPTY, waitPics: [] })],
  ["paused longer than the whole: idle", show(cleanState({ pausedRemaining: 2 * MINUTE, total: MINUTE }, known)),
    show({ ...EMPTY, waitPics: [] })],
  ["strings for numbers: idle", show(cleanState({ endAt: String(T), total: "60000" }, known)), show({ ...EMPTY, waitPics: [] })],
  ["sound must be true itself", cleanState({ sound: "yes" }, known).sound, false],
  ["pictures: kept, cleaned, at most 3",
    show(cleanState({ waitPics: [
      { picture: "read", words: "  Read   my book " },
      { picture: "gone", words: "Old picture" }, // no longer in the set: its words stay
      { picture: "gone" }, // nothing left of it
      "junk",
      { picture: "music", words: 7 },
      { picture: "draw", words: "Draw" },
      { picture: "read", words: "Too many" },
    ] }, known).waitPics),
    show([{ picture: "read", words: "Read my book" }, { picture: null, words: "Old picture" }, { picture: "music", words: "" }])],
  ["words cut to 40 characters", cleanState({ waitPics: [{ words: "x".repeat(60) }] }, known).waitPics[0].words.length, 40],
];

let failed = 0;
for (const [name, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name.padEnd(48)} → ${String(got)}` + (ok ? "" : `\n      expected ${want}`));
}

console.log(failed ? `\n${failed} of ${cases.length} failed` : `\nall ${cases.length} passed`);
process.exit(failed ? 1 : 0);
