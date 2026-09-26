---
type: Operations Runbook
title: Admin and Approvals
description: Who the admin is and how one is made (admins/{uid} in the console, Google sign-in only), and every action on the coach app's Admin screen and its tabs — approving or declining coaches with a note of how they were checked, the admin log (who approved which coach, when, and how), places coaches type that are not in the list, join requests, requests for more videos a month, suspending coaches and classes, taking a coach off a class, taking a page down, the monthly AI and video limits (and one coach's own video limit), and the institutions coaches choose from (seeding, adding, retiring) — with the writes and rules behind each, and the one-off switch-on steps.
tags: [admin, coach-approval, audit-log, admin-log, institutions, join-requests, more-videos, suspend, take-down, monthly-limits, firestore-rules, runbook]
status: stable
---

This document owns the admin role: how someone becomes an admin, and what each action on the **Admin** screen of the
coach app (`#admin`, `public/coach/js/screen-admin.js`) does — above all, approving each coach before they can use
the platform at all, and recording who approved them and how. Every admin action is a direct Firestore write from
the coach app (`public/coach/js/cloud.js`), allowed by `firestore.rules` only for an admin signed in with Google —
no Cloud Function is involved — and each is written together with an entry in the **admin log** (`adminLog`). The
documents themselves are described in [data model](/platform/data-model.md).

## Who is an admin

An admin is a user **signed in with Google** for whom `admins/{uid}` exists. No client can create, change or list
that document, so **admins are made only in the database**, never from the app; a signed-in user may only `get` their
own, which is how the coach app decides to show the **Admin** link (read once at sign-in). The rules' `isAdmin()` also
requires the Google sign-in (`sign_in_provider == 'google.com'`, email verified): an `admins/{uid}` document does
nothing for a password or other sign-in. An admin also needs a coach profile (About you comes first for everyone).
The Admin screen works whatever that profile's status, so an admin approves their own profile like anyone else's
(with a note, like anyone else's), and is then a coach of classes like anyone else.

### Making the first admin (or another)

1. The person opens `https://simplify.whiz.coach/coach/`, signs in with Google and saves **About you** once. This
   creates their Firebase Authentication user and `coaches/{uid}`.
2. The project owner opens the Firebase console for `simplify-special` → **Authentication → Users**, finds the email
   and copies the **User UID**.
3. **Firestore Database → Data**: start collection `admins` (if absent), add a document whose **ID is that UID**. The
   fields don't matter (the rules test only that it exists); `{ note: "owner", addedAt: <timestamp> }` is a good
   record.
4. The person signs out and in again (or reloads the tab): **Admin** appears in the nav. Their own profile is waiting
   like anyone's: they approve it under **Waiting**, saying how they know themself (e.g. "Owner of the project").

To remove an admin, delete the document in the console. Admins cannot make other admins from the app. Their past
entries in the admin log stay, with their email.

## The admin log

`adminLog/{id}`: one entry per admin action, written **in the same commit as the action** (`logged()` in
`cloud.js`). Fields: `action`, `adminUid` and `adminEmail` (the rules insist they are the signed-in admin's own uid
and Google email), `at` (the request time), `note` (≤ 500), and as they apply `coach`, `coachName`, `coachEmail`,
`request`, `classCode`, `className`, `institution`, `institutionName` and `detail` — names are copied in so the
history still reads right after a rename or a retirement.

| Action | Written by | Note |
|---|---|---|
| `coach-approved` | Approve (a coach) | **required, ≥ 10 characters**: how the admin checked |
| `coach-declined` | Decline (a coach) | what the coach is told (optional; the coach sees it) |
| `coach-pending` | a decision put back to waiting (allowed by the rules; the app's Undo writes nothing instead) | optional |
| `coach-suspended`, `coach-unsuspended` | Suspend, Let back in (and their Undo) | why (optional); "Undo" for an undo |
| `join-approved` | Approve (a request to join a class) | **required, ≥ 10 characters**: how the admin checked |
| `join-declined` | Decline (a request) | why (optional; the coach sees only "Not approved") |
| `coach-removed`, `coach-added` | Take off (a coach from a class), and its Undo | |
| `coach-place-added` | "It's already listed": a listed institution put on a coach's profile in place of their typed place | `detail`: what they typed |
| `institution-added`, `institution-edited`, `institution-retired`, `institution-restored` | the Institutions tab (and "Add it to the list" from a coach's card, with the coach) | |
| `class-suspended`, `class-restored`, `page-taken-down`, `page-put-back` | the Classes tab | `detail`: the page's title |
| `limits-changed` | Save the limits | `detail`: the new limits |
| `more-videos-approved` | Give them more (a request for more videos) | why (optional); `detail`: "*N* videos a month" |
| `more-videos-declined` | Decline (a request for more videos) | why (optional) |
| `coach-limits-changed` | an admin setting one coach's videos a month without a request (allowed by the rules; no screen writes it yet) | `detail`: the new number |

**What the rules guarantee** (`firestore.rules`, `adminLog` and `loggedNow`): admins read and create entries;
nobody updates or deletes one (the owner can, in the console). A decision on a coach (`coaches/{uid}.decisionLog`),
a suspension (`suspendLog`), a coach's own limit (`limitsLog`) and a decision on a request (`requests/{id}.decisionLog`) are refused unless the entry
they name was written in the same commit by the same admin for the same coach or request with the matching action —
and such an entry is refused unless its decision is in the commit too (`getAfter`). So every approval since
2026-09-25 has a record of who approved and how, and there is no record of an approval that did not happen. The
other actions' entries are written by the coach app beside them; the rules don't insist on those.

Decisions made before the log existed have no entry: the Coaches tab says "Before the admin history began, so there
is no note of how" (or "when approvals began" for the migration's `decidedBy: "migration"`).

## The Admin screen

Six tabs, each with its own address (the tab's link changes the address with `history.replaceState`, so switching
tabs doesn't reload anything; the Admin link in the nav opens **Waiting**):

| Tab | Address | What |
|---|---|---|
| **Waiting** (with a count) | `#admin` | coaches waiting for approval, requests from coaches (to join a class, or for more videos a month) |
| **Coaches** | `#admin/coaches` | every coach, who approved them and how; suspend, let back in, approve later |
| **Classes** | `#admin/classes` | every class: suspend it, take its page down, take a coach off it |
| **Institutions** | `#admin/places` | the list coaches choose from |
| **History** | `#admin/history` | the admin log |
| **Limits** | `#admin/limits` | the monthly AI and video limits |

The screen loads six things: the pending requests, every coach, every class with its coaches (`classCoaches`), the
institutions, `config/limits`, and the latest 300 log entries (`orderBy("at", "desc")`; an older decision's entry is
fetched by id). The **Admin** link in the nav shows a live count of what waits (`cloud.watchWaiting`: coaches and
requests with `status == "pending"`; a profile from before approvals, with no `status`, shows on the Waiting tab but
is not in that count). Every action shows a toast; everything but approving a request has **Undo**.

A decision's note is typed in a small form that opens **in the card** (only one at a time); what was typed is kept
while the screen redraws, and an Undo opens the form again with it.

### Waiting: coaches waiting for approval

Oldest first (by when they asked, or asked again): every coach whose `status` is `pending` — or who has no `status`
at all (a profile from before approvals). Each card shows the name, email, **Works at** (their institutions by
name), **Not in the list** (a place they typed, see below), their old **Organisation** if they have one, **How to
check them** (the profile's note), when they asked, and — for a coach who was declined and asked again — "Asked
again" and what they were told before. The hint under the heading: "Approve only after checking who they are and
where they work. You write down how you checked."

| Action | What is written | Rules |
|---|---|---|
| **Approve** | Opens "How did you check them?" with an example from their own place ("For example: seen taking classes at AWWA School @ Napiri"), the hint "Kept in the admin history with your name. The coach doesn't see it.", and "N more letters to go" until the note has 10. If none of their places is in the list yet, a warning says so ("Add it first, or they can't make a class"). **Approve** then takes the card away and shows "Approved: Mr Lim" with Undo. When the toast goes (8 s, the next toast, leaving the page, sign-out), one commit writes the `coach-approved` entry and `coaches/{uid}`: `status: "approved"`, `decidedAt`, `decidedBy`, `decisionLog`, and removes any `decisionMessage` (`cloud.decideCoach`). The coach's own screen changes to My classes as it happens. | an admin changes only `status`, `decidedAt` (= request time), `decidedBy` (= the admin), `decisionLog` (its entry, in the same commit) and `decisionMessage` — never together with `suspended`, never the coach's name or note; the entry's note ≥ 10 characters |
| **Decline** | Opens "What should they know? (if you like)", e.g. "Please add a work email I can check." — "The coach sees this. It is kept in the admin history too." The same toast and Undo; then `status: "declined"`, the stamps, `decisionLog`, and `decisionMessage` (≤ 300) if something was written. The coach sees **Not approved** with "The admin says: “…”", and can change About you and **Ask the admin again** (`status` back to `pending`, `reappliedAt`), which brings them back here marked **Asked again**. | as above; a message only on a decline |

Undo writes nothing (the decision had not been sent). A decision can be changed later from the Coaches tab.

#### A place not in the list

A coach whose school or centre isn't in the list types its name on About you (`otherPlace`, ≤ 120). Their card shows
it under **Not in the list** with two buttons:

- **Add it to the list** opens the institution form in the card with the name filled in; add the organisation (and
  type and area if you like) and **Add, and put it on their profile**: one commit creates `institutions/{id}`, puts
  the new id on the coach's `institutions` and deletes their `otherPlace` (`cloud.saveInstitution(…, { forCoach })`),
  with an `institution-added` entry naming the coach.
- **It's already listed** (they didn't find it, or wrote it differently): choose the listed place, and **Put it on
  their profile** does the same with that id (`cloud.addPlaceToCoach`, `coach-place-added`).

The rules let an admin change a coach's `institutions` only this way: exactly one id added, the rest kept, and
`otherPlace` deleted, in the same write. The Institutions tab also says when coaches have typed places, with a
button to the right tab.

An approved coach makes their own classes (see [the coach app](/coach/coach-app.md#my-classes)): there is no
per-class approval for a new class. The admin sees each new class under **Classes**, with its institution. A coach
approved with only a typed place can't make a class until the place is in the list and on their profile.

### Waiting: requests from coaches

The section is headed "Requests from coaches (*n*)", oldest first. A request is to join a class, or for more videos a
month.

#### To join a class

A coach who works with a colleague asks to join the colleague's class by its code. Each card shows "Join
K7M-3RQ-P9T (3 Kindness)" (or "— no class has this code"), the coach's name and email, their status if not approved,
**Works at**, **The class is at** (the class's institution), **The class's coaches**, how to check them, their note
and when they asked. **Check that they really coach that class** — the admin is the only check.

| Action | What is written | Rules |
|---|---|---|
| **Approve** | Opens "How did you check they coach this class?" (e.g. "For example: seen teaching 3 Kindness with Ms Tan"; ≥ 10 characters). Then, in one transaction: the `join-approved` entry; the coach's uid added to `classCoaches/{code}.uids`; the request → `approved` with `decidedAt`, `decidedBy`, `decisionLog`, `resultCode`. Disabled when no class has that code ("There is no class with the code … Decline this request instead."). No Undo — take the coach off the class instead. | `classCoaches` update is admin-only, at most 50 uids; a request is decided once (`status == 'pending'`), only `status`, `decidedAt`, `decidedBy`, `decisionLog`, `resultCode` change, and only with its entry |
| **Decline** | Opens "Why? (if you like)" — kept in the history; the coach sees only "Not approved". The card disappears; when the toast's Undo runs out, the `join-declined` entry and the request → `declined`. | as above |

A request decided by another admin meanwhile fails with "This request has already been decided." An older "New
class" request (from before coaches made their own) can only be declined, with a line saying so.

#### More videos a month

A coach with 3 or fewer videos left this month can ask for more from the video panel, with an optional note
([videos](/coach/videos.md#asking-the-admin-for-more)). The card is headed "More videos a month" and shows the coach,
**Works at**, **Videos a month now** (their own number, or everyone's), how to check them, their note and when they
asked.

| Action | What is written | Rules |
|---|---|---|
| **Approve** | Opens **Videos a month for this coach** (0–500, suggested: the current number + 20; an empty box or anything but a whole number from 0 to 500 says "Give a whole number from 0 to 500.") and "Why? (if you like)" ("Kept in the admin history with your name. A page video costs a few cents."). **Give them more** then writes, in one transaction (`cloud.approveMoreVideos`): the `more-videos-approved` entry (with the request, the coach and `detail` "*N* videos a month"); `coaches/{uid}.limits = { videosPerMonth: N }` with `limitsLog`; and the request → `approved` with `decidedAt`, `decidedBy`, `decisionLog` and `videosPerMonth`. The toast says "Mr Lim can make 60 videos a month now." No Undo. The number stays for every later month until an admin changes it | an admin changes only a coach's `limits` (just `videosPerMonth`, an integer 0–500) and `limitsLog`, only with an entry for that coach in the same commit; the request as for a join, plus `videosPerMonth` (0–500) |
| **Decline** | "Why? (if you like)", kept in the history. When the toast's Undo runs out, the `more-videos-declined` entry and the request → `declined`. The coach can ask again | as above |

### Coaches

Every coach, with a status chip (**Approved**, **Waiting for approval**, **Not approved**) and **Suspended** when
suspended; email, **Works at** — with "Changed …, after approval" when an approved coach changed where they work
after the decision (`institutionsChangedAt` later than `decidedAt`) — a place not in the list (with the same two
buttons), the old organisation if any, how to check them, their classes, and:

- **Approved by** / **Declined by**: the admin's name (from their own coach profile; else their email), when, and
  "Checked: “…”" (an approval's note) or "Told them: “…”" (a decline's message), from the log entry the profile's
  `decisionLog` names.
- **Suspended by**: the same for a suspension, with "Why: “…”".

A search box (name, email, school, status) appears once there are more than 8 coaches.

- **Approve** (a declined coach): the same note form as on Waiting — approve later.
- **Suspend** opens "Why? (if you like)" ("Kept in the admin history. The coach sees that the admin has paused their
  account."); **Suspend** then sets `suspended: true` with its `suspendLog` entry, at once, with Undo (logged "Undo").
  **Let back in** is one tap, with Undo. A suspended coach keeps their sign-in but every rule and callable treats
  them as no one's coach: they cannot read or write their classes' pages and shelves, publish, upload, make or join
  classes, or use Write with AI or videos, and the coach app says "The admin has paused your account".
- **History** opens the History tab searched for that coach's email.
- A coach still waiting shows **Go to Waiting**.

### Classes

Each class with its name, code, **Institution** (or the old **Organisation** of a class made before institutions),
"Learners see “…”, published …" or "Nothing", its coaches — each with **Take off** — and a **Suspended** chip.

- **Take off** a coach (they moved school, or left): `classCoaches/{code}.uids` without them (`arrayRemove`), with a
  `coach-removed` entry; Undo puts them back (`coach-added`). Their other classes and their approval are untouched.
- **Suspend the class** / **Make it active again** sets `classes/{code}.status` to `suspended` / `active`. A suspended class is invisible to learners — their `get` is refused, and the learner app treats that like a wrong code (see [My class](/learner/my-class.md)) — and its coaches can read the class document but not its pages or shelves, and cannot publish.
- **Take the page down** (only when something is published) sets `latest` to `null`; learners see "Nothing from your coach yet" at their next refresh. Undo puts the same `latest` back. The coaches' pages are untouched, so a coach can publish again — suspend the coach or the class to stop that.
- A class code that got out: the coach makes a new class (a new code), and once the devices have the new code the admin suspends the old one.

### History

The admin log, newest first: "**Ms Tan** approved **Mr Lim** as a coach", "How they checked: “Seen taking classes
at AWWA School @ Napiri”", and when, with the admin's email. A search box finds entries by any word — a coach, an
admin, a class, a note. 50 at a time, **Show 50 more** for the rest of the latest 300. Under the list: "Who did
what, newest first. Nobody can change or delete it from the app." An action just taken shows at once.

## Monthly limits

The **Limits** tab. `config/limits` = `{ flashPerMonth, videosPerMonth, updatedAt, updatedBy }`, the same for every coach (each save also writes a `limits-changed` entry):

| Limit | Default (`DEFAULT_LIMITS` in `functions/lib.js`) | Allowed by the rules | Counts |
|---|---|---|---|
| AI requests per coach per month | 200 | 0–5,000 | `writePage` and `planOverlay` calls (Gemini Flash: writing pages and marking pictures) — see [Write with AI](/coach/ai-helper.md#counting) |
| Videos per coach per month (a coach can ask for more) | 20 | 0–100 | `makeVideo` (a page video, made by the renderer on Cloud Run, a few cents each) — see [videos](/coach/videos.md#videos-this-month) |

The form's hint: "The same for every coach, counted in Singapore months, unless you gave a coach more videos when they
asked. AI requests are writing pages and marking pictures (Gemini Flash); a page video costs a few cents to make (most of it the voice)." A
missing document, or a missing or invalid field, means the default.

**One coach's own limit.** A coach the admin gave more videos (above) has `coaches/{uid}.limits.videosPerMonth`,
which takes the place of everyone's number for that coach only (`limitsFrom(limits, coach)` in `functions/lib.js`;
the coach app reads the same with `cloud.getLimits(uid)`). A missing or invalid own number means everyone's. The
Limits tab does not show or change it; the coach's next request does. Months are Singapore months (UTC+8); usage is kept per coach per month in
`usage/{uid}_{YYYY-MM}` (`flash`, `video`, `declined`), written only by the functions and readable by that coach and
admins. Lowering a limit below what a coach has already used this month simply stops further use until the next
month. Any signed-in user may read the limits (the coach app shows "12 of 200 this month").

Costs behind these numbers are in [costs and limits](/operations/costs-and-limits.md).

## Institutions

`institutions/{id}` = `{ name (≤ 80), org (≤ 60), type (≤ 60), area (≤ 40), active, updatedAt }`: one entry per **place** — an organisation with several centres has one entry for each, and the coaches' picker groups them by `org`. Any signed-in user may read them (learners never sign in); only admins write, and an entry is never deleted — **retired** with `active: false`, because profiles and classes point at it. A retired place disappears from the picker and from "Where is the class?", but a coach who chose it keeps it (marked "(retired)") until they take it off.

On the Admin screen's **Institutions** tab, **Institutions (N in the list)** shows every entry grouped by organisation with its area, type and how many coaches chose it. Every change writes its log entry. When coaches have typed places not in the list, a note names them and links to the tab where their cards are (see [a place not in the list](#a-place-not-in-the-list)).

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

`node tools/test-rules.mjs` pins every admin-only write (and that coaches cannot make them), that an admin signed
in without Google can do nothing, the admin log (an approval without its entry, an entry without its approval, a
note under 10 characters, another admin's name or email, an old entry reused, changing or deleting an entry — all
refused), giving a coach more videos (only with its entry, for the coach who asked, at most 500 — and never by the
coach), that a coach waiting for approval (or declined, or suspended) can do nothing but edit their own profile
(and, declined, ask again), a place typed instead of an institution, and that an approved coach can make a class
only for their own active institution; `node tools/test-functions.mjs` that every callable
refuses a coach who is not approved; `node tools/test-seed.mjs` the seeding and migration tools;
`node tools/smoke.mjs coach` drives the Admin screen in Chrome against a stand-in `cloud.js` — the note forms,
Undo bringing a note back, a place not in the list, taking a coach off a class, giving a coach more videos when they
ask, the history and its search, and
the tabs at iPad and phone widths. The real `cloud.js` was walked through against the emulators (every write above,
with the rules) on 2026-09-25; see [local development](/operations/local-development.md) for signing in there.
