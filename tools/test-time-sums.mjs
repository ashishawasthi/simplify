// Time sums: the arithmetic and the words of every answer
// (public/js/tools/time-sums-calc.js). No dependencies, no runner:
//
//   node tools/test-time-sums.mjs

import {
  DAY, MAX_ADD, QUICK, afterAnswer, clockText, durationText, howLongUntil, inputValue, minutesOf, parseTime,
  quickText, timeAfter, untilAnswer, wholeNumber,
} from "../public/js/tools/time-sums-calc.js";

const json = (v) => JSON.stringify(v);
const t = (hhmm) => parseTime(hhmm);

const cases = [
  // reading the time box
  ["read 15:30", t("15:30"), 930],
  ["read 00:00", t("00:00"), 0],
  ["read 23:59", t("23:59"), 1439],
  ["read with seconds", t("07:05:30"), 425],
  ["read one digit hour", t("7:05"), 425],
  ["an empty box is no time", t(""), null],
  ["24:00 is no time", t("24:00"), null],
  ["7:60 is no time", t("7:60"), null],
  ["words are no time", t("half past three"), null],
  ["nothing is no time", t(undefined), null],
  ["write back to the box", inputValue(930), "15:30"],
  ["write back, past midnight", inputValue(DAY + 5), "00:05"],
  ["the time of a date", minutesOf(new Date(2026, 8, 26, 14, 7)), 847],

  // saying a time
  ["3:30 pm", clockText(930), "3:30 pm"],
  ["midnight", clockText(0), "12:00 am"],
  ["noon", clockText(720), "12:00 pm"],
  ["12:05 am", clockText(5), "12:05 am"],
  ["11:59 pm", clockText(1439), "11:59 pm"],

  // saying an amount of time
  ["0 minutes", durationText(0), "0 minutes"],
  ["1 minute", durationText(1), "1 minute"],
  ["45 minutes", durationText(45), "45 minutes"],
  ["1 hour", durationText(60), "1 hour"],
  ["2 hours", durationText(120), "2 hours"],
  ["1 hour 1 minute", durationText(61), "1 hour 1 minute"],
  ["1 hour 20 minutes", durationText(80), "1 hour 20 minutes"],
  ["never below 0", durationText(-5), "0 minutes"],

  // typed numbers, forgiven
  ["digits", wholeNumber("20"), 20],
  ["empty is 0", wholeNumber(""), 0],
  ["letters are dropped", wholeNumber("2o"), 2],
  ["a minus is dropped", wholeNumber("-5"), 5],

  // how long until
  ["until later today", json(howLongUntil(t("14:10"), t("15:30"))), json({ minutes: 80, tomorrow: false })],
  ["until the same time", json(howLongUntil(t("14:10"), t("14:10"))), json({ minutes: 0, tomorrow: false })],
  ["until a time already gone: tomorrow", json(howLongUntil(t("22:00"), t("06:30"))), json({ minutes: 510, tomorrow: true })],
  ["until, no end yet", howLongUntil(t("14:10"), null), null],
  ["the until answer", json(untilAnswer(t("14:10"), t("15:30"))),
    json({ tone: "answer", headline: "1 hour 20 minutes", subline: "2:10 pm to 3:30 pm", badge: "1 hour 20 minutes" })],
  ["the until answer, tomorrow", untilAnswer(t("22:00"), t("06:30")).subline, "10:00 pm to 6:30 am tomorrow"],

  // what time after
  ["after 20 minutes", json(timeAfter(t("15:50"), 20)), json({ minutes: 970, tomorrow: false, added: 20 })],
  ["after, past midnight", json(timeAfter(t("22:50"), 120)), json({ minutes: 50, tomorrow: true, added: 120 })],
  ["after, at most a day less a minute", timeAfter(t("10:00"), 99999).added, MAX_ADD],
  ["after nothing", timeAfter(t("10:00"), 0).minutes, 600],
  ["after, no start", timeAfter(null, 20), null],
  ["the after answer", json(afterAnswer(t("15:50"), 20)),
    json({ tone: "answer", headline: "4:10 pm", subline: "20 minutes after 3:50 pm", badge: "4:10 pm" })],
  ["the after answer, tomorrow", afterAnswer(t("22:50"), 120).headline, "12:50 am tomorrow"],

  // the quick amounts
  ["quick amounts", QUICK.map(quickText).join(" | "), "5 min | 10 min | 15 min | 30 min | 1 hour | 2 hours"],
];

let failed = 0;
for (const [name, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name.padEnd(44)} → ${String(got)}` + (ok ? "" : `\n      expected ${want}`));
}
console.log(failed ? `\n${failed} of ${cases.length} failed` : `\nall ${cases.length} passed`);
process.exit(failed ? 1 : 0);
