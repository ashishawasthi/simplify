---
description: Checklist before merging a change to Simplify
---

1. If `public/` changed: bump `CACHE` in `public/sw.js`; add new files to `ASSETS`.
2. Run `node tools/test-assets.mjs` and the relevant `tools/test-*.mjs`, then `node tools/smoke.mjs`.
3. Run `node tools/build-docs-index.mjs` then `--check` if docs changed.
4. Only now update the guide, its screenshots and videos.
5. Merge to `main`; CI tests and deploys. Never a bare `firebase deploy`.
