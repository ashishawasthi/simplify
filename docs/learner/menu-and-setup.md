---
type: Product Contract
title: Menu and Set-up
description: What the learner's menu shows and in what groups, the My class tile, the header's 🏠 and ✕ (and a tool's clearLabel), and the adult's #setup page — press-and-hold with no PIN, hiding tools per device, pictures only, the Speak button, each tool's own set-up section, and joining a class by code or by a #join=CODE QR link ("Is this your class?").
tags: [menu, setup, device-settings, pictures-only, press-and-hold, class-code, join, header]
status: stable
---

This document owns the two screens every other screen hangs off: the menu the app always opens on, and the set-up page (`#setup`) where the adult who looks after a device chooses what that device shows. It also owns the header's 🏠 and ✕ as the learner meets them. How screens are registered, routed and handed their shell is the [tool contract](/platform/architecture.md#the-tool-contract); every stored key is in the [data model](/platform/data-model.md).

## The menu

The menu is `nav#menu` (`aria-label="Tools"`) in `public/index.html`: one big button per tool, each a plain link (`href="#<id>"`), so Back returns to the menu and a tool's address can be shared. It has no "pick a tool" line and no heading of its own; the screen title reads "Simplify".

Order and groups come from `GROUPS` and `TOOLS` in `public/js/tools.js`; `index.html` must list the same tools (`app.js` logs an error for any mismatch either way).

| Place | Heading | Tools, as their button reads | Button picture |
|---|---|---|---|
| Top, no heading | — | My class | `school.svg` (only once the device follows a class) |
| Money | 💰 Money (system emoji) | Can I buy? · What is the change? · Next dollar · Next note · Make the amount · Make a shopping list | 🛒 · a drawn 50¢ coin · 💲 · a drawn $10 note · a drawn $2 note and $1 coin · 📝 |
| My day | `menu-my-day.svg` My day | Now and next · Wait · Steps | `menu-now-next.svg` · `more-time.svg` · `menu-steps.svg` |
| Talk | `menu-talk.svg` Talk | I need · Show a card | `menu-i-need.svg` · `menu-show-card.svg` |

- Money comes first so the buttons people knew from the money-only app stay where they were. The money tools keep their emoji and the app's own note and coin drawings (`[data-picture]`, drawn by `moneySvg()` from `public/js/currency-data.js`).
- Every other tile and group heading has `data-menu-icon`, which `app.js` fills with an `<img>` from `MENU_ICONS` in `public/js/pictures.js` — the app's own files, so the menu looks the same on Android and iPad (a newer emoji such as 🪪 is an empty box on older Android). See [pictures](/learner/pictures.md#menu-icons).
- Each button's words are `.pic-words`, so a pictures-only device shows just the pictures (below).
- The footer link reads "ℹ️ How to use this app" on the menu and on tools without a guide page, and "How to use this tool" on the six money tools, which open their own guide page (`guide` in `TOOLS`). It opens in a new tab, except in an iPad or iPhone home-screen app (`navigator.standalone === true`), where a new tab would leave for Safari — whose storage is not the app's — so the guide opens in the app's own window instead.

### What takes a tool off the menu

`applyDevice()` in `public/js/app.js` runs at boot and after every device-settings change. A tool's `<li>` is hidden when:

1. its id is in the device's `hidden` list (the set-up page's switches), or
2. it could not start (its `mount()` threw or returned no `show()`), or
3. it is My class and the device follows no class (`classCode` is null).

A group whose every tool is hidden loses its heading too. Hiding a tool only takes its button off the menu: its address still works, so I need's Break can open Wait on a device whose menu hides Wait.

### The My class tile

The tile sits above the groups, and only while the device has a class. `public/js/tools/my-class.js` rewrites its words at mount into "My class" with the class's name under it (`device.className`, e.g. "3 Kindness"); the name is hidden when there is none. The reader behind the tile is [My class](/learner/my-class.md).

## The header buttons

Inside any screen, `header#app-header` shows two round buttons with no words beside them (every word is one more thing to read; screen readers get their names from `aria-label`). It is hidden on the menu.

- **🏠** (`#to-menu`, `aria-label="Menu"`) returns to the start of this visit — the menu, however many screens a tool opened with `shell.go()` — or, on the first screen of a visit opened by a shared link, puts the menu in that screen's place so Back from the menu leaves the app. The history mechanics are in [the architecture](/platform/architecture.md).
- **✕** (`#clear-all`) shows only while the tool on screen has something to clear (its `hasAnything()`); a tool with no `clearAll()` never shows it. A tap runs the tool's `clearAll()`, which always offers "↩ Put it back" in the toast instead of asking "are you sure?"; focus then goes to the screen title, since the ✕ may have just hidden itself.
- The ✕'s spoken name is "Start over: clear everything in this tool" unless the tool's `mount()` returns `clearLabel`. Only Now and next does ("Start the day again: nothing done, the cards stay"), because its ✕ keeps the cards.

| Screen | ✕ shows when | What it does (toast) |
|---|---|---|
| The six money tools | anything is typed or picked | clears every box and row ("Everything cleared") |
| Wait | a wait is running or paused | stops it ("Wait stopped"; Put it back restores the time that was left) |
| Now and next | at least one card is done | nothing done, cards kept ("Back to the start") |
| Steps | a deck is past its first step | this deck back to step 1 ("Back to step 1") |
| I need, Show a card, My class, set-up | never | — |

The floating yes/no pill between 🏠 and ✕ belongs to the money tools: see [the money tools](/learner/money-tools.md#the-answer-and-the-floating-pill).

## Device settings

Everything the set-up page changes is one object per device, `localStorage` `simplify-device-v1`, read and written only through `public/js/device.js`:

```
{ hidden: [tool ids], picturesOnly: false, speak: true, classCode: null, className: null, tools: { "<tool id>": {…} } }
```

- `getDevice()` returns a deep-frozen copy; `setDevice(patch)` saves at once (no debounce: an adult may close the app right after) and notifies `onDeviceChange` listeners.
- `clean()` turns whatever is stored — an older shape, a hand edit, junk — into usable settings: a bad value falls back to its default, tool ids must be kebab-case with object values, the class name is trimmed to 60 characters and dropped without a code, and unknown keys ride along untouched for a newer version.
- A `storage` event from another tab (the guide opens the set-up page in its own tab in a browser) re-reads and notifies, so the menu updates without a reload.
- Nothing about a device's settings leaves the device. A shared class iPad and a student's own phone can each be set up differently.

### Pictures only

With `picturesOnly` on, `<html>` gets `data-pictures-only` and every `.pic-words` element is moved out of sight but kept for screen readers (`public/css/styles.css`), so a control whose words are `.pic-words` keeps its name. The screen title is `.pic-words` too, except on the set-up page, which is for adults. Tools mark only words a picture already says: numbers stay, and so does anything an adult must read (a card's message, the set-up page, Wait's ＋ for the adult). Each tool's document lists what steps aside on its screen.

### The Speak button

`speak` (default on) allows the 🔊 Speak button on full-screen cards; it shows only when this is on and the card has words this device can say — a recorded clip, or the device's own voice ([the recorded voice](/platform/voice.md)). The card and the voice rules are in [Show a card](/learner/show-card.md#the-full-screen-card).

## The set-up page (`#setup`)

`public/js/setup.js` (`mountSetup`), title "Set up this device". Nothing on the menu leads here. The user guide's page `/guide/set-up` has an "⚙️ Open set-up" link to `/#setup`; on an iPad or iPhone that guide must be opened from the home-screen app's own ℹ️ link, so the set-up it opens is the app's and not Safari's (whose settings are separate).

### The hold

Every visit starts behind one big button, "⚙️ Hold to open set-up": press and hold for `HOLD_MS` (1500 ms) while a ring fills. There is no PIN and nothing to get wrong — letting go early just resets it, so a child exploring can't change anything by accident.

- Works with a finger (pointer capture, so a finger that wanders off the button still counts), a mouse, or Space/Enter held down. A long press can't open a context menu or start a text selection.
- Under `prefers-reduced-motion` there is no ring, only the hold.
- The finger that held is still down when the settings appear: clicks on the settings are ignored until it lifts, and for 500 ms after, so the lift can't flip whatever switch is now under it.
- Once open, focus goes to the "Show on the menu" heading. Leaving the page (`hide()`), or opening `#setup` again, puts it back behind the hold.

### What it shows, in order

Every switch is a whole row (`role="switch"`, `aria-checked`), with its state in colour, a mark (✔ or none), the knob's side and a word (On/Off). Every change is saved the moment it is made and offered back in the toast with "↩ Put it back". The page uses plain words, never `.pic-words`.

1. **Show on the menu** — a switch per tool (not My class), grouped under each group's picture and name like the menu, each with the tool's menu picture. Toast: "Wait: off the menu" / "Wait: on the menu".
2. **Words and sound** — "Pictures only (hide words)" (toast "Pictures only: on/off") and "Speak button on cards" (toast "Speak button: on/off").
3. **Each tool's own section**, for every tool whose module exports `setup()`, in `TOOLS` order under the tool's picture and name: Steps, I need, Show a card. A section's `setup(section, shell)` runs the first time the settings open and its `show()` on later openings; its settings are saved as `tools[<id>]` through `setToolSettings()`. A section that throws is left out and the rest of the page works.
4. **My class** — `public/js/class-setup.js`, in `div#class-setup-slot` (below).

| Section | What an adult sets | Saved as `tools[<id>]` | Owner |
|---|---|---|---|
| Steps | Fewer steps, per deck | `{ fewer: [deck ids] }` | [Steps](/learner/steps.md#set-up-fewer-steps) |
| I need | which of the 11 cards show | `{ cards: [card ids] }` | [I need](/learner/i-need.md#set-up) |
| Show a card | which of the 6 cards show; the stop's name; the second line of "Please be patient with me." | `{ hidden, stop, disclose }` | [Show a card](/learner/show-card.md#set-up) |

Now and next and Wait have no section: `TOOLS` names `nowNext.setup` and `wait.setup`, but neither module exports one, so both are `undefined` and `setup.js` skips them.

## Joining a class

The My class section decides which class this device follows. It is the only section a class's QR code opens: the poster's link is `https://simplify.whiz.coach/#join=<CODE>`, which `parseAddress()` in `app.js` routes to the set-up page with `join=<CODE>`. Then there is **no hold**, and the menu, Words and sound and tool sections stay hidden: whoever scanned it (a student, a parent) only answers "Is this your class?".

The section has three states, one at a time.

**Find** — "Class code", with the hint "On the class's poster, under the QR code: 9 letters and numbers." Typing is forgiven: made upper case, every character outside `ALPHABET` (`23456789ABCDEFGHJKMNPQRSTUVWXYZ` — no 0, 1, I, L or O) dropped, shown in threes as `K7M-3RQ-P9T` with the caret kept after the same character, and a pasted link understood (`codeFromText()` takes what follows `join=`). As soon as the box holds 9 characters the class is looked up — no button to press — with "Looking for the class…" in a `role="status"` line. More than 9 says "A class code has 9 letters and numbers." Enter asks again.

- A code no class has, a suspended class, no internet, or no server to ask (localhost) all give the same calm line: "Can't find this class. Check the code, or try again with the internet." with "↻ Try again". When the device comes back online, a failed lookup is retried by itself.
- The lookup is `fetchClass()` in `public/js/class-data.js`: one plain HTTPS `GET` of the class's Firestore document, and only the code leaves the device (see [My class](/learner/my-class.md#fetching-the-page)).

**Ask** — "Is this your class?" (a `role="group"` named by that question), the class's name (or "A class with no name"), "Code: K7M-3RQ-P9T", and "✔ Yes" / "✕ No"; focus lands on Yes.

- **Yes** calls `followClass()`: saves the class and its latest page (`simplify-class-v1`), sets `classCode` and `className` on the device, and starts fetching the page's pictures and videos in the background. Toast "My class: 3 Kindness"; Put it back restores both the device settings and the saved copy exactly as they were. Focus moves to "Open My class".
- **No** returns to the code box (or to the class already followed), changing nothing.

**Current** — "This device follows", the class's name, "Code: …", and "✏️ Change" and "✕ Leave".

- "Open My class" (with the school picture) shows only right after joining — by QR code or by Yes — and opens the reader with `shell.go("my-class")`.
- In Safari on an iPad or iPhone (`navigator.standalone === false`) a note says "Simplify on the Home Screen keeps its own settings: type this code on its set-up page too." A QR code opens Safari, whose storage is not the installed app's, so an installed iPad app gets its class by typing the code in its own set-up page.
- **Change** shows the code box while the device still follows its class, with a "Keep 3 Kindness" button to go back.
- **Leave** clears `classCode` and `className` at once (toast "Left 3 Kindness", with Put it back); the saved page and the media cache are deleted only at the next start (`forgetClassIfNone()`), so the undo can still bring them back. Focus goes to the section's heading.

A `#join` for the class the device already follows skips the question and shows the current state with "Open My class". A `#join` whose code is malformed shows the calm not-found line. Any device-settings change (an undo, another tab) re-settles the section unless it is mid-question.

## Who owns what

| Module | Owns |
|---|---|
| `public/index.html` | the menu's markup, groups and tile pictures; the header; the footer guide link |
| `public/js/tools.js` | `GROUPS`, `TOOLS` (order, titles, groups, guide pages, `setup`) |
| `public/js/app.js` | menu pictures, `applyDevice()`, routing incl. `#join=`, 🏠, ✕ and `clearLabel` |
| `public/js/device.js` | `simplify-device-v1`: `getDevice`, `setDevice`, `toolSettings`, `setToolSettings`, `onDeviceChange` |
| `public/js/setup.js` | the hold, the switches, Words and sound, hosting tool sections and the class section |
| `public/js/class-setup.js` | the My class section: find / ask / current |
| `public/js/class-data.js` | class codes, `fetchClass`, `followClass`, `forgetClassIfNone` |

Pinned by the `set-up:`, `menu:` and `device settings` scenes in `tools/smoke/app.mjs` and the `set-up:` scenes in `tools/smoke/my-class.mjs` (run with `node tools/smoke.mjs app` and `node tools/smoke.mjs my-class`; see [local development](/operations/local-development.md)); the class code rules by `node tools/test-class.mjs`.
