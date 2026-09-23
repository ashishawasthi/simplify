---
type: Product Contract
title: Wait
description: The Wait tool (#wait) — the five minute buttons, the shrinking disc and the time left in words, pause, stop and Put it back, the calm Done with an optional soft chime, While I wait pictures, #wait?m=N (I need's Break), the wake lock and busy flag, what is saved (an end time, never a countdown), and its screen-reader, reduced-motion and pictures-only behaviour.
tags: [wait, timer, disc, wake-lock, sound, reduced-motion, pictures-only, deep-link]
status: stable
---

Wait makes the length of a wait visible: pick a number of minutes and a coloured disc shrinks as the time goes, with the time left in words, then a calm green Done. This document owns the Wait screen (`public/js/tools/wait.js`) and its time rules (`public/js/tools/wait-time.js`). It is in the My day group of [the menu](/learner/menu-and-setup.md#the-menu).

## What the learner sees

The screen has three phases; `phaseOf(state, now)` decides which from the saved state alone.

| Phase | On screen |
|---|---|
| **Idle** | Five big buttons — 1, 2, 5, 10, 15 min (`MINUTE_CHOICES`) — always in the same places; under them the While I wait pictures and the ＋; a small sound switch. No disc, no ✕. |
| **Running / paused** | A big disc whose blue part shrinks clockwise, like a clock's hand, from 12 o'clock; under it the time left in words ("5 minutes"); under that the While I wait pictures, to look at only. Paused: the disc turns grey with ⏸ "Paused" on it. The header ✕ shows. |
| **Done** | The disc turns green with ✔ "Done"; the minute buttons, the While I wait strip (editable) and the sound switch come back under it for another wait. No ✕. |

- **A tap on a minute button** starts that wait at once; focus moves to the disc.
- **A tap on the disc** pauses (spoken name "Pause the wait") and a second tap goes on from the time that was left ("Continue the wait"). On Done the disc is `aria-disabled` and does nothing.
- **The header ✕** stops a running or paused wait (toast "Wait stopped"); "Put it back" restores the time that was left at that moment — not the old end time, so the seconds the toast was up don't count — and whether it was paused. Its spoken name is the shell's default, "Start over: clear everything in this tool" (Wait returns no `clearLabel`).
- **Leaving** the screen while a wait runs doesn't stop it: back again, the disc shows the right time left. Leaving after Done puts Done away; next time, the buttons.
- A wait that ended while the screen was elsewhere shows Done on the way back — for an hour (`DONE_FOR`); after that it opens on the buttons.

### Time left in words

`timeLeft(ms)` rounds **up**, so it never says less than is left: whole minutes above a minute ("5 minutes" until exactly 4:00 is left), then "1 minute", then 10-second steps ("50 seconds" … "10 seconds"). The screen updates just after each change of words, and often enough for the disc to move smoothly (about half a degree a step, at most 10 times a second, never less than once a second — `nextDelay()`). A wait is at most 60 minutes (`MAX_MINUTES`).

### The end: Done, silent by default

At the end the disc turns green with ✔ Done. The **sound switch** ("🔕 Sound off" / "🔔 Sound on", a `role="switch"`) is off unless someone turns it on; with it on, the end plays one soft chime — G5 with a quiet octave, fading over about two seconds, a small bell rather than an alarm. Turning sound on plays the chime once straight away, so whoever set it hears what the end will sound like (and that the device isn't muted). Where the phone can buzz, the end gives a short 200 ms vibration (never on iPhone, and not on a page nobody has tapped yet, which Chrome refuses).

The chime and the buzz belong to the moment of the end: only if the screen sees the end within 3 seconds of it (`SIGNAL_WITHIN`) and the app is in front. A wait that ended in a pocket shows Done without them.

iOS plays Web Audio only from an `AudioContext` made or resumed inside a tap, so the context is made on the tap that starts a wait, turns sound on, pauses or continues — never before sound is on — plus a silent buffer that older iPads need; the chime at the end reuses it. No tap yet, no context, no sound.

## While I wait

Up to three pictures (`MAX_PICS`) for the learner to look at during a wait, chosen with the [picture picker](/learner/pictures.md#the-picture-picker) (title "While I wait"), each a picture, a few words, or both.

- Idle and Done: a "While I wait" heading and one row per picture, each with a ✕ ("Remove: Read"); ✕ offers "Read: removed" with Put it back, which returns it to its place. The ＋ reads "＋ While I wait" while there are none and "＋ Add" after, and goes once three are chosen; its spoken name is "Add a picture: While I wait". Its words are for the adult setting it up, so they are not `.pic-words`.
- Running: just the pictures, nothing to change; the strip is hidden if there are none.
- Picking nothing (✕ or Esc in the picker) changes nothing.

## Opening a wait by link: `#wait?m=N`

`#wait?m=2` starts a 2-minute wait at once. I need's Break card does exactly this with `shell.go("wait", { m })` (2 or 5 minutes — [I need](/learner/i-need.md#break-opens-wait)), and it works on a device whose menu hides Wait. Now and next's ⏳ button opens plain `#wait`.

- `m` is acted on only when the address is **fresh** (a tap, a `go()`, a shared link) — never on Back, Forward or a reload, which would otherwise start the wait again. See the `fresh` flag in the [tool contract](/platform/architecture.md#the-tool-contract).
- `clampMinutes()` brings `m` into range — `0` or negative → 1, `90` → 60, fractions rounded — and anything that isn't a number (`m=soon`) starts nothing.
- A fresh `m` starts over whatever Wait was doing.
- If sound is on and the tap that led here still counts as a user activation, the chime's audio is unlocked then.

## Keeping the screen awake, and updates

While a wait **runs on screen**, Wait asks for a screen Wake Lock (asked again whenever the app comes back to the front, since the browser drops it in the background) and calls `shell.setBusy(true)`, so a new version of the app never reloads the disc in front of someone watching it (see [offline and updates](/platform/offline-and-updates.md)). Paused, Done, idle or off screen: the lock is released and the app is not busy. A browser that refuses the lock (battery saver, an older one) still runs the wait.

Coming back to the front, the screen catches up at once — the time left, or Done — because timers are throttled in the background.

## What is saved

`localStorage` `simplify-wait-v1` (via `shell.save`):

```
{ endAt, pausedRemaining, total, sound, waitPics: [{ picture, words }] }
```

A wait is kept as **the moment it ends** (`endAt`, ms since 1970), never as a countdown: a phone slows or freezes a page in the background, so counted ticks would drift, while an end time is right whenever the screen next looks — even after a reload. Paused, `endAt` is null and `pausedRemaining` holds the ms left; `total` is the whole wait (the disc's full circle). `remainingOf()` never exceeds `total`, so a clock put back can't make the disc bigger than full.

`cleanState()` turns any stored value into a usable state: out-of-range or contradictory times fall back to idle, unknown picture ids are dropped, words are single-spaced and cut to 40 characters, and at most three pictures are kept. Sound and pictures survive stopping a wait. Wait has no set-up section. The full registry is the [data model](/platform/data-model.md).

## Accessibility

- **Screen readers** hear the time left on starting and arriving, then at most once a minute (`mayAnnounce()`), "Paused" on a pause, and "Done" once — from a visually hidden `role="status"` line, emptied first so the same words are read again. The disc's middle (number, ⏸, ✔) is `aria-hidden`; the words line and the status line carry it. The minute buttons are a group named "How long to wait", each named "1 minute", "5 minutes" ….
- **Reduced motion**: the disc doesn't move. It shows the number big with its unit under it ("5" / "minutes"), and the words line under the disc is kept for screen readers only; the screen updates only when the words change.
- **Pictures only**: "Paused", "Done", "While I wait", the sound switch's words and the pictures' words step aside; the numbers, the time left and the adult's ＋ keep their words.
- ⏸ and ✔ are drawn as SVG, not typed, so they look the same on every phone and iPad.

## Who owns what

| Module | Owns |
|---|---|
| `public/js/tools/wait.js` | the screen, sound, wake lock, busy, While I wait |
| `public/js/tools/wait-time.js` | pure time maths: phases, time left in words, the disc's wedge (`wedgePath`), `nextDelay`, `signalNow`, `cleanState`, `clampMinutes` |
| `public/css/tools/wait.css` | the disc, the buttons, reduced motion |

`node tools/test-wait.mjs` pins the time rules (every phase, the words walked second by second, the wedge, junk states); `node tools/smoke.mjs wait` runs the screen in Chrome with a movable clock — every phase, `#wait?m=`, reload, pause, stop and Put it back, the chime and buzz, the wake lock, screen-reader announcements, reduced motion, pictures only and While I wait.
