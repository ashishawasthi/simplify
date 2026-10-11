# Simplify — agent guidance

Simplify is a free, static progressive web app for autistic and other special-needs children and teens in Singapore
(live at <https://simplify.whiz.coach/>), plus a coach platform ("My class") on Firebase project `simplify-special`.
Full documentation is the OKF bundle at [docs/index.md](docs/index.md): open the index, pick an area, read the one
document you need. Visual rules are in [DESIGN.md](DESIGN.md).

## Layout

- `public/` — the learner app and the coach app (`public/coach/`); plain HTML/CSS/JS, **no build step, no dependencies**.
- `functions/` — Cloud Functions (Node 22, ES modules).
- `video/` — headless-Chrome video renderer (also a Cloud Run job, `simplify-video`).
- `tools/` — tests (`test-*.mjs`), smoke tests, seed and helper scripts.
- `docs/` — documentation; `docs/**/index.md` files are generated.
- Rules: `firestore.rules`, `storage.rules`, `database.rules.json`.

## Coding standards

- Learner app: vanilla JS, no framework, no bundler, no analytics, no tracking, no third-party requests on load.
- **Students never sign in.** Never add a student account, ID, cookie, profile, or any write from a learner's device
  to a server. Nothing leaves the device except the class code when My class is set up.
- Never log or send feelings, behaviour or location. No health claims; say "based on visual supports (NCAEP 2020)".
- Never use operator, government or brand logos, or artwork resembling Singapore notes/coins (Currency Act s.20).
- Never reject input with a validation error — prevent or forgive it. Prefer undo over confirmation dialogs.
- Use the design tokens in `public/css/styles.css`; see [DESIGN.md](DESIGN.md).
- Do not edit generated `docs/**/index.md` by hand; run `node tools/build-docs-index.mjs`.
- Every doc has OKF frontmatter; keep it valid (`node tools/build-docs-index.mjs --check`).
- Keep the one public address `https://simplify.whiz.coach/` for absolute URLs; links between pages stay relative.

## Build, run and test

- Serve learner app: `python3 -m http.server -d public 8080`
- With real headers/CSP (offline testing): `firebase serve --only hosting --port 5050 --project simplify-special`
- Emulators (coach app, My class): `firebase emulators:start --only auth,firestore,storage,database,functions --project simplify-special`
  (use with the Python server; the site's CSP blocks emulator ports).
- Tests are plain Node 22 scripts: `node tools/test-<name>.mjs`; `node tools/smoke.mjs [name]` for headless Chrome;
  `node tools/build-docs-index.mjs --check` for docs. See the `run-tests` skill.
- The service worker caches the app: tick "Update on reload" in DevTools while developing.

## Release rules

- Before merging any change to `public/`: **bump `CACHE` in `public/sw.js`** and add new files to `ASSETS`
  (`node tools/test-assets.mjs` checks).
- Update the guide, its screenshots and videos only **after** a change is tested locally, never alongside it.
- A merge to `main` deploys everything via CI. Never run a bare `firebase deploy`; the email extension and the video
  renderer image are deployed by hand. See the `release-and-deploy` skill.
- Keep secrets out of the repo (`.gitguardian.yaml` is active).

## Local agent config

`.agents/` holds rules, workflows and skills. Machine-local Claude settings (`.claude/`) were migrated there.
