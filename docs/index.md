---
okf_version: "0.2"
---

# Documentation

This bundle is the reference for how Simplify works. Each document owns one
subject and states current behaviour.

**How to use it:** read this page, open the one area index whose purpose matches
your question, then open only the documents you need. Each level links down one
step and nothing is repeated between them — this page names the areas, an area
index names its documents, a document holds the detail.

Every *content* document carries `type`, `title`, `description`, `tags`, and
`status` frontmatter. The area index pages linked below carry no frontmatter:
they are OKF reserved filenames that exist only to route, and
`node tools/build-docs-index.mjs` writes them. Links between documents are
bundle-root-absolute (`/area/file.md`).

One exception to "current behaviour": [Plans](/plans/index.md) holds
designed-but-unbuilt work, so nothing there describes a shipped system.

## Areas

- [Platform](/platform/index.md) (6 documents) — How the app is built — the static shell, the tool contract, offline and updates, security headers, data and AI models.
- [Learner app](/learner/index.md) (10 documents) — One document per screen a learner touches — the menu and set-up, the money tools, the daily-life tools, My class.
- [Coach platform](/coach/index.md) (5 documents) — The coach app at /coach/ — classes, the markdown page, pictures, YouTube, the AI helper, videos, and the admin's approvals.
- [Operations](/operations/index.md) (5 documents) — Running what exists — local development and tests, releasing, the cloud project, costs and limits.
- [Product and research](/product/index.md) (3 documents) — Why the app is the way it is — the design rules for autistic learners, and the research behind the tools.
- [Plans (not yet built)](/plans/index.md) (2 documents) — Designs for work that does **not** exist in the code — never cite one as evidence that a capability ships.

## Elsewhere in the repo

Documentation that deliberately stays outside this bundle, because it is written for a different reader or lives next to what it describes.

### Start here

- [README](../README.md) — what Simplify is, how to run it, test it and deploy it — the short version.

### Guides for people using the app

Served with the app, written for learners' adults and for coaches, with screenshots of the real screens. They simplify and are not a specification.

- [Learner guide](../public/guide.html)
- [Coach guide](../public/coach/guide.html)

### Licences

- [Third-party notices](../THIRD_PARTY_NOTICES.md) — the Noto Emoji pictures (Apache-2.0) and anything else not written here.
