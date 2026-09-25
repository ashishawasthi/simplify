---
type: Operations Runbook
title: Local Development
description: Which local server to use for what (plain static, Hosting headers, Firebase emulators) and why the CSP and clean URLs decide it, pointing the learner and coach apps at the emulators, fake AI models, every unit test and smoke test with what it needs, the docs check, guide screenshots and the helper scripts.
tags: [local-development, emulators, csp, testing, smoke-tests, screenshots, service-worker, tooling]
status: stable
---

How to run Simplify on your own machine, which server suits which job, how to reach the Firebase emulators, and every test and helper script in `tools/`. The CI side of the same tests is in [release and deploy](/operations/release-and-deploy.md).

## What you need

| Tool | For |
|---|---|
| Node 22 | every `tools/*.mjs` script: built-in `WebSocket` and `fetch`, no `npm install` in the repo root |
| Google Chrome | the smoke tests and the guide screenshots (`CHROME=<path>` to use another binary; the default is the macOS app path) |
| Firebase CLI (`npm i -g firebase-tools`; CI pins `firebase-tools@15`) | the emulators, `firebase serve`, deploys |
| Java (CI uses Temurin 21) | the Firestore and Storage emulators |
| `npm ci --prefix functions` | the Functions emulator and `tools/test-functions.mjs` |
| Python 3 | the plain static server; `tools/make-qr.py` also needs `segno` and `Pillow` |

There is no build step. What is in `public/` is what Hosting serves.

## Pick a server

| Server | Command | Sends `firebase.json` headers (CSP)? | Clean URLs (`/guide/speak`)? | Use it for |
|---|---|---|---|---|
| Plain static | `python3 -m http.server -d public 8080` → http://localhost:8080 | no | no | editing screens; running either app against the emulators |
| Hosting | `firebase serve --only hosting --port 5050 --project simplify-special` → http://localhost:5050 | yes | yes (and the `/guide/` → `/guide` redirect) | checking headers and the CSP; the service worker and offline; the guide pages |
| Full emulator suite | `firebase emulators:start` (ports below) | yes, on the Hosting emulator | yes | Auth, Firestore, Storage and Functions for the coach platform |

Two facts decide the choice:

- **The CSP blocks the emulators.** The site's policy (`firebase.json`, see [security](/platform/security.md)) lets the learner app connect only to itself, `firestore.googleapis.com` and `firebasestorage.googleapis.com`, and the `/coach` policy lists only Google's hosts and the `asia-southeast1-simplify-special.cloudfunctions.net` functions. Neither allows `http://127.0.0.1:<port>`. A page served on port 5050 (by `firebase serve` or the Hosting emulator) therefore cannot reach the emulators. Serve the page with the plain static server, which sends no CSP, and run the emulators beside it.
- **The service worker cannot install on the plain server.** `ASSETS` in `public/sw.js` lists pages by clean URL (`/guide`, `/guide/menu` …). `python3 -m http.server` answers `/guide/menu` with 404 and `/guide` with a redirect to the directory listing, and `fetchAsset` refuses both, so the install fails as a whole. That does no harm while editing (every load comes from disk), but anything about offline or updates must be tried on port 5050.

The service worker is cache-first (see [offline and updates](/platform/offline-and-updates.md)), so on port 5050 a reload does not show an edit to a file it has already cached. While developing, tick **Update on reload** under DevTools → Application → Service workers, or use a private window.

## The Firebase emulators

Ports come from `emulators` in `firebase.json` (`singleProjectMode: true`, project `simplify-special` from `.firebaserc`):

| Emulator | Port |
|---|---|
| Auth | 9099 |
| Functions | 5001 |
| Firestore | 8085 |
| Storage | 9199 |
| Hosting | 5050 |
| Emulator UI | 4000 |

To try the coach platform end to end, offline and free:

```sh
npm ci --prefix functions                                    # once
firebase emulators:start --only auth,firestore,storage,functions
python3 -m http.server -d public 8080                        # in another terminal
```

The emulators load `firestore.rules`, `storage.rules` and `firestore.indexes.json`, so they enforce the same rules as production. Their data is gone when they stop; add `--import=<folder> --export-on-exit` with a folder outside the repo to keep it.

**Coach app.** `public/coach/js/firebase-config.js` `emulators()` returns the emulator ports whenever the page's hostname is `localhost` or `127.0.0.1`, and `public/coach/js/cloud.js` then connects Auth, Firestore, Storage and Functions to `127.0.0.1`. No switch is involved: on localhost the coach app always uses the emulators and can never reach production. A test that runs its emulators on other ports stores them first in localStorage `simplify-coach-emulators`, e.g. `{"auth":9699,"firestore":8685,…}`. Open http://localhost:8080/coach/ and sign in with the Auth emulator's stand-in Google account. To make that account the admin, create `admins/{uid}` in the Emulator UI's Firestore tab (http://127.0.0.1:4000), as the owner does in the real console (see [admin and approvals](/coach/admin-and-approvals.md)).

**Learner app.** `public/js/class-data.js` `endpoints()` sends no requests at all on `localhost`, `127.0.0.1` or `[::1]` unless localStorage `simplify-class-emulator` asks for the emulators:

```js
localStorage.setItem("simplify-class-emulator", "on");   // Firestore :8085, Storage :9199
// or other local ports:
localStorage.setItem("simplify-class-emulator", '{"firestore":"http://127.0.0.1:8185","storage":"http://127.0.0.1:9299"}');
```

Run it in the DevTools console at http://localhost:8080/, reload, and join a class that the emulated coach app published. Anything that is not `on` or JSON naming two local origins counts as not asked.

### Fake AI models

`functions/.env.local` (committed; read only by the Functions emulator, and never deployed because the functions' `ignore` in `firebase.json` includes `*.local`) sets `SIMPLIFY_AI_FAKE=1`. `functions/ai.js` `aiIsFake()` then answers `writePage`, `planVideo` and the video render with deterministic fakes, so nothing goes to Gemini and nothing costs money. The fakes are honoured only inside the emulator (`FUNCTIONS_EMULATOR=true`) or a plain Node process (no `K_SERVICE`): a deployed function always calls the real models. To call the real models from the emulator, remove that line and have application-default credentials (`gcloud auth application-default login`) for an account with Vertex AI access; every request is then billed (see [costs and limits](/operations/costs-and-limits.md)). The models themselves are in [AI models](/platform/ai-models.md).

## Unit tests

Each is one Node file with no runner and no dependencies unless the table says so; `node tools/test-<name>.mjs` runs it and exits non-zero on a failure. CI runs every `tools/test-*.mjs` in turn.

| Test | Covers | Needs |
|---|---|---|
| `test-assets.mjs` | every file under `public/` (bar the coach app and the few it names, such as `og-card.png`) is in `ASSETS` in `public/sw.js`, every `ASSETS` entry exists, pages by clean URL | Node |
| `test-class.mjs` | the class markdown parser (`public/js/class-markdown.js`), class codes and the Firestore reading in `public/js/class-data.js` (stand-in `fetch` and localStorage), and `sw.js` leaving class files, `/coach/` and `/__/` alone | Node |
| `test-coach.mjs` | the coach app's pure parts: class codes, the editor toolbar, dates and the Singapore month, picture sizes, spotting an in-app browser, institutions (search, grouping, which screen a coach gets) | Node |
| `test-functions.mjs` | the six callables in `functions/index.js` with fake models: who may call, write / ask / decline, the free answer for an empty instruction, monthly limits (also under parallel calls), refunds, the Singapore month, the page check, plan → start → check → approve / discard; first runs `copy-class-markdown.mjs --check` | Firebase CLI, Java, `npm ci --prefix functions`; starts Auth, Firestore, Storage and Functions emulators itself |
| `test-i-need.mjs` | I need's cards, settings, sentences and body map, pinned word for word | Node |
| `test-money.mjs` | the money maths (`money.js`) and every money tool's wording (`answers.js`), including the original change requests' own examples | Node |
| `test-now-next.mjs` | Now and next's list rules (`now-next-list.js`) | Node |
| `test-pictures.mjs` | `public/js/pictures.js` against `public/img/pic/`: each file's safety and shape, the size budget, the Noto licence notices | Node |
| `test-rules.mjs` | `firestore.rules` and `storage.rules`, case by case, over the emulators' REST APIs with unsigned test tokens | Firebase CLI, Java; starts Auth, Firestore and Storage emulators itself |
| `test-seed.mjs` | `tools/seed-institutions.mjs` with the real `tools/seed/institutions.json` (a dry run writes nothing, a second run changes nothing, a retired entry stays retired, a bad file writes nothing) and `tools/migrate-coaches.mjs` (dry run, then approved / pending, then nothing on a second run) | Firebase CLI, Java; starts the Firestore emulator itself (8331, hub 4431) |
| `test-show-card.mjs` | Show a card's wording, pictures and settings (`show-card-cards.js`) | Node |
| `test-speak.mjs` | the dictation parser `speechToCents()` | Node |
| `test-steps.mjs` | the Steps decks word for word, the rules every deck keeps, Next / Back / Fewer steps, the 30-minute start again | Node |
| `test-voice.mjs` | the recorded voice: every sentence a card can say has its clip, every clip is in the map, keys are the on-screen words, the generator's plan, map and sw.js list are current ([the recorded voice](/platform/voice.md)) | Node |
| `test-wait.mjs` | Wait's time maths (`wait-time.js`) | Node |

`test-rules.mjs` and `test-functions.mjs` write a temporary `firebase.json` with ports of their own (rules: 9311, 8311, 9411, hub 4411; functions: 9321, 8321, 9421, 5321, hub 4421, plus Eventarc 9621 and Cloud Tasks 9721) and a temporary `TMPDIR`, then run themselves again inside `firebase emulators:exec`. They can run beside `firebase emulators:start` or each other.

Run them all as CI does:

```sh
for t in tools/test-*.mjs; do node "$t" || break; done
```

## Smoke tests

`tools/smoke.mjs` runs the real app in real headless Chrome, one short scene at a time, four at once, each in a fresh browser context:

```sh
node tools/smoke.mjs                 # every scene file in tools/smoke/
node tools/smoke.mjs wait i-need     # only tools/smoke/wait.mjs and i-need.mjs
CHROME="$(command -v google-chrome)" node tools/smoke.mjs   # Linux, as in CI
```

It needs Node 22 and Chrome and nothing else. It serves `public/` itself (or `SMOKE_ROOT=<folder>`) on a free port with clean URLs and the site-wide headers of `firebase.json`, so an inline style or script the CSP blocks fails the scene. It removes `navigator.serviceWorker` before the page's scripts, so every load comes straight from disk. A scene fails on any console error, uncaught exception or failed request, or when its `expect` is not true within 5 s; a whole run gives up after 10 minutes.

| Scene file | Covers |
|---|---|
| `app.mjs` | the menu, routing, the money tools, the set-up page and device settings, the update reload, and every guide scene in `tools/guide-scenes.mjs` still reaching its state |
| `coach.mjs` | the coach app's screens and flows with `public/coach/js/cloud.js` swapped for an in-memory stand-in: sign-in, About you and its institution picker, waiting for approval (and approval arriving live), not approved, making a class, editor and preview, Publish, Write with AI, picture and video shelves, YouTube, the QR poster, the admin screen (coach approvals, join requests, institutions) |
| `i-need.mjs` | I need |
| `my-class.mjs` | the My class tile, the reader and the set-up page's class section |
| `now-next.mjs` | Now and next and My day |
| `shared.mjs` | the shared parts: `say-aloud.js`, `show-card.js`, `picture-picker.js` |
| `show-card.mjs` | Show a card and its set-up section |
| `steps.mjs` | Steps |
| `wait.mjs` | Wait, with stand-ins for wake lock, vibration, sound and a movable clock |

No smoke scene reaches the internet or an emulator, which is how they live with the CSP: `my-class.mjs` sets `simplify-class-emulator` to `on` and replaces `fetch()` in the page with a stand-in that answers the class document and makes its pictures and videos, and `coach.mjs` serves a fake `cloud.js` through DevTools request interception. The real `cloud.js` against the emulators is only tried by hand, as above — or by a throwaway script that starts the emulators on ports of its own, serves `public/` with the plain static server, sets `simplify-coach-emulators`, and drives two headless Chrome contexts through the Auth emulator's Google popup (its "Add new account" form).

## Docs check

```sh
node tools/build-docs-index.mjs --check
```

Writes nothing; exits 1 when a document under `docs/` lacks the five frontmatter keys, a link between documents does not resolve, or `docs/index.md` and the area indexes are out of date. Without `--check` it rewrites those indexes.

## Guide screenshots

The learner guide's screenshots come from the running app, one scene per run. Take them only after the change is tested (see [release and deploy](/operations/release-and-deploy.md#the-guide-comes-after-testing)).

```sh
node tools/shoot-guide.mjs yes                       # one scene
for s in menu yes no picker show-me change next-dollar next-note make-amount shopping-list \
         wait-pick wait i-need i-need-card i-need-hurts show-card show-card-stop now-next my-day \
         menu-more menu-class my-class class-join setup-hold setup; do
  node tools/shoot-guide.mjs "$s"
done
```

The scenes (viewport, path, setup, expect, and the output file) are `SCENES` in `tools/guide-scenes.mjs`; `node tools/shoot-guide.mjs` with no name lists them. Each writes `public/img/guide/screen-<scene>.png` at twice the viewport, using a throwaway Chrome profile so no service worker serves stale files; `SHOOT_DIR=<folder>` writes there instead. To add a scene, give it the viewport the guide's `<img>` declares and a setup that leaves the app in that state; the `app.mjs` smoke scenes then check it too.

The coach guide's pictures (`public/coach/img/guide/`) come from `node tools/shoot-coach-guide.mjs [scene…]`, which drives the real coach app with the in-memory stand-in for `cloud.js` exported as `STUBS` from `tools/smoke/coach.mjs`, so no network or emulator is needed (`SHOOT_DIR=` works the same way). To review the screens rather than make the guide's pictures, `SHOOT_DIR=<folder> SHOOT_VIEWPORT=820x1180 node tools/shoot-coach-guide.mjs` shoots every scene at that size, the whole window, uncropped — an iPad in portrait is where text above a screen's main content costs most. `tools/smoke/coach-guide.mjs` checks the guide's links, anchors and pictures, and that every scene still reaches its state.

`public/img/guide/mic-on-keyboard.png` is not a scene. It is a real Android screenshot: the dialog plus the phone's own keyboard with the microphone key ringed in `--color-primary`. The keyboard belongs to Android, not the page, so no headless capture can include it: retake it on an Android device.

A new or changed image under `public/` needs a `CACHE` bump in `public/sw.js`, and a new one also an `ASSETS` entry.

## Helper scripts

| Script | What it does |
|---|---|
| `node tools/vendor-firebase.mjs` | Downloads the pinned Firebase JS SDK modules (`FIREBASE`, currently 12.19.0: app, auth, firestore, storage, functions) from gstatic and `uqr` (`UQR`, 0.1.3) from jsdelivr into `public/coach/vendor/`, rewriting the SDK's absolute imports to relative ones, with licences and a README of source URLs and SHA-256 sums. The coach CSP is `script-src 'self'` (plus `apis.google.com`), so nothing else loads them. To upgrade: change the version, run it, update the import paths in `public/coach/js/cloud.js` or `public/coach/js/qr.js`, delete the old folder. |
| `node tools/copy-class-markdown.mjs [--check]` | Copies `public/js/class-markdown.js` byte for byte to `functions/class-markdown.js` (functions deploy from `functions/` alone). `--check` exits 1 if the copy differs. `firebase.json` runs the copy as the functions' `predeploy`; `test-functions.mjs` runs the check. |
| `node tools/make-voice.mjs [--check]` | Records the clips Speak plays (Cloud Text-to-Speech, Chirp 3 HD) for every fixed sentence the cards can say — only the missing ones — deletes orphans, and writes `public/js/voice-clips.js` and the clip list in `sw.js`. Needs ffmpeg and `gcloud auth login`. See [the recorded voice](/platform/voice.md). Run `test-voice.mjs` after it and bump `CACHE`. |
| `node tools/make-pictures.mjs [names…]` | Builds `public/img/pic/` from `public/js/pictures.js`: pinned Noto Emoji SVGs plus our own drawings, with the licence file. See [pictures](/learner/pictures.md). Run `test-pictures.mjs` after it. |
| `python3 tools/make-qr.py` | Draws `public/img/og-card.png` and `public/img/qr-poster.png`. See [share card](/operations/share-card.md). |
