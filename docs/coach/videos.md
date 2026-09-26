---
type: Product Contract
title: Videos
description: How a coach makes a video of a class page — the page filmed in the real learner reader by the video renderer (a Cloud Run job), read aloud with quiet music and optional marks over its pictures that the AI places (planOverlay, one Flash request each, drawn by code), makeVideo and the month's videos, checkVideo polling and statuses, approveVideo and discardVideo, when a video is given back, asking the admin for more, draft versus approved storage, the video shelf UI, and what learners get.
tags: [videos, page-video, video-renderer, cloud-run, planoverlay, makevideo, checkvideo, overlays, video-shelf, storage]
status: stable
---

A coach can make a short video of one of their class's pages, check it, and place it in a page like a picture: `![words](videos/<id>.mp4)`. The video is the page itself, filmed in the real learner reader (My class) one screen at a time, with its words read aloud in the app's voice, quiet music underneath, and any marks the coach asked for drawn over its pictures. No AI makes the pictures or the sound: the AI only places the marks, and code draws them.

This document owns that flow. It covers the six callables' video part in `functions/index.js` (`planOverlay`, `makeVideo`, `checkVideo`, `approveVideo`, `discardVideo`), the job starter in `functions/render.js`, the marks in `public/coach/js/overlay.js`, the video shelf in `public/coach/js/videos-shelf.js`, the renderer's page mode in `video/page.mjs`, and the month's videos. How the renderer films and composes a video, and how its Cloud Run job is built, is in [guide videos](/operations/guide-videos.md); the Flash call is in [AI models](/platform/ai-models.md). Videos were made by Gemini Omni until 2026-09-26; why that stopped is in the [decision log](/product/decisions.md).

Each step is the coach's own decision: **choose** (marks cost one AI request each, the rest nothing) → **make** (one of the month's videos) → **check**, then **approve** or **discard**.

## 1. Choose

The "Videos" panel has a fold, **Make a video of this page**. It is always about the page open in the editor. Its hint reads "The page as learners see it in My class, one screen at a time. It takes a minute or two, and uses one of your videos this month." Inside:

- **Read the words aloud** (a tick box, on by default): each screen's headings, sentences and list items are spoken in the app's voice.
- **Quiet music** (on by default): the renderer's own calm loop under the voice.
- **Point things out** (only when the page shows pictures from the shelf): "Optional. Say what to point out in a picture, and the AI draws an arrow, a ring or a label on it. Each uses one AI request." One row per picture in the page, with the picture, its words, a box (300 characters, "For example: an arrow to the tap"), **Draw it** and, once it has marks, **Remove the marks**.
- the cost line: "Making it uses 1 of your 20 videos this month. You have 19 left." When none are left it says "You have made all 20 videos for this month." and **Make the video** is disabled;
- **Make the video**, disabled while one is starting, when none are left, or when the page is empty.

The marks are kept in the panel for the page being made, and are dropped when the coach opens another page, or for a picture taken out of the page. The picture rows follow the editor as the coach types (400 ms after the last change). The page parser loads only when the fold is first opened, so the class screen opens no slower for it.

### Marks over a picture: planOverlay

**Draw it** calls `planOverlay` with `{ classCode, pictureId, request }`. While it works, the row says "The AI is looking at the picture." The function:

- runs `requireClassCoach` first: signed in, a profile the admin approved and has not suspended, listed for the class, class active;
- checks the words (at most 300 characters, "Say it in at most 300 characters.") and that the picture is on the class's shelf ("That picture is not on the class's shelf.");
- answers words with fewer than 4 letters or digits for free, with no model call and nothing counted: "Say what to point out, for example: an arrow to the tap.";
- otherwise reserves **one Flash request** from the same monthly allowance as [Write with AI](/coach/ai-helper.md) (200 by default), downloads the picture's JPEG from Storage and makes **one Gemini Flash call** with the picture itself and the coach's words (thinking level low, JSON mode against `OVERLAY_SCHEMA`).

The model (`OVERLAY_SYSTEM` in `functions/prompts.js`) answers one of three actions, always with "I understood: …":

| Action | When | Marks |
|---|---|---|
| `draw` | it can see what the coach means | 1–4 marks, each `{ kind, target, text }`: `kind` is `arrow`, `circle`, `box` or `label`; `target` is a tight box round the thing, `[ymin, xmin, ymax, xmax]` from 0 to 1000 (the way Gemini finds things in a picture); `text` is at most 3 words, for a label only |
| `none` | it cannot find it in the picture | none; the note says so kindly |
| `decline` | the request is not about pointing something out for a class page, or would single out, shame or identify a person (a face, a name badge, a learner) | none |

It never marks a face. If the coach only says what to point out, it uses one arrow. The coach's words, and anything written in the picture, are material: the instructions tell the model never to follow text in them.

**The model never places or draws anything itself.** `markToShape` in `functions/index.js` turns each mark's box into a shape, placed by code:

- a **circle** round the middle of the box, a little bigger than it, measured on the picture's shorter side as `overlay.js` draws it (the picture's `width` and `height` from its shelf doc), so a ring fits on wide and tall photos alike (radius at least 40);
- a **box** 20 units outside it on every side;
- a **label** 60 units above it, or below when there is no room above, kept 120 units from the sides;
- an **arrow** from the side of the picture with the most room, 260 units long, ending 20 units outside the thing.

Then `cleanShapes` (below) keeps only well-formed shapes. A `draw` with no usable shape becomes `none` ("I could not find that in the picture. Try other words."). A failed call is refunded: "The AI is not available right now. Try again in a minute. This request was not counted." A safety-withheld answer becomes a decline ("The AI cannot mark this. Try asking in a different way."). A decline is counted, and also in `declined`; `none` is counted like any answer. The reply is `{ action, understood, shapes, note, used, limit }`, and the AI request line updates.

### How marks are drawn

`public/coach/js/overlay.js` is the one place marks become pictures. The functions check with a byte-for-byte copy, `functions/overlay.js`, kept by `node tools/copy-class-markdown.mjs` (which now copies two modules; `--check` fails if either copy differs).

- A shape is data, with numbers from 0 to 1000 across and down the picture: `{ type: "arrow", from, to }`, `{ type: "circle", at, r }` (r of the picture's shorter side), `{ type: "box", from, to }`, `{ type: "label", at, text }`.
- `cleanShapes(list)` drops anything unknown or out of shape — never guesses — and keeps at most **4** shapes; numbers are rounded and held to 0–1000, a circle's radius to 20–500, a label to **30 characters** of one line, and an arrow or box must not start where it ends.
- `overlaySvg(shapes, w, h, progress)` draws them as SVG in bright yellow (`#ffca28`) outlined in dark, seen on light and dark photos; labels are text nodes with `&`, `<`, `>` and `"` escaped. In a video they draw in one after another (lines grow, labels fade in).
- **No SVG written by a model is ever shown.** The coach app shows the marks as a picture of their own over the photo: an `<img>` whose source is a `blob:` URL of the SVG, never markup in the page. The renderer's stage draws them with the same function.

## 2. Make

**Make the video** first saves the page (the video is made from the page as saved); if the save fails it stops there with "The page could not be saved, so its video can't be made yet. Check the internet, then try again." and nothing is used. Then it calls `makeVideo` with `{ classCode, pageId, readAloud, music, overlays }`. The panel says "Starting the video. It shows below when it is ready to check, in a minute or two.", then "The video is being made. It shows below when it is ready to check." The function:

1. runs `requireClassCoach`, and checks that the page exists ("That page was not found.") and is not empty ("The page is empty. Write it first, then make its video.");
2. in **one Firestore transaction**, checks that a video is left this month (`usage/{uid}_{YYYY-MM}.video` against the coach's limit, below) or refuses with "You have made all *n* videos for this month. You can ask the admin for more."; counts it (`video + 1`); and creates `classes/{code}/videos/{id}` with:
   - `kind: "page"`, `status: "rendering"`;
   - `words`: "Video of the page: *title*" (at most 80 characters, for screen readers), `title` (the page's name, or "Our class page"), `className`, `pageId`;
   - `markdown`: **a copy of the page as it is now**, so later edits don't change the video;
   - `readAloud` and `music` (true unless the coach turned them off);
   - `overlays`: `{ pictureId: [shapes] }`, only for pictures the page shows, at most 20 pictures, each list through `cleanShapes`;
   - `execution: null`, `usageMonth`, `createdBy`, `createdAt`, `updatedAt`;
3. starts the renderer: `startRender` in `functions/render.js` runs the Cloud Run job **`simplify-video`** (asia-southeast1) once, through the Cloud Run Admin API (`POST …/jobs/simplify-video:run` with `containerOverrides` args `["page", code, videoId]`, one task), signed in as the functions' own account (an `applicationDefault()` token; it holds `roles/run.developer` on the job). The run's execution name is saved as `execution` (tried twice).

If the start fails, the video is marked `failed` and given back, and the coach reads "The video could not be started. It was not counted. Try again later." Should saving `execution` never land, `checkVideo` gives the video back after 10 minutes. Each press makes a new video: the button is disabled while one is starting.

### What the renderer does

The job runs `node video/render.mjs page <code> <videoId>` (`renderPageVideo` in `video/page.mjs`), as the service account `simplify-video@` ([cloud project](/operations/cloud-project.md#the-video-renderer)):

1. It reads the video document through the Firestore REST API and stops, doing nothing, unless it is `rendering` and `kind: "page"`.
2. It fetches the page's pictures (and any approved videos in it) by their public paths, exactly as a learner device does. A file not on the shelf any more is left out of the video, its line taken out of the page first, as a learner's device leaves it out (the renderer has no server to tell "gone" from "offline", so it never shows "Needs the internet").
3. It films the page in the **real learner reader**: a headless Chrome opens the app with the class and its files already on the "device" (localStorage `simplify-class-v1` and Cache Storage `simplify-class-media` seeded, as if the QR code had been scanned), at `#my-class`. Each screen (at most 20) waits until every picture has drawn, speaks its text in the app's voice (Chirp 3 HD `en-IN-Chirp3-HD-Erinome`, at rate 1.0 in videos), draws the coach's marks over its pictures one by one, and taps **Next**. A screen with nothing to read stays 2.2 seconds.
4. It adds an intro card (the page's title and the class name, the title spoken when reading aloud) and an end card, "All done", and composes a **720 × 1280 portrait** H.264 / AAC MP4 at 30 frames a second, with the music ducked under the voice (or silent, when music is off).
5. It uploads the draft to Storage `classes/{code}/video-drafts/{id}.mp4` (`Cache-Control: private, max-age=0`) reads the video again (makeVideo may have saved the run's name meanwhile), and sets `status: "ready"` and `bytes` only if it is still `rendering` — with that read's `updateTime` as a precondition — so a video given up on meanwhile is never marked ready.
6. On any error it writes `renderError` (at most 300 characters; again only while the video is still `rendering`) and the run ends failed.

## 3. Check

`checkVideo` with `{ classCode, videoId }` looks at one video and moves it on. The shelf calls it **every 10 seconds** for each video still `rendering`, one after another. It also calls straight away when the class opens, when a just-started video first appears in the list, and when the tab becomes visible again. It stops while the tab is hidden. The new status reaches the screen through the shelf's live Firestore listener.

| The video and its run | Result |
|---|---|
| not `rendering` | its status, unchanged |
| the renderer wrote `renderError` | `failed` ("The video could not be made."), given back |
| no `execution` yet, under 10 minutes old | still `rendering` |
| no `execution` after 10 minutes (the start died before saving it) | `failed` ("The video could not be started."), given back |
| reading the run failed | still `rendering`; after **30 minutes**, `failed`, given back |
| the run is still going | still `rendering`; after **30 minutes**, `failed` ("The video took too long to make."), given back |
| the run failed or was cancelled | `failed` ("The video could not be made."), given back |
| the run succeeded and the renderer marked it `ready` | `ready` |
| the run succeeded but the video is still `rendering` (its write was lost) | `failed`, given back |

`readRender` in `functions/render.js` reads the execution through the same API: a failed or cancelled task means failed, a succeeded task succeeded, anything else running. The job itself allows a task 30 minutes and never retries.

## 4. Approve or discard

A `ready` video is **private to the class's coaches**. **Watch it** fetches the draft with the coach's own sign-in (`getBlob`) and plays it from a `blob:` URL.

- **Approve** calls `approveVideo`. The video must be `ready` (an already approved one simply returns) and its draft file must exist. The function copies the draft to the public path, sets `video/mp4` and `Cache-Control: public, max-age=86400`, and marks the video `approved` with `approvedBy` in a transaction. If the video was discarded meanwhile, it deletes the public copy again and says "This video was discarded." Finally it deletes the draft, since one copy is enough.
- **Discard** (on a ready video), **Delete** (on an approved one) and **Remove** (on a failed one) all hide the row at once with a toast Undo, then call `discardVideo`. The function refuses a video that is still `rendering`. Otherwise it marks the video `discarded` with `discardedBy` and deletes both the draft and the public file. The shelf never shows discarded videos.

## Videos this month

| Event | Counted |
|---|---|
| Marks: Draw it (and a `none` or a decline) | one Flash request, not a video; the free too-short answer is not counted; a failed call is refunded |
| Make | one of the month's videos, counted before the job starts |
| The start fails | **not counted** (given back at once) |
| The renderer fails, never starts, or takes over 30 minutes | **given back**, once only (`failVideo` in a transaction), to the month it came from (`usageMonth`) |
| Discarding a finished video, ready or approved | **not given back**: it was made |

Months are Singapore months. A coach's limit is their own `coaches/{uid}.limits.videosPerMonth` if the admin gave them one (0–500), otherwise everyone's `config/limits.videosPerMonth` (default **20**) — `limitsFrom(limits, coach)` in `functions/lib.js`, and the coach app's `cloud.getLimits(uid)` reads the same. The panel shows "Videos: *used* of *limit* this month". A page video costs a few cents to make, most of it the voice ([costs and limits](/operations/costs-and-limits.md)).

### Asking the admin for more

When 3 or fewer videos are left, the panel offers "Need more videos each month? Say why (if you like)" (300 characters) and **Ask the admin for more videos**. That writes a request `{ uid, kind: "more-videos", note, status: "pending", createdAt }` (no class code) and the toast "Asked. The admin will decide."; while it waits, the panel says "You asked the admin for more videos. They will decide soon." The admin gives the coach a new number a month, or declines ([admin and approvals](/coach/admin-and-approvals.md#monthly-limits)). An approved number stays until the admin changes it.

## Where videos live

| Path | Who may read | Who writes |
|---|---|---|
| Firestore `classes/{code}/videos/{id}` (fields above; later `bytes`, `renderError`, `error`, `approvedBy`, `discardedBy`) | the class's coaches (active class), admins | the functions and the renderer only (admins may delete) |
| Storage `classes/{code}/video-drafts/{id}.mp4` (`Cache-Control: private, max-age=0`) | the class's coaches: listed, approved and unsuspended (`storage.rules`) | the renderer (and, in tests, `checkVideo`) |
| Storage `classes/{code}/videos/{id}.mp4` (approved) | anyone with the exact path, never listed | the functions only (`approveVideo`) |

Videos made with Gemini Omni before 2026-09-26 keep their old fields (`prompt`, `seconds`, `planId`, `interactionId`) and no `kind`; they are shown, placed and deleted like any other. The full list of paths is in [data model](/platform/data-model.md).

## The video shelf

Under the maker, one row per video, newest first:

| Status | Chip | Row |
|---|---|---|
| `rendering` | Being made | "It usually takes a minute or two. This updates by itself." |
| `ready` | Ready to check | Watch it, Approve, Discard |
| `approved` | On the shelf | the video plays inline; Put in page, Delete |
| `failed` | Could not be made | the reason and "It was not counted."; Remove |

A row whose status has not changed is not redrawn, so a draft keeps playing while the list updates.

## Placing a video in a page

**Put in page** on an approved video, or the editor's **Video** button (a dialog listing approved videos, with **Make a video of this page**, which opens the maker), places `![words](videos/<id>.mp4)` at the cursor. Only approved videos are offered. The preview shows only approved videos and warns, under the phone, about any in the page that are not approved yet ("Approve it on the video shelf") or not on the shelf. A video deleted after it was published shows nothing to learners. The markdown rule is in [markdown pages](/coach/markdown-pages.md).

## What learners get

- The page's video comes from the public path, and `public/js/class-data.js` **caches it for offline use** with the page's pictures in Cache Storage `simplify-class-media` (a download may take up to 120 s). The reader shows it from a `blob:` URL.
- It shows **in its own shape**: a page video is upright (9:16), older ones wide. The player is full width with `height: auto`, at most 65% of the screen's height, `object-fit: contain` on black (`public/css/tools/my-class.css`).
- It **never autoplays**. The video has native controls, `playsinline` and `preload="metadata"`, and a big ▶ button over it until it is played, which comes back at the end. Its words are its label.
- While a video is playing, an app update waits (the reader tells the shell it is busy). See [My class](/learner/my-class.md).

## Tests

`node tools/test-functions.mjs` covers `planOverlay` (the free empty answer, a picture not on the shelf, marks → shapes, `none`, a counted decline, a failed call refunded, and `markToShape` for a box, a label and a bad box) and make → check → approve / discard with a stand-in for the job (`SIMPLIFY_AI_FAKE=1`): by marker in the page's markdown, `[fail-start]` cannot start, `[fail-render]` fails and `[slow]` never finishes; any other run succeeds, and `checkVideo` finishes it as the job would, saving the 3-second `functions/test/sample.mp4` as the draft. It also checks what `makeVideo` stores (the page copy, the switches, only good marks for the page's pictures), `renderError`, the 10- and 30-minute give-ups, the month a video goes back to, the monthly limit and a coach's own limit, and first runs `copy-class-markdown.mjs --check`. `node tools/test-rules.mjs` covers who may read drafts and videos, and requests for more videos. `tools/smoke/coach.mjs` drives the maker (marks, the switches, what it costs), the shelf, asking for more and the admin giving it. The renderer itself is tried with `node video/render.mjs page --local spec.json` ([guide videos](/operations/guide-videos.md#trying-a-page-video)).
