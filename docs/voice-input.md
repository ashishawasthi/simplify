# Voice input without a speech API or a model

This app accepts spoken amounts — "ten dollars fifty" becomes `10.50` in the
money box — with **no speech recognition code, no model, no network call, and
no microphone permission**. It borrows the dictation the user's keyboard
already has, then parses the text it types.

Two problems have to be solved, and they are independent:

1. **Getting dictated text at all**, given that the money fields use a numeric
   keypad which has no mic button.
2. **Turning that text into an amount**, given that dictation writes numbers
   inconsistently.

---

## Why not the Web Speech API

`SpeechRecognition` is the obvious tool and it is the wrong one here.

- **It does not work in an installed iOS PWA.** This app is designed to be
  added to the home screen, which is exactly the context where the API is
  unavailable on iOS. A voice feature that silently dies for half the users is
  worse than none.
- **It prompts for microphone access.** The audience is users with cognitive
  or motor difficulties; a permission dialog is a hard stop for many of them.
- **It needs a network round trip** on several implementations. The rest of the
  app works offline from the service worker cache, and voice entry should not
  be the one thing that fails in a shop with no signal.

Keyboard dictation has none of these problems. It is built into the OS, the
user has already granted it whatever it needs, it works offline on modern
Android and iOS, and — critically — **the web page is never involved**. The
page cannot tell dictation from typing.

---

## Part 1 — Opening a text input so the keyboard offers a mic

### The obstacle

The money fields (`#money-input` and each item row's price box, in
[`public/index.html`](../public/index.html)) carry `inputmode="decimal"`,
because the app's whole point is entering amounts and a numeric keypad is far
easier to hit accurately.

That attribute asks the OS for the number pad. **Neither Gboard nor the
iOS keyboard offers voice typing on the number pad.** Tapping the mic there
produces Gboard's "This app doesn't support voice input" toast — the keyboard
is declining, not the browser, and no page-level code can change that.

So the amount cannot be dictated *into the field the user is looking at*. It
has to be dictated somewhere that gets a full keyboard.

### The workaround: a dialog with a plain text box

The 🎤 button opens the `#speak` `<dialog>` in
[`public/index.html`](../public/index.html). Its `#speak-input` is an ordinary
`type="text"` field with **no `inputmode`**, so the OS shows the full
alphabetic keyboard, mic included. Its placeholder is an example amount rather
than an instruction, because the field works just as well for typing.

The user flow is: tap 🎤 → dialog opens with the keyboard up → tap the
keyboard's own mic → speak → the words appear as text → tap Done.

### The one timing detail that matters

`openSpeak()` in [`public/js/speak.js`](../public/js/speak.js) calls
`showModal()` and then focuses the input **synchronously**, still inside the
button's click handler. That ordering is load-bearing: mobile browsers only
raise the on-screen keyboard for a focus call that is part of a user gesture.
Move that focus into a `setTimeout`, a promise callback, or a transition-end
handler and the dialog opens with no keyboard — the user then has to tap the
field themselves before they can reach the mic, which is an extra step for the
people least able to absorb one.

### Why a text input and not a `<select>`, buttons, or a custom widget

Because dictation is a *keyboard* feature. It only exists where the OS shows a
keyboard, which means a focused text-editable element. Anything that isn't a
real focused input gets no mic.

### What the page actually observes

Nothing about speech. The OS inserts characters and fires `input` events
identical to typing. That is what makes this approach robust: there is no API
to feature-detect, no promise to reject, no permission to be denied. If
dictation is unavailable or the user prefers, **they can just type into the
same box** — the dialog is a working text input either way, which is why the
placeholder shows an example rather than instructions.

---

## Part 2 — Turning the transcript into cents

### Nothing hands us a number

Speech engines return strings, always. The digits you often see are not a
numeric type — the engine chose a digit *spelling*. This happens in a step
called **inverse text normalization (ITN)**: after recognising words, the
engine reformats certain categories into their conventional written form, so
"twelve fifty" is emitted as the characters `12.50`.

ITN is a convenience, not a contract. It varies by engine, OS version,
language, and phrasing. The parser therefore assumes nothing and handles both
digit text and word text.

### The awkward cases ITN produces

| The user says | Dictation may write | Why it is awkward |
|---|---|---|
| "twelve fifty" | `12:50` | ITN guessed **a time**, not money |
| "twelve fifty" | `12.50` | already correct |
| "twelve fifty" | `twelve fifty` | no ITN applied |
| "ten dollars fifty cents" | `10 dollars 50 cents` | two numbers, needs joining |
| "fifty cents" | `50 cents` | the number is cents, not dollars |
| "one thousand two hundred" | `1,200` | thousands separator |
| "twenty five" | `twenty-five` | hyphenated, two words, one number |

### The conversion, step by step

All of this lives in [`public/js/speak.js`](../public/js/speak.js) as
`speechToCents(raw)`, which returns **integer cents** or `null` when no number
can be found. Integer cents avoids float rounding errors on money.

**Step 1 — normalise the text.** Lowercase, drop `$` and `,` as noise, and
rewrite a `12:50`-shaped colon into `12.50`. That last rule is the important
one: it reinterprets ITN's time guess as a decimal amount.

**Step 2 — convert any surviving number words to digits.** `wordsToDigits()`
splits on whitespace *and hyphens*, then walks the words with two registers:
`cur`, the part being built right now, and `done`, the thousands groups already
banked. It emits a number — `flush()` — whenever the next word cannot continue
the current one. `UNITS` and `TENS` are the word tables it matches against.

Four details carry the behaviour:

- **"twelve fifty" is two numbers, not 62.** A tens word after a small number
  flushes. The `cur % 100 !== 0` test in that guard keeps "two hundred fifty" a
  single 250, because a hundreds value *can* legitimately absorb a tens word.
- **"five five" is two numbers, not 10.** A unit word after another small
  number (`cur < 20`) flushes too.
- **Thousands are banked into `done` rather than multiplied into `cur`.** This
  is what keeps "one thousand two hundred" at 1200: the later `× 100` for
  "hundred" reaches only the `two`, never the thousand already settled.
- **Hyphens split rather than vanish.** Deleting them (an earlier version did)
  turns "twenty-five" into `twentyfive`, which matches no word table and is
  passed through as ordinary text — so "twenty-five dollars fifty cents"
  parsed as **$50.00**, a wrong amount stated with full confidence rather than
  a visible failure.

Words that aren't numbers pass through untouched, so "dollars" and "cents"
survive for the next step. `"and"` and `"a"` are skipped, letting "a hundred
and five" work.

**Step 3 — decide what the numbers mean.** Back in `speechToCents()`: test the
text for `dollar|buck` and for `cent`, pull out every number with a regex, and
apply three rules in priority order.

1. **Cents mentioned without dollars** → the number *is* cents. "fifty cents"
   is 50¢, not $50.
2. **Two whole numbers, second under 100** → dollars and cents. Covers
   "ten dollars fifty", "ten fifty", and the `12 50` that step 2 produced.
   Both must be whole, so `12.50` and `50` don't merge. The under-100 test
   stops a second number that cannot be cents from being merged — though note
   it is then *dropped* rather than reconsidered, so "10 200" yields $10.
3. **Otherwise** → dollars, decimals included.

The only place a real number is created is the `parseFloat`/`Math.round` in
these three rules. Everything before this is string manipulation.

### Showing the user what was understood

`preview()` runs the parse on every `input` event, not just on Done, and writes
the result into `#speak-heard`.

So as dictation lands, the dialog says **"That is $10.50"** underneath. The
user confirms the interpretation before it reaches their money — important
when a heuristic parser might read "twelve fifty" as $12.50 or $1,250. The
element carries `role="status"`, so screen readers announce it too.

Done with an unparseable value doesn't close the dialog; it shows
*"Say a number, like 'ten dollars'"* and lets the user try again.

---

## Checking the parser

Every example in this document is a case in
[`tools/test-speak.mjs`](../tools/test-speak.mjs), which imports the real
module and needs no dependencies or runner:

```sh
node tools/test-speak.mjs
```

Two bugs found this way had both produced *confident wrong amounts* rather than
visible failures — the worst outcome for a parser whose result the user is
asked to approve. Keep the cases and this document in step.

---

## Known gaps in the parser

**A non-cents second number is silently discarded.** `"10 200"` → `$10`. Rule 2
declines to merge, and rule 3 only ever reads `nums[0]`. This is deliberate:
guessing at input the parser cannot interpret risks inventing a large amount,
whereas the *"That is $10.00"* preview shows the user the result before it
reaches their money. It is also hard to reach in practice — the phrasings that
would produce it, like "one thousand two hundred" or "1,200", now resolve to a
single number.

Note that the whole words path is unreachable whenever dictation applies ITN,
which is the common case on both Gboard and iOS.

---

## Trade-offs of this approach

**What it costs.** The parser is a heuristic, not a grammar — it will misread
unusual phrasings (see Known gaps above), and it is English-only (`UNITS`,
`TENS`, and the `dollar|cent` tests are hardcoded). It also adds a dialog step:
dictating takes an extra tap compared to a mic wired directly into the field.

**What it buys.** No permission prompt, no network, no model, works offline,
works in installed iOS PWAs, degrades to plain typing if dictation is missing,
and adds no dependency or bundle weight. The preview line makes the heuristic's
mistakes visible and correctable before they matter.

For a money app whose users struggle with typing but can speak, and which must
work in a shop with no signal, that trade is clearly worth it.
