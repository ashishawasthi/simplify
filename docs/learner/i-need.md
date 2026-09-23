---
type: Product Contract
title: I need
description: The I need tool (#i-need) — the fixed grid of eleven cards and their exact sentences, which are on by default, gaps instead of moving cards, Break's 2 or 5 minutes of Wait, Hurts' two questions (a tappable body, then how much), I want through the picture picker, the adult's per-device card switches, and why nothing is kept.
tags: [i-need, aac, cards, hurts, body-map, break, setup, pictures-only]
status: stable
---

I need gives a student big cards for what they need to say when speech is hard. A tap puts the whole sentence over the screen for an adult to read. This document owns the I need screen (`public/js/tools/i-need.js`), its cards and words (`public/js/tools/i-need-cards.js`), the Hurts questions (`public/js/tools/i-need-hurts.js`) and the body drawing (`public/js/tools/i-need-body.js`). The full-screen card it opens is shared: see [Show a card](/learner/show-card.md#the-full-screen-card).

## The cards

`CARDS` is the fixed grid, in this order. Each card's picture is the picture with the same id in [the picture set](/learner/pictures.md).

| # | Card (`id`) | Label on the grid | What the card shows the adult | On by default |
|---|---|---|---|---|
| 1 | `help` | Help | "I need help" | yes |
| 2 | `break` | Break | "I need a break", with 2 and 5 minutes of Wait | yes |
| 3 | `toilet` | Toilet | "I need the toilet" | yes |
| 4 | `water` | Water | "I need water" | yes |
| 5 | `too-loud` | Too loud | "It is too loud" | yes |
| 6 | `stop` | Stop | "Stop, please" | yes |
| 7 | `hurts` | Hurts | asks where and how much, then "It hurts here: tummy. A lot." | yes |
| 8 | `want` | I want | asks for a picture, then "I want: Kopi" | no |
| 9 | `more-time` | More time | "I need more time" | no |
| 10 | `dont-understand` | Don't understand | "I don't understand" | no |
| 11 | `all-done` | All done | "I am all done" | no |

**Positions never move.** A card keeps its place for good — the AAC motor-planning rule: a hand learns where "Help" is. A card an adult switches off leaves an empty gap (`visibility: hidden`, and `inert`, so it can't be focused or read out), and nothing after it moves up. `gridCells()` drops only the places after the last card that is on, which moves no card. With every card off the screen says "All the cards are switched off on this device. An adult can switch them on again on the set-up page."

The grid has 2 columns on a phone and 3 on a screen at least 600 px both ways (an iPad either way up), so a phone turned on its side keeps its 2 columns and no card changes place. Nothing on the grid animates.

## Tapping a card

A plain card opens the full-screen card: its picture, its sentence in the largest type that fits, and the card's own Turn around, Speak (where allowed) and ✕ — nothing is said until Speak is tapped.

### Break opens Wait

Break's card carries two choices for whoever holds it (`BREAK_MINUTES`): the Wait picture with "2 minutes" and "5 minutes". A tap closes the card and opens [Wait](/learner/wait.md) with `shell.go("wait", { m })`, which starts that wait at once. It works even on a device whose menu hides Wait; Back from Wait returns to I need.

### Hurts: where, then how much

Hurts asks two questions, one per screen, on a full-screen sheet (a `<dialog>` in the picture picker's look), so Esc or the phone's Back button simply closes it, back to the grid, and no step lands in the app's history.

1. **"Where?"** — a plain figure seen from the front, drawn in the page as inline SVG so a region can light up red: separate rounded parts like an artist's wooden mannequin, a face of two eyes and a mouth, pale grey (no skin colour), no hair, no expression, age-neutral. Every region is a real `<button>` laid over its part (`SPOTS`), named Head, Eyes, Ear, Mouth or teeth, Throat, Chest, Tummy, Arm, Hand, Leg, Foot; a region that comes in two (ears, arms, hands) has a spot on each side, but only one is offered to screen readers and the keyboard. Beside the figure, **My back** is a button of its own, drawn from behind (hair and a spine). Pressing or focusing a region lights it up. ✕ ("Close: back to I need") closes the sheet.
2. **"How much?"** — the chosen region drawn big and named, then three buttons of growing circles: "A little", "A lot", "Very bad". ◀ ("Back: where it hurts") sits where ✕ was and returns to "Where?".

The answer opens the card: the drawing with the region in red — the close-up of the head and neck for a face region (head, eyes, ear, mouth, throat), the back view for My back — and the sentence from `hurtsSentence()`: "It hurts here: mouth or teeth. Very bad." The sentence names no side, since a picture seen from the front swaps them; the adult asks which one, and the student can point.

For 400 ms after a question changes, taps on the sheet are ignored, so one double tap can't answer both. Focus moves to the question each time, so a screen reader hears "Where?" or "How much?" first.

### I want

I want opens the [picture picker](/learner/pictures.md#the-picture-picker) titled "I want". On a pictures-only device it offers pictures only, with no words box. The card shows the picture and "I want: <words>" — the words typed, or the picture's own words when there are none; with neither, "I want" (`wantSentence()`). Closing the picker changes nothing, and a pick that ends after the screen has changed is dropped.

## Set-up

I need's section on [the set-up page](/learner/menu-and-setup.md#the-set-up-page-setup) starts "A card switched off leaves a gap, so the other cards stay where they are." and has a switch per card with its picture, its label, and under it what it says word for word ("“I need help”"; Hurts "Asks where and how much, then “It hurts here …”"; I want "Asks for a picture, then “I want …”"). A switch saves at once, with a toast ("Toilet: off") and Put it back.

Saved as this tool's device settings, `tools["i-need"]` in `simplify-device-v1`:

```
{ cards: ["help", "break", …] }   the cards that are on, in CARDS order
```

`{}` (nothing chosen yet) means the defaults above. `cardsOn()` forgives anything stored: no list means the defaults, an id that isn't a card is left out. A change on the set-up page — or its Put it back, or the page in another tab — redraws the grid at once.

## Nothing is kept

Nothing is saved but which cards are on: not which card was tapped, nor when, nor where it hurt. So the screen has no header ✕ and no `shell.save`. Nothing is sent anywhere. (The [design principles](/product/design-principles.md) explain why: no logs of feelings, behaviour or location, and a communication tool is the student's voice.)

## Accessibility

- Every card is a `<button>` whose name is its label; on a **pictures-only** device the labels step aside (still read out) and the pictures grow to take the room. The card that opens keeps its words — they are for the adult.
- The grid is a list (`role="list"` restored, since Safari stops calling a list without bullets a list).
- The body's regions are buttons in head-to-foot order, then My back; the drawings themselves are decorative (`aria-hidden`) because the words beside them say the same.
- A long press on a card doesn't select text or open iOS's picture menu, and a double tap doesn't zoom.

## Who owns what

| Module | Owns |
|---|---|
| `public/js/tools/i-need.js` | the grid, the taps, the set-up section |
| `public/js/tools/i-need-cards.js` | `CARDS`, `BREAK_MINUTES`, `REGIONS`, `SIZES`, `cardsOn`, `withCard`, `gridCells`, `hurtsSentence`, `wantSentence` (pure) |
| `public/js/tools/i-need-hurts.js` | the Hurts sheet: "Where?" and "How much?" |
| `public/js/tools/i-need-body.js` | the figure as data (`PARTS`, `MARKS`, `SPOTS`, `CLOSE_UP`, `UPPER`) and `bodyDrawing()` |
| `public/css/tools/i-need.css` | the grid, the sheet, the lit region |

`node tools/test-i-need.mjs` pins every card's order, label and sentence word for word, the settings rules, and the body map (every region can be tapped, the tap areas don't overlap, and they are big enough on a phone); `node tools/smoke.mjs i-need` runs the screen in Chrome.
