---
name: run-tests
description: Run Simplify's Node test scripts, smoke tests and docs check. Use when verifying a change to public/, functions/, rules or docs.
---

# Running Simplify tests

No runner; each test is a plain Node 22 script. Run the one matching the change:

| Area | Command |
|---|---|
| Money | `node tools/test-money.mjs` |
| Dictation | `node tools/test-speak.mjs` |
| Wait / I need / Now and next / Show a card / Steps / Time sums / Stop and check | `node tools/test-wait.mjs`, `test-i-need`, `test-now-next`, `test-show-card`, `test-steps`, `test-time-sums`, `test-stop-check` |
| Voice clips, pictures | `node tools/test-voice.mjs`, `node tools/test-pictures.mjs` |
| Class / coach | `node tools/test-class.mjs`, `node tools/test-coach.mjs` |
| sw.js ASSETS | `node tools/test-assets.mjs` |
| Rules, functions, seed (start emulators; need Java + Firebase CLI) | `node tools/test-rules.mjs`, `test-functions.mjs`, `test-seed.mjs` |
| Every screen (headless Chrome) | `node tools/smoke.mjs` or `node tools/smoke.mjs wait` |
| Docs | `node tools/build-docs-index.mjs --check` |

CI (`.github/workflows/tests.yml`) runs every `tools/test-*.mjs` plus smoke on PRs. Details:
`docs/operations/local-development.md`.
