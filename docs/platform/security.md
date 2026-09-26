---
type: Product Contract
title: Security
description: What the site promises about security and privacy and how the code keeps it — learners have no login by design, the headers per path (learner CSP, coach CSP, referrer, permissions, noindex), the no-innerHTML rule, Firestore, Storage and Realtime Database rule boundaries (only a coach the admin approved may do anything but fill in their profile; the push signal is read-only by exact code), what each Cloud Function checks before acting, what the video renderer's account may write, marks over pictures drawn only by code (never SVG from a model), the public guide-videos bucket, coach sign-in, the privacy analysis of the push to open screens, and exactly what the learner app sends and to whom.
tags: [security, csp, headers, firestore-rules, storage-rules, database-rules, privacy, minors, authorisation, xss]
status: stable
---

This document is the contract for what may run, load, be read, be written and leave a device. It owns the HTTP headers, the no-innerHTML rule, the boundaries the Firestore and Storage rules draw, and what each callable checks. The per-path access table is in [data model](/platform/data-model.md); the model calls themselves are in [AI models](/platform/ai-models.md).

## What the learner app sends, and to whom

Learners never sign in — there is no learner account, login, ID or profile anywhere, by design: most learners are minors, and what is never collected can never leak. Nothing a learner types or taps is sent anywhere, and a learner's device never writes to any server. The learner app's only requests beyond its own site are:

| When | To | What is sent |
|---|---|---|
| Joining a class, and each refresh of My class | `firestore.googleapis.com` | One `GET` of `classes/<code>` (the class code is in the URL), with `credentials: "omit"` and `cache: "no-store"` |
| While the app or a guide page is on screen on a device that follows a class | `simplify-special-default-rtdb.asia-southeast1.firebasedatabase.app` | One `EventSource` stream of `signals/<code>.json` (the class code is in the URL; no cookies, no token, no ID), closed while the app is in the background |
| My class needs a picture or video of the latest page | `firebasestorage.googleapis.com` | One `GET` per file, `classes/<code>/pictures/<id>.jpg` or `classes/<code>/videos/<id>.mp4`, with `credentials: "omit"` |
| A learner taps a YouTube card | `www.youtube-nocookie.com` | The privacy-enhanced player loads in a frame (`?rel=0&playsinline=1`), with the site's origin as referrer; nothing loads from YouTube before the tap |
| A learner taps a link button | the linked `https://` site | Opens in a new tab with `rel="noopener noreferrer"` |
| Someone opens a "Watch" fold on the learner guide | `storage.googleapis.com` | `GET` of the guide video and its poster from the public `simplify-guide-videos` bucket (`public/js/guide-video.js`); nothing is fetched before the tap. The same for every device, with no class code |

A device with no class set makes none of these but the last, and only when someone taps Watch. Like any website, every request also carries the device's internet address. On `localhost` and `127.0.0.1` the app asks nobody unless localStorage `simplify-class-emulator` points it at the emulators (`class-data.js` `endpoints()`). The class code travels in a URL path, never a query string; the `#join=<CODE>` fragment on a QR code never reaches a server. Joining and following a class are described in [my class](/learner/my-class.md).

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
| `img-src` | `'self' blob: https://storage.googleapis.com/simplify-guide-videos/` | `blob:` for My class's pictures, shown from the device's media cache; the guide-videos bucket only (not the rest of Google Storage) for a guide video's poster |
| `media-src` | `'self' blob: https://storage.googleapis.com/simplify-guide-videos/` | `blob:` for My class's videos, likewise; Google Storage for the guide videos, only once a Watch fold is opened |
| `connect-src` | `'self' https://firestore.googleapis.com https://firebasestorage.googleapis.com https://simplify-special-default-rtdb.asia-southeast1.firebasedatabase.app` | The one class read, the class's pictures and videos, and the push signal's stream (the stream answers directly, with no redirect to another host) |
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
| `img-src` | `'self' blob: data: https://firebasestorage.googleapis.com https://lh3.googleusercontent.com https://storage.googleapis.com/simplify-guide-videos/` | `blob:` for pictures being uploaded and for the marks over a picture (an SVG made by `overlay.js`); Storage for shelf pictures; the coach guide video's poster; `data:` and Google profile photos are allowed, though no code in `public/coach/js/` uses them today |
| `media-src` | `'self' blob: https://firebasestorage.googleapis.com https://storage.googleapis.com/simplify-guide-videos/` | Approved videos from Storage; drafts as `blob:` after an authenticated download; the coach guide's video |
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

**Marks over a picture are never markup from a model.** `planOverlay`'s model answers only numbers and a kind of mark; code places them (`markToShape`), `cleanShapes` in `public/coach/js/overlay.js` (and its byte-identical copy in `functions/`) drops anything unknown or out of range and cuts a label to 30 characters, and `overlaySvg` writes the SVG itself, escaping the label's text. The coach app shows it as an `<img>` from a `blob:` URL, where no script can run; the video renderer's stage draws it with the same function ([videos](/coach/videos.md#how-marks-are-drawn)).

No lint rule forbids `innerHTML`; the rule is held by review and by tests that feed markup in and check it comes out as text: `tools/test-class.mjs` (`<img onerror>` and `<script>` in a page stay text; `javascript:` and `data:` links keep only their words) and the smoke scenes in `tools/smoke/shared.mjs` (a shown card), `now-next.mjs` (card words), `show-card.mjs` (the stop's name) and `my-class.mjs` (a page); the show-card and my-class scenes also check that the injected handler never ran. The bundled pictures are checked for anything that could run or load: `tools/test-pictures.mjs` allows only a fixed set of SVG elements and attributes and rejects `<script>`, event handlers, `<foreignObject>`, `<image>` and outside references ([pictures](/learner/pictures.md)).

## Firestore rules

`firestore.rules` denies by default. The Cloud Functions use the Admin SDK, which skips the rules, so anything written only by functions has no client write rule at all. `node tools/test-rules.mjs` tests the rules against the emulators.

**Helper functions**

| Function | True when |
|---|---|
| `signedIn()` | `request.auth != null` |
| `withGoogle()` | signed in with Google (`sign_in_provider == 'google.com'`) and the email verified |
| `isAdmin()` | `withGoogle()`, and `admins/{uid}` exists (created by the owner in the console; no client may write it) |
| `loggedNow(logId, action, key, value)` | the `adminLog/{logId}` written in this same commit (`getAfter`) has that `action`, this admin's uid, `at == request.time`, and `key == value` (the coach or request it is about) |
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
- **A coach waiting for approval** (`status` `pending` or missing), **declined** or **suspended** can do nothing else: they create their own profile, signed in with Google (`status: "pending"`, 0–10 institution ids and/or an `otherPlace` of ≤ 120 characters — at least one — the email must be the signed-in one) and may later change only `name`, `note`, `institutions` and `otherPlace` — a change of either place must stamp `institutionsChangedAt` with the request time. A declined coach may also ask again: `status` `declined` → `pending` with `reappliedAt` = request time, nothing else. `decidedAt`, `decidedBy`, `decisionLog`, `decisionMessage`, `suspended` and `suspendLog` can't be written by the coach, nor `approved`. The rules check the shape of each institution id (a list of strings, no repeats, joined with commas and split again to the same list, since the rules cannot loop), not that it exists.
- **An approved coach** reaches only their own profile and requests, and only the classes they are listed for. Publishing, pages and the picture shelf also need the class to be active. They make a class of their own in one transaction: `classes/{code}` must be exactly `{ name, institution, status: "active", latest: null, createdAt, updatedAt }` (both times the request time), for an institution in their own profile whose `active` is `true`, under a code whose `classCoaches` does not exist; and `classCoaches/{code}` must be exactly `{ uids: [themself] }`, only while `classes/{code}` does not exist before the write and does after it (`getAfter` / `existsAfter` see the other half of the transaction). A code that exists can't be taken: writing it would be an update, which a coach may not make. A request must be their own, `pending` and well-formed: `join-class` with a class code, or `more-videos` with none. They can never write their own `limits`.
- **Admins** sign in with Google (an `admins/{uid}` doc is not enough with any other sign-in). They list coaches, requests, classes and usage; decide a coach (`status`, stamped with `decidedAt` and `decidedBy`, with `decisionLog` naming its `adminLog` entry; a decline may carry `decisionMessage`, ≤ 300, which any other status removes) or set `suspended` (with `suspendLog`) — one or the other in a write, never the coach's name or note; put one more institution on a coach's profile in place of their `otherPlace` (nothing else changes); decide a pending request once (with `decisionLog`; for more videos, also setting the coach's `limits.videosPerMonth`, 0–500, with `limitsLog`); pause and edit classes (including taking a page down, `latest: null`); write `classCoaches` (at most 50 uids); add and edit institutions (never delete); set `config/limits` within fixed ranges; delete pages, pictures and videos. An admin makes classes only as an approved coach.
- **The admin log** (`adminLog/{id}`): admins read it and create entries, never update or delete them. An entry's `adminUid` and `adminEmail` must be the caller's own uid and Google email and `at` the request time, so no admin can write in another's name or date an entry. Approving a coach or a join request needs a `note` of at least 10 characters (how the admin checked). A decision on a coach, a suspension and a decision on a request are allowed only with their entry in the same commit (`loggedNow`), and those entries only with their decision (`getAfter` on the coach or request) — so every approval has a record of who approved and how, and there is no record of an approval that did not happen. Other admin actions write their entry beside them from the coach app; the rules don't insist on those.
- **Function-only**: `classes/{code}/videos` (clients may read; only admins delete; the functions and the video renderer write it) and `usage` (a coach reads only their own `usage/{uid}_{YYYY-MM}`).
- **Stamps**: the times a coach writes (a profile's or request's `createdAt`, `institutionsChangedAt`, a new class's `createdAt` / `updatedAt`, a page's `createdAt` / `updatedAt` / `publishedAt`, a published `latest.publishedAt`, a picture's `createdAt`) and an admin's `decidedAt` and an institution's `updatedAt` must equal `request.time`, and the matching `createdBy`, `updatedBy`, `publishedBy` and `decidedBy` must be the caller.
- Sizes: class name ≤ 30, page and `latest` markdown ≤ 20,000 characters, titles ≤ 80, picture words ≤ 80, pictures at most 1600 × 1600.

## Realtime Database rules

`database.rules.json` denies everything at the root. Its one grant: anyone may read `signals/{code}` when the key is exactly 9 characters of the class-code alphabet. So a device can stream its own class's signal, but nobody can read `signals` itself (no list of classes), read the root, or write anything; only the `classSignal` function writes, with the Admin SDK. A wrong code reads `null`, like a code with nothing published, so the signal says nothing about which codes exist. `node tools/test-rules.mjs` covers each case against the Realtime Database emulator, as a plain read and as a stream.

## Pushing a page to open screens: the privacy analysis

A coach can publish with **Show it now on open screens**, which opens My class on every learner device that has Simplify on screen ([my class](/learner/my-class.md#hearing-about-a-new-page)). The owner chose how on 2026-09-26, after weighing three Firebase ways to push against the learners, most of them minors:

| Way | What a learner's device would reveal or store | Chosen? |
|---|---|---|
| Firebase Cloud Messaging (web push) | A lasting device ID (Firebase Installations) and a push token held by Apple, Google or Mozilla, which we would have to store against each class — a list of learners' devices. It also needs a notification-permission prompt, and works on iPad only once the app is on the home screen | No |
| A Firestore listener (Firebase SDK) | Only the class code on an open connection, but the SDK (~790 KB, more than the learner app's own code) also sends SDK version headers and keeps a small IndexedDB "heartbeat" store | No |
| **A Realtime Database stream** (the browser's `EventSource`, no SDK) | Only the class code, in the URL, on an open connection. No ID, no token, no cookie, nothing stored on the device beyond the class copy it already keeps | **Yes** |

What holds it to that:

- **Learners' devices never write.** No presence, no "seen", no delivery count: a coach sees only that they published, never who had the app open or how many ("no counts at all", the owner's choice). The signal node holds `{ at, force }` and nothing else — no page, no name.
- **Only while on screen.** The stream is closed when the app goes to the background, so Google sees "an internet address has class X open" only while it truly is, much as it already saw each class read.
- **Only the app itself moves.** A forced page can only open My class inside Simplify; it cannot open a link, another site or a notification. The page's content goes through the same rules and renderer as before.
- **Only a class's coaches can force**, through the same `firestore.rules` that let them publish (`latest.force` must be a boolean); the admin's take-down and pause remove the signal at once.
- Firestore and Realtime Database data-access audit logs stay off, as they are by default, so no per-read log of internet addresses is kept in the project.

## Storage rules

`storage.rules` denies by default, and nothing may be listed. Storage rules may read at most two Firestore documents per request, so its `isClassCoach(code)` reads exactly two: `classCoaches/{code}` (the caller must be in `uids`) and `coaches/{uid}` (read once and handed to `approved()`: `status == 'approved'` and not suspended). Whether the class is active is left to `firestore.rules`, whose shelf document (`classes/{code}/pictures/{id}`) needs an approved listed coach **and** an active class — and only shelf pictures are ever used: a file whose shelf write is refused is deleted again by the coach app, and nothing a learner sees links to it. `isAdmin()` is the same `admins/{uid}` check; a `delete` by an admin who is not listed stops after the first read, so it still stays within two.

| Path | Read | Write |
|---|---|---|
| `classes/{code}/pictures/{id}.jpg` | anyone, by the exact path (`id` matching `isId`) | a class's approved coach may create only: `image/jpeg`, under 2 MB, never over an existing file (`resource == null`, a new id per upload); the coach or an admin may delete |
| `classes/{code}/video-drafts/{id}.mp4` | a class's coach | the video renderer (and the functions) only |
| `classes/{code}/videos/{id}.mp4` | anyone, by the exact path | functions only |

The guide videos are in a bucket of their own, `gs://simplify-guide-videos`, which is **public to read** (`allUsers` has `roles/storage.objectViewer`, no Firebase rules) and holds only the three guide videos and their posters — nothing about a class or a person. Only the renderer's account writes it. Keeping them apart means the class bucket never has to be public ([guide videos](/operations/guide-videos.md#the-guide-videos-bucket)).

The Storage rules' Firestore lookups need `roles/firebaserules.firestoreServiceAgent` on the Cloud Storage for Firebase service agent ([cloud project](/operations/cloud-project.md)); without it every coach upload fails.

## Callable authorisation

(The one trigger, `classSignal`, is not callable: it runs on changes to `classes/{code}` that the rules above already allowed, reads the class again and writes only `signals/{code}` — `functions/signal.js`.)

The six callables in `functions/index.js` run in `asia-southeast1` as `simplify-functions@simplify-special.iam.gserviceaccount.com`, at most 10 instances, with App Check not enforced. Because they use the Admin SDK, their own checks are the whole boundary. Every one starts with `requireClassCoach(request, classCode)` in `functions/lib.js`, which fails with a plain message unless, in order:

1. the call carries a signed-in uid (`unauthenticated`);
2. the class code, normalised, is 9 characters (`invalid-argument`);
3. `coaches/{uid}` exists ("Fill in About you first."), is not suspended ("Your account is paused. Ask the admin.") and is approved ("The admin has not approved you yet." — or, when declined, "The admin has not approved you as a coach. Contact the admin."), and the class exists and `classCoaches/{code}.uids` includes the uid (`permission-denied`);
4. the class's `status` is `active` (`failed-precondition`).

Then each checks its own input before calling a model or touching Storage:

| Callable | Also checks |
|---|---|
| `writePage` | instruction ≤ 1,000, markdown ≤ 20,000, title ≤ 80 characters; up to 3 answers, each trimmed; under 4 letters or digits in total is answered free with a question and no model call; a Flash use is reserved in a transaction before the call |
| `planOverlay` | `pictureId` is a safe id and on this class's shelf; words ≤ 300 characters; the same short-request and reservation rules; only this class's picture file is sent to the model; the answer becomes shapes by code and `cleanShapes` |
| `makeVideo` | `pageId` is a safe id, the page exists in this class and is not empty; in one transaction a video is left this month (the coach's own limit, or everyone's); marks are kept only for pictures the page shows (≤ 20) and through `cleanShapes`; then it starts the renderer for that one video, by class code and video id only |
| `checkVideo` | `videoId` is a safe id and the video exists in this class; only a `rendering` video is checked |
| `approveVideo` | the video is `ready` and its draft file exists |
| `discardVideo` | the video exists and is not still `rendering` |

Any coach of the class may check, approve or discard any of the class's videos. Timeouts: `writePage`, `planOverlay` and `approveVideo` 120 s; `makeVideo`, `checkVideo` and `discardVideo` 60 s.

## The video renderer

Page videos are made by the Cloud Run job `simplify-video` ([guide videos](/operations/guide-videos.md#the-cloud-run-job)), which runs as its own service account, `simplify-video@simplify-special.iam.gserviceaccount.com`, not as the functions:

- **Who can start it.** Only the functions' account holds `roles/run.developer` on the job (and `roles/iam.serviceAccountUser` on `simplify-video@`), so a run starts only through `makeVideo`, after its checks, or by the owner. A run takes a class code and a video id, both checked against their exact shapes, and does nothing unless that video is `rendering` and of `kind: "page"`.
- **What it may write.** `roles/storage.objectAdmin` on the class bucket (it writes one draft, `classes/{code}/video-drafts/{id}.mp4`, `private, max-age=0`) and on `gs://simplify-guide-videos`; `roles/datastore.user` (it sets that one video's `status`, `bytes` and `updatedAt`, or `renderError`, only if the document is unchanged since it read it); `roles/serviceusage.serviceUsageConsumer` (Text-to-Speech, billed to the project). IAM, like the Admin SDK, is not bound by `firestore.rules` or `storage.rules`, so these grants are its whole boundary.
- **What it reads.** The video document, and the page's pictures and approved videos by their public paths, as any learner device can. It sends only the page's words to Text-to-Speech.
- **What it films.** The shipped learner reader and coach app from its own copy of `public/`, in a headless Chrome with no sign-in; the page is shown exactly as learners would see it, through the same parser and renderer. What the model sees, and the prompt-injection guard in its instructions, are in [AI models](/platform/ai-models.md); the checks on the model's page before a coach sees it are in [Write with AI](/coach/ai-helper.md).

## Coach sign-in

The coach app signs in with Google in a popup (`prompt: "select_account"`, so a shared iPad always asks whose account) and keeps the session for the browser tab only (`browserSessionPersistence` in `public/coach/js/cloud.js`): class iPads are shared, and closing the tab or Sign out ends it. The web API key in `public/coach/js/firebase-config.js` only names the project; the rules decide what anyone may do. Anyone with a Google account can sign in and fill in About you, and that is all until an admin approves them; the rules refuse a profile or an admin action from any other kind of sign-in (the Auth project has had email sign-in switched on only briefly, for a test). Approval, suspension and take-down are in [admin and approvals](/coach/admin-and-approvals.md).
