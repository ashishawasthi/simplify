---
type: Product Contract
title: Videos
description: How a coach makes a short AI video for a class page — planVideo (Flash write / ask / decline and the clip's constraints), the exact request and the credit shown before Make, startVideo, checkVideo polling and statuses, approveVideo and discardVideo, credit refund rules, draft versus approved storage, the video shelf UI, and what learners get.
tags: [videos, gemini-omni, planvideo, startvideo, checkvideo, credits, video-shelf, storage]
status: stable
---

A coach can ask for a short, realistic clip ("hands washing with soap at a sink"), check it, and place it in a page like a picture: `![words](videos/<id>.mp4)`. This document owns that flow. It covers the five video callables in `functions/index.js`, the planner's prompt in `functions/prompts.js`, the video shelf in `public/coach/js/videos-shelf.js`, and the credits. Model ids, the Omni request shape and per-second cost are in [AI models](/platform/ai-models.md).

Each step is the coach's own decision: **plan** (free of video credits) → **make** (one credit) → **check**, then **approve** or **discard**.

## 1. Plan

The "Videos" panel has a fold, **Make a short video**, with a **Describe the video** box (1,000 characters). Its hint reads "One calm scene, up to 10 seconds … Planning it is free; making it uses one of your videos this month." **Plan the video** calls `planVideo` with `{ classCode, request, answers }`.

`planVideo` runs the same checks and gives the same shape as the [page helper](/coach/ai-helper.md):

- `requireClassCoach` runs first: signed in, a profile the admin approved and has not suspended, listed for the class, class active.
- A request with fewer than 4 letters or digits gets a free fixed question ("What should the video show?", `EMPTY_PLAN_ANSWER`), with no model call and nothing counted.
- Otherwise it reserves **one Flash request** from the same monthly allowance as the helper (200 by default). Then **one Gemini Flash call** (thinking level low, JSON mode against `PLAN_VIDEO_SCHEMA`) answers `write`, `ask` (up to 3 questions with 2–4 suggested answers) or `decline`. Every answer starts with "I understood: …".
- A failed call is refunded: "The helper is not available right now … This request was not counted." A safety-withheld answer becomes a decline. A decline is counted.

**What the planner writes** (`PLAN_VIDEO_SYSTEM`) is an English prompt of 40–120 words describing:

- one continuous, calm shot of **3–10 seconds**, with no cuts. The framing and camera are stated: steady, at eye or hand level, slow or no movement;
- realistic live action in soft natural light and an ordinary tidy setting. Where the place matters, a generic Singapore setting is described in words (an HDB kitchen, a void deck, a hawker centre, an MRT gate), never a named or recognisable place;
- generic people. Hands and objects are preferred, faces are kept out of close-up, and it is never a real person's likeness;
- **no text, captions, subtitles, readable signs, numbers, logos, brands or watermarks**;
- **no music and no voice**: only soft natural sounds of the action, and nothing sudden or startling;
- the action shown slowly and clearly from start to finish, the way a learner would copy it.

**The planner declines**:

- anything unrelated to learning;
- anything harmful, violent, frightening or sexual;
- **nudity or undressed bodies**. For body topics such as puberty or toileting it declines kindly and suggests pictures and words in the page instead. The page helper covers these topics in words;
- real people or their look-alikes;
- brands, logos or cartoon characters;
- anything that would identify a learner, family or school.

**On `write`** the function turns the answer into the plan it will make:

- the prompt becomes one line of at most 2,000 characters (an empty prompt is refunded);
- `seconds` is rounded and clamped to 3–10 (8 if missing);
- `words` for screen readers are at most 80 characters, falling back to the request.

It stores the plan in `classes/{code}/videoPlans/{planId}` (`request`, `prompt`, `words`, `seconds`, `createdBy`, `createdAt`), which no client can read or write, and returns `planId`, `prompt`, `seconds` and `words`.

## 2. See the exact request, then Make

The coach sees a plan card:

- **"The video request"**: the exact prompt that will be sent;
- **Length**: in seconds;
- **Words for learners**: the screen-reader words;
- **the cost**: "Making it uses 1 of your 5 videos this month. You have *n* left." When none are left it says "You have made all 5 videos for this month." and **Make the video** is disabled.

**Change the description** goes back to the box.

**Make the video** calls `startVideo` with `{ classCode, planId }`. In one Firestore transaction the function:

1. checks that the plan exists and **was made by this coach** (another coach's plan is "not found");
2. if the plan already has a video that has not failed, returns that one. Pressing Make twice never spends a second credit;
3. checks that a credit is left this month (`usage/{uid}_{YYYY-MM}.video` against `config/limits.videosPerMonth`, default **5**). If not, it refuses with "You have made all *n* videos for this month.";
4. **reserves the credit** (`video + 1`), creates `classes/{code}/videos/{id}` with `status: "rendering"`, `prompt`, `words`, `seconds`, `planId`, `interactionId: null`, `usageMonth`, `createdBy` and timestamps, and links the plan to it.

Then it starts **Gemini Omni** text-to-video as a background interaction: 16:9, 720p, the planned duration, delivered inline, with no SDK retries because a render costs money and is not idempotent. The call itself takes about two minutes to return, so the function allows 540 s and the app waits as long. If the start fails, the video is marked `failed`, the credit is refunded, and the coach reads "The video could not be started. Your video credit was given back. Try again later." If it succeeds, the interaction id is saved on the video (retried once). Meanwhile the panel says "Starting the video. This takes about 2 minutes, and then a few more to finish. You can keep working on the page meanwhile."

## 3. Check

`checkVideo` with `{ classCode, videoId }` looks at one video and moves it on. The shelf calls it **every 10 seconds** for each video still `rendering`, one after another. It also calls straight away when the class opens, when a just-started video first appears in the list, and when the tab becomes visible again. It stops while the tab is hidden. The new status reaches the screen through the shelf's live Firestore listener.

| The render | Result |
|---|---|
| no interaction id yet, under 10 minutes old | still `rendering` |
| no interaction id after 10 minutes (the start died before saving it) | `failed`, credit refunded |
| `queued` / `in_progress`, or the read itself failed | still `rendering`; after **30 minutes**, `failed` ("took too long"), credit refunded |
| `completed` with a clip | the clip is saved as the draft and the status becomes `ready` |
| completed with a clip that is not an MP4 (no `ftyp` box), empty or over 100 MB | `failed` ("came back broken"), credit refunded |
| saving the clip hit a Storage error | still `rendering`; the next check tries again |
| failed, cancelled, incomplete, or finished without a clip | `failed`, credit refunded |

It always reads the render first, so a clip that finished while nobody had the class open is still saved, however late the check comes. The clip is taken from inline base64 (the verified delivery) or copied from a `gs://` or `https://` URI.

## 4. Approve or discard

A `ready` clip is **private to the class's coaches**. **Watch it** fetches the draft with the coach's own sign-in (`getBlob`) and plays it from a `blob:` URL.

- **Approve** calls `approveVideo`. The video must be `ready` (an already approved one simply returns) and its draft file must exist. The function copies the draft to the public path, sets `video/mp4` and `Cache-Control: public, max-age=86400`, and marks the video `approved` with `approvedBy` in a transaction. If the video was discarded meanwhile, it deletes the public copy again and says "This video was discarded." Finally it deletes the draft, since one copy is enough.
- **Discard** (on a ready clip), **Delete** (on an approved one) and **Remove** (on a failed one) all hide the row at once with a toast Undo, then call `discardVideo`. The function refuses a video that is still `rendering`. Otherwise it marks the video `discarded` with `discardedBy` and deletes both the draft and the public file. The shelf never shows discarded videos.

## Credits

| Event | Credit |
|---|---|
| Planning (and asking, and declining) | none. Uses one Flash request, except for the free too-short answer |
| Make | one video credit, reserved before Omni is called |
| Make pressed again on the same plan | none (the same video comes back) |
| The start fails, or the render fails, breaks or takes over 30 minutes | **refunded**, once only (`failVideo` in a transaction), to the month it came from (`usageMonth`) |

Seen on the live project on 2026-09-23: two of three real renders with the same kind of request finished in about 3 minutes (the finished MP4 is 1280×720, 8 s, H.264 High + AAC, about 3.1 MB, moov atom first); one stayed `in_progress` at Gemini for over 30 minutes and was marked `failed` with its credit returned, exactly as above. Omni is a preview model, so an occasional stalled render is expected — the coach presses Make again. A render that finishes after being marked failed is not collected (and was still paid for). A plan is used up by its render: `startVideo` refuses the same `planId` twice ("Plan the video again").
| Discarding a finished clip, ready or approved | **not refunded**: it was made and paid for |

Months are Singapore months. The admin sets the limit (see [admin and approvals](/coach/admin-and-approvals.md#monthly-limits)), and the unit cost is in [costs and limits](/operations/costs-and-limits.md).

## Where videos live

| Path | Who may read | Who writes |
|---|---|---|
| Firestore `classes/{code}/videos/{id}`: `status` (`rendering`, `ready`, `approved`, `failed`, `discarded`), `prompt`, `words`, `seconds`, `planId`, `interactionId`, `usageMonth`, `bytes`, `error`, `createdBy`, `approvedBy`, `discardedBy`, timestamps | the class's coaches (active class), admins | the functions only (admins may delete) |
| Firestore `classes/{code}/videoPlans/{id}` | nobody (functions only) | the functions |
| Storage `classes/{code}/video-drafts/{id}.mp4` (`Cache-Control: private, max-age=0`) | the class's coaches: listed, approved and unsuspended (`storage.rules`) | the functions only |
| Storage `classes/{code}/videos/{id}.mp4` (approved) | anyone with the exact path, never listed | the functions only |

The full list of paths is in [data model](/platform/data-model.md).

## The video shelf

The panel shows "Videos: *used* of *limit* this month", the maker, and one row per video, newest first:

| Status | Chip | Row |
|---|---|---|
| `rendering` | Being made | "It usually takes a few minutes. This updates by itself." |
| `ready` | Ready to check | Watch it, Approve, Discard |
| `approved` | On the shelf | the clip plays inline; Put in page, Delete |
| `failed` | Could not be made | the reason and "Your video credit was given back."; Remove |

Every row can show "The request", the exact prompt it was made from. A row whose status has not changed is not redrawn, so a draft keeps playing while the list updates.

## Placing a video in a page

**Put in page** on an approved video, or the editor's **Video** button (a dialog listing approved videos, with a link to the maker), places `![words](videos/<id>.mp4)` at the cursor. Only approved videos are offered. The preview shows only approved videos and warns, under the phone, about any in the page that are not approved yet ("Approve it on the video shelf") or not on the shelf. A video deleted after it was published shows nothing to learners. The markdown rule is in [markdown pages](/coach/markdown-pages.md).

## What learners get

- The page's video comes from the public path, and `public/js/class-data.js` **caches it for offline use** with the page's pictures in Cache Storage `simplify-class-media` (a download may take up to 120 s). The reader shows it from a `blob:` URL.
- It **never autoplays**. The video has native controls, `playsinline` and `preload="metadata"`, and a big ▶ button over it until it is played, which comes back at the end. Its words are its label.
- While a video is playing, an app update waits (the reader tells the shell it is busy). See [My class](/learner/my-class.md).

## Tests

`node tools/test-functions.mjs` covers plan → start → check → approve / discard with a fake Omni (`[fail-start]`, `[fail-render]` and `[slow]` markers, and otherwise the 3-second `functions/test/sample.mp4`), including double presses, refunds and the 30-minute give-up. `node tools/test-rules.mjs` covers who may read drafts and videos. `tools/smoke/coach.mjs` drives the shelf.
