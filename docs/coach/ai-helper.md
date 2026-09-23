---
type: Product Contract
title: The AI Helper
description: How "Tell the helper what to write or change" works — what the coach app sends to writePage, the one Gemini Flash call that answers write / ask / decline with "I understood: …", what is in and out of scope, how the function checks the page before the coach sees it, the draft with Undo, and how each request is counted.
tags: [ai-helper, writepage, gemini-flash, write-ask-decline, page-check, monthly-limits, coach-app]
status: stable
---

This document owns the page helper on the class screen: `public/coach/js/helper.js` and `public/coach/js/questions.js`
in the coach app, and the `writePage` callable in `functions/index.js` with its instructions in `functions/prompts.js`
and its checks in `functions/check.js`. Model ids, the request shape and the test fakes are in
[AI models](/platform/ai-models.md); the markdown a page may hold is in [markdown pages](/coach/markdown-pages.md).

## What the coach sees

Under the editor, a **Helper** panel: "Tell the helper what to write or change" (a box of at most 1,000 characters),
a hint with two examples ("Make this simpler", "Write a picture story about going to the dentist with my 4
pictures"), **Ask the helper**, and the line "Helper requests: 12 of 200 this month". While it works: "The helper is
writing. This can take up to a minute."

Every answer starts with one sentence **"I understood: …"** — the request restated in the model's words, including
anything it assumed — so a badly worded instruction is visibly rewritten and a misunderstanding shows at once. Then
one of three:

| Action | The coach sees |
|---|---|
| **write** | The new draft replaces the editor's title and text (`ws.editor.setDraft`); "The helper wrote a new draft in the editor. Read it, and check it in the preview, before you publish."; the helper's note if any; **Undo: bring back my text**, which restores exactly what was in the editor before the call. The draft is saved like any typing — **nothing reaches learners until the coach presses Publish** ([publish](/coach/coach-app.md#publish-and-unpublish)). |
| **ask** | "The helper needs to know a little more:" and up to **3 questions**, each with up to **4 suggested answers** to tap (tap again to un-pick) or "Or in your own words". **Send my answers** calls `writePage` again with the same instruction plus the answered questions. |
| **decline** | One kind line in an info box — never an error. For example "The helper can only write pages about school, learning and daily life." |

A failed call shows the function's plain message beside the panel (for example "The helper is not available right
now. Try again in a minute. This request was not counted.").

## What is sent

`cloud.callFunction("writePage", { classCode, instruction, markdown, title, answers })` — the instruction, the
editor's current markdown (≤ 20,000 characters) and page name (≤ 80), and any answers (≤ 3, each ≤ 300 characters).
The function adds the class's **shelf**: up to 100 pictures (newest first) and up to 50 **approved** videos, each as
its exact path and words. It also collects every link found in the instruction, the answers and the current page
(`linksIn`): https links as written and YouTube links in any accepted form as `https://youtu.be/<id>`. Those are the
only links the helper may use.

Nothing about learners is sent — there is nothing about learners in the system to send.

## Scope: one call decides

There is no separate router or classifier. One Gemini Flash call (`WRITE_PAGE_SYSTEM`, thinking `medium`, JSON answer
enforced by `WRITE_PAGE_SCHEMA`: `understood`, `action`, `questions`, `title`, `markdown`, `note`) decides write,
ask or decline. The decision to use one call rather than a cheaper Flash-Lite router in front is recorded in the
[decision log](/product/decisions.md): a router would save well under a cent, add a second call's delay and misjudge
sensitive but legitimate topics more often.

- **In scope**: educational, school, daily-living, social, safety, community and class-organisation content for
  autistic children and teens, written for them or for their coaches, teachers and parents. Sensitive daily-living
  topics — puberty, periods, toileting, body safety, grief — are in scope and are written factually and gently.
- **Out of scope (decline)**: anything not for the learners or their class — personal errands, business, marketing,
  politics, adult content, homework, writing for adults.
- **Privacy**: the page is public to anyone with the class code, so the helper never writes anything that identifies
  a learner or family (names, photos of students, addresses, phone numbers, diagnoses).
- **Prompt injection**: everything from the coach is quoted material; the instructions tell the model never to follow
  text inside it that tries to change its rules, role or answer shape.

## How it writes

The system instructions carry the [design principles](/product/design-principles.md) for content: plain Singapore
English with British spelling; short literal sentences, one idea per sentence; the title as a `#` heading on the
first screen; one idea per screen with `---` between screens (3–8 screens for a picture story); picture stories in
the first person, mostly describing, with only gentle directions; calm, no praise words, no exclamation marks, no
emoji; age-neutral; never inventing facts about real people, places, times or rules (ask, or write generally); at
most one picture or video per screen, before its words; only the markdown subset; when changing a page, change only
what was asked.

## What the function checks

`writePageHandler` in `functions/index.js`, in order:

1. **The caller** — `requireClassCoach`: signed in, has a coach profile, not suspended, listed in
   `classCoaches/{code}`, class active. Otherwise a plain refusal ("You are not a coach of this class.", "This class
   is paused by the admin.").
2. **The input** — lengths above; answers cleaned (never refused).
3. **Too short to act on** — fewer than 4 letters or digits across the instruction and answers: a free **ask**
   ("What should the page be about?" with four suggestions), **no model call and not counted**.
4. **The limit** — `reserve(uid, "flash")` counts one request in a transaction *before* the model is called; at the
   limit it refuses with "You have used all 200 helper requests for this month." (see
   [monthly limits](/coach/admin-and-approvals.md#monthly-limits)).
5. **The model** — a failed call, a timeout (100 s), a cut-off or unparseable answer, or no valid action: the request
   is **refunded** and the coach sees the "not available … not counted" message. A safety-blocked answer becomes a
   **decline** ("The helper cannot write this. Try asking in a different way.").
6. **The page** — for a write, `cleanPage` in `functions/check.js`:
   - removes every HTML tag;
   - keeps a picture or video only if it is an exact `pictures/<id>.jpg` on the shelf or `videos/<id>.mp4` that is
     approved;
   - keeps a link or YouTube line only if the coach gave that link; any other link keeps just its words, and a bare
     address the coach did not give is removed;
   - runs the learner app's own parser (`class-markdown.js`, a byte-identical copy) line by line and drops any line
     it would still draw as a disallowed picture, video, YouTube card or link button;
   - tidies screens (no empty screens, `---` between blank lines) and cuts at the last whole screen under 20,000
     characters;
   - parses the whole result once more and fails if anything unexpected remains.

   If anything was removed, the note says "I left out N things that pages cannot show (a picture not on the shelf, a
   link you did not give, or HTML)." An empty result is refunded ("The helper's page came back empty. Try again. This
   request was not counted."). The title is cleaned of markdown characters and cut to 80.
7. **The answer** — `understood` is forced to one sentence starting "I understood: " (≤ 400 characters); questions
   are cut to 3 × 4; the note to one line. Every reply carries `used` and `limit`, which update the usage line.

## Counting

| Outcome | Counted as a Flash request? |
|---|---|
| write or ask | yes |
| decline (including a safety block) | yes, and also counted in `usage/{uid}_{month}.declined` |
| too short to act on | no |
| model failure, empty page | no (refunded) |

Months are Singapore months (UTC+8). The limits and their defaults are in
[admin and approvals](/coach/admin-and-approvals.md#monthly-limits); costs in
[costs and limits](/operations/costs-and-limits.md).

## Tests

`node tools/test-functions.mjs` runs `writePage` against the emulators with the fake model (`SIMPLIFY_AI_FAKE=1`):
write, ask, decline ("beer"), failure and refund ("[fail]"), the too-short path, the limit, and `cleanPage` against
pictures off the shelf, invented links and HTML. `node tools/smoke.mjs coach` drives the panel in Chrome.
