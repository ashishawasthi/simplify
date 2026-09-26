---
type: System Reference
title: Costs and Limits
description: What Simplify costs to run and what keeps the bill small — the Blaze plan and the S$50 budget alert (it warns, it does not cap), Hosting transfer and the offline download per device, Firestore and Storage at pilot scale, the AI and video unit costs (Flash requests, page videos rendered on Cloud Run with a spoken voice, the public guide-videos bucket) and the per-coach monthly limits (200 Flash requests, 20 videos, more on request) enforced on the server, the Realtime Database push stream (tiny, and only while the app is on screen), and how often learner devices ask for a new page.
tags: [costs, billing, blaze, budget, limits, gemini, cloud-run, text-to-speech, hosting, quotas, realtime-database]
status: stable
---

This document is the money view of the project `simplify-special`: what is billed, what limits it, and where each
limit is enforced. The resources themselves are in [cloud project](/operations/cloud-project.md); the AI calls in
[AI models](/platform/ai-models.md); the video renderer in [guide videos](/operations/guide-videos.md).

## Plan and budget

- The project is on the **Blaze** (pay-as-you-go) plan. It has to be: Cloud Storage for Firebase needs Blaze for a
  bucket since 3 February 2026, and Cloud Functions need it too. Blaze keeps the Spark free quotas, so most of the
  learner app's use costs nothing.
- A **budget of S$50 a month** for this project, alerting billing admins by email at 50%, 90% and 100% of actual spend.
  **A budget warns; it does not cap.** Nothing stops spending automatically — the limits below are what bound it.

## What is billed

| Service | What uses it | Expected at pilot scale |
|---|---|---|
| Firebase Hosting (storage and transfer) | Every learner and coach page load; the service worker's install on each release | Within the free allowance. A first visit downloads the whole offline copy (about 190 files, ~4 MB, ~3.5 MB of it images); a release costs each device only the changed files, because the worker revalidates with ETags and unchanged images come back as bodiless 304s (see [offline and updates](/platform/offline-and-updates.md)). Firebase's pages disagree on the exact free Hosting allowance, so check the console's usage page rather than a number here. |
| Cloud Firestore (asia-southeast1) | Learner devices reading their class (one document read per check); the coach app's listeners and writes; the functions' usage counters | Cents a month or less — free tier applies |
| Realtime Database (asia-southeast1) | One stream per learner device **while the app is on screen**, to its class's signal `{ at, force }` (a few dozen bytes per publish); written only by the `classSignal` function | Free tier (1 GB stored, 10 GB downloaded a month). Blaze allows 200,000 streams open at once per database — far beyond a pilot |
| Cloud Storage (asia-southeast1) | Class pictures (≤ 2 MB each, usually far less) and approved videos (a few MB each), downloaded once per device and then kept offline | Cents a month |
| Cloud Storage — `simplify-guide-videos` (asia-southeast1, public) | The three guide videos (4–7 MB each) and their posters, fetched only when someone opens a guide's Watch fold, from `storage.googleapis.com` | Cents a month: about a tenth of a US cent per full view |
| Cloud Functions (2nd gen, asia-southeast1) | The six callables, only when a coach uses Write with AI or videos; the `classSignal` trigger, once per change to a class; at most 10 instances each | Negligible |
| Vertex AI — Gemini Flash | `writePage`, `planOverlay` | A fraction of a cent per request |
| Cloud Run job `simplify-video` (asia-southeast1, 2 CPU, 4 GiB) | One run per page video a coach makes (`makeVideo`), and the owner's remakes of the guide videos | About **US$0.01** per page video (a minute or two) |
| Cloud Text-to-Speech (Chirp 3 HD) | The words a page video reads aloud, and the guide videos' lines | US$30 per million characters at list price (after any monthly free allowance): about US$0.03 for a page of 1,000 characters, at most about US$0.36 (20 screens of 600) |
| Cloud Build and Artifact Registry | Building the renderer's image (by hand, when `video/` or the learner reader changes) and keeping it | Cents |

Firebase Authentication (Google sign-in for coaches and the admin) is free at this scale.

## The limits that bound the AI bill

AI and videos are the only parts whose cost grows with what one person does, so they have hard limits, **per coach
per Singapore month** (UTC+8), checked on the server before any model is called or any video is started:

| Limit | Default | Worst case per coach per month |
|---|---|---|
| AI requests (Gemini Flash: Write with AI and marks over pictures) | 200 | well under US$1 |
| Page videos (the renderer and its voice) | 20, or the coach's own number (up to 500) when the admin gave them more | about US$1 at the default (US$0.01–0.05 a typical video), at most about US$7.40 if every video were a 20-screen page read aloud in full |

- The defaults are `DEFAULT_LIMITS` in `functions/lib.js`; the admin changes them for everyone in `config/limits`
  (0–5,000 and 0–100, enforced by `firestore.rules`), and may give one coach more videos a month when they ask
  (`coaches/{uid}.limits.videosPerMonth`, 0–500) — see [monthly limits](/coach/admin-and-approvals.md#monthly-limits).
- A use is counted in a transaction **before** the model is called or the job started, so parallel requests cannot
  overrun a limit; failed calls and failed videos are given back. The coach sees "Making it uses 1 of your 20
  videos this month" before making one. Details in [AI models](/platform/ai-models.md#limits-and-counting) and
  [videos](/coach/videos.md#videos-this-month).
- Only approved, unsuspended coaches of an active class can call the functions at all, and a coach exists only after
  the admin approves them.
- Worst case for the whole platform at the defaults is therefore a few US dollars × the number of coaches a month,
  plus whatever the admin grants on request (500 long videos a month could reach about US$185 for that coach), plus
  small change for everything else. A budget alert at 50% is the moment to look at `usage/` in Firestore.

## What keeps the rest small

- **Learner devices ask only when there is something new**: while the app is on screen, a device listens to its
  class's push signal and reads the class (one small document read) only when the signal says the page changed; it
  also reads it when My class opens (not twice within 15 seconds). The stream is closed in the background. See
  [My class](/learner/my-class.md#hearing-about-a-new-page).
- **Media is fetched once**: pictures and videos are kept in the device's `simplify-class-media` cache and only the
  files of the latest page are downloaded; pictures are resized to ≤ 1600 px in the coach's browser before upload.
- **No analytics, no logging of learners**, so there is nothing else to store or bill.
- The learner app is static files: no server runs for it.
