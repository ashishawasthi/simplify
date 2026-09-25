# Simplify

Simplify workflows for special needs.

**Simplify** is a free, static progressive web app for autistic and other special-needs children and teens in
Singapore. It opens on one menu of big buttons, and each tool is one screen that does one job:

- **Money** — Can I buy?, What is the change?, Next dollar, Next note, Make the amount, Make a shopping list: type,
  dictate or tap pictures of Singapore notes and coins, and get a green, red or blue answer at once.
- **My day** — Now and next (with the whole day as My day), Wait (a shrinking disc), Steps (one step at a time for
  daily tasks), Time sums (how long until a time, or what time it will be after some minutes).
- **Talk** — I need (cards for asking when speech fails), Show a card (big cards to show a bus captain, cashier or
  onlooker).
- **Stay safe** — Stop and check (someone asked for a code, money, photos or a meet-up: stop, show a trusted adult,
  or call the 1799 ScamShield Helpline).
- **My class** — the latest page from the learner's coach, one screen at a time, once a class is set up on the
  device. A new page shows at once when My class is open, and a coach can choose to open it on every learner screen
  that has Simplify open at that moment.

No account, no analytics, no build step. It works offline once opened, and nothing leaves the device unless My class
is set up — then only the class code. An adult sets each device up (hide tools, pictures only, speech, the class) on a
set-up page reached from the guide.

## Privacy: students have no login

**Students never sign in, and the application is designed for that.** Most learners are minors, so Simplify keeps
nothing that could identify one: there is no student account, login, ID, profile, cookie or tracking, and what is
never collected can never leak. Everything a student types, taps or picks stays on their device. A device that follows
a class sends only the class code (and, like any website, its internet address) to read the coach's page, and while
Simplify is on screen it listens for a new page on a plain read-only stream to that class — no Firebase SDK, no device
ID, no push token, nothing stored about who listens. A student's device never writes anything to any server, so no
coach or admin can see who had the app open. The choices behind this, and the other push options that were turned
down, are in [security](docs/platform/security.md#pushing-a-page-to-open-screens-the-privacy-analysis).

The **coach platform** behind My class lets coaches the admin has approved — each choosing the institutions they
work at — make classes and write one simple markdown page per class, with pictures, YouTube videos, short AI-made
videos and an AI helper, backed by Firestore, Cloud Storage, Cloud Functions and a Realtime Database (the push
signal) in Singapore.

## Live

- **Learner app:** <https://simplify.whiz.coach/> — the only address to share or link to (every absolute URL in the
  app, guide and QR codes uses it; links between pages stay relative, so they work offline and in PR previews).
  `simplify-special.web.app` serves the same files but is a separate origin, so numbers saved there don't carry over.
- **User guide:** <https://simplify.whiz.coach/guide>
- **For coaches:** the coach app is at `/coach/` on the same site, with its own guide at `/coach/guide.html`. Nothing
  a learner sees links to it — give coaches the address directly.

## Documentation

Everything beyond this page — how the app is built, every screen, the coach platform, security, data, AI models,
operations, the design principles, the research and the decision log — is in **[docs/index.md](docs/index.md)**, an
Open Knowledge Format (OKF 0.2) bundle: open the index, pick the area, then the one document you need. The indexes
are generated from each document's frontmatter by `node tools/build-docs-index.mjs` — never edit them by hand.

## Run locally

Any static server works for the learner app:

```sh
python3 -m http.server -d public 8080      # then open http://localhost:8080
```

To get the real `firebase.json` headers (CSP, caching, clean URLs — needed to test offline), serve with the Firebase
CLI instead: `firebase serve --only hosting --port 5050`. The coach app and My class run against the Firebase
emulators (`firebase emulators:start`, with fake AI models) from the plain Python server, because the site's CSP
blocks the emulators' ports — see [local development](docs/operations/local-development.md) for the details.

The service worker serves the app from its cache, so a reload may not show an edit; while developing, tick "Update
on reload" under DevTools → Application → Service workers.

## Tests

No test runner and no dependencies for the learner app — each test is a plain Node script (Node 22):

```sh
node tools/test-money.mjs       # money maths and every money tool's wording, incl. the original change requests
node tools/test-speak.mjs       # the dictation parser
node tools/test-wait.mjs        # Wait's time maths and saved state
node tools/test-i-need.mjs      # I need's cards, settings, sentences and body map
node tools/test-now-next.mjs    # Now and next's list rules
node tools/test-show-card.mjs   # Show a card's wording (LTA's words exactly) and settings
node tools/test-steps.mjs       # the Steps decks, Next/Back and Fewer steps
node tools/test-time-sums.mjs   # Time sums' arithmetic and every answer's words
node tools/test-stop-check.mjs  # Stop and check's asks and every word on its card
node tools/test-voice.mjs       # the recorded voice: every sentence Speak says has its clip, in the map and sw.js
node tools/test-pictures.mjs    # the picture set: list vs files, SVG safety, size, licence notices
node tools/test-class.mjs       # class markdown, class codes, reading a class, the push signal, the service worker's exclusions
node tools/test-coach.mjs       # the coach app's pure parts
node tools/test-assets.mjs      # sw.js ASSETS matches exactly the files the app serves
node tools/test-rules.mjs       # Firestore, Storage and Realtime Database rules (starts the emulators; needs Java + Firebase CLI)
node tools/test-functions.mjs   # the Cloud Functions and the push trigger, with fake AI models (starts the emulators too)
node tools/test-seed.mjs        # seeding the institutions and the coach-status migration (starts the emulator too)
node tools/smoke.mjs            # every screen in headless Chrome; `node tools/smoke.mjs wait` for one file
node tools/build-docs-index.mjs --check   # docs frontmatter, generated indexes and links
```

`.github/workflows/tests.yml` runs every `tools/test-*.mjs` and the smoke tests on each pull request and push to
`main`. Details of each test are in [local development](docs/operations/local-development.md).

## Deploy

The Firebase project is `simplify-special`, with the custom domain `simplify.whiz.coach` on its Hosting site.

- **A merge to `main` deploys everything** (`.github/workflows/firebase-hosting-merge.yml`): once every test
  passes, Cloud Functions, Firestore rules and indexes, Storage rules and Realtime Database rules go live, and then
  the website. Each pull
  request gets a Hosting preview channel URL (`firebase-hosting-pull-request.yml`). A failed deploy can be run again
  from GitHub Actions (**Run workflow**). By hand, only if CI is unavailable: `firebase deploy --only
  functions,firestore:rules,firestore:indexes,storage,database`, then `firebase deploy --only hosting`.
- **Before merging any change to `public/`, bump `CACHE` in `public/sw.js`**, and add any new file under `public/`
  to `ASSETS` — otherwise installed apps keep the old version, or the new file won't work offline.
- **Update the guide and its screenshots only after a change has been tested locally**, never alongside it.

The full checklist, the commands and the cloud set-up are in
[release and deploy](docs/operations/release-and-deploy.md) and [cloud project](docs/operations/cloud-project.md).

## Licence

MIT (see `LICENSE`). The bundled pictures include Google's Noto Emoji (Apache-2.0), and the coach app vendors the
Firebase JS SDK (Apache-2.0) and uqr (MIT) — see `THIRD_PARTY_NOTICES.md`.
