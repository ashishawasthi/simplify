---
trigger: always_on
description: Non-negotiable privacy, safety and release rules for Simplify
---

- Students never sign in. Never add student accounts, IDs, cookies, tracking, analytics, or any server write from a
  learner device.
- No logos, brand artwork, or drawings resembling Singapore notes/coins (only colour, proportion, metal, size).
- No health claims. No logs of feelings, behaviour or location.
- Any change to `public/` requires bumping `CACHE` in `public/sw.js` and listing new files in `ASSETS`.
- Never run a bare `firebase deploy`. Do not hand-edit generated `docs/**/index.md`.
- Follow [AGENTS.md](../../AGENTS.md) and [DESIGN.md](../../DESIGN.md).
- Allowed without asking (migrated from Claude permissions): web search, read-only `gcloud services|artifacts|run`
  commands. Ask before anything that deploys or changes cloud resources.
