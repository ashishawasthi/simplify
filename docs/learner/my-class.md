---
type: Product Contract
title: My Class
description: The learner's My class reader — the menu tile, the coach's latest published page one screen at a time with Back and Next that never move, fetching the class with one plain HTTPS request (only the class code leaves the device), hearing about a new page at once through a Realtime Database stream (no SDK, no ID, nothing written), a page the coach shows now on every open screen, the offline copy of the page and its pictures and videos, and the calm lines shown instead of errors.
tags: [my-class, class-page, reader, offline, firestore-rest, realtime-database, push, privacy, learner-tool]
status: stable
---

My class (`#my-class`) shows the page the device's class coach published last, one screen at a time. It is the only
part of the learner app that uses the network. The reader is `public/js/tools/my-class.js`; reading the class, the
saved copy and the media cache are in `public/js/class-data.js`; hearing about a new page is `public/js/class-live.js`. How a device joins a class (the QR code's
`#join=<CODE>` or the set-up page) is in [menu and set-up](/learner/menu-and-setup.md); what a page may contain, and
how it is drawn, is in [markdown pages](/coach/markdown-pages.md).

## The menu tile

**My class** sits above the groups, with the class's name under it ("3 Kindness"), and appears only once the device
follows a class (`device.classCode`). It has no group and is not in the set-up page's "Show on the menu" list; leaving
the class (on the set-up page) removes it.

## Reading a page

- The page is split into **screens** at each `---` line and drawn by the shared parser
  (`parseClassMarkdown` + `renderScreen` from `public/js/class-markdown.js`) — text nodes only, never HTML.
- **◀ Back** and **Next ▶** sit at the bottom, always in the same place; on the last screen Next reads **All done**
  and returns to where the learner came from — the menu, when My class was opened from the set-up page. Progress dots show the place (up to 12 screens; more show "3 / 20").
  Screen readers hear "Screen 3 of 7".
- Under the page: "Updated Tue 8:05 am" (`publishedWords`: "today 8:05 am", a weekday within the week, then
  "22 Sept", with the year when it differs).
- A quick second Next within 450 ms of the screen changing is the same tap twice and is ignored.
- The screen being read is saved in `localStorage` `simplify-my-class-v1` as `{ page, screen }`, so Back into My
  class or a reload shows the same screen; a fresh visit starts at screen 1.
- **Pictures and videos** come only from the class's shelf, shown full width with their words as the description for
  screen readers. A video never plays by itself. A file not on the device and not reachable shows "Needs the
  internet" in its place, and loads when the internet is back.
- **YouTube** appears as a card that loads nothing from YouTube until it is tapped, then plays in the
  privacy-enhanced player; see [markdown pages](/coach/markdown-pages.md#youtube).

Nothing is an error:

| Situation | The learner sees |
|---|---|
| No class on this device | "No class on this device yet" / "An adult can add the class code on the set-up page." |
| Nothing published yet, or the page was taken down | "Nothing from your coach yet" |
| No internet | the saved copy, as last read |

## Fetching the page

One plain HTTPS request, no Firebase SDK and no account:

```
GET https://firestore.googleapis.com/v1/projects/simplify-special/databases/(default)/documents/classes/<CODE>
```

The rules let anyone `get` an **active** class by its exact code and nothing else — no listing; a suspended class or
a wrong code both come back 403/404 and are treated as "missing". The answer's typed Firestore JSON is turned into
`{ code, name, latest }` (`fromFirestore` / `classFromDocument`), where `latest` is `{ pageId, title, markdown,
publishedAt }` or null. The request gives up after 20 s and is sent with `cache: "no-store"`.

Pictures and videos are fetched from Cloud Storage by exact path (`GET
https://firebasestorage.googleapis.com/v0/b/simplify-special.firebasestorage.app/o/classes%2F<CODE>%2Fpictures%2F<id>.jpg?alt=media`,
or `videos%2F<id>.mp4`), with `credentials: "omit"` and CORS allowed by the bucket's read-only CORS policy.

**Only the class code leaves the device** (plus, as with any website, the device's internet address). Nothing a
learner types or taps is sent, and nothing is ever written from a learner's device — not even "I am online", so
no coach or admin can see who has the app open. On `localhost` and `127.0.0.1` the app asks nobody unless
`localStorage` `simplify-class-emulator` points it at the emulators (see
[local development](/operations/local-development.md)).

## Hearing about a new page

Nothing asks again and again. While the app — any screen, or any page of the guide — is **on screen** on a device
that follows a class, `class-live.js` keeps one stream open to the class's **push signal** in Firebase's Realtime
Database (Singapore), with the browser's own `EventSource`:

```
GET https://simplify-special-default-rtdb.asia-southeast1.firebasedatabase.app/signals/<CODE>.json
Accept: text/event-stream
```

The signal is `{ at, force }` — when the latest page was published (ms), and whether the coach asked for it to be
shown now — or `null` when nothing is published. A Cloud Function, `classSignal`, writes it on every change to
`classes/<CODE>` (`functions/signal.js`); nobody else can write it, and nobody can list the signals
([security](/platform/security.md#realtime-database-rules)). It never holds the page, the class's name or anything
about a learner.

On each signal the device compares `at` with the saved page's `publishedAt` (`matchesSignal`). A different page is
read at once with the usual single request (`refreshClass({ pushed: true })`), saved, and its files downloaded.

- **My class open**: the new page shows **at once**, from its first screen — even mid-read (`onNewPage` in
  `class-data.js`). A page taken down shows "Nothing from your coach yet" at once.
- **Anywhere else**: nothing changes on screen; the new page is there the next time My class opens.
- **The coach ticked "Show it now on open screens"** (`force`): My class opens at once on whatever screen is showing —
  a tool, the set-up page, or a guide page (which goes to `/#my-class`). A running Wait keeps counting and is there
  on the way back; a playing video stops. This happens only on a screen that was **open when the page was pushed**
  (`shouldForce`):
  - the first signal after a page loads is never forced — an app opened after the push just has the page waiting in
    My class;
  - a signal arriving on an open stream is forced;
  - the first signal of a stream opened again — the app back on screen, the internet back — is forced only within
    **5 minutes** of the push (`FORCE_WINDOW`);
  - the same push is never forced twice.

The stream is **closed while the app is in the background** (`visibilitychange`) and opened again when it comes
back: less battery, and no lasting "this device is open" for anyone to see. A stream that fails is tried again after
5 s, doubling up to 5 minutes, and at once when the device comes back online; one the rules refuse (a code no class
has) is not tried again until the class changes.

**My class opening** still reads the class once (`refreshClass()`, not twice within 15 seconds), for a device whose
network blocks the stream's host.

## The copy on the device

- `localStorage` `simplify-class-v1`: `{ code, name, latest, checkedAt }` — the class as last read.
- Cache Storage `simplify-class-media`: exactly the files the latest page uses (fetched when a page arrives, others
  dropped), under `<origin>/class-media/<code>/<picture|video>/<id>`, shown as `blob:` URLs. The service worker
  neither caches nor serves these; see [offline and updates](/platform/offline-and-updates.md).
- Leaving the class deletes both at the next start (`forgetClassIfNone`), not at once, so the set-up page's Put it
  back can still restore them.
- A change of class (another code on the set-up page) makes the reader start again with the new class's page.

While a video is playing, or a YouTube player is open, the tool reports itself busy (`shell.setBusy`), so an app
update never reloads under it.

## Tests

`node tools/test-class.mjs` covers the class code, `fetchClass` with a stand-in `fetch` (found, missing, offline),
the saved copy, pushed refreshes and `onNewPage`, `samePage`, `publishedWords`, the parser, and the push signal's
pure parts (`cleanSignal`, `applyEvent`, `matchesSignal`, `shouldForce`). `node tools/smoke.mjs my-class` drives
joining, the tile, reading, offline, a new page arriving mid-read, the push stream (one stream per class, none without
a class, closed in the background, forced from a tool, from a guide page, not forced when pushed before the app
opened or more than 5 minutes before it came back), YouTube and pictures only in Chrome with stubbed network answers
and a stand-in `EventSource`. `node tools/test-functions.mjs` runs `classSignal` both directly and as a real
Firestore trigger in the emulators.
