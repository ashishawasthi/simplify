---
type: Product Contract
title: Show a card
description: The Show a card tool (#show-card) — the six cards and their exact words (three carry LTA Helping Hand wording, never its design), fixed places with gaps, the adult's per-device switches, stop name and opt-in second line — and the shared full-screen card every tool opens (openCard) with Turn around, Speak on a tap in the device's own voice, fit-to-screen text and the wake lock.
tags: [show-card, cards, lta, helping-hand, full-screen-card, speech, disclosure, setup]
status: stable
---

Show a card holds big cards a student shows someone in a public place — a bus captain, station staff, a cashier, the people around. A tap puts the card over the whole screen. This document owns the Show a card screen (`public/js/tools/show-card.js`), its cards and settings (`public/js/tools/show-card-cards.js`), and the **shared full-screen card** (`public/js/show-card.js`) and **speech** (`public/js/say-aloud.js`) that I need uses too.

## The cards

`CARDS`, in the order the screen shows them. Each card's picture is the picture with the same id in [the picture set](/learner/pictures.md).

| # | Card (`id`) | Label on the screen | What the card says |
|---|---|---|---|
| 1 | `seat` | Seat, please | "May I have a seat please?" |
| 2 | `bell` | My stop | "Please alert me when I am approaching my stop." (+ "My stop: …" if set) |
| 3 | `cannot-talk` | I cannot talk | "I cannot talk now. I can point or type." |
| 4 | `please` | Be patient with me | "Please be patient with me." (+ the second line, if chosen) |
| 5 | `space` | Give us space | "My child is overwhelmed. Please give us some space. We are OK." — for a parent to show |
| 6 | `thank-you` | Thank you | "Your care is greatly appreciated. Thank you!" |

### The LTA Helping Hand wording rule

Cards 1, 2 and 6 carry the wording of LTA's Helping Hand cards **exactly**, so bus captains and station staff know them at a glance (checked on caringcommuters.gov.sg on 2026-09-23; see the [daily-life research](/product/daily-life-research.md)). The wording only: the cards' design is LTA's, and nothing here copies it — no logo, layout or artwork; each card uses the app's own picture. Don't reword these three, and re-check the source before changing them. No card names a diagnosis unless the adult opts in (the second line, below).

### The screen

The six cards sit in two columns — on a phone, a phone on its side and an iPad alike — each a big button with its picture and label, always in the same place. A card switched off on the set-up page leaves a gap (out of sight, `inert`: not focusable, not read out), so a hand learns where each one is. With all six off the screen says "All the cards are switched off on this device. An adult can switch them on again on the set-up page."

A tap opens the full-screen card (below) with the card's picture, words and lines. Nothing is said until Speak is tapped. The screen keeps nothing, so it has no header ✕ and saves nothing.

## Set-up

Show a card's section on [the set-up page](/learner/menu-and-setup.md#the-set-up-page-setup) starts "A card switched off leaves a gap, so the other cards stay where they are." and has:

- **A switch per card**, with its picture, label and what it says word for word — including its current extra line. Toast "Seat, please: off", with Put it back.
- **Stop name**, under My stop: a text box (up to 40 characters, `STOP_MAX`), with the note "The card shows it under its words: “My stop: …”. Leave it empty on a shared iPad." It is saved as it is typed (so nothing is lost if the app closes) and offered back once, when the box is left or Enter is pressed: "Stop name: Bishan Interchange" or "Stop name removed".
- **Second line**, under Be patient with me: radio buttons "No second line" (the default), "I have a hidden disability.", "I am autistic.", with the note "Only if the student wants it." Disclosure is the student's choice, never the app's. Toast "Second line: I am autistic." / "No second line".

Saved as this tool's device settings, `tools["show-card"]` in `simplify-device-v1`:

```
{ hidden: ["space"], stop: "Bishan Interchange", disclose: "none" | "hidden-disability" | "autistic" }
```

`readSettings()` forgives anything stored: unknown cards are dropped, a bad `disclose` is `"none"`, and `cleanStop()` keeps one line with control characters and stray spaces removed, cut at 40 whole characters (an emoji is never split). The stop name is only ever shown as text. A change in the set-up page, its undo, or the page in another tab redraws the screen at once.

## The full-screen card

`openCard({ picture, words, lang, lines, actions })` in `public/js/show-card.js` is how every tool shows one message over the whole screen: Show a card, [I need](/learner/i-need.md) (its cards and the Hurts answer). It is a `<dialog>` styled as a full-screen overlay — not the Fullscreen API and no orientation lock, which iPhone lacks — so it works the same on every phone and iPad.

| Option | Meaning |
|---|---|
| `picture` | a picture id from `pictures.js`, or an element (the Hurts drawing) |
| `words` | the message, in the largest type that fits |
| `lang` | the language of `words`, if not English (`"zh-SG"`) |
| `lines` | smaller lines under it: strings, or `{ text, lang }` for another language — drawn in that language's font, spoken by its voice (or not at all where the device has none) and announced in it by screen readers |
| `actions` | choices for whoever holds the card: `[{ picture, number, words, onTap }]` (I need's Break: the Wait picture, "2", "minutes"). A tap closes the card, then runs `onTap()`. |

It returns a promise that settles when the card closes: with the action tapped, or `null`. `closeCard()` closes it from code; any change of screen does (`app.js`), so a card never outlives its screen. One card at a time: opening another replaces it.

- **The words** are set by `fit()` to the biggest font size (20–480 px) at which the words and lines fit their box without breaking a word; a word too long even at 20 px may then break. It refits when the phone turns or an iPad splits the screen. A device on its side puts the picture beside the words — on an iPad or in a browser; the installed Android app is held upright by the manifest (`"orientation": "portrait"`).
- **Three round buttons** run along the bottom edge, nearest whoever holds the phone:
  - **🔄 Turn around** ("Turn around, for the person opposite", `aria-pressed`) turns the card body 180° so the person opposite can read it; the buttons and choices stay the right way up for the holder. Tap again to turn it back.
  - **🔊 Speak** ("Speak: say the card out loud") reads the words and lines aloud — shown only when the device's `speak` setting is on, the browser can speak, and there is something to say.
  - **✕** ("Close the card"), with no words under it, as everywhere else. Esc and Android's Back close it too.
- The dialog's accessible name is the message (or the picture's words).
- For 350 ms after it opens, real taps on the card are ignored, so the second tap of a quick double tap on a tile can't land on the card that just opened under the finger.
- While a card is up, it asks for a screen Wake Lock (again when the app returns to the front), so the screen doesn't go dark in front of the person reading it. A browser that refuses still shows the card.
- On a pictures-only device the Turn around and Speak captions, and an action's words that its picture already says, step aside; the card's message stays.
- Words are only ever set as text (`textContent`), never as HTML.

### Speech

`public/js/say-aloud.js`: `canSpeak()`, `say(text | [{ text, lang }])`, `stop()`. Output only, with the device's own `speechSynthesis` voice — the microphone stays off site-wide.

- `say()` must be called straight from a tap (iOS only lets speech start from one); it cuts off anything still being said, speaks at rate 0.9 (a little slower, for a noisy place), and settles when done or cut off.
- Voices arrive late and differ per phone. English tries Singapore, then British, then any English; Chinese tries Singapore, China, then Taiwan Mandarin — never a Hong Kong or Macau voice, which would read the words as Cantonese. Malay and Tamil try Singapore, then Malaysia or India. Within each, an on-device voice beats a network one, which fails offline.
- A part in a language the device has no voice for is left out, since the English voice would read it as nonsense; English always goes.
- Speech stops when the card closes, the screen changes, or the app goes to the background.

## Accessibility

- Every card is a `<button>` named by its label; on a pictures-only device the labels step aside (still the buttons' names) and the pictures grow.
- The list keeps `role="list"` (Safari drops it from a list without bullets).
- Reduced motion changes nothing here: nothing on this screen animates.

## Who owns what

| Module | Owns |
|---|---|
| `public/js/tools/show-card.js` | the screen and the set-up section |
| `public/js/tools/show-card-cards.js` | `CARDS`, `DISCLOSURES`, `STOP_MAX`, `readSettings`, `withCard`, `withStop`, `withDisclosure`, `cardLines`, `cardFor` (pure) |
| `public/js/show-card.js` | the shared full-screen card: `openCard`, `closeCard` |
| `public/js/say-aloud.js` | speech: `canSpeak`, `say`, `stop` |
| `public/css/tools/show-card.css`, `public/css/styles.css` | the screen; the card overlay (`.card-sheet`) |

`node tools/test-show-card.mjs` pins every card's words (the three LTA cards exactly), pictures and the settings rules; `node tools/smoke.mjs show-card` runs the screen, the card, Speak, Turn around, gaps, pictures only, phone-on-its-side and iPad layouts, and the set-up section in Chrome.
