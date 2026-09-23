---
type: Product Contract
title: Design Principles
description: The rules every learner screen follows for autistic and other special-needs learners — one question per screen, fixed positions, pictures with few literal words, no errors, undo over confirmation, silence, age-neutral, the student's own supports, adult set-up out of the way, and nothing leaving the device.
tags: [design, accessibility, autism, special-needs, principles, privacy, wcag]
status: stable
---

Simplify is used by autistic children and teens and other special-needs learners across support levels — from
minimally-speaking picture users to teens who read and speak but freeze under stress — mostly on Android phones and
shared class iPads. These are the rules every learner screen keeps. A new screen or tool that breaks one needs a
decision in the [decision log](/product/decisions.md) first. The research behind them is in
[daily-life research](/product/daily-life-research.md).

## One thing at a time

- **One question per screen**, picked from one menu that is one level deep. The money tools each answer one question;
  each daily-life tool does one job. See [menu and set-up](/learner/menu-and-setup.md).
- **The same parts in the same places.** Every money tool is built from the same money box, list and answer panel at
  the bottom, with the same words ("Add item", "Put it back", "Can buy / Cannot buy"). The header always has 🏠 on
  the left and ✕ on the right.
- **Positions never move.** Fixed cards (I need, Show a card, the menu tiles) stay in the same place on every visit —
  the AAC motor-planning principle. Hiding a card leaves a gap rather than shifting the others. Back and Next in
  Steps and My class sit in the same place on every screen.
- **Short, purposeful use.** Each tool ends by pointing back to the real task ("All done", "Back to …"), not to more
  screen time.

## Few words, and literal ones

- **As few words on screen as possible**: every word is one more thing to read. 🏠 and ✕ have no labels beside them
  (screen readers get their names from `aria-label`), the menu has no "pick a tool" line, and there is no hint text
  before there is an answer.
- **Picture + colour + 1–4 plain words.** Pictures come from one bundled set, so a card looks the same on Android and
  iPad (emoji do not) — see [pictures](/learner/pictures.md). An adult can set a device to **pictures only**, which
  hides the words marked for it, for students who don't read.
- **Literal language.** No idioms or figures of speech; a button says exactly what happens next.
- **Every state uses colour + icon + plain words together**, so it works for colour-blind users and non-readers: green
  yes, red no, blue for an amount. The floating yes/no pill at the top carries the short amount too ("✋ $6 more"),
  because the on-screen keyboard often hides the bottom panel; if an amount is too long for the space, it drops the
  word, never digits.

## Forgiving by design

- **Never a validation error.** Bad input is prevented or forgiven, never rejected. An empty money box counts as $0,
  so a price alone already gives an answer; a stored setting that can't be read falls back to its default.
- **Immediate feedback.** Answers update as the learner types or taps; there is no submit button.
- **Undo instead of confirmation dialogs** ("Take back one", "Put it back"): the action happens, and a toast offers
  to reverse it.
- **Controls appear only when they have something to act on** — no disabled buttons waiting to be understood.
- **No stray taps.** A card that opens under the finger ignores taps in its first moments, so a quick double tap
  can't act on it.

## Calm

- **Silent by default.** No ticking or alarm sounds. Any sound is soft, optional, set by an adult, and starts from a
  tap (Wait's one chime). Speech happens only on a tap, in the device's own voice (`speechSynthesis`, output only —
  the microphone stays off for the whole site).
- **Age-neutral.** Many users are teens: no mascots, confetti, streaks, points or "good boy" praise. Neutral names
  (Wait, Steps, Show a card).
- **`prefers-reduced-motion` is respected** everywhere; Wait shows only the number instead of a moving disc.

## Big and clear

- Touch targets of 56–96 px (`--target-small` 56 px, `--target` 64 px, larger tiles and cards) with generous
  spacing; big type (22 px body, 32–34 px amounts and headlines).
- Text contrast targets WCAG AAA (7:1); non-text parts clear the 3:1 floor.

## The student's own supports

- **Supports, not compliance tools.** A break is a right, not a reward; nothing tells a student to "calm down".
  Communication tools (I need, Show a card) are the student's voice and are never taken away as a consequence — the
  guide says so.
- **No logs of feelings, behaviour or location.** Nothing a student taps is recorded or sent. No health claims
  ("reduces anxiety", "treats"); say "based on visual supports (NCAEP 2020)", never "evidence-based app".
- **Fading built in**: Steps can leave out steps a student has mastered ("Fewer steps").
- **Disclosure is the student's choice.** Cards carry no diagnosis by default; "I have a hidden disability." or
  "I am autistic." is an opt-in second line.
- **Personal details only on personal devices.** Nothing personal is built in for shared class iPads, and a tool
  used by the next student starts fresh (a Steps deck left for 30 minutes opens at step 1).

## Adults set up, out of the child's way

- Each device is set up by an adult on the [set-up page](/learner/menu-and-setup.md) (`#setup`), reached from the
  guide and entered with a press-and-hold — no PIN, no errors, never on the menu. A shared class iPad and a
  student's own phone can be set up differently.
- There are no settings on the learner's screens themselves.

## Local, respectful and lawful pictures

- Multiracial people, halal-safe food by default, and no operator, government or brand logos (LTA's card design,
  EZ-Link, SimplyGo, product packaging): drawn generic versions instead. Show a card uses LTA's Helping Hand
  *wording*, never the card's design.
- The note and coin pictures are drawn to be recognised, not copied: Singapore's Currency Act (s.20) covers any
  drawing resembling a note or coin, so they take only physical facts — colour, true proportions, metal, relative
  size and value — and never the artwork. See [money tools](/learner/money-tools.md#the-currency-drawings).

## Private and offline

- **No account, no analytics, no tracking.** Nothing leaves the device unless My class is set up, and then only the
  class code (plus the device's internet address, as with any website). YouTube receives anything only after the
  learner taps a video. See [security](/platform/security.md).
- **Works offline once opened**, and state is saved on the device so it survives closing the app — count your notes
  at home, check at the shop with no signal. See [offline and updates](/platform/offline-and-updates.md).
- **Voice without a microphone permission**: dictation comes from the keyboard's own microphone, never the page. See
  [voice input](/learner/voice-input.md).

## Content coaches publish

Coach pages follow the same rules, and the AI helper writes to them: short literal sentences in plain Singapore
English, one idea per screen, pictures only from the class's shelf, no names of learners, sensitive daily-living
topics written factually and gently. What is published is public to anyone with the class code, so it never holds
pictures of students or private information. See [the AI helper](/coach/ai-helper.md) and
[markdown pages](/coach/markdown-pages.md).
