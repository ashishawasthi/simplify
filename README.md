# Simplify

Simplify workflows for special needs.

**Simplify** is a free, static progressive web app for autistic and other special-needs children and teens in
Singapore. It opens on one menu of big buttons, and each tool is one screen that does one job:

- **Money** — Can I buy?, What is the change?, Next dollar, Next note, Make the amount, Make a shopping list: type,
  dictate or tap pictures of Singapore notes and coins, and get a green, red or blue answer at once.
- **My day** — Now and next (with the whole day as My day), Wait (a shrinking disc), Steps (one step at a time for
  daily tasks).
- **Talk** — I need (cards for asking when speech fails), Show a card (big cards to show a bus captain, cashier or
  onlooker).
- **My class** — the latest page from the learner's coach, one screen at a time, once a class is set up on the
  device.

No account, no analytics, no build step. It works offline once opened, and nothing leaves the device unless My class
is set up — then only the class code. An adult sets each device up (hide tools, pictures only, speech, the class) on a
set-up page reached from the guide.

The **coach platform** behind My class lets coaches the admin has approved — each choosing the institutions they
work at — make classes and write one simple markdown page per class, with pictures, YouTube videos, short AI-made
videos and an AI helper, backed by Firestore, Cloud Storage and Cloud Functions in Singapore.

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
node tools/test-pictures.mjs    # the picture set: list vs files, SVG safety, size, licence notices
node tools/test-class.mjs       # class markdown, class codes, reading a class, the service worker's exclusions
node tools/test-coach.mjs       # the coach app's pure parts
node tools/test-assets.mjs      # sw.js ASSETS matches exactly the files the app serves
node tools/test-rules.mjs       # Firestore and Storage rules (starts the emulators; needs Java + Firebase CLI)
node tools/test-functions.mjs   # the Cloud Functions with fake AI models (starts the emulators too)
node tools/test-seed.mjs        # seeding the institutions and the coach-status migration (starts the emulator too)
node tools/smoke.mjs            # every screen in headless Chrome; `node tools/smoke.mjs wait` for one file
node tools/build-docs-index.mjs --check   # docs frontmatter, generated indexes and links
```

`.github/workflows/tests.yml` runs every `tools/test-*.mjs` and the smoke tests on each pull request and push to
`main`. Details of each test are in [local development](docs/operations/local-development.md).

## Deploy

The Firebase project is `simplify-special`, with the custom domain `simplify.whiz.coach` on its Hosting site.

- **Hosting** deploys automatically: every push to `main` publishes to the live channel
  (`.github/workflows/firebase-hosting-merge.yml`), and each pull request gets a preview channel URL
  (`firebase-hosting-pull-request.yml`). The deploy does not wait for the Tests workflow, so run the tests before
  merging. Manually: `firebase deploy --only hosting`.
- **Rules, indexes and Cloud Functions** are not deployed by CI:
  `firebase deploy --only firestore:rules,firestore:indexes,storage` and `firebase deploy --only functions` (run
  `test-rules` / `test-functions` first). Never a bare `firebase deploy`.
- **Before merging any change to `public/`, bump `CACHE` in `public/sw.js`**, and add any new file under `public/`
  to `ASSETS` — otherwise installed apps keep the old version, or the new file won't work offline.
- **Update the guide and its screenshots only after a change has been tested locally**, never alongside it.

The full checklist, the commands and the cloud set-up are in
[release and deploy](docs/operations/release-and-deploy.md) and [cloud project](docs/operations/cloud-project.md).

## Licence

MIT (see `LICENSE`). The bundled pictures include Google's Noto Emoji (Apache-2.0), and the coach app vendors the
Firebase JS SDK (Apache-2.0) and uqr (MIT) — see `THIRD_PARTY_NOTICES.md`.
