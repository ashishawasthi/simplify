---
type: Product Contract
title: Security
description: What the site promises about security and privacy and how the code keeps it — the headers per path (learner CSP, coach CSP, referrer, permissions, noindex), the no-innerHTML rule, Firestore and Storage rule boundaries (only a coach the admin approved may do anything but fill in their profile), what each Cloud Function checks before acting, coach sign-in, and exactly what the learner app sends and to whom.
tags: [security, csp, headers, firestore-rules, storage-rules, privacy, authorisation, xss]
status: stable
---

This document is the contract for what may run, load, be read, be written and leave a device. It owns the HTTP headers, the no-innerHTML rule, the boundaries the Firestore and Storage rules draw, and what each callable checks. The per-path access table is in [data model](/platform/data-model.md); the model calls themselves are in [AI models](/platform/ai-models.md).

## What the learner app sends, and to whom

Learners never sign in, and nothing a learner types or taps is sent anywhere. The learner app's only requests beyond its own site are:

| When | To | What is sent |
|---|---|---|
| Joining a class, and each refresh of My class | `firestore.googleapis.com` | One `GET` of `classes/<code>` (the class code is in the URL), with `credentials: "omit"` and `cache: "no-store"` |
| My class needs a picture or video of the latest page | `firebasestorage.googleapis.com` | One `GET` per file, `classes/<code>/pictures/<id>.jpg` or `classes/<code>/videos/<id>.mp4`, with `credentials: "omit"` |
| A learner taps a YouTube card | `www.youtube-nocookie.com` | The privacy-enhanced player loads in a frame (`?rel=0&playsinline=1`), with the site's origin as referrer; nothing loads from YouTube before the tap |
| A learner taps a link button | the linked `https://` site | Opens in a new tab with `rel="noopener noreferrer"` |

A device with no class set makes none of these. Like any website, every request also carries the device's internet address. On `localhost` and `127.0.0.1` the app asks nobody unless localStorage `simplify-class-emulator` points it at the emulators (`class-data.js` `endpoints()`). The class code travels in a URL path, never a query string; the `#join=<CODE>` fragment on a QR code never reaches a server. Joining and following a class are described in [my class](/learner/my-class.md).

## Headers

All headers come from `hosting.headers` in `firebase.json`. For the same header key the later matching rule wins, so the `/coach` rule (last in the list) replaces the site-wide CSP and `Cache-Control` for coach paths while the other site-wide headers still apply there. Caching headers are covered in [offline and updates](/platform/offline-and-updates.md#hostings-cache-control).

### Every path (`**`)

| Header | Value |
|---|---|
| `Content-Security-Policy` | the learner CSP below |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `no-referrer` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |

### The learner CSP

| Directive | Value | Why |
|---|---|---|
| `default-src` | `'self'` | Everything else comes from the site |
| `script-src` | `'self'` | No inline script, no other host |
| `style-src` | `'self'` | No inline `<style>` or `style=""`; JS sets styles through the DOM, which the CSP allows |
| `img-src` | `'self' blob:` | `blob:` for My class's pictures, shown from the device's media cache |
| `media-src` | `'self' blob:` | `blob:` for My class's videos, likewise |
| `connect-src` | `'self' https://firestore.googleapis.com https://firebasestorage.googleapis.com` | The one class read, and the class's pictures and videos |
| `frame-src` | `https://www.youtube-nocookie.com` | YouTube's privacy-enhanced player, only after a tap |
| `object-src` | `'none'` | No plugins |
| `base-uri` | `'self'` | No `<base>` to another site |
| `form-action` | `'none'` | No form submits anywhere |
| `frame-ancestors` | `'none'` | Nobody may frame the app |

Every picture is bundled (`/img/pic/`), so a card looks the same on every device and nothing breaks the same-origin image policy. The smoke tests serve pages with the site-wide (`**`) headers from `firebase.json` and fail on any console error, so a CSP violation fails CI.

### The coach CSP (`^/coach(/.*)?$`)

| Directive | Value | Why |
|---|---|---|
| `default-src` | `'self'` | |
| `script-src` | `'self' https://apis.google.com` | Firebase Auth's Google sign-in popup helper; the SDK itself is vendored under `/coach/vendor/` |
| `style-src` | `'self'` | |
| `img-src` | `'self' blob: data: https://firebasestorage.googleapis.com https://lh3.googleusercontent.com` | `blob:` for pictures being uploaded; Storage for shelf pictures; `data:` and Google profile photos are allowed, though no code in `public/coach/js/` uses them today |
| `media-src` | `'self' blob: https://firebasestorage.googleapis.com` | Approved videos from Storage; drafts as `blob:` after an authenticated download |
| `connect-src` | `'self' https://firestore.googleapis.com https://firebasestorage.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://asia-southeast1-simplify-special.cloudfunctions.net` | Firestore, Storage, Firebase Auth (sign-in and token refresh), and the six callables |
| `frame-src` | `https://simplify-special.firebaseapp.com https://www.youtube-nocookie.com` | The Auth handler frame, and the preview's YouTube player |
| `object-src`, `base-uri`, `form-action`, `frame-ancestors` | as the learner CSP | |

The `/coach` rule also sends `X-Robots-Tag: noindex`, so search engines do not index the coach pages. Nothing in the learner app, the learner guide or a QR code links to `/coach/`.

### Referrer and the YouTube exception

The whole site sends no referrer. The one exception is the YouTube frame, which `class-markdown.js` creates with `referrerpolicy="strict-origin-when-cross-origin"`, sending only the site's origin: YouTube refuses an embed that arrives with no referrer (Error 153). A smoke scene in `tools/smoke/my-class.mjs` pins the attribute. Link buttons use `rel="noopener noreferrer"`.

### Permissions-Policy

Camera, microphone and geolocation are off for the whole site; nothing in the app asks for them. Voice entry uses the keyboard's own dictation, never the page's microphone ([voice input](/learner/voice-input.md)). Everything else stays at the browser default, which is what the tools use: Wake Lock (a running Wait, a shown card), `speechSynthesis` (Speak), and the YouTube frame's `encrypted-media; picture-in-picture; fullscreen`.

## No innerHTML in the learner app

Words someone typed — a card's words, a stop's name, a coach's page — go on screen with `textContent` or DOM calls, never as HTML. The only `innerHTML` in `public/js/` is markup the app builds itself from constants:

- note and coin drawings from `currency-data.js` (`app.js` menu pictures, `note-picker.js`, `show-money.js`, `setup.js`, `result.js` for an `{ picture: cents }` icon);
- `result.js` sets the answer's `subline` as HTML only when the answer carries `answers.js`'s `MARKUP` symbol — answers built only from formatted amounts and denomination labels. Every other subline is `textContent`.

`class-markdown.js` renders a coach's page only with `createElement` and text nodes: anything outside the markdown subset shows as plain text, a link must be `https://`, and a picture or video can only be a shelf path ([markdown pages](/coach/markdown-pages.md)). The coach app has no `innerHTML` at all; `qr.js` draws the poster's QR code with DOM calls.

No lint rule forbids `innerHTML`; the rule is held by review and by tests that feed markup in and check it comes out as text: `tools/test-class.mjs` (`<img onerror>` and `<script>` in a page stay text; `javascript:` and `data:` links keep only their words) and the smoke scenes in `tools/smoke/shared.mjs` (a shown card), `now-next.mjs` (card words), `show-card.mjs` (the stop's name) and `my-class.mjs` (a page); the show-card and my-class scenes also check that the injected handler never ran. The bundled pictures are checked for anything that could run or load: `tools/test-pictures.mjs` allows only a fixed set of SVG elements and attributes and rejects `<script>`, event handlers, `<foreignObject>`, `<image>` and outside references ([pictures](/learner/pictures.md)).

## Firestore rules

`firestore.rules` denies by default. The Cloud Functions use the Admin SDK, which skips the rules, so anything written only by functions has no client write rule at all. `node tools/test-rules.mjs` tests the rules against the emulators.

**Helper functions**

| Function | True when |
|---|---|
| `signedIn()` | `request.auth != null` |
| `isAdmin()` | `admins/{uid}` exists (created by the owner in the console) |
| `isApprovedCoach()` | `coaches/{uid}` exists, its `status` is `approved` (set only by an admin) and its `suspended` is not `true` |
| `isListedCoach(code)` | an approved coach whose uid is in `classCoaches/{code}.uids` (the class itself may be paused) |
| `isClassCoach(code)` | a listed coach, and `classes/{code}.status == 'active'` |
| `onlyChanged(keys)` | an update touches only those fields |
| `text(v, max)`, `filledText(v, max)` | a string within the length (and not blank) |
| `isCode(v)` | 9 characters from the class-code alphabet |
| `isId(v)` | `^[A-Za-z0-9_-]{1,40}$`: safe as a document id, a Storage file name and in markdown |
| `isInstitutionId(v)` | `^[A-Za-z0-9_-]{1,100}$`: an institution's id (the seed file's slugs, or an auto id) |

**Boundaries**

- **Learners** (no sign-in) may only `get` a `classes/{code}` document whose `status` is `active`. Nothing can be listed, so a class can be found only by its exact code; a wrong code and a paused class both answer 403/404.
- **Anyone signed in** — a coach at any stage, or an admin — may read the institutions, and their own profile.
- **A coach waiting for approval** (`status` `pending` or missing), **declined** or **suspended** can do nothing else: they create their own profile (`status: "pending"`, 1–10 institution ids, the email must be the signed-in one) and may later change only `name`, `note` and `institutions` — a change of `institutions` must stamp `institutionsChangedAt` with the request time. `status`, `decidedAt`, `decidedBy` and `suspended` can't be written by the coach. The rules check the shape of each institution id (a list of strings, no repeats, joined with commas and split again to the same list, since the rules cannot loop), not that it exists.
- **An approved coach** reaches only their own profile and requests, and only the classes they are listed for. Publishing, pages and the picture shelf also need the class to be active. They make a class of their own in one transaction: `classes/{code}` must be exactly `{ name, institution, status: "active", latest: null, createdAt, updatedAt }` (both times the request time), for an institution in their own profile whose `active` is `true`, under a code whose `classCoaches` does not exist; and `classCoaches/{code}` must be exactly `{ uids: [themself] }`, only while `classes/{code}` does not exist before the write and does after it (`getAfter` / `existsAfter` see the other half of the transaction). A code that exists can't be taken: writing it would be an update, which a coach may not make. A join request must be their own, `join-class`, `pending`, and well-formed.
- **Admins** list coaches, requests, classes and usage; decide a coach (`status`, stamped with `decidedAt` and `decidedBy`) or set `suspended` — one or the other in a write, and never the coach's own fields; decide a pending request once; pause and edit classes (including taking a page down, `latest: null`); write `classCoaches` (at most 50 uids); add and edit institutions (never delete); set `config/limits` within fixed ranges; delete pages, pictures and videos. An admin makes classes only as an approved coach.
- **Function-only**: `classes/{code}/videos` (clients may read; only admins delete), `classes/{code}/videoPlans` (no client access at all), and `usage` (a coach reads only their own `usage/{uid}_{YYYY-MM}`).
- **Stamps**: the times a coach writes (a profile's or request's `createdAt`, `institutionsChangedAt`, a new class's `createdAt` / `updatedAt`, a page's `createdAt` / `updatedAt` / `publishedAt`, a published `latest.publishedAt`, a picture's `createdAt`) and an admin's `decidedAt` and an institution's `updatedAt` must equal `request.time`, and the matching `createdBy`, `updatedBy`, `publishedBy` and `decidedBy` must be the caller.
- Sizes: class name ≤ 30, page and `latest` markdown ≤ 20,000 characters, titles ≤ 80, picture words ≤ 80, pictures at most 1600 × 1600.

## Storage rules

`storage.rules` denies by default, and nothing may be listed. Storage rules may read at most two Firestore documents per request, so its `isClassCoach(code)` reads exactly two: `classCoaches/{code}` (the caller must be in `uids`) and `coaches/{uid}` (read once and handed to `approved()`: `status == 'approved'` and not suspended). Whether the class is active is left to `firestore.rules`, whose shelf document (`classes/{code}/pictures/{id}`) needs an approved listed coach **and** an active class — and only shelf pictures are ever used: a file whose shelf write is refused is deleted again by the coach app, and nothing a learner sees links to it. `isAdmin()` is the same `admins/{uid}` check; a `delete` by an admin who is not listed stops after the first read, so it still stays within two.

| Path | Read | Write |
|---|---|---|
| `classes/{code}/pictures/{id}.jpg` | anyone, by the exact path (`id` matching `isId`) | a class's approved coach may create only: `image/jpeg`, under 2 MB, never over an existing file (`resource == null`, a new id per upload); the coach or an admin may delete |
| `classes/{code}/video-drafts/{id}.mp4` | a class's coach | functions only |
| `classes/{code}/videos/{id}.mp4` | anyone, by the exact path | functions only |

The Storage rules' Firestore lookups need `roles/firebaserules.firestoreServiceAgent` on the Cloud Storage for Firebase service agent ([cloud project](/operations/cloud-project.md)); without it every coach upload fails.

## Callable authorisation

The six callables in `functions/index.js` run in `asia-southeast1` as `simplify-functions@simplify-special.iam.gserviceaccount.com`, at most 10 instances, with App Check not enforced. Because they use the Admin SDK, their own checks are the whole boundary. Every one starts with `requireClassCoach(request, classCode)` in `functions/lib.js`, which fails with a plain message unless, in order:

1. the call carries a signed-in uid (`unauthenticated`);
2. the class code, normalised, is 9 characters (`invalid-argument`);
3. `coaches/{uid}` exists ("Fill in About you first."), is not suspended ("Your account is paused. Ask the admin.") and is approved ("The admin has not approved you yet." — or, when declined, "The admin has not approved you as a coach. Contact the admin."), and the class exists and `classCoaches/{code}.uids` includes the uid (`permission-denied`);
4. the class's `status` is `active` (`failed-precondition`).

Then each checks its own input before calling a model or touching Storage:

| Callable | Also checks |
|---|---|
| `writePage` | instruction ≤ 1,000, markdown ≤ 20,000, title ≤ 80 characters; up to 3 answers, each trimmed; under 4 letters or digits in total is answered free with a question and no model call; a Flash use is reserved in a transaction before the call |
| `planVideo` | request ≤ 1,000 characters; the same short-request and reservation rules |
| `startVideo` | `planId` is a safe id; in one transaction the plan exists in this class and was made by this caller, and a video credit is left; a plan already started (and not failed) returns that video instead of spending a second credit |
| `checkVideo` | `videoId` is a safe id and the video exists in this class; only a `rendering` video is checked |
| `approveVideo` | the video is `ready` and its draft file exists |
| `discardVideo` | the video exists and is not still `rendering` |

Any coach of the class may check, approve or discard any of the class's videos. What the model sees, and the prompt-injection guard in its instructions, are in [AI models](/platform/ai-models.md); the checks on the model's page before a coach sees it are in [the AI helper](/coach/ai-helper.md).

## Coach sign-in

The coach app signs in with Google in a popup (`prompt: "select_account"`, so a shared iPad always asks whose account) and keeps the session for the browser tab only (`browserSessionPersistence` in `public/coach/js/cloud.js`): class iPads are shared, and closing the tab or Sign out ends it. The web API key in `public/coach/js/firebase-config.js` only names the project; the rules decide what anyone may do. Anyone with a Google account can sign in and fill in About you, and that is all until an admin approves them. Approval, suspension and take-down are in [admin and approvals](/coach/admin-and-approvals.md).
