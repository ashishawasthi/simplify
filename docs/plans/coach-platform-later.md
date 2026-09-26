---
type: Plan
title: Coach Platform — Put Off
description: Coach-platform features deliberately left out of the first build — Microsoft sign-in, App Check, several classes per device, per-learner content, read receipts, replies, push, a parent view, a class-wide tool list — with what each would need.
tags: [plan, coach-platform, roadmap, put-off]
status: draft
---

**None of this exists in the code.** These were put off when the coach platform was designed on 2026-09-23 (see
the [daily-life research](/product/daily-life-research.md), section 8) and are not part of what is built. What *is*
built is described in the [coach area](/coach/index.md). Each item notes why it waited and what it would touch.

| Feature | Why it waited | What it would need |
|---|---|---|
| **Microsoft sign-in** | Google sign-in accepts any Google account, including one made on a school address; no school has needed Microsoft yet | The Microsoft provider in Firebase Authentication, an Azure app registration, a button on the coach sign-in screen, and the `/coach` CSP extended for Microsoft's sign-in origins |
| **App Check** | The learner app reads a class with one plain HTTPS request and no SDK; the rules already limit reads to an exact class code, and AI calls are limited per coach | An attestation provider for the coach app at least; enforcing it on Firestore and Storage would also affect the learner app's plain requests |
| **Several classes per device** | One class per device keeps the menu to one My class tile and the set-up page to one question | `classCode` in the device settings becomes a list; the menu and My class choose between classes |
| **Content for one learner** | Learners never sign in, so the class code is the only thing that identifies what a device sees | A per-learner code or account — a much larger privacy question |
| **Read receipts or analytics** | Nothing a learner does is recorded or sent ([design principles](/product/design-principles.md)) | A decision to change that principle first |
| **Learner replies** | Same: learners only read | Accounts or codes for learners, moderation, storage of learners' data |
| **Push notifications** (a notice while the app is closed) | Web Push needs a subscription per device — a lasting device ID and a token stored against the class — and a permission prompt the audience may not manage. An **open** app already hears about a new page at once through a Realtime Database stream that needs neither ([my class](/learner/my-class.md#hearing-about-a-new-page)) | A push service, subscriptions stored per device, the prompt, and a privacy review for minors |
| **A parent view** | The pilot is for coaches and their classes | A third role in the rules and the coach app |
| **A class-wide tool list** that sets each device's menu | Each device is set up by an adult on `#setup` | A field on the class document read by the learner app, and a rule for how it combines with the device's own hidden tools |

Two items once listed here are gone (2026-09-26): longer or edited AI video (Veo) and portrait videos. Videos are no
longer made by a model at all — a coach's video is the class page filmed in code, upright (9:16) — see
[videos](/coach/videos.md) and the [decision log](/product/decisions.md).

Before building any of these, add the decision to the [decision log](/product/decisions.md) and check the
[costs and limits](/operations/costs-and-limits.md) it would change.
