---
type: Product Contract
title: Stop and check
description: The Stop and check tool (#stop-check) — ten things someone may ask for (a code, Singpass, a password, card numbers, money, a link, photos, a meet-up, a secret, a prize), each opening the shared full-screen card with STOP, show a trusted adult, one plain rule and the 1799 ScamShield Helpline; the words' sources, the tool-only pictures, and why nothing is kept.
tags: [stop-check, scams, online-safety, scamshield, full-screen-card, stay-safe, learner-tool]
status: stable
---

Stop and check is for the moment someone — a message, a call, a new "friend" online — asks a young person for
something they must not give. Teens with phones are a real target in Singapore, where scams that ask for a one-time
code, Singpass or a PayNow transfer are common ([daily-life research](/product/daily-life-research.md), "Stop and
check"). This document owns the screen (`public/js/tools/stop-check.js`), its words
(`public/js/tools/stop-check-cards.js`) and its styles (`public/css/tools/stop-check.css`). It is the first tool in
the **Stay safe** group (🛡 `menu-safe.svg`); its menu picture is `stop.svg` (🛑).

## The screen

"Someone asked me for:" and ten buttons in two columns, in places that never move, each a picture and 1–4 words.
A tap opens the shared full-screen card ([Show a card](/learner/show-card.md#the-full-screen-card)) with
**Turn around** and **Speak** (where the set-up page allows it; these sentences have no recorded clip, so the
device's own voice reads them).

| Button | Picture | The rule on the card |
|---|---|---|
| A code (OTP) | `code.svg` 🔢 | Never tell anyone a code sent to your phone. Not the bank. Not the police. |
| Singpass or IC | `id-card.svg` 🪪 | Never give anyone your Singpass, your password or your IC number. |
| My password | `password.svg` 🔑 | Never tell anyone your password. |
| My card number | `bank-card.svg` | Never give anyone the numbers on your bank card. |
| Send money | `send-money.svg` 💸 | Do not send money or gift cards. Do not use PayNow for them. |
| Tap a link | `link.svg` 🔗 | Do not tap the link. Do not download the app. |
| Photos of me | `photo.svg` 📷 | Never send photos of your body. |
| Meet up | `meet-up.svg` 📍 | Never meet someone you know only from your phone. |
| Keep a secret | `secret.svg` 🤫 | Do not keep it secret. Tell your family. |
| I won a prize | `prize.svg` 🎁 | A real prize never asks for money or a code. |

Every card shows the stop sign, **STOP. Show a trusted adult.** in the largest type that fits, then the rule, then
**No adult near? Call 1799, the ScamShield Helpline.**

## The words

- The advice follows the Singapore Police Force and ScamShield: government officers never ask you to transfer money
  or give bank log-in details by phone; 1799 is the 24-hour ScamShield Helpline for checking whether something is a
  scam (checked on [scamshield.gov.sg](https://www.scamshield.gov.sg/) on 2026-09-26). Re-check the number before
  changing the card.
- Literal words only ([design principles](/product/design-principles.md)): the rule says what to do, not "scammer" or
  "trick". The card points to a person first — a trusted adult — and a phone number second.
- The words are pinned word for word by `node tools/test-stop-check.mjs`.

## Pictures

The ask pictures are **tool pictures** (`TOOL_PICTURES` in `public/js/pictures.js`), Noto Emoji files the picture
picker never offers — so their words need no recorded voice clip ([pictures](/learner/pictures.md)).

## Nothing kept

The tool has no saved state, no ✕ and no set-up section: nothing about what was tapped, or when, is stored or sent.

## Tests

`node tools/test-stop-check.mjs` (every label and rule, the card, the pictures); `node tools/smoke.mjs stop-check`
(ten buttons in two columns, a card's exact words and picture, closing it, pictures only). The guide page is
`/guide/stop-check`.
