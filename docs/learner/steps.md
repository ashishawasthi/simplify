---
type: Product Contract
title: Steps
description: The Steps tool — a daily routine one step at a time (Wash hands, Return the tray, Pay by card) with a picture, a few words, progress dots, Next and Back that never move, All done pointing back to the task, the Can I buy? step, each deck's own address and saved step, the 30-minute fresh start for shared iPads, and the adult's Fewer steps switch.
tags: [steps, task-analysis, decks, fewer-steps, fading, shared-ipad, learner-tool]
status: stable
---

Steps (`#steps`, group **My day**) shows a routine one step at a time — task analysis (NCAEP 2020) on a phone. The
screen is `public/js/tools/steps.js`; the decks and how to move through one are plain data and pure functions in
`public/js/tools/steps-decks.js`, pinned by `tools/test-steps.mjs`. It follows
[the tool contract](/platform/architecture.md#the-tool-contract).

## Two screens, two addresses

| Address | Screen |
|---|---|
| `#steps` | The chooser: one big button per deck, its picture and name |
| `#steps?deck=<id>` | One step fills the screen: its picture, its words, progress dots, a big **Next ▶** and a smaller **◀ Back** |

Each has its own address, so Android's Back goes from a deck to the chooser and a teacher can share a link to one deck.
An unknown deck id (including `toString`) finds nothing (`deckById` uses a `Map`) and the chooser shows.

**Nothing moves from step to step**: the picture, the words and the buttons keep their places whether a step's words
take one line or three. Screen readers hear each new step from a status line ("Step 3 of 7: Put on soap"); nothing is
spoken aloud.

After the last step, **All done**: a green ✔, the deck's own end line pointing back to the real task, and **Choose
another** (which returns to the chooser the way Back does).

## The decks

Every step is one plain, literal action of 2–8 words with a picture from the [bundled set](/learner/pictures.md).
Steps marked *(small)* are not core: **Fewer steps** leaves them out.

| Deck (`id`) | Steps | End line |
|---|---|---|
| **Wash hands** (`wash-hands`) | Turn on the tap · Wet your hands · Put on soap · Rub for 20 seconds · Rinse off the soap · Turn off the tap *(small)* · Dry your hands | "All done. Your hands are clean." |
| **Return the tray** (`return-tray`) | Finish your food · Put tissues and bones on the tray *(small)* · Carry the tray with two hands · Find the tray return · Halal tray? Use the halal side · Put the tray in · Throw away table litter *(small)* | "All done. The table is ready for the next person." |
| **Pay by card** (`pay-card`) | Can I buy it? *(small, with a Can I buy? button)* · Look at the price on the screen · Tap your card on the reader · Wait for the beep or the green tick · Take your card back · Take the receipt if you want it *(small)* | "All done. You paid." |

- Return the tray teaches the routine at hawker centres, coffeeshops and food courts (NEA, since 2021) — never fines.
  Its pictures are drawn for Singapore: a tray return with its halal side marked green, with no text or symbol.
- The first Pay by card step offers **🛒 Can I buy?**, which opens that money tool (`shell.go("can-i-buy")`); Back
  returns to the same step. The button sits in the room of the step's words, not in the way of Next and Back.

A deck is `{ id, name, picture, end, steps }`, each step `{ picture, words, core, open? }`; `test-steps.mjs` pins the
decks word for word and checks every picture exists, every deck has at least 3 core steps and no step has more than 8
words. Adding a deck means adding it to `DECKS` and its pictures to `pictures.js`.

## Where the student is

Saved through `shell.save` in `localStorage` `simplify-steps-v1`:

```
{ at: { <deck id>: index of the step on screen in the whole deck }, touched: { <deck id>: ms when last opened or moved } }
```

- `at` counts in the **whole** deck, not in the steps shown, so turning Fewer steps on or off never sends the student
  to another part of the routine: a step no longer shown shows as the next one that is. A saved value that is junk
  or out of range is clamped (`cleanAt`).
- A reload, a trip to Can I buy? and back, or 🏠 and back into the deck finds the same step.
- **Fresh start**: a deck left on All done starts again the next time it is opened, and so does a deck untouched for
  **30 minutes** (`FORGET_AFTER_MS`, `resumeAt`) — also when a sleeping iPad is woken with the deck still on screen —
  so the next student on a shared class iPad starts at step 1, not in the middle of someone else's routine.
- The header **✕** starts the deck on screen again ("Back to step 1", with Put it back).

## Set-up: fewer steps

The tool's section on the [set-up page](/learner/menu-and-setup.md) has one switch per deck: "Fewer steps: only the
main steps of a routine, for a student who already does the small ones." Beside each switch, "Leaves out: …" lists
exactly the steps it hides. Saved as this tool's device settings, `tools.steps = { fewer: [deck ids] }`; every change
is saved at once and offered back in the toast. This is the fading the research asks for: the small steps drop away
as the student learns them.

## Pictures only

On a pictures-only device the words — the step's, the deck names, the buttons' — are hidden from sight (`pic-words`);
the pictures, ◀ ▶ and the dots stay, and the picture takes the words' room.

## Tests

`node tools/test-steps.mjs` pins the decks, Next and Back (including from All done), Fewer steps, `cleanAt` and the
30-minute start again. `node tools/smoke.mjs steps` drives the chooser, each deck, the Can I buy? round trip, the
fresh start, Fewer steps on the set-up page and pictures only in Chrome.
