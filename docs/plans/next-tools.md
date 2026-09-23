---
type: Plan
title: Next and Later Tools
description: Learner tools researched and scored but not built — Say it, How I feel, Order food, My trip, Time sums, Stop and check, Break, About me, Print view, and the Later list — with each one's screen, scores, effort and the caution that goes with it.
tags: [plan, roadmap, tools, daily-life, learner]
status: draft
---

**None of these tools exists in the code.** They come from the tool catalogue of the
[daily-life research](/product/daily-life-research.md) (2026-09-23), which scored each candidate: Impact (1–5) = need
× evidence × how often it's needed in Singapore daily life; Fit (1–5) = offline, one screen, no accounts, small;
Effort S (days), M (a week or two), L (more — usually drawings). The first release — Wait, I need, Now and next,
Show a card, Steps and My class — is built; see the [learner area](/learner/index.md).

Every tool here would follow the [design principles](/product/design-principles.md) and plug into the shell like the
existing tools ([adding a tool](/platform/architecture.md)).

## Next

| Tool | One screen | Impact / Fit | Effort | Caution |
|---|---|---|---|---|
| **Say it** | Type (or dictate) one sentence; show it huge or speak it; the last 5 phrases as buttons | 3 / 4 | S | Reuses Show a card's full-screen view; not a replacement for prescribed AAC |
| **How I feel** | Five bands (colour, size, one word; faces optional) → the student's own "what helps me" pictures | 4 / 5 | S | Words must match the school's own programme (Zones or a 5-point scale); no branding; nothing saved |
| **Order food** | Drink (kopi, teh, Milo, water + O, C, kosong, siew dai, peng), a food row (halal by default), here or tapau / dabao / bungkus → one big sentence to show; then Can I buy? and "return the tray" | 4 / 4 | M + L drawings | Builds the words, not a menu; device voices may mispronounce kopi terms |
| **My trip** | MRT first (trains stop at every station): line colour, station code, "towards …", stops to go, where to get off; "Something is wrong" scripts | 4 / 4 | M | Buses skip stops unless someone presses the bell, so a tap-per-stop counter miscounts — use the stop name and the bus's own next-stop display where there is one. A training aid, never a safety device |
| **Time sums** | "How long until 3:30?", "What time will it be in 20 minutes?" — two boxes and the answer panel, like the money tools | 3 / 5 | S | SPED functional numeracy teaches money and time together |
| **Stop and check** | Someone asks for an OTP, Singpass, a PayNow transfer, photos or a meet-up → "Stop. Show a trusted adult." | 3 / 5 | S | Teens with phones; a very Singapore-specific scam risk |
| **Break** | Breathe (optional, never the default), Move, Quiet — each short, ending on "Back to …" | 3 / 5 | S | Some interoception-sensitive children find breathing exercises distressing |
| **About me** | One card, written by the student with support: how I communicate, what helps, what upsets me, Call my family | 3 / 3 | S | Personal phones only, never a shared iPad; show and flip, hand the phone only to uniformed staff, teachers or clinicians; back it with the phone's lock-screen emergency info |
| **Print view** | Paper copies of I need, Show a card, Now and next and each Steps deck | 3 / 5 | S | Batteries die; phones are banned in secondary schools during school hours |

## Later

- **What will happen** — picture stories before an outing or a change ("Social Stories" is Carol Gray's term; don't
  use it as a name).
- **Choose** — pick one of a few pictures.
- **Pack my bag** — a checklist built on the Steps engine, with fading.
- **Days until** — counts days, not "sleeps", for teens.
- **Emergency (practice)** — practice mode by default: 999 police, 995 ambulance/fire, SMS 70999 for people who
  cannot speak; `tel:`/`sms:` links only on a personal phone, never auto-dial. Re-check the numbers first (1777 ends
  on 1 Jan 2027).
- **More Steps decks** — pay by NETS or PayNow QR, puberty and hygiene for teens, body safety, water safety, cross the
  road (Green Man+).

## Not building

The research also lists what is deliberately **not** built — a full AAC talk board, video modelling, timed
self-monitoring prompts, live weather or bus arrivals, a calm-places directory, a queue-number counter, stars or token
boards, and mood or behaviour logs — each with its reason, in
[the research's tool catalogue](/product/daily-life-research.md#not-building-and-why). Don't pick one of those up
without a new entry in the [decision log](/product/decisions.md).
