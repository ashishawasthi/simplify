---
type: Product Contract
title: My Class
description: The learner's My class reader — the menu tile, the coach's latest published page one screen at a time with Back and Next that never move, fetching the class with one plain HTTPS request (only the class code leaves the device), when it checks for a new page and why it never swaps a page mid-read, the offline copy of the page and its pictures and videos, and the calm lines shown instead of errors.
tags: [my-class, class-page, reader, offline, firestore-rest, privacy, learner-tool]
status: stable
---

My class (`#my-class`) shows the page the device's class coach published last, one screen at a time. It is the only
part of the learner app that uses the network. The reader is `public/js/tools/my-class.js`; reading the class, the
saved copy and the media cache are in `public/js/class-data.js`. How a device joins a class (the QR code's
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
learner types or taps is sent. On `localhost` and `127.0.0.1` the app asks nobody unless `localStorage`
`simplify-class-emulator` points it at the emulators (see [local development](/operations/local-development.md)).

## When it checks for a new page

`refreshClass()` reads the class again:

- when the **menu** shows and when the app **comes back to the front** — at most every **10 minutes**;
- whenever **My class opens** — always, but not twice within 15 seconds.

It saves what it finds and downloads the files a new page needs in the background. **What is on screen is never
replaced**: the reader keeps the page it opened with until the next time it opens — unless it opened moments ago
(10 s) and has not been touched yet, or it had nothing to show. A new page therefore appears on the next visit, never
in the middle of someone reading.

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
the saved copy, `samePage`, `publishedWords` and the parser. `node tools/smoke.mjs my-class` drives joining, the tile,
reading, offline, a new page arriving, YouTube and pictures only in Chrome with stubbed network answers.
