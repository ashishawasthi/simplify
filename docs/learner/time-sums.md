---
type: Product Contract
title: Time sums
description: The Time sums tool (#time-sums) — two questions about the clock (How long until? and What time after?) answered in the shared answer panel, the From box that follows the time now until changed, the device's own time picker, quick amounts, "tomorrow" past midnight, what is kept, and the pure arithmetic in time-sums-calc.js.
tags: [time-sums, time, clock, numeracy, answer-panel, learner-tool]
status: stable
---

Time sums answers two questions about the clock, the way the money tools answer questions about money: boxes at
the top, the answer in the panel at the bottom, updated as the boxes change, with no submit button and no error.
SPED functional numeracy teaches money and time together ([daily-life research](/product/daily-life-research.md)).
This document owns the screen (`public/js/tools/time-sums.js`), its arithmetic (`public/js/tools/time-sums-calc.js`)
and its styles (`public/css/tools/time-sums.css`). It is in the **My day** group, after Steps; its menu picture is
`clock.svg` (🕒).

## The screen

- **Two questions**, side by side at the top, each a picture and words, in places that never move:
  **How long until?** (`more-time`, ⏳) and **What time after?** (`clock`, 🕒). The one on show is blue with a thick
  edge (`aria-pressed="true"`) — not colour alone.
- **From**: a time box (`<input type="time">`, so each device shows its own time picker — a clock dial on Android, a
  wheel on iPad). It shows the time now, looked at again every 15 s, with "Now" under it. Once someone changes it,
  "Now" goes and a **Now** button appears beside the heading, which puts it back to the time now. Cleared on the
  picker, it goes back to now too.
- **Until** (How long until?): another time box, empty at first.
- **Add** (What time after?): **hours** and **minutes** boxes (numbers only, forgiven as typed: letters dropped, at
  most 23 hours) and six quick amounts: **5 min**, **10 min**, **15 min**, **30 min**, **1 hour**, **2 hours** — a tap
  sets the amount (it does not add to it).

## The answers

| Question | Answer panel | Example |
|---|---|---|
| How long until? | headline: the amount of time; under it: from and to | **1 hour 20 minutes** — "2:10 pm to 3:30 pm" |
| What time after? | headline: the time; under it: the amount and from | **4:10 pm** — "20 minutes after 3:50 pm" |

- Times are said as a clock shows them: "3:30 pm", "12:00 am", "12:00 pm". Amounts: "0 minutes", "1 minute",
  "1 hour", "1 hour 20 minutes", "2 hours".
- An Until time earlier than From is **tomorrow's**: "10:00 pm to 6:30 am tomorrow" → 8 hours 30 minutes. An
  amount that goes past midnight says "12:50 am tomorrow". The amount to add is at most a day less a minute, so the
  answer is today or tomorrow, never further.
- No Until time, or nothing to add: no answer (the panel stays hidden) — never an error. The answer's picture is
  the question's (⏳ or 🕒), from the app's own set.

## Kept, and cleared

`simplify-time-sums-v1` keeps `{ mode, start, end, add }`: the question, the From time if changed, the Until time
and the amount. Opened afresh from the menu (show's `fresh`), From goes back to the time now — a time set
yesterday is no use today — while a reload or Back keeps it. The header **✕** shows while anything is set (From
changed, Until set, or an amount), clears all three, and offers **Put it back**.

## Pictures only

The questions' words are `.pic-words`; their pictures grow. Numbers, times and the unit words next to the boxes stay:
they are not something a picture says.

## Tests

`node tools/test-time-sums.mjs` pins the arithmetic and every answer's words (44 cases: reading the box, saying a
time and an amount, forgiving typed numbers, tomorrow, the cap). `node tools/smoke.mjs time-sums` drives the screen in
Chrome: the answer as times are set, tomorrow, quick and typed amounts, Now, ✕ and Put it back, what is kept, pictures
only, and the iPad layout. The guide page is `/guide/time-sums`.
