---
type: Operations Runbook
title: Admin and Approvals
description: Who the admin is and how the first one is made (admins/{uid} in the console), and every action on the coach app's Admin screen — approving or declining coaches before they can use the platform, join requests, suspending coaches and classes, taking a page down, the monthly helper and video limits, and the institutions coaches choose from (seeding, adding, retiring) — with the writes and rules behind each, and the one-off switch-on steps.
tags: [admin, coach-approval, institutions, join-requests, suspend, take-down, monthly-limits, firestore-rules, runbook]
status: stable
---

This document owns the admin role: how someone becomes an admin, and what each action on the **Admin** screen of the
coach app (`#admin`, `public/coach/js/screen-admin.js`) does — above all, approving each coach before they can use
the platform at all. Every admin action is a direct Firestore write from the
coach app (`public/coach/js/cloud.js`), allowed by `firestore.rules` only when `admins/{uid}` exists — no Cloud
Function is involved. The documents themselves are described in [data model](/platform/data-model.md).

## Who is an admin

An admin is a signed-in Google user for whom `admins/{uid}` exists. No client can create, change or list that
document; a signed-in user may only `get` their own, which is how the coach app decides to show the **Admin** link
(read once at sign-in). An admin also needs a coach profile (About you comes first for everyone). The Admin screen
works whatever that profile's status, so an admin approves their own profile like anyone else's, and is then a coach
of classes like anyone else.

### Making the first admin (or another)

1. The person opens `https://simplify.whiz.coach/coach/`, signs in with Google and saves **About you** once. This
   creates their Firebase Authentication user and `coaches/{uid}`.
2. The project owner opens the Firebase console for `simplify-special` → **Authentication → Users**, finds the email
   and copies the **User UID**.
3. **Firestore Database → Data**: start collection `admins` (if absent), add a document whose **ID is that UID**. The
   fields don't matter (the rules test only that it exists); `{ note: "owner", addedAt: <timestamp> }` is a good
   record.
4. The person signs out and in again (or reloads the tab): **Admin** appears in the nav. Their own profile is waiting
   like anyone's: they approve it under **Coaches waiting for approval**.

To remove an admin, delete the document in the console. Admins cannot make other admins from the app.

## The Admin screen

It loads five things: the pending requests, every coach, every class with its coaches (`classCoaches`), the institutions, and `config/limits`. Its lead line: "Approve a coach only after checking who they are and where they work. Let a coach join a class only after checking they really coach it." Every action shows a toast; everything but approving a join request has **Undo**.

### Coaches waiting for approval

First on the screen, oldest first: every coach whose `status` is `pending` — or who has no `status` at all (a profile from before approvals). Each card shows the name, email, **Works at** (their institutions by name; "An institution no longer listed" for an id that isn't), their old **Organisation** if they have one, **How to check them** (the profile's note) and when they asked. **Check the person before approving** — for example by calling the institution — because approval is the only thing standing between a Google account and uploading, publishing and the AI helper.

| Action | What is written | Rules |
|---|---|---|
| **Approve** | The card leaves at once and the toast says "Approved: Mr Lim" with Undo. When the toast goes (8 s, the next toast, leaving the page, sign-out), `coaches/{uid}` gets `status: "approved"`, `decidedAt`, `decidedBy` (`cloud.decideCoach`). The coach's own screen changes to My classes as it happens. | an admin changes only `status` (`pending` \| `approved` \| `declined`), `decidedAt` (= request time) and `decidedBy` (= the admin) — never together with `suspended`, never the coach's own fields |
| **Decline** | The same, with `status: "declined"`. The coach sees "Not approved" and a note to contact the admin. | as above |

Undo writes nothing (the decision had not been sent). A decision can be changed later from the coach list, and setting `status` back to `pending` is allowed too.

An approved coach makes their own classes (see [the coach app](/coach/coach-app.md#my-classes)): there is no per-class approval for a new class. The admin sees each new class in **Classes**, with its institution.

### Requests to join a class

A coach who works with a colleague asks to join the colleague's class by its code. Each card shows "Join K7M-3RQ-P9T (3 Kindness)" (or "— no class has this code"), the coach's name and email, their status if not approved, **Works at**, **The class is at** (the class's institution), how to check them, their note and when they asked. **Check that they really coach that class** — the admin is the only check.

| Action | What is written | Rules |
|---|---|---|
| **Approve** | In one transaction: the coach's uid added to `classCoaches/{code}.uids`; the request → `approved` with `decidedAt`, `decidedBy`, `resultCode`. Disabled when no class has that code ("There is no class with the code … Decline this request instead."). No Undo — suspend the coach instead. | `classCoaches` update is admin-only, at most 50 uids; a request is decided once (`status == 'pending'`) and only `status`, `decidedAt`, `decidedBy`, `resultCode` change |
| **Decline** | The card disappears at once; when the toast's Undo runs out, the request → `declined`. The coach sees "Not approved". | as above |

A request decided by another admin meanwhile fails with "This request has already been decided." An older "New class" request (from before coaches made their own) can only be declined, with a line saying so.

There is no action to remove one coach from one class; suspend the coach (all their classes) or edit `classCoaches/{code}.uids` in the console.

### Coaches

Every coach, with a status chip (**Approved**, **Waiting for approval**, **Not approved**) and **Suspended** when suspended; email, **Works at** — with "Changed …, after approval" when an approved coach changed their institutions after the decision (`institutionsChangedAt` later than `decidedAt`) — the old organisation if any, how to check them, their classes and when they were decided.

- **Approve** (a declined coach): as above — approve later.
- **Suspend** / **Let back in** (an approved coach) sets `coaches/{uid}.suspended`, at once, with Undo. A suspended coach keeps their sign-in but every rule and callable treats them as no one's coach: they cannot read or write their classes' pages and shelves, publish, upload, make or join classes, or use the helper or videos, and the coach app says "The admin has paused your account".

### Classes

Each class with its name, code, **Institution** (or the old **Organisation** of a class made before institutions), "Learners see “…”, published …" or "Nothing", its coaches and a **Suspended** chip.

- **Suspend the class** / **Make it active again** sets `classes/{code}.status` to `suspended` / `active`. A suspended class is invisible to learners — their `get` is refused, and the learner app treats that like a wrong code (see [My class](/learner/my-class.md)) — and its coaches can read the class document but not its pages or shelves, and cannot publish.
- **Take the page down** (only when something is published) sets `latest` to `null`; learners see "Nothing from your coach yet" at their next refresh. Undo puts the same `latest` back. The coaches' pages are untouched, so a coach can publish again — suspend the coach or the class to stop that.
- A class code that got out: the coach makes a new class (a new code), and once the devices have the new code the admin suspends the old one.

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

## Institutions

`institutions/{id}` = `{ name (≤ 80), org (≤ 60), type (≤ 60), area (≤ 40), active, updatedAt }`: one entry per **place** — an organisation with several centres has one entry for each, and the coaches' picker groups them by `org`. Any signed-in user may read them (learners never sign in); only admins write, and an entry is never deleted — **retired** with `active: false`, because profiles and classes point at it. A retired place disappears from the picker and from "Where is the class?", but a coach who chose it keeps it (marked "(retired)") until they take it off.

On the Admin screen, **Institutions (N in the list)** — last, as the longest list — shows every entry grouped by organisation with its area, type and how many coaches chose it:

- **Add an institution**: name, organisation, type (with the types already used as suggestions) and area; saved active with a new auto id.
- **Edit**: the same form, in place.
- **Retire** / **Bring back**: `active` false / true, with Undo.
- A search box appears once the list is longer than 8 entries.

### Seeding

`tools/seed/institutions.json` is the list the app offers: an array of `{ id, name, org, type, area, source }` (`source` is where the entry was checked and is not stored). Today it holds four AWWA places — AWWA School @ Napiri, AWWA School @ Bedok, and the AWWA Early Intervention Centres @ Hougang and @ Fernvale Link. `tools/seed/institutions-researched.json` is a longer researched list (120 Singapore disability institutions, one per place, each with its source) that is **not** seeded: the admin adds from it, one at a time, when a coach needs one.

```sh
node tools/seed-institutions.mjs --dry-run   # what would change in production
node tools/seed-institutions.mjs             # write it (as the project's owner)
```

It checks the whole file first against the rules' limits (ids of 1–100 letters, digits, `-` or `_`; a name and an organisation; lengths) and writes nothing if any entry is wrong. A new entry is created active; an existing one gets its name, org, type and area from the file only if they differ — its `active` is left as the admin set it — and entries only in Firestore are left alone and listed. So it is safe to run again after editing the file; note that it puts back the file's wording over an admin's edit of a seeded entry. It signs in with `gcloud auth print-access-token` (an owner's token, which the rules do not apply to) and `--emulator host:port` points it at an emulator instead. `node tools/test-seed.mjs` runs it against the emulator with the real file.

## Switching coach approval on (once)

Coach approval, institutions and coaches making their own classes arrived together (2026-09-24, see the [decision log](/product/decisions.md#coach-platform)). Profiles made before then have no `status`, so the new rules treat them as waiting. In this order:

1. `node tools/test-rules.mjs && node tools/test-functions.mjs && node tools/test-seed.mjs`.
2. `firebase deploy --only firestore:rules,storage` and `firebase deploy --only functions`.
3. `node tools/seed-institutions.mjs --dry-run`, then `node tools/seed-institutions.mjs`.
4. `node tools/migrate-coaches.mjs` (a dry run: lists who gets what), then `node tools/migrate-coaches.mjs --apply`. Every profile with no `status` becomes `approved` (with `decidedBy: "migration"`) if the coach is listed for any class — the admin had approved them for it — and `pending` otherwise. Profiles that have a status are left alone, so a second run changes nothing.
5. Merge the coach app (Hosting). Coaches from before are asked to choose their institutions first (About you); approved ones then carry on as before.

Classes made before keep their free-text `org` (the rules still accept it on an admin's update) and have no `institution`; nothing needs to change them.

## Tests

`node tools/test-rules.mjs` pins every admin-only write (and that coaches cannot make them), that a coach
waiting for approval (or declined, or suspended) can do nothing but edit their own profile, and that an approved
coach can make a class only for their own active institution; `node tools/test-functions.mjs` that every callable
refuses a coach who is not approved; `node tools/test-seed.mjs` the seeding and migration tools;
`node tools/smoke.mjs coach` drives the Admin screen in Chrome against a stand-in `cloud.js`.
