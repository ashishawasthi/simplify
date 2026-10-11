---
name: release-and-deploy
description: Release and deploy Simplify (Firebase project simplify-special). Use when shipping a change, deploying rules/functions/extensions, or rebuilding the video renderer.
---

# Release and deploy

- A merge to `main` deploys everything via `.github/workflows/firebase-hosting-merge.yml`: after tests pass,
  functions + Firestore/Storage/RTDB rules and indexes, then Hosting. PRs get a preview channel.
- Before merging a `public/` change: bump `CACHE` in `public/sw.js`; add new files to `ASSETS`.
- Update guide screenshots/videos only after local testing.
- Manual fallback (CI down only): `firebase deploy --only functions,firestore:rules,firestore:indexes,storage,database`,
  then `firebase deploy --only hosting`.
- Email extension (not in CI): `firebase ext:list --project simplify-special`, then
  `firebase deploy --only extensions --project simplify-special` (all or nothing; never bare `firebase deploy`);
  grant invoker role on a new trigger after first deploy (`docs/operations/cloud-project.md#email`).
- Video renderer image (not in CI): `gcloud builds submit --config video/cloudbuild.yaml .`, then update the
  Cloud Run job `simplify-video`.

Always confirm with the user before running any deploy. Full checklist: `docs/operations/release-and-deploy.md`.
