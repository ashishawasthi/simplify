# simplify — Can I Afford It?

Simplify workflows for special needs.

**Can I Afford It?** is a simple, static progressive web app that helps
special-needs users answer one question: *"Do I have enough money to buy
these things?"*

- **My money** — type an amount, dictate it with the mobile keyboard's
  microphone, or tap pictures of Singapore notes and coins to count cash
  visually.
- **Things I want to buy** — add any number of prices.
- **The answer** — a big, always-visible green "Yes! You have enough" or
  red "Not enough", with the money left over or how much more is needed.

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

One-time setup:

1. Create a Firebase project at <https://console.firebase.google.com> and
   put its project ID in `.firebaserc` (replacing `YOUR_FIREBASE_PROJECT_ID`).
2. Manual deploys: `npm i -g firebase-tools`, `firebase login`, then

   ```sh
   firebase deploy --only hosting
   ```

Automatic deploys (GitHub Actions, `.github/workflows/deploy.yml`) run on
every push to `main`. They need:

1. A repository **variable** `FIREBASE_PROJECT_ID` set to your project ID
   (Settings → Secrets and variables → Actions → Variables).
2. A repository **secret** `FIREBASE_SERVICE_ACCOUNT` containing a service
   account JSON key with the *Firebase Hosting Admin* role. The easiest way
   to create both the account and the secret is:

   ```sh
   firebase init hosting:github
   ```

   (or create the service account manually in Google Cloud IAM and paste
   its JSON key into the secret).

When releasing a new version, bump the `CACHE` version string in
`public/sw.js` so installed apps pick up the new files on next launch.

## Platform notes

- The money inputs use `type="text"` + `inputmode="decimal"`, so the numeric
  keyboard appears on mobile *and* the OS keyboard microphone (dictation)
  still works; dictated text like "10 dollars 50" is parsed forgivingly.
- `<dialog>` requires iOS ≥ 15.4 / modern Android.
- Haptic tick on note taps uses `navigator.vibrate` (not supported on iOS;
  silently skipped).
