---
type: System Reference
title: Costs and Limits
description: What Simplify costs to run and what keeps the bill small — the Blaze plan and the S$50 budget alert (it warns, it does not cap), Hosting transfer and the offline download per device, Firestore and Storage at pilot scale, the AI unit costs and the per-coach monthly limits (200 Flash requests, 5 videos) enforced on the server, and how often learner devices ask for a new page.
tags: [costs, billing, blaze, budget, limits, gemini, hosting, quotas]
status: stable
---

This document is the money view of the project `simplify-special`: what is billed, what limits it, and where each
limit is enforced. The resources themselves are in [cloud project](/operations/cloud-project.md); the AI calls in
[AI models](/platform/ai-models.md).

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
| Cloud Storage (asia-southeast1) | Class pictures (≤ 2 MB each, usually far less) and approved videos (~3 MB for 8 s), downloaded once per device and then kept offline | Cents a month |
| Cloud Functions (2nd gen, asia-southeast1) | The six callables, only when a coach uses the helper or videos; at most 10 instances | Negligible |
| Vertex AI — Gemini Flash | `writePage`, `planVideo` | A fraction of a cent per request |
| Vertex AI — Gemini Omni | `startVideo` | About US$0.10 per second of video: US$0.30–1.00 a clip (3–10 s), about US$0.80 at the usual 8 s |

Firebase Authentication (Google sign-in for coaches and the admin) is free at this scale.

## The limits that bound the AI bill

AI is the only part whose cost grows with what one person does, so it has hard limits, **per coach per Singapore
month** (UTC+8), checked on the server before any model is called:

| Limit | Default | Worst case per coach per month |
|---|---|---|
| AI requests (Gemini Flash: Write with AI and video planning) | 200 | well under US$1 |
| Videos (Gemini Omni) | 5 | about US$4 (at most US$5 at 10 s each) |

- The defaults are `DEFAULT_LIMITS` in `functions/lib.js`; the admin changes them for everyone in `config/limits`
  (0–5,000 and 0–100, enforced by `firestore.rules`) — see
  [monthly limits](/coach/admin-and-approvals.md#monthly-limits).
- A use is counted in a transaction **before** the model is called, so parallel requests cannot overrun a limit;
  failed calls are refunded. A video is only rendered from a plan that passed the Flash check and that the coach
  approved on seeing "Making it uses 1 of your 5 videos this month". Details in
  [AI models](/platform/ai-models.md#limits-and-counting).
- Only approved, unsuspended coaches of an active class can call the functions at all, and a coach exists only after
  the admin approves them.
- Worst case for the whole platform is therefore about **US$5 × the number of coaches** a month in AI, plus small
  change for everything else. A budget alert at 50% is the moment to look at `usage/` in Firestore.

## What keeps the rest small

- **Learner devices ask rarely**: a device reads its class when the menu shows or the app comes to the front, at most
  every 10 minutes, and whenever My class opens (not twice within 15 seconds) — one small document read each time. See
  [My class](/learner/my-class.md#when-it-checks-for-a-new-page).
- **Media is fetched once**: pictures and videos are kept in the device's `simplify-class-media` cache and only the
  files of the latest page are downloaded; pictures are resized to ≤ 1600 px in the coach's browser before upload.
- **No analytics, no logging of learners**, so there is nothing else to store or bill.
- The learner app is static files: no server runs for it.
