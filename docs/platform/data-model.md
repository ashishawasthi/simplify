---
type: System Reference
title: Data Model
description: Every piece of stored data and its shape — the learner app's localStorage keys and Cache Storage, the coach app's session and test keys, every Firestore collection and document with its fields and who reads and writes it, every Cloud Storage path, the declared indexes, and the class code format.
tags: [data-model, localstorage, firestore, cloud-storage, class-code, indexes, schema]
status: stable
---

This document owns where data lives and what it looks like. Why the rules are drawn where they are is in [security](/platform/security.md); how devices cache the app is in [offline and updates](/platform/offline-and-updates.md).

## On the learner's device

Nothing the learner app keeps leaves the device, except the class code ([security](/platform/security.md#what-the-learner-app-sends-and-to-whom)). Tool state goes through `storage.js` (debounced, see [architecture](/platform/architecture.md#storage-wrapper)); device settings and the class copy are written at once. Every reader cleans what it finds, so an older shape, a hand edit or junk falls back to defaults rather than an error.

### localStorage

| Key | Owner | Shape |
|---|---|---|
| `afford-it-v1` | Can I buy? (`money-tool.js`, via the shell) | `{ moneyValue, moneySource, pickedNotes, items }` — the exact shape the single-screen app saved, so it keeps the name it had before the menu existed |
| `simplify-change-v1` | What is the change? | `{ moneyValue, moneySource, pickedNotes, spendValue }` |
| `simplify-next-dollar-v1` | Next dollar | `{ items }` |
| `simplify-next-note-v1` | Next note | `{ items }` |
| `simplify-make-amount-v1` | Make the amount | `{ needValue }` |
| `simplify-shopping-list-v1` | Make a shopping list | `{ moneyValue, moneySource, pickedNotes, items }`, items named |
| `simplify-now-next-v1` | Now and next (`now-next-list.js`) | `{ cards: [{ id, picture, words, changed }], done, view }` — at most 12 cards; `picture` a picture id or `null`; `words` up to 40 characters; `done` how many from the top are done; `view` `"now-next"` or `"my-day"` |
| `simplify-wait-v1` | Wait (`wait-time.js`) | `{ endAt, pausedRemaining, total, sound, waitPics }` — `endAt` ms since 1970 or `null`; `pausedRemaining` ms or `null`; `total` ms; `sound` boolean (off by default); `waitPics` up to 3 `{ picture, words }` |
| `simplify-steps-v1` | Steps (`steps.js`) | `{ at: { <deck id>: step index in the whole deck }, touched: { <deck id>: ms } }` |
| `simplify-my-class-v1` | My class reader (`tools/my-class.js`) | `{ page, screen }` — `page` is `"<code>\|<pageId>\|<publishedAt>"`, `screen` the index on show |
| `simplify-device-v1` | `device.js` | device settings, below |
| `simplify-class-v1` | `class-data.js` | `{ code, name, latest, checkedAt }` — the class as last read; `latest` is `{ pageId, title, markdown, publishedAt }` (ISO string) or `null`; `checkedAt` ms |
| `simplify-class-emulator` | `class-data.js`, development only | `"on"`, or `{"firestore":"http://127.0.0.1:…","storage":"http://127.0.0.1:…"}`; read only on localhost |

Money fields: `moneyValue`, `spendValue`, `needValue` are the box's text as typed; `moneySource` is `"typed"` or `"notes"`; `pickedNotes` the cents of each note or coin tapped in the picker, in order; `items` is `[{ value }]` or, for a shopping list, `[{ name, value }]`. I need, Show a card and the set-up page save no tool state; the key pattern `simplify-<id>-v1` comes from `app.js` `storageKey()`.

### Device settings

`simplify-device-v1`, owned by `device.js`:

```
{ hidden: [tool ids], picturesOnly: false, speak: true, classCode: null, className: null, tools: {} }
```

| Field | Meaning |
|---|---|
| `hidden` | Tools left off this device's menu (their links still work) |
| `picturesOnly` | Hide words marked `.pic-words` |
| `speak` | Show the Speak button on cards |
| `classCode` | The class this device follows, or `null` |
| `className` | That class's name as its coach wrote it (≤ 60 characters), for showing only; `null` without a code |
| `tools` | Each tool's own settings by id, written by its set-up section |

Per-tool settings inside `tools` (`{}` means the defaults):

| Tool | Shape |
|---|---|
| `i-need` | `{ cards: [card ids] }` — the cards that are on, in `CARDS` order |
| `show-card` | `{ hidden: [card ids], stop: "…", disclose: "none" \| "hidden-disability" \| "autistic" }` — `stop` up to 40 characters |
| `steps` | `{ fewer: [deck ids] }` — decks showing only their core steps |

### Cache Storage

| Cache | Owner | Contents |
|---|---|---|
| `simplify-v<N>` (`CACHE` in `public/sw.js`) | the service worker | every file in `ASSETS`, keyed by URL; older versions deleted on activate |
| `simplify-class-media` | `class-data.js` | exactly the files the followed class's latest page uses, keyed `<origin>/class-media/<code>/<picture\|video>/<id>`; deleted when the device follows no class |

The learner app uses no IndexedDB and no sessionStorage, and does not request persistent storage.

## In the coach's browser

| Key | Where | Owner | Shape |
|---|---|---|---|
| Firebase Auth session | sessionStorage (`browserSessionPersistence`) | the Firebase SDK | the signed-in user, for this tab only |
| `simplify-coach-page-<code>` | sessionStorage | `public/coach/js/editor.js` | the id of the page open in this class's editor, so a reload reopens it |
| `simplify-coach-emulators` | localStorage, localhost only | `public/coach/js/firebase-config.js` | emulator ports, e.g. `{"auth":9699,"firestore":8685,…}`, for tests that run their own |

## Firestore

Database `(default)` in project `simplify-special` (Firestore in asia-southeast1). "Functions" means the Cloud Functions in `functions/index.js`, which bypass the rules. Who may do what is enforced by `firestore.rules`; the coach app's calls are all in `public/coach/js/cloud.js`.

| Path | Fields | Read by | Written by |
|---|---|---|---|
| `admins/{uid}` | none needed (existence is the role) | that user (`get` only) | the owner, in the console |
| `coaches/{uid}` | `name` (≤ 60), `org` (≤ 80), `note` (≤ 300), `email` (the sign-in email), `createdAt`, `suspended` (bool, set by an admin) | that coach; admins (and list) | the coach creates it and edits `name` / `org` / `note`; an admin sets only `suspended` |
| `requests/{id}` | `uid`, `kind` (`"new-class"` \| `"join-class"`), `className` (≤ 30; required for new-class), `classCode` (join-class only), `org`, `note`, `status` (`pending` → `approved` \| `declined`), `createdAt`, `decidedAt`, `decidedBy`, `resultCode` | its coach (`get`, and list with `where("uid", "==", uid)`); admins | an active coach creates it `pending`; an admin decides it once |
| `classes/{code}` | `name` (≤ 30), `org` (≤ 80), `status` (`active` \| `suspended`), `latest`, `createdAt`, `updatedAt` | **anyone, `get` by exact code while `active`**; its listed coaches even while suspended; admins (and list) | admins create it (on approving a request), pause it and take a page down; its coaches change only `latest` and `updatedAt` |
| `classes/{code}.latest` | `null`, or `{ pageId, title (≤ 80), markdown (≤ 20,000), publishedAt, publishedBy }` | as the class | publish / unpublish by a class's coach; take-down by an admin |
| `classes/{code}/pages/{pageId}` | `title` (≤ 80), `markdown` (≤ 20,000), `createdAt`, `createdBy`, `updatedAt`, `updatedBy`, `publishedAt` (when it was last published) | its coaches, admins | its coaches create, save and delete; admins delete |
| `classes/{code}/pictures/{pictureId}` | `words` (≤ 80), `file` (`"pictures/<id>.jpg"`), `width`, `height` (1–1600), `createdAt`, `createdBy` | its coaches, admins | its coaches create it (after uploading the file), edit `words` and delete; admins delete |
| `classes/{code}/videos/{videoId}` | `status` (`rendering` → `ready` → `approved`, or `failed`, or `discarded`), `prompt`, `words`, `seconds`, `planId`, `interactionId`, `usageMonth`, `createdBy`, `createdAt`, `updatedAt`; later `bytes`, `error`, `approvedBy`, `discardedBy` | its coaches, admins | functions only (`startVideo`, `checkVideo`, `approveVideo`, `discardVideo`); admins may delete |
| `classes/{code}/videoPlans/{planId}` | `request`, `prompt`, `words`, `seconds`, `createdBy`, `createdAt`; `videoId` once started | nobody (no client access) | functions only (`planVideo`, `startVideo`) |
| `classCoaches/{code}` | `uids` (≤ 50 coach uids) | a listed active coach (`get`); a listed signed-in user (list with `where("uids", "array-contains", uid)`); admins | admins |
| `usage/{uid}_{YYYY-MM}` | `flash`, `video`, `declined` (counts), `uid`, `month` | that coach (`get` their own months); admins (and list) | functions only |
| `config/limits` | `flashPerMonth` (0–5,000, default 200), `videosPerMonth` (0–100, default 5), `updatedAt`, `updatedBy` | anyone signed in | admins |

- The month in a `usage` id is the Singapore month (UTC+8), `monthKey()` in `functions/lib.js` and `sgMonthKey()` in `public/coach/js/format.js`. A missing `config/limits` doc, or a missing or invalid field, means the defaults. How the counters are used is in [AI models](/platform/ai-models.md#limits-and-counting).
- A video keeps `usageMonth` so a refund goes back to the month its credit came from. Video states and the shelf are in [videos](/coach/videos.md).
- Publishing is one batch: the page gets `publishedAt` and the class gets the new `latest`. Learners only ever read `classes/{code}`; drafts, pictures documents, videos documents and plans are never visible to them.
- An admin's approval of a new class creates `classes/{code}` (`status: "active"`, `latest: null`) and `classCoaches/{code}` with the requester, and sets the request's `resultCode`, in one transaction ([admin and approvals](/coach/admin-and-approvals.md)).

### Indexes

`firestore.indexes.json` declares two composite indexes on `requests`: (`uid` ascending, `createdAt` descending) and (`status` ascending, `createdAt` ascending). The coach app's current queries are equality-only (`where("uid", "==", …)`, `where("status", "==", "pending")`) and sort on the device, which needs no composite index. Two field overrides turn off indexing of the long text fields, `pages.markdown` and `classes.latest.markdown`, which are never queried.

## Cloud Storage

Bucket `simplify-special.firebasestorage.app` (asia-southeast1). Nothing can be listed; public files are read by their exact path through `https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<url-encoded path>?alt=media`.

| Path | Read by | Written by | Notes |
|---|---|---|---|
| `classes/{code}/pictures/{id}.jpg` | anyone, exact path | a class's coach (create only: JPEG, under 2 MB, never overwrite); coach or admin deletes | resized in the coach's browser to at most 1600 px; uploaded with `Cache-Control: public, max-age=86400` |
| `classes/{code}/video-drafts/{id}.mp4` | a class's coaches | functions (`checkVideo`) | a finished clip awaiting approval; `private, max-age=0`; deleted on approve or discard |
| `classes/{code}/videos/{id}.mp4` | anyone, exact path | functions (`approveVideo` copies the draft here) | `public, max-age=86400`; deleted on discard |

The ids in these paths are the matching Firestore document ids and must match `^[A-Za-z0-9_-]{1,40}$`.

## The class code

A class is identified by its code, the id of `classes/{code}` and `classCoaches/{code}`:

- **9 characters** from the 31-character alphabet `23456789ABCDEFGHJKMNPQRSTUVWXYZ` — no `0`, `1`, `I`, `L` or `O`, which are easily mixed up. About 2.6 × 10¹³ possible codes.
- **Stored without dashes, shown in threes**: `K7M3RQP9T` is shown as `K7M-3RQ-P9T`.
- **Typing is forgiven**: upper-cased, then every character outside the alphabet dropped (`"k7m-3rq p9t"` → `K7M3RQP9T`); the learner app also accepts a pasted `…/#join=<CODE>` link.
- **Made by the admin's browser** when approving a new class (`newClassCode()` in `public/coach/js/class-code.js`), with `crypto.getRandomValues` and rejection sampling (bytes 248 and up are redrawn, so every character is equally likely), retried up to 5 times if the code is taken. The QR code opens `https://simplify.whiz.coach/#join=<CODE>`.

The same alphabet and length are defined in four places that must agree: `public/coach/js/class-code.js`, `public/js/class-data.js` (`ALPHABET`, `CODE_LENGTH`), `functions/lib.js` (`ALPHABET`, with the length checked in `requireClassCoach`) and `isCode()` in `firestore.rules`.
