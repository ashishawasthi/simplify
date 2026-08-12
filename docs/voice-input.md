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

The money fields are declared like this, because the app's whole point is
entering amounts and a numeric keypad is far easier to hit accurately:

```html
<input id="money-input" type="text" inputmode="decimal" ...>
```

`inputmode="decimal"` asks the OS for the number pad. **Neither Gboard nor the
iOS keyboard offers voice typing on the number pad.** Tapping the mic there
produces Gboard's "This app doesn't support voice input" toast — the keyboard
is declining, not the browser, and no page-level code can change that.

So the amount cannot be dictated *into the field the user is looking at*. It
has to be dictated somewhere that gets a full keyboard.

### The workaround: a dialog with a plain text box

The 🎤 button opens a `<dialog>` containing an ordinary text input — no
`inputmode`, so the OS shows the full alphabetic keyboard, mic included:

```html
<dialog id="speak" class="speak" aria-labelledby="speak-title">
  <h2 id="speak-title">Tap 🎤, say your money</h2>
  <p class="speak-hint">Tap the microphone on your keyboard, then say the amount.</p>
  <input id="speak-input" type="text" autocomplete="off"
         enterkeyhint="done" placeholder="ten dollars fifty"
         aria-label="Say or type the amount">
  <p id="speak-heard" role="status">&nbsp;</p>
  ...
</dialog>
```

The user flow is: tap 🎤 → dialog opens with the keyboard up → tap the
keyboard's own mic → speak → the words appear as text → tap Done.

### The one timing detail that matters

```js
export function openSpeak(cb) {
  onAmount = cb;
  els.input.value = "";
  preview();
  els.dialog.showModal();
  els.input.focus(); // same tap gesture, so the keyboard opens right away
}
```

`focus()` must run **synchronously inside the button's click handler**. Mobile
browsers only raise the on-screen keyboard for a focus call that is part of a
user gesture. Move that `focus()` into a `setTimeout`, a promise callback, or a
transition-end handler and the dialog opens with no keyboard — the user then has
to tap the field themselves before they can reach the mic, which is an extra
step for the people least able to absorb one.

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
| "twenty five" | `twenty five` | two words, one number |

### The conversion, step by step

All of this lives in [`public/js/speak.js`](../public/js/speak.js) as
`speechToCents(raw)`, which returns **integer cents** or `null` when no number
can be found. Integer cents avoids float rounding errors on money.

**Step 1 — normalise the text.**

```js
let s = String(raw)
  .toLowerCase()
  .replace(/[,$]/g, "")
  .replace(/(\d+):(\d{2})/g, "$1.$2") // "twelve fifty" often arrives as "12:50"
  .trim();
```

Currency symbols and thousands separators are noise. The colon rule is the
important one: it reinterprets ITN's time guess as a decimal amount.

**Step 2 — convert any surviving number words to digits.**

`wordsToDigits()` walks the tokens with a small accumulator, emitting a number
whenever the next word cannot continue the current one:

```js
if (word in TENS) {
  // a tens word never continues a small number: "twelve fifty" is 12 | 50
  if (cur != null && cur % 100 !== 0) flush();
  cur = (cur ?? 0) + TENS[word];
} else if (word in UNITS) {
  if (cur != null && cur < 20) flush(); // "five five" is 5 | 5
  cur = (cur ?? 0) + UNITS[word];
} else if (word === "hundred") {
  cur = (cur ?? 1) * 100;
}
```

The two `flush()` guards encode how people actually say prices:

- **"twelve fifty" is two numbers, not 62.** A tens word after a small number
  starts a new number. But `cur % 100 !== 0` keeps "two hundred fifty" as a
  single 250, because a hundreds value *can* legitimately absorb a tens word.
- **"five five" is two numbers, not 10.** A unit word after another small
  number starts a new one.

Words that aren't numbers pass through untouched, so "dollars" and "cents"
survive for the next step. `"and"` and `"a"` are skipped, letting "a hundred
and five" work.

**Step 3 — decide what the numbers mean.**

```js
const hasDollar = /dollar|buck/.test(s);
const hasCent = /cent/.test(s);
const nums = s.match(/\d*\.\d+|\d+/g);
if (!nums) return null;

const first = parseFloat(nums[0]);
if (hasCent && !hasDollar) return Math.round(first);        // "50 cents"
if (nums.length >= 2 && !nums[0].includes(".") && !nums[1].includes(".")) {
  const second = parseFloat(nums[1]);
  if (second < 100) return Math.round(first * 100 + second); // "10 dollars 50"
}
return Math.round(first * 100);                              // "12.50", "10"
```

Three rules, in priority order:

1. **Cents mentioned without dollars** → the number *is* cents. "fifty cents"
   is 50¢, not $50.
2. **Two whole numbers, second under 100** → dollars and cents. Covers
   "ten dollars fifty", "ten fifty", and the `12 50` that step 2 produced.
   Both must be whole: `12.50` and `50` should not merge. The `< 100` test
   stops a second number that cannot be cents from being merged — though note
   it is then *dropped* rather than reconsidered, so "10 200" yields $10.
3. **Otherwise** → dollars, decimals included.

The only place a real number is created is `parseFloat` / `Math.round` here.
Everything before this is string manipulation.

### Showing the user what was understood

The parse runs on every `input` event, not just on Done:

```js
function preview() {
  const cents = speechToCents(els.input.value);
  els.heard.textContent = cents == null ? " " : `That is ${formatCents(cents)}`;
}
```

So as dictation lands, the dialog says **"That is $10.50"** underneath. The
user confirms the interpretation before it reaches their money — important
when a heuristic parser might read "twelve fifty" as $12.50 or $1,250. The
element carries `role="status"`, so screen readers announce it too.

Done with an unparseable value doesn't close the dialog; it shows
*"Say a number, like 'ten dollars'"* and lets the user try again.

---

---

## Known gaps in the parser

Verified against the current implementation. All three are in the
words-to-digits path; the digit path that ITN normally produces is unaffected,
which is why they are easy to miss in day-to-day use.

**Hyphenated tens return `null`.** `"twenty-five"` → `null`, while
`"twenty five"` → `2500` correctly. The token loop strips hyphens with
`tok.replace(/-/g, "")`, producing `"twentyfive"`, which matches neither
`UNITS` nor `TENS` and falls through as an ordinary word. The inline comment
`// "twenty-five"` shows the intent was to support it. Splitting on the hyphen
rather than deleting it would fix this. User-visible: dictation that emits a
hyphenated number is rejected with *"Say a number, like 'ten dollars'"*.

**"thousand" over-multiplies when followed by more words.**
`"one thousand two hundred"` → `10020000` cents, i.e. **$100,200** instead of
$1,200. `hundred` and `thousand` multiply the whole accumulator rather than
only its trailing part, so `1000` then `+2` then `×100` compounds. A correct
implementation keeps a separate running total and partial value. Plain
`"one thousand"` → `100000` ($1,000) is fine, as is `"two hundred fifty"`.

**A non-cents second number is silently discarded.** `"10 200"` → `$10`. Rule 2
declines to merge, and rule 3 only ever reads `nums[0]`. Arguably safer than
guessing, but the user gets no signal that part of what they said was ignored —
though the *"That is $10"* preview does at least show the result before they
commit to it.

None of these are reachable when dictation applies ITN, which is the common
case on both Gboard and iOS.

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
