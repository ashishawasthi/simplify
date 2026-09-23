---
type: Product Contract
title: Money Tools
description: The six money tools (Can I buy?, What is the change?, Next dollar, Next note, Make the amount, Make a shopping list) — what each asks and answers word for word, the money box and price rows, the notes-and-coins picker with tap counts, Show me, empty box = $0, the floating yes/no pill, rounding up to 5¢, what each saves (and why Can I buy? keeps afford-it-v1), answers.js and money.js purity, and the currency-drawings rule.
tags: [money, answers, notes-and-coins, show-me, rounding, currency, singapore, storage]
status: stable
---

The six money tools each answer one money question on one screen. They share one controller, `mountMoneyTool()` in `public/js/money-tool.js`, which runs whichever boxes and list a tool's block in `public/index.html` has (`data-box="money|spend|need"`, `data-list="items|named"`) and asks `public/js/answers.js` what to say. This document owns their screens, their wording and their money rules; the shell they plug into is the [tool contract](/platform/architecture.md#the-tool-contract), and dictating an amount is [voice input](/learner/voice-input.md).

## The six tools

| Tool (address) | Asks for | Answers (tone) |
|---|---|---|
| **Can I buy?** (`#can-i-buy`) | 💰 My money; 🛒 Things I want to buy (prices) | ✅ "Can buy" · "Money left: $X" (yes) — or ✋ "Cannot buy" · "You need $X more" with 💵 Show me (no) |
| **What is the change?** (`#change`) | 💰 My money (what I pay with); 🧾 I spend | "Change: $2.70" · "The money you get back", with 💵 Show me (answer, a drawn 50¢ as its icon) — 👍 "No change" · "You gave the exact money" when equal — or ✋ "Cannot buy" · "You need $X more" with Show me (no) |
| **Next dollar** (`#next-dollar`) | 🛒 Things I buy (prices) | 💲 "Next dollar: $4" · "You get back $0.50", or "That is exact — no change" (answer) |
| **Next note** (`#next-note`) | 🛒 Things I buy (prices) | "Next note: $5" · "No $5? Use $10", with both notes drawn on the screen (answer) |
| **Make the amount** (`#make-amount`) | 🎯 I need | "Make $1.30" · "$1 + 20¢ + 10¢", drawn (answer); for an amount coins can't make, "Make $1.33" · "$1 + 20¢ + 10¢ + 5¢ makes $1.35" |
| **Make a shopping list** (`#shopping-list`) | 💰 My money; 📝 I need to buy (names and prices) | ✅ "Yes! Within your budget" · "Money left: $X" (yes) — or ✋ "Over your budget" · "Too much by $X" (no) |

- Nothing to judge yet — no price above $0 in a list tool, or an empty "I spend" / "I need" box — gives tone `neutral`: **no panel at all**, not a "type your money here" line (the empty boxes already say it).
- **An empty money box counts as $0** as soon as there is something to judge, so a price alone already answers ("Cannot buy · You need $3 more"). The answer never waits for the money box.
- Next note climbs a ladder of the $1 coin and the notes ($1, $2, $5, $10, $50, $100) and offers the next rung as the backup ("No $5? Use $10"), drawn at its real size too, captioned "No $5? Use:". Past $100 it pays a $100 for each full hundred plus the next note for the rest, with no backup: "Pay $100 × 2 + $5" · "That makes $205".
- Amounts are written by `formatCents()`: whole dollars drop ".00" ("$4", not "$4.00") — fewer symbols to read. A shortfall is always "need $X more", never a negative number.

## The screen

Every tool is built from the same parts in the same places: its boxes and list at the top, the answer panel at the bottom, and the header's 🏠 and ✕ ([menu and set-up](/learner/menu-and-setup.md#the-header-buttons)). The ✕ shows once anything is typed or picked; it clears the tool on screen only (toast "Everything cleared", with Put it back). Each tool's footer link "How to use this tool" opens its own guide page (`/guide/<id>`).

### The money box

One box is `createMoneyField()` in `public/js/money-field.js`: a `$`-prefixed `type="text"` input with `inputmode="decimal"` (the big number pad), placeholder "0", and beside it:

- **🎤** ("Say how much money I have", "Say how much I spend" …) opens the speak dialog — [voice input](/learner/voice-input.md). It shows only while the box is empty.
- **✕** ("Clear my money" …) takes the 🎤's place once the box holds anything; it empties the box (toast "Cleared $12.50", Put it back) and hands focus to the 🎤 rather than the box, whose keypad would cover it.
- **💵** at the right of the "My money" heading ("Tap my notes and coins"; on What is the change? "Tap the notes and coins I pay with") opens the notes-and-coins picker. It is on the three My money boxes only, and hides with the 🎤 once the box is filled — a filled box never looks as if it is waiting for another step.
- After the picker fills the box, a chip under it says "💵 from my notes and coins". Typing takes over from the picker: the picked notes are dropped and the chip goes.
- On leaving the box it is tidied: "5.5" becomes "5.50"; text with no number is left alone and counts as $0.

Nothing typed is ever rejected. `parseToCents()` in `public/js/money.js` accepts "5", "5.5", "$5.50", "1,000" and "10 dollars 50"; a box with no number in it is `null` (empty), and every amount is capped at $1,000,000 (`MAX_CENTS`) rather than refused.

### Price rows

`createItems()` in `public/js/items.js` makes the list: one big price row per thing ("Price of thing 1, in dollars"), each with its own 🎤 / ✕ pair and a "−" button ("Remove thing 1"). "Things cost: $X" totals them. An empty or unreadable row counts as $0.

- "＋ Add item" appears only once the last row has a price, so there is one empty row at a time; the new row gets the cursor.
- "−" on a row that had anything in it offers "Took away <name or $X>" with Put it back (the row returns to its place). Removing the last row leaves one empty row.
- Make a shopping list adds an "Item name" box above each price (`type="text"`, up to 40 characters, "Name of thing 1"), which opens the full keyboard — mic included — directly.

### The notes-and-coins picker

`public/js/note-picker.js`, the full-screen `<dialog id="picker">`: tap pictures of Singapore notes and coins to count cash, like laying money out on a table.

- The top reads "You have" and the running total, with "✔ Done". Under it the tray shows one chip per denomination in first-tap order, in that note's or coin's colour, with a count ("$2 × 3"); empty, it says "Tap your notes and coins below ⬇️".
- Notes ($2, $5, $10, $50, $100) and coins (5¢, 10¢, 20¢, 50¢, $1) are drawn bigger for bigger money, as in a wallet (`pictureScale()`).
- Each picture carries its own **×N badge** once tapped, because by the time a finger reaches the big notes and the coins the tray has scrolled out of view. Its spoken name follows: "Add 5 dollars", then "Add 5 dollars, 2 tapped".
- A tap pops the total and the badge (a short animation) and gives a 10 ms haptic tick where `navigator.vibrate` exists (not on iOS; silently skipped).
- "↩ Take back one" removes the last tap; "✕ Start again" removes all; both are disabled with nothing tapped. Each has visible words above a round button and a full spoken name.
- Done, Esc and the browser's own dismissal all keep the count — a count is never lost. Reopening the picker on a box filled from it starts from the same notes; a typed box starts from nothing.

### The answer and the floating pill

`public/js/result.js` draws the panel at the bottom from the answer object: colour + icon + plain words together (green yes, red no, blue answer), recomputed on every keystroke and tap — there is no submit button. The panel's text sits in a `role="status"` `aria-live="polite"` region; the "💵 Show me" button sits outside it, so screen readers don't re-read the button with every change.

A **yes/no** answer (tone `yes` or `no`) is repeated in a small pill pinned top-centre between 🏠 and ✕ — the on-screen keyboard covers the bottom panel far more often than the top. The pill carries the icon and the short amount (`badge`: "$6 more", "$4 left", "$3 over"); if that doesn't fit, it drops the word, never digits. It follows iOS's visual viewport so it stays against the real top edge with the keyboard up. An `answer`-tone result (change, next dollar …) has no pill, because a bare icon can't carry it. The pill is `aria-hidden`; the panel alone talks to screen readers.

### Show me

"💵 Show me" appears on answers that carry `showMe`: Can I buy?'s shortfall and What is the change?'s change or shortfall (Make a shopping list's "Over your budget" has none). It opens `dialog#show-money` (`public/js/show-money.js`): "You need" / "Your change", the amount ("$1.30 more" / "$2.70"), the pieces in words ("$1 + 20¢ + 10¢"), and the notes in a column with the coins in a row under them, each at its real size order with a ×N badge for repeats. "✔ OK" closes it.

**Rounding.** Singapore issues no 1¢ coin, so Show me and Make the amount round **up** to the next 5¢ (`roundUpToCoin()`) — never down, because an answer that leaves the student a few cents short is the one wrong answer — and say so: "That makes $1.35". The pieces are the fewest notes and coins (`breakdown()`: largest first, which is optimal for SGD's 1-2-5 values). Next dollar and Next note need no rounding: they already round up.

## What each tool saves

Each tool keeps its own numbers in `localStorage` (debounced 200 ms, flushed before a reload or when the app goes to the background), so a count made at home is still there at the shop, offline. The shape is only the parts the tool has:

```
{ moneyValue, moneySource: "typed" | "notes", pickedNotes: [cents …], spendValue, needValue, items: [{ value }] | [{ name, value }] }
```

Values are the raw text as typed. Can I buy? saves under **`afford-it-v1`**, the key the app used when Can I buy? was the whole app, in exactly the shape it used then — so nobody's numbers were lost when the menu arrived. The other five use `simplify-<id>-v1` (`storageKey()` in `public/js/app.js`). The full registry is the [data model](/platform/data-model.md).

## The maths and the words are pure

- `public/js/money.js` — integer cents only, no floats: `parseToCents`, `formatCents`, `roundUpToCoin`, `breakdown`, `moneyWords` ("$2 × 3 + 50¢"), `nextDollar`, `nextNotes`, `piecesTotal`.
- `public/js/answers.js` — one pure function per tool (`canIBuy`, `change`, `nextDollarAnswer`, `nextNote`, `makeAmount`, `shoppingList`), taking amounts already in cents (`null` = empty box) and returning `{ tone, icon, headline, subline?, badge?, showMe?, pictures? }`. `ANSWERS` maps each tool id to its function.
- Neither touches the DOM, so `node tools/test-money.mjs` holds every sum and every wording to account, including every example from the original change requests, numbered as there.
- A subline may contain `<strong>` around formatted amounts. `answers.js` marks its own answers with the `MARKUP` symbol, and `result.js` uses `innerHTML` for a subline only when that mark is present; any other answer, with words a person typed, is plain text. A Symbol can't come from JSON, so no saved state or class page can claim it (see [security](/platform/security.md)).

## The currency drawings

The note and coin pictures are drawn to be recognised, not copied. Singapore's Currency Act (s.20; Gazette Notification 2078 of 2006) covers "any photograph, drawing or design resembling" a note or coin, and using any design from one needs MAS permission. So the drawings in `public/js/currency-data.js` (`noteSvg`, `coinSvg`, `moneySvg`) take only physical facts from MAS's own descriptions:

- **Notes** (portrait series): each note's own colour in two tones, its true proportions from `sizeMm` (a $2 is drawn 78% the length of a $100), a pale oval where every note has its watermark, and the value — large, and small in two corners.
- **Coins** (third series): each coin's metal — 5¢ gold (brass-plated); 10¢–50¢ silver (nickel-plated); $1 a silver centre in a gold ring — its relative diameter, a raised rim, and the value in dark ink.
- **Never the artwork:** no portrait, coat of arms, lion, cowrie shells, landmarks, orchid, "SINGAPORE" lettering, signatures, serial numbers, security features, octagon frame or bead ring. That list lives in the header comment of `public/js/currency-data.js`; keep it there.

Each drawing's gradient gets a unique id, because the same note can be on screen in the picker, Show me and an answer at once, and a `url(#id)` that resolves into a closed dialog paints nothing. Another currency would be one more entry in `CURRENCIES`; the picker draws whatever it finds.

## Who owns what

| Module | Owns |
|---|---|
| `public/index.html` | each tool's block, headings and box labels; the picker, Show me and speak dialogs; the answer panel and pill |
| `public/js/money-tool.js` | the controller: boxes, list, saving, `clearAll`, `hasAnything` |
| `public/js/money-field.js` | one money box: 🎤 / ✕ / 💵, the chip, tidy on blur |
| `public/js/items.js` | price rows and names, Add item, remove and undo |
| `public/js/note-picker.js` | the notes-and-coins picker |
| `public/js/show-money.js` | Show me and the answer pictures (`renderPictureGroups`) |
| `public/js/result.js` | the panel and the floating pill |
| `public/js/answers.js`, `public/js/money.js` | the words and the maths (pure) |
| `public/js/currency-data.js` | SGD denominations, sizes, colours and the drawings |

Pinned by `node tools/test-money.mjs` and the `money:` scenes of `tools/smoke/app.mjs` (including each tool's own key, numbers saved by the older version, and ✕ with Put it back); the guide's screenshots come from `tools/shoot-guide.mjs` ([local development](/operations/local-development.md)).
