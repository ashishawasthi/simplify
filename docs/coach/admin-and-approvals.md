---
type: Operations Runbook
title: Admin and Approvals
description: Who the admin is and how the first one is made (admins/{uid} in the console), and every action on the coach app's Admin screen — approving or declining class requests (new class codes, joining), suspending coaches and classes, taking a page down, and setting the monthly helper and video limits — with the writes and rules behind each.
tags: [admin, approvals, class-requests, suspend, take-down, monthly-limits, firestore-rules, runbook]
status: stable
---

This document owns the admin role: how someone becomes an admin, and what each action on the **Admin** screen of the
coach app (`#admin`, `public/coach/js/screen-admin.js`) does. Every admin action is a direct Firestore write from the
coach app (`public/coach/js/cloud.js`), allowed by `firestore.rules` only when `admins/{uid}` exists — no Cloud
Function is involved. The documents themselves are described in [data model](/platform/data-model.md).

## Who is an admin

An admin is a signed-in Google user for whom `admins/{uid}` exists. No client can create, change or list that
document; a signed-in user may only `get` their own, which is how the coach app decides to show the **Admin** link
(read once at sign-in). An admin also needs a coach profile (About you comes first for everyone) and can be a coach of
classes like anyone else.

### Making the first admin (or another)

1. The person opens `https://simplify.whiz.coach/coach/`, signs in with Google and saves **About you** once. This
   creates their Firebase Authentication user and `coaches/{uid}`.
2. The project owner opens the Firebase console for `simplify-special` → **Authentication → Users**, finds the email
   and copies the **User UID**.
3. **Firestore Database → Data**: start collection `admins` (if absent), add a document whose **ID is that UID**. The
   fields don't matter (the rules test only that it exists); `{ note: "owner", addedAt: <timestamp> }` is a good
   record.
4. The person signs out and in again (or reloads the tab): **Admin** appears in the nav.

To remove an admin, delete the document in the console. Admins cannot make other admins from the app.

## The Admin screen

It loads four things: the pending requests (oldest first), every coach, every class with its coaches
(`classCoaches`), and `config/limits`. Its lead line: "Approve each coach for each class only after checking they
really are a coach of that class." Every action shows a toast; decline, suspend, take-down and limits have **Undo**,
approve does not (a mistaken new class is fixed by suspending it).

### Requests waiting

Each card shows what is asked ("New class: 3 Kindness", or "Join K7M-3RQ-P9T (3 Kindness)" / "— no class has this
code"), the coach's name and email, organisation, "How to check them" (the coach's profile note) and the request's own
note. **Check the person before approving** — the admin is the only check that a coach really teaches that class.

| Action | What is written | Rules |
|---|---|---|
| **Approve a new class** | In one transaction: a new random class code (`newClassCode`, 9 characters from `23456789ABCDEFGHJKMNPQRSTUVWXYZ`, retried up to 5 times if taken); `classes/{code}` = `{ name, org, status: "active", latest: null, createdAt, updatedAt }`; `classCoaches/{code}` = `{ uids: [coach] }`; the request → `approved` with `decidedAt`, `decidedBy`, `resultCode`. Toast: "Approved: “3 Kindness”, code K7M-3RQ-P9T." | `classes` create and `classCoaches` create are admin-only; a request can be decided once (`status == 'pending'`) and only `status`, `decidedAt`, `decidedBy`, `resultCode` change |
| **Approve joining** | In one transaction: the coach's uid added to `classCoaches/{code}.uids`; the request → `approved`. Disabled when no class has that code ("There is no class with the code … Decline this request instead.") | `classCoaches` update is admin-only, at most 50 uids |
| **Decline** | The card disappears at once; when the toast's Undo runs out, the request → `declined`. The coach sees "Not approved". | as above |

A request decided by another admin meanwhile fails with "This request has already been decided."

There is no action to remove one coach from one class; suspend the coach (all their classes) or edit
`classCoaches/{code}.uids` in the console.

### Coaches

Each coach with name, email, organisation, "How to check them" and a **Suspended** chip when suspended.
**Suspend** / **Let back in** sets `coaches/{uid}.suspended` (the only field an admin may change there). A suspended
coach keeps their sign-in but every rule and callable treats them as no one's coach: they cannot read or write their
classes' pages and shelves, publish, upload, ask for classes or use the helper or videos, and the coach app says "The
admin has paused your account".

### Classes

Each class with its name, code, organisation, "Learners see “…”, published …" or "Nothing", and a **Suspended**
chip.

- **Suspend the class** / **Make it active again** sets `classes/{code}.status` to `suspended` / `active`. A
  suspended class is invisible to learners — their `get` is refused, and the learner app treats that like a wrong
  code (see [My class](/learner/my-class.md)) — and its coaches can read the class document but not its pages or
  shelves, and cannot publish.
- **Take the page down** (only when something is published) sets `latest` to `null`; learners see "Nothing from your
  coach yet" at their next refresh. Undo puts the same `latest` back. The coaches' pages are untouched, so a coach can
  publish again — suspend the coach or the class to stop that.

## Monthly limits

`config/limits` = `{ flashPerMonth, videosPerMonth, updatedAt, updatedBy }`, the same for every coach:

| Limit | Default (`DEFAULT_LIMITS` in `functions/lib.js`) | Allowed by the rules | Counts |
|---|---|---|---|
| Helper requests per coach per month | 200 | 0–5,000 | `writePage` and `planVideo` calls (Gemini Flash) — see [the AI helper](/coach/ai-helper.md#counting) |
| Videos per coach per month | 5 | 0–100 | `startVideo` renders (Gemini Omni, about US$0.80 each) — see [videos](/coach/videos.md) |

The form's hint: "The same for every coach, counted in Singapore months." A missing document, or a missing or invalid
field, means the default. Months are Singapore months (UTC+8); usage is kept per coach per month in
`usage/{uid}_{YYYY-MM}` (`flash`, `video`, `declined`), written only by the functions and readable by that coach and
admins. Lowering a limit below what a coach has already used this month simply stops further use until the next
month. Any signed-in user may read the limits (the coach app shows "12 of 200 this month").

Costs behind these numbers are in [costs and limits](/operations/costs-and-limits.md).

## Tests

`node tools/test-rules.mjs` pins every admin-only write (and that coaches cannot make them);
`node tools/smoke.mjs coach` drives the Admin screen in Chrome against a stand-in `cloud.js`.
