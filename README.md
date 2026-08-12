# simplify — Can I Afford It?

Simplify workflows for special needs.

**Live:** <https://simplify.whiz.coach/> (custom domain) —
also at <https://simplify-special.web.app/>

**Can I Afford It?** is a simple, static progressive web app that helps
special-needs users answer one question: *"Do I have enough money to buy
these things?"*

- **My money** — type an amount, dictate it with the mobile keyboard's
  microphone, or tap pictures of Singapore notes and coins to count cash
  visually.
- **Things I want to buy** — add any number of prices.
- **The answer** — a big, always-visible green "Yes! You have enough" or
  red "Not enough", with the money left over or how much more is needed.

A step-by-step **user guide** lives at [/guide](public/guide.html)
(served without the `.html` suffix because of Hosting's `cleanUrls`; linked
from the landing page, opens in a new tab). It covers basic use,
dictating amounts with the keyboard microphone, and adding the app to the
home screen on iPhone and Android. Its screenshots are in
`public/img/guide/`; both the page and images are precached by the service
worker so the guide works offline too.

No framework, no build step, no account, no analytics — nothing leaves the
device. Works offline once installed (PWA).

## Design principles for special-needs users

- One screen, one question — no navigation, menus, or settings.
- Touch targets 56–96&nbsp;px with generous spacing.
- Never a validation error — bad input is prevented or forgiven, not rejected.
- Every state uses color + icon + plain words together (works for
  color-blind users and non-readers); WCAG AAA contrast.
- Big type, plain language, at most a few words per label.
- Immediate feedback — the answer updates as you type or tap; no submit button.
- Undo instead of confirmation dialogs ("Take back one", "Put it back").
- The note/coin pictures are stylized drawings (real SGD colors + big
  numerals), which avoids MAS currency-reproduction restrictions and is more
  legible than photos.
- `prefers-reduced-motion` respected; state saved locally so it survives
  closing the app (count your notes at home, check at the shop, offline).

## Run locally

Any static server works:

```sh
python3 -m http.server -d public 8080
# then open http://localhost:8080
```

or with the Firebase emulator: `firebase emulators:start --only hosting`.

## Deploy to Firebase Hosting

The Firebase project is `simplify-special` (set in `.firebaserc` and the
deploy workflow). The live site is served at
<https://simplify-special.web.app/>, with the custom domain
<https://simplify.whiz.coach/> mapped to the same Hosting site (added under
**Hosting → Custom domains** in the Firebase console).

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

When releasing a new version, bump the `CACHE` version string in
`public/sw.js` so installed apps pick up the new files on next launch.

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

- `og:image` deliberately points at the `.web.app` origin, which is always
  reachable by crawlers even if custom-domain DNS is mid-change. After sharing,
  re-scrape with the [Facebook Sharing Debugger][fb] or [X Card Validator][x]
  to clear their caches.

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
