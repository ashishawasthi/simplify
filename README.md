# simplify — money tools

Simplify workflows for special needs.

**Live:** <https://simplify.whiz.coach/> — the address people use, and the
only one to share or link to. Every absolute URL in the app and guide
(canonical, Open Graph, the QR codes, the guide's instructions) uses it; links
between pages stay relative so they also work offline and in PR previews.
(The same site answers at Firebase's own `simplify-special.web.app` too, but
that is a separate origin: numbers saved there don't carry over.)

**Simplify** is a simple, static progressive web app of money tools for
special-needs learners. It opens on a menu of six big buttons; each tool is
one screen that answers one question:

| Tool (URL) | Asks for | Answers |
|---|---|---|
| **Can I buy?** (`/#can-i-buy`) | My money, the prices of things | green "Can buy · Money left", or red "Cannot buy · You need $X more" with 💵 Show me |
| **What is the change?** (`/#change`) | My money (the note you pay with), I spend | "Change: $2.70", with 💵 Show me |
| **Next dollar** (`/#next-dollar`) | the prices | "Next dollar: $4 · You get back $0.50" |
| **Next note** (`/#next-note`) | the prices | "Next note: $5 · No $5? Use $10", with both notes drawn |
| **Make the amount** (`/#make-amount`) | I need | "$1 + 20¢ + 10¢", drawn |
| **Make a shopping list** (`/#shopping-list`) | My money, item names and prices | "Yes! Within your budget · Money left", or "Over your budget" |

- **My money** — type an amount, dictate it with the keyboard's microphone
  (🎤), or tap pictures of Singapore notes and coins (💵) to count cash; each
  picture shows how many times it was tapped (×2).
- **The answer** — always visible at the bottom: green yes, red no, blue for
  an amount, grey for "what to type next". An empty money box counts as $0, so
  a price alone already gives an answer.
- **💵 Show me** — the notes and coins for a shortfall or for the change,
  drawn, fewest pieces, rounded up to the next 5¢ (there is no 1¢ coin).
- Each tool remembers its own numbers; **Start over** clears only the tool on
  screen; **🏠 Menu** (or Back) returns to the menu. Every tool has its own
  link, which a teacher can share.

What each tool says lives in `public/js/answers.js` (pure, no DOM); the
maths — fewest notes and coins, next dollar, next note, rounding — in
`public/js/money.js`. Both are pinned by `node tools/test-money.mjs`, which
includes every example from the requester's change-request document.

The **user guide** is a short topic menu at [/guide](public/guide.html) with
one small page per topic under [/guide/](public/guide/): `menu`, one page per
tool (`can-i-buy`, `change`, `next-dollar`, `next-note`, `make-amount`,
`shopping-list` — the same ids as the app's URLs, and each tool's "How to use
this tool" link opens its page), then `notes-and-coins`, `speak`,
`home-screen`, `updates`, `no-microphone` and `privacy` — so nobody has to
read a long page to find one answer. Pages are served without `.html`
(Hosting `cleanUrls`), share `public/css/guide.css`, and start and end with a
"← Help menu" link. Screenshots are in `public/img/guide/`; every page and
image is precached by the service worker, so the guide works offline too.

The guide was once a single page whose sections were shared as
`/guide#<section>` links; `public/js/guide-links.js` forwards those to the
section's new page. A new topic page needs a button on the menu, an entry in
`ASSETS` in `public/sw.js`, and — if it replaces an old section — a line in
`guide-links.js`.

Update the guide **after** a change has been tested locally, never
alongside it, so its words and pictures describe what actually ships. The
screenshots come from the running app, one scene per run:

```sh
for s in menu yes no picker show-me change next-dollar next-note make-amount shopping-list; do node tools/shoot-guide.mjs $s; done
```

(Node 22 and Chrome, nothing to install; each scene checks the app reached
the expected state before writing the PNG.)

`mic-on-keyboard.png` is a real Android screenshot (dialog plus the phone's own
keyboard, with the microphone key ringed in `--color-primary`), so it has to be
retaken on a device — the keyboard belongs to Android, not to the page, and no
headless capture can include it.

No framework, no build step, no account, no analytics — nothing leaves the
device. Works offline once installed (PWA).

## Design principles for special-needs users

- One question per screen, picked from one simple menu — one level deep, no
  settings. Every tool is built from the same parts in the same places (money
  box, list, answer at the bottom) and uses the same words ("Add item",
  "Start over", "Put it back", "Can buy / Cannot buy").
- Touch targets 56–96&nbsp;px with generous spacing.
- Never a validation error — bad input is prevented or forgiven, not rejected.
  A blank box counts as $0 rather than leaving the answer waiting.
- Every state uses color + icon + plain words together (works for
  color-blind users and non-readers); WCAG AAA contrast. The floating
  yes/no badge at the top of the screen (visible even when the on-screen
  keyboard hides the bottom panel) carries the short amount too — "$6
  more", not just ✋ — for the same reason.
- Big type, plain language, at most a few words per label.
- Immediate feedback — the answer updates as you type or tap; no submit button.
- Undo instead of confirmation dialogs ("Take back one", "Put it back").
- The note/coin pictures are drawn to be recognised, not copied. Singapore's
  Currency Act (s.20; Gazette Notification 2078 of 2006) covers any drawing
  *resembling* a note or coin, and using any design from one needs MAS
  permission, so the drawings take only physical facts from MAS's own
  descriptions: each note's colour and true proportions (a $2 is drawn 78% the
  length of a $100), each coin's metal (5¢ gold; 10¢–50¢ silver; $1 a silver
  centre in a gold ring) and relative size, and the value. Never the artwork:
  no portrait, coat of arms, lion, landmarks, orchid, lettering, signatures,
  serial numbers or security features (the full list is in
  `public/js/currency-data.js`).
- `prefers-reduced-motion` respected; state saved locally so it survives
  closing the app (count your notes at home, check at the shop, offline).
  Each tool has its own `localStorage` key; Can I buy? keeps `afford-it-v1`,
  the key the app used before it had a menu, so nobody's numbers were lost.

## Tests

No dependencies, no runner:

```sh
node tools/test-money.mjs   # money maths + every tool's wording, incl. the requester's examples
node tools/test-speak.mjs   # the dictation parser
```

## Run locally

Any static server works:

```sh
python3 -m http.server -d public 8080
# then open http://localhost:8080
```

or with the Firebase emulator: `firebase emulators:start --only hosting`
(this one also applies the `firebase.json` headers).

The service worker serves everything cache-first, so a reload won't show an
edit to a file it has already cached. While developing, tick "Update on
reload" under DevTools → Application → Service workers.

## Deploy to Firebase Hosting

The Firebase project is `simplify-special` (set in `.firebaserc` and the
deploy workflow). The live site is <https://simplify.whiz.coach/>, a custom
domain mapped to the Hosting site (added under **Hosting → Custom domains**
in the Firebase console); Firebase's default
`https://simplify-special.web.app/` serves the same files.

Manual deploys: `npm i -g firebase-tools`, `firebase login`, then

```sh
firebase deploy --only hosting
```

Automatic deploys (`.github/workflows/firebase-hosting-merge.yml`) run on
every merge/push to `main` and publish to the `live` channel, so both URLs
update together. Pull requests get a temporary preview channel URL
(`.github/workflows/firebase-hosting-pull-request.yml`).

One-time setup: a repository **secret**
`FIREBASE_SERVICE_ACCOUNT_SIMPLIFY_SPECIAL` containing a service account JSON
key with the *Firebase Hosting Admin* role. The easiest way to create both the
account and the secret is:

   ```sh
   firebase init hosting:github
   ```

   (or create the service account manually in Google Cloud IAM and paste
   its JSON key into the secret).

**Before merging any change to `main`**, check whether `CACHE` in
`public/sw.js` needs bumping. The service worker is cache-first: without a new
`CACHE` string, already-installed apps keep serving the old HTML/CSS/JS
indefinitely after deploy, even though the raw files on the server are new.
Bump it for any change to `public/` — HTML, CSS, JS, or a precached image —
skip it only for changes that don't touch `public/` at all (e.g. `README.md`,
`tools/`). A new file under `public/` also has to be added to `ASSETS`, or it
won't work offline.

### How an update reaches people already using the app

Opening the app (a page load) makes the browser fetch `sw.js`; a changed
`CACHE` installs the new files in the background and the new worker takes
over. The page already on screen is still the old one, so on its own the
change would only show on the *following* open — and switching back to the
app from the app switcher (common on Android and iPad) isn't an open at all.
`public/js/update.js` closes both gaps:

- it reloads into the new version as soon as one takes over, if the screen
  hasn't been touched since the app opened or came to the front; otherwise
  the next time the app goes to the background — never while a window (the
  picker, speak, Show me) is open;
- when the app comes back to the front (at most every 10 minutes) it asks the
  browser to check for a new version, so an app left open for days updates
  too;
- `storage.flush()` runs before that reload and whenever the app is hidden, so
  the last number typed survives.

Devices still running a version from before `update.js` existed need two opens
to pick up the first version that has it.

`firebase.json` serves `sw.js`, the manifest, HTML, JS and CSS with
`Cache-Control: no-cache` (ETags make the recheck a cheap 304), so a browser
without the service worker can never mix old and new modules. Header rules
that set the same key are resolved by order — the later rule wins — which is
why the broad globs come first. Images keep `max-age=3600`.

Every response also carries a Content-Security-Policy (same-origin only; no
inline script and no inline styles — the guide's CSS lives in
`css/guide.css`, and JS only sets styles through the DOM, which is allowed),
`X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` and a
`Permissions-Policy` that turns off camera, microphone and location — voice
entry uses the keyboard's own dictation, never the page. To check headers
locally: `firebase serve --only hosting --port 5050`.

## Sharing

- `public/img/og-card.png` (1200×630) is the Open Graph / Twitter
  `summary_large_image` card referenced from `public/index.html`. It contains a
  QR code for <https://simplify.whiz.coach/> **and** the URL as readable text,
  so a screenshot of the link preview is still scannable and typeable.
  The app name, QR and URL are all centred inside the middle 630×630 square,
  because WhatsApp — the main sharing route — crops a preview to that square
  and discards the rest. Keep anything that must survive inside it. The
  `og:image` URL carries a `?v=` cache-buster: scrapers key their cached copy
  on the full URL, so bump it whenever the card is redrawn, or WhatsApp and
  Facebook will keep serving the old picture.
- `public/img/qr-poster.png` (1000×1240) is a standalone QR for printed
  handouts or posters.
- Both are generated offline (no third-party QR service) with `segno` +
  `Pillow`; the generator lives in `tools/make-qr.py`. Re-run it after changing
  the URL or wording:

  ```sh
  python3 -m pip install segno pillow && python3 tools/make-qr.py
  ```

- `og:image` points at <https://simplify.whiz.coach/>, like every other
  absolute URL. After changing it or the card, re-scrape with the
  [Facebook Sharing Debugger][fb] or [X Card Validator][x] to clear their
  caches.

[fb]: https://developers.facebook.com/tools/debug/
[x]: https://cards-dev.twitter.com/validator

## Platform notes

- The money inputs use `type="text"` + `inputmode="decimal"` for the big
  numeric keyboard — but that keyboard has **no dictation key** on iOS or
  Android (Gboard shows "This app doesn't support voice input"). Voice entry
  therefore goes through the 🎤 button inside each money box — shown only
  while the box is empty (a ✕ clear button takes the same slot once it has
  a value), so it can't read as a submit step: it opens the
  `#speak` dialog whose plain text input summons the full keyboard (mic
  available), and `js/speak.js` parses the dictated text — digits, "10
  dollars 50 cents", word numbers like "twelve fifty" — into a clean amount.
  (The Web Speech API was rejected because it doesn't work in installed
  home-screen PWAs on iOS.) See
  [docs/voice-input.md](docs/voice-input.md) for how this works end to end,
  and for the parser's known gaps.
- `<dialog>` requires iOS ≥ 15.4 / modern Android.
- Haptic tick on note taps uses `navigator.vibrate` (not supported on iOS;
  silently skipped).
