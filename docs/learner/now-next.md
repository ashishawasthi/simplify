---
type: Product Contract
title: Now and Next
description: The Now and next tool and its My day view — the big Now card with Done, the Next card, All done, the whole-day strip with move, take away and the Changed badge, adding cards from the picture picker, the ✕ that starts the day again, what is saved and the rules pinned by test-now-next.
tags: [now-next, my-day, visual-schedule, changed, picture-picker, learner-tool]
status: stable
---

Now and next (`#now-next`, group **My day**) is a picture schedule the student carries: what is happening now, what
comes next, and — in the **My day** view — the whole day, where a change to the plan is said rather than hidden. It
delivers visual supports and warnings before a change (NCAEP 2020). The screen is `public/js/tools/now-next.js`; the
list's rules are pure functions in `public/js/tools/now-next-list.js`, pinned by `tools/test-now-next.mjs`. It follows
[the tool contract](/platform/architecture.md#the-tool-contract).

## Two views

Two big switches at the top, **Now and next** and **My day**, choose the view; the view chosen last is saved and comes
back next time.

### Now and next

- **Now** — the current card, big, in a blue frame, tagged "Now", with ⏳ which opens [Wait](/learner/wait.md)
  (`shell.go("wait")`; Back returns here).
- **✔ Done** — a big button under Now. Done moves Next up to Now with a short slide up (none under reduced motion);
  screen readers hear "Now: <words>".
- **Next** — the following card, smaller, tagged "Next". While the last card is Now, Next shows **All done**.
- After the last card: one green **All done** card.
- With no cards at all: one big **＋ Add** — the card added becomes Now.

### My day

The whole day as a strip, top to bottom:

- Cards **done** are small and grey with ✔; a tap goes back to that card (it is Now again), with "Back to <words>"
  and Put it back in the toast.
- **Now** is big and blue; the cards after it are outlined.
- Every card not done yet has **✕** (take it away — "Took away <words>", Put it back), **↑ ↓** (one place up or down
  among the cards not done; a card moved up past Now becomes Now) and **Changed**.
- **Changed** marks a card as a change to the plan: it shows the Changed picture and word, in both views. A change is
  announced, not hidden.
- A tap on a card's picture picks another picture.
- **＋ Add** at the end, up to **12 cards** ("Full: 12 cards" after that); then **Remove all**, with Put it back.

Cards are made with the shared picture picker (`pickPicture`, see [pictures](/learner/pictures.md#the-picture-picker)):
a picture from the bundled set, a few words (at most 40 characters), or both. The picker's title says which slot is
being filled (Now, Next, Later).

## The header ✕

Shown once something is done. It **starts the day again** — nothing done, the cards kept — with "Back to the start"
and Put it back. It is the one tool that gives its ✕ its own spoken name (`clearLabel`: "Start the day again: nothing
done, the cards stay"); see [the header](/learner/menu-and-setup.md#the-header-buttons).

## Taps that bounce

A second tap too soon after the first (a bounce, a double tap) is ignored, so one Done never skips a card and one ↑
never undoes itself.

## What is saved

`localStorage` `simplify-now-next-v1` (through `shell.save`):

```
{ cards: [{ id, picture, words, changed }], done, view }
```

- `cards` — the day in order, at most `MAX_CARDS` (12). `id` is a whole number unique in the list that follows the
  card when it moves; `picture` an id from `pictures.js` or null; `words` "" or up to `MAX_WORDS` (40) characters;
  a card has a picture, words or both; `changed` true for a change to the plan.
- `done` — how many cards from the top are done: `cards[done]` is Now, `cards[done + 1]` Next; `done ===
  cards.length` (with any cards) is All done.
- `view` — `"now-next"` or `"my-day"`.

Every function in `now-next-list.js` takes a state and returns a new frozen one, or the same one when there is
nothing to do — never an error. A card is found by its id, not its place, so a tap on a card that has since moved
still means that card. A saved state that can't be read (junk, an older shape, an unknown picture) is cleaned into a
usable one (`clean`).

Nothing is sent anywhere and nothing is logged. There is no set-up section for this tool: the student (or an adult
beside them) edits the day on the tool itself. On a pictures-only device the words marked `pic-words` (the Now and Next tags, Done,
Add, Changed, All done) are hidden from sight; the pictures and signs stay.

## Tests

`node tools/test-now-next.mjs` pins every rule of the list (Done, going back, adding, moving past Now, take away and
put back, Changed, remove all and restore, the 12-card limit, cleaning a saved state). `node tools/smoke.mjs now-next`
drives both views in Chrome, including reduced motion, the bounce guard and pictures only.
