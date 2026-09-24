---
type: System Reference
title: Offline and Updates
description: How the learner app works offline and gets new versions — the service worker's revision-stamped precache and its install that fetches only changed files, what it answers and ignores, the stamp rule and what test-assets.mjs enforces, the modulepreload lists, update.js's safe reload, Hosting's Cache-Control headers, and My class's separate media cache.
tags: [service-worker, cache, offline, updates, precache, cache-control, pwa, modulepreload, stamp]
status: stable
---

This document owns how the learner app is stored on a device and how a new deploy reaches a device that already has it: `public/sw.js`, `public/js/update.js`, the `Cache-Control` headers in `firebase.json`, and My class's own media cache. The module layout is in [architecture](/platform/architecture.md); the release steps that apply these rules are in [release and deploy](/operations/release-and-deploy.md).

## The service worker

`public/sw.js` is a versioned, cache-first precache of the whole learner app. `update.js` registers it as `/sw.js` at boot (a failed registration is ignored: offline support is a bonus, never a blocker).

### `ASSETS` and `CACHE`

- `ASSETS` maps every file the learner app needs offline, by the URL Hosting serves it at, to its **revision**: the first 8 hex digits of the SHA-256 of its bytes (`"/js/app.js": "1a2b3c4d"`). Pages are keyed by their clean URLs (`"/"`, `"/guide"`, `"/guide/speak"`), never as `.html`, because Hosting's `cleanUrls` 301s the `.html` form and a cached redirect breaks offline navigation. It covers every file under `public/` except the coach app and the four `NOT_PRECACHED` files below: the app page, every guide page and screenshot, all CSS and JS, the manifest, favicon, icons, every bundled picture in `/img/pic/` and every clip of [the recorded voice](/platform/voice.md) in `/audio/voice/`.
- `ASSETS` sits between two marked comment lines and is written only by `node tools/stamp.mjs`, never by hand ([the stamp rule](#the-stamp-rule)).
- `CACHE` is worked out from `ASSETS` when the worker starts: `simplify-<8 hex digits>`, an FNV-1a hash of the whole map. Any changed, added or removed file changes a revision, so it changes `sw.js`'s bytes (the browser installs the new worker) and the cache's name. There is no version number to bump. (Before revisions the caches were named `simplify-v<N>`, and at first `afford-v<N>`, when the app was only "Can I buy?"; the cleanup below still recognises both.)

### Install

The install asks the network only for what changed. For every entry in `ASSETS`, in parallel:

1. A copy already in the cache named `CACHE` whose bytes hash to the entry's revision is left as it is — what an earlier, interrupted attempt at this same version got through.
2. Otherwise, a copy in any earlier version's cache (any name `MINE` matches) whose bytes hash to the revision is copied across. On a release that changes one script, that is every other file: the phone downloads `sw.js` and that one script.
3. Otherwise `fetchAsset(url, rev)` fetches it with `cache: "no-cache"`, and keeps it only if it is `ok`, not `redirected`, and its bytes hash to the revision.

Every file is seen through (`Promise.allSettled`) before the install gives up, so whatever could be fetched is kept; then, if any file failed, the install fails as a whole and the version already installed keeps running. The next update check (the next page load, or `update.js`'s check on resume) tries again and fetches only what is still missing, so an install cut short on a slow or dropping connection resumes rather than restarting. When every file is in, the worker calls `self.skipWaiting()`.

- `cache: "no-cache"` makes the browser revalidate each file with the server, sending the ETag of its HTTP-cached copy. Hosting answers an unchanged image with a bodiless 304; HTML, JS, CSS and the manifest come in full.
- **Nothing stale is ever kept.** Whether a copy comes from the device or the network, its bytes must hash to this version's revision. A CDN edge not yet cleared, or the browser's own HTTP cache, answering with the previous release's file fails the check instead of being baked into the cache (the reason for the 2026-08-12 decision to bypass HTTP caches). A file changed without `node tools/stamp.mjs` fails it too, with the file's URL and "run node tools/stamp.mjs" in the error.
- A response that is not `ok` or was `redirected` throws: a typo, a file not deployed, a redirect.

`crypto.subtle.digest` hashes each file; hashing the whole app (about 5 MB) takes a few tens of milliseconds.

### Activate

On `activate` the worker deletes every cache `MINE` matches (`/^(afford|simplify)-v\d+$|^simplify-[0-9a-f]{8}$/`) other than the current `CACHE`, then calls `self.clients.claim()` so it controls the pages already open. Caches with any other name — `simplify-class-media` below — are not the worker's and are left alone.

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

## The modulepreload lists

`public/index.html` and `public/coach/index.html` each carry, between two marked comment lines in `<head>`, a `<link rel="modulepreload">` for every module their entry script (`/js/app.js`, `/coach/js/main.js`) reaches by static `import` or `export … from`, nearest first. Without them the browser finds the modules one import level at a time — eight levels deep in the learner app, five in the coach app — and on a slow network each level costs a round trip before the next can start. With them it asks for all of them as the page arrives. Measured on a first visit over HTTP/2 with Chrome's "Fast 3G" throttling (562 ms latency, 1.4 Mbit/s), the learner menu was ready in about 2.2 s instead of 3.7 s, the coach app in about 3.2 s instead of 4.2 s. Once the service worker is in, the learner app's modules come from the device either way.

`import()` is not followed (the coach preview's lazy `class-markdown.js` stays lazy). The lists are written by `node tools/stamp.mjs`.

## The stamp rule

**After any change under `public/`, run `node tools/stamp.mjs`**, and commit what it writes: `ASSETS` in `public/sw.js` (every file, with its revision) and the two modulepreload lists. That is the whole rule — a new file is picked up, a deleted one dropped, a changed one re-stamped, and the new `CACHE` follows. Without it, `node tools/test-assets.mjs` fails, and a device would refuse the file whose bytes no longer match (keeping the version it has) until a stamped release is deployed.

The generators that write under `public/` (`make-voice.mjs`, `make-pictures.mjs`, `make-icons.mjs`, `shoot-guide.mjs`) end by saying so. Changes only under `public/coach/` touch nothing the service worker keeps, but a change to the coach app's modules can change its modulepreload list, so run it then too.

`node tools/test-assets.mjs` checks:

- `sw.js`'s `ASSETS` and both modulepreload lists are exactly what `stamp.mjs` would write now;
- every `NOT_PRECACHED` file exists, and nothing under `/coach` or written with `.html` is kept;
- in a sandbox (`node:vm`, in-memory Cache Storage, `crypto.subtle`), the install itself: a first install keeps every file byte for byte under one `simplify-<hash>` cache and reuses a matching copy from a `simplify-v<N>` cache; activate deletes the old version's cache and leaves `simplify-class-media`; the next release fetches only its one changed file; a stale copy from the network and a 404 are refused; an install cut short resumes by fetching only what it missed.

`NOT_PRECACHED` (in `tools/stamp.mjs`) is the served-but-not-needed-offline list: `/sw.js` itself, `/img/og-card.png` (the link-preview card), `/img/qr-poster.png` (a poster to print) and `/img/pic/LICENSE.txt` (the pictures' licence).

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
| `/sw.js` | `no-cache` (the browser must always see new revisions) |
| `/manifest.webmanifest` | `no-cache`, with `Content-Type: application/manifest+json` |
| `/`, `/guide`, `/guide/**` | `no-cache` |
| `^/coach(/.*)?$` (regex) | `no-cache`, for every coach file including images … |
| `/coach/vendor/**` | … except the vendored libraries: `public, max-age=31536000, immutable`. Their folders are named by version (`firebase/12.19.0/`), so a coach's browser keeps them without asking again; a new version goes in a new folder, never over an old one (`tools/vendor-firebase.mjs`) |

`no-cache` with ETags makes every recheck a cheap 304, and means a browser without the worker never mixes old and new modules. Other files (such as `/img/pic/LICENSE.txt`) get Hosting's defaults. Hosting clears its CDN cache on every release.

## My class's media cache

My class keeps its own offline copy, separate from the worker's precache, in `public/js/class-data.js` (the reader's behaviour is in [my class](/learner/my-class.md)):

- The class as last read is in localStorage `simplify-class-v1`. The files the latest page uses are in Cache Storage `simplify-class-media` (`MEDIA_CACHE`), keyed `<origin>/class-media/<code>/<picture|video>/<id>`. The worker never serves or deletes this cache; the reader reads it with `getMedia()` and shows each file as a `blob:` URL.
- `refreshClass()` reads the class at most every 10 minutes when the menu shows or the app comes to the front, and whenever My class opens (then only "not twice within 15 seconds"). `keepClassMedia()` then downloads the files a new page needs and deletes every other entry — another page's, another class's.
- A file is fetched with `credentials: "omit"`, `mode: "cors"` and a 120-second limit, and kept only if its type is `image/*` for a picture or `video/*` for a video. The page itself is fetched with `cache: "no-store"` and a 20-second limit.
- After a Leave, the saved copy and the whole media cache are deleted at the next start (`forgetClassIfNone`), not at once, so the toast's undo can still restore them.
- In Cloud Storage the files carry their own `Cache-Control`: shelf pictures `public, max-age=86400` (set by the coach app on upload; a picture id is never reused), approved videos `public, max-age=86400` (set by `approveVideo`), video drafts `private, max-age=0`.
