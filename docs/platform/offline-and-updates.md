---
type: System Reference
title: Offline and Updates
description: How the learner app works offline and gets new versions — the service worker's versioned precache and revalidating install, what it answers and ignores, the CACHE bump rule and what test-assets.mjs enforces, update.js's safe reload, Hosting's Cache-Control headers, and My class's separate media cache.
tags: [service-worker, cache, offline, updates, precache, cache-control, pwa]
status: stable
---

This document owns how the learner app is stored on a device and how a new deploy reaches a device that already has it: `public/sw.js`, `public/js/update.js`, the `Cache-Control` headers in `firebase.json`, and My class's own media cache. The module layout is in [architecture](/platform/architecture.md); the release steps that apply these rules are in [release and deploy](/operations/release-and-deploy.md).

## The service worker

`public/sw.js` is a versioned, cache-first precache of the whole learner app. `update.js` registers it as `/sw.js` at boot (a failed registration is ignored: offline support is a bonus, never a blocker).

### `CACHE` and `ASSETS`

- `CACHE` is one string constant near the top of `public/sw.js`, named `simplify-v<N>`. Each release that changes `public/` raises `N` by one. (The very first versions were named `afford-v<N>`, when the app was only "Can I buy?"; that is why the cleanup below recognises both.)
- `ASSETS` lists every file the learner app needs offline, by the URL Hosting serves it at: pages by their clean URLs (`"/"`, `"/guide"`, `"/guide/speak"`), never as `.html`, because Hosting's `cleanUrls` 301s the `.html` form and a cached redirect breaks offline navigation. It covers the app page, every guide page and screenshot, all CSS and JS, the manifest, favicon, icons, every bundled picture in `/img/pic/` and every clip of [the recorded voice](/platform/voice.md) in `/audio/voice/` (that part of the list, between two marked comment lines, is written by `tools/make-voice.mjs`).

### Install

For every entry in `ASSETS`, in parallel, `fetchAsset(url)` fetches with `cache: "no-cache"` and stores the response under the URL in a cache named `CACHE`; then the worker calls `self.skipWaiting()`.

- `cache: "no-cache"` makes the browser revalidate each file with the server, sending the ETag of its HTTP-cached copy. Hosting answers an unchanged image with a bodiless 304, so a release does not re-download the guide screenshots, pictures and icons. HTML, JS, CSS and the manifest are served `no-cache` and come in full each time (a few tens of KB compressed). No copy is used without the server confirming it is current, which `addAll()`'s default fetch would not guarantee.
- A response that is not `ok`, or was `redirected`, throws. One bad entry (a typo in `ASSETS`, a file not deployed) fails the whole install, and the version already installed keeps running on every device until a fixed one is deployed.

### Activate

On `activate` the worker deletes every cache whose name matches `/^(afford|simplify)-v\d+$/` other than the current `CACHE`, then calls `self.clients.claim()` so it controls the pages already open. Caches with any other name — `simplify-class-media` below — are not the worker's and are left alone.

`skipWaiting` + `clients.claim` mean a new worker takes over a running page immediately. That is why tools are imported statically and never with `import()` ([architecture](/platform/architecture.md#routing)): a module fetched later by an old page would come from the new cache.

### Fetch

For a `GET` to this origin, the worker answers from `CACHE` with `ignoreSearch: true` (so `/?utm_source=…` finds `/`) and falls back to the network on a miss. It never writes to the cache at fetch time, so only `ASSETS` is ever stored. A request with a `Range: bytes=…` header — an `<audio>` element fetching a voice clip — gets that range of the cached file as a `206` (`ranged()`), since Safari plays nothing from a whole-file answer; a range past the end gets `416`.

It does not answer (the browser fetches as if no worker were there):

| Request | Why |
|---|---|
| Any method other than `GET` | Nothing to precache |
| Another origin | Firestore, Cloud Storage and YouTube (My class) go straight to the network; `class-data.js` keeps its own copy of what it needs |
| `/coach` and anything under `/coach/` | The coach app is never cached for learners |
| Anything under `/__/` | Firebase Hosting's reserved paths (auth handler, `init.json`) |

A path that merely starts with the letters `/coach` (such as `/coaching`) is still the worker's. `tools/test-class.mjs` runs `sw.js` in a sandbox and pins this routing: own files answered, `/coach…` and `/__/…` not, other origins not, `POST` not.

## The CACHE bump rule

- **Bump `CACHE` for any change under `public/`** — HTML, CSS, JS, an image, a guide page. The worker is cache-first: without a new `CACHE` string the browser sees no change in `sw.js`, installs nothing, and installed apps keep serving the old files indefinitely even though Hosting has the new ones. Changes outside `public/` (docs, `tools/`, `functions/`, rules) need no bump. Files under `public/coach/` are never precached, so a coach-only change does not strictly need one; a bump there costs each device only a revalidation.
- **A new file under `public/` must be added to `ASSETS`**, or it will not work offline.

`node tools/test-assets.mjs` enforces `ASSETS` exactly (it does not and cannot check that `CACHE` was bumped). It reads the `ASSETS` array out of `public/sw.js`, lists every file Hosting would serve from `public/` (skipping dotfiles and the whole `public/coach/` folder), maps `index.html` to `/` and `x.html` to `/x`, and fails on:

- an entry listed twice;
- an entry under `/coach`;
- an entry written with `.html`;
- an entry with no file behind it (it would fail every install);
- a served file that is neither in `ASSETS` nor in its `NOT_PRECACHED` list;
- a `NOT_PRECACHED` file that does not exist, or that is also in `ASSETS`.

`NOT_PRECACHED` is the served-but-not-needed-offline list: `/sw.js` itself, `/img/og-card.png` (the link-preview card), `/img/qr-poster.png` (a poster to print) and `/img/pic/LICENSE.txt` (the pictures' licence).

## Reloading into a new version

A new worker taking over does not change the page already on screen. `public/js/update.js` (`initUpdates`, called last at boot) reloads it at a moment that cannot disrupt:

- On `controllerchange` after the page already had a controller (the very first install is not an update), it marks the app updated and tries `reloadIfSafe()`.
- `reloadIfSafe()` reloads only when all hold: an update is waiting; no `dialog[open]` is on the page (the notes-and-coins picker, speak, Show me, a shown card, the picture picker, Hurts); no tool has called `setBusy(true)` (a running Wait, a playing class video or open YouTube player); and either the screen has not been touched (`pointerdown` / `keydown`) since the page loaded or came to the front, or the page is now hidden. It calls `storage.flush()` first, then `location.reload()`.
- So an untouched screen reloads at once; a screen in use reloads the next time the app goes to the background (`visibilitychange` to hidden). A tool going idle does not trigger a reload — that is exactly when "Done" is on screen.
- Coming back to the front is not a page load, so the browser would not look for a new `sw.js` by itself. On becoming visible, `update.js` resets `touched` and, if more than 10 minutes (`CHECK_EVERY`) have passed since the last check, calls `registration.update()`. Failures (offline) are ignored until the next check.

Independently, `app.js` calls `flush()` on every `visibilitychange` to hidden and on `pagehide`, since a phone may kill a backgrounded app without warning. The reload keeps the history state, so every tool sees `fresh: false` and shows what it saved instead of repeating a one-off instruction ([the tool contract](/platform/architecture.md#the-tool-contract)).

## Hosting's Cache-Control

`firebase.json` sets these per path. For the same header key, the later matching rule wins, which is why the broad globs come first.

| Path | `Cache-Control` |
|---|---|
| `**/*.@(svg\|png)` | `public, max-age=3600` |
| `**/*.@(js\|css)` | `no-cache` |
| `/sw.js` | `no-cache` (the browser must always see a new `CACHE`) |
| `/manifest.webmanifest` | `no-cache`, with `Content-Type: application/manifest+json` |
| `/`, `/guide`, `/guide/**` | `no-cache` |
| `^/coach(/.*)?$` (regex) | `no-cache`, for every coach file including images |

`no-cache` with ETags makes every recheck a cheap 304, and means a browser without the worker never mixes old and new modules. Other files (such as `/img/pic/LICENSE.txt`) get Hosting's defaults. Hosting clears its CDN cache on every release.

## My class's media cache

My class keeps its own offline copy, separate from the worker's precache, in `public/js/class-data.js` (the reader's behaviour is in [my class](/learner/my-class.md)):

- The class as last read is in localStorage `simplify-class-v1`. The files the latest page uses are in Cache Storage `simplify-class-media` (`MEDIA_CACHE`), keyed `<origin>/class-media/<code>/<picture|video>/<id>`. The worker never serves or deletes this cache; the reader reads it with `getMedia()` and shows each file as a `blob:` URL.
- `refreshClass()` reads the class at most every 10 minutes when the menu shows or the app comes to the front, and whenever My class opens (then only "not twice within 15 seconds"). `keepClassMedia()` then downloads the files a new page needs and deletes every other entry — another page's, another class's.
- A file is fetched with `credentials: "omit"`, `mode: "cors"` and a 120-second limit, and kept only if its type is `image/*` for a picture or `video/*` for a video. The page itself is fetched with `cache: "no-store"` and a 20-second limit.
- After a Leave, the saved copy and the whole media cache are deleted at the next start (`forgetClassIfNone`), not at once, so the toast's undo can still restore them.
- In Cloud Storage the files carry their own `Cache-Control`: shelf pictures `public, max-age=86400` (set by the coach app on upload; a picture id is never reused), approved videos `public, max-age=86400` (set by `approveVideo`), video drafts `private, max-age=0`.
