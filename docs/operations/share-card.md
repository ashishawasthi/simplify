---
type: System Reference
title: Share Card and QR Poster
description: The link-preview card (og-card.png, 1200×630, QR and readable URL inside the middle square WhatsApp keeps), its ?v= cache-buster, the printable qr-poster.png, how tools/make-qr.py draws both offline, and how to make Facebook, WhatsApp and X pick up a new card.
tags: [open-graph, share-card, qr-code, whatsapp, make-qr, social-preview]
status: stable
---

This document owns the site-wide sharing images for the learner app at https://simplify.whiz.coach/. The per-class QR
poster a coach prints is a different thing, drawn in the browser by the coach app — see
[the coach app](/coach/coach-app.md).

## The link-preview card

`public/img/og-card.png` (1200×630) is the Open Graph and Twitter `summary_large_image` card, referenced from
`public/index.html`:

- `og:image` and `twitter:image` both point at `https://simplify.whiz.coach/img/og-card.png?v=2` — absolute, and on
  the one public address, like every absolute URL (see [release and deploy](/operations/release-and-deploy.md)).
  `og:image:type`, `og:image:width` (1200), `og:image:height` (630) and an `og:image:alt` / `twitter:image:alt`
  ("Simplify — QR code linking to simplify.whiz.coach") go with it.
- The card carries a QR code for https://simplify.whiz.coach/ **and** the address as readable text, so a screenshot of
  a preview is still scannable and typeable.
- The app name, the QR and the URL all sit inside the **middle 630×630 square**, because WhatsApp — the main way the
  link is shared — crops a preview to that square and discards the rest. Anything that must survive goes inside it.

### The `?v=` cache-buster

Scrapers (WhatsApp, Facebook, X) cache the card by its full URL. Whenever the card is redrawn, bump `?v=` in **both**
`og:image` and `twitter:image`, or they keep showing the old picture. Then run `node tools/stamp.mjs`, as for any
change under `public/`.

## The printable poster

`public/img/qr-poster.png` (1000×1240) is a standalone QR for printed handouts or posters: a title, a tagline, the QR
and the URL printed beneath it. Its title and tagline still read "Can I afford it?" / "Check if you have enough money
to buy what you want." (`TITLE` and `TAGLINE` in `tools/make-qr.py`), from when the app was one money tool; change them
there and re-run to redraw it.

## Drawing both: `tools/make-qr.py`

Both images are generated offline — no third-party QR service — with `segno` (the QR) and `Pillow`:

```sh
python3 -m pip install segno pillow
python3 tools/make-qr.py
```

The script's constants hold the URL (`URL`, `URL_LABEL`), the app name and the poster's words. It looks for macOS
system fonts (Arial, Helvetica, SF) and falls back to Pillow's plain default font elsewhere, so run it on a Mac to
get the published look. Re-run it after changing the URL or wording, then bump `?v=` (for the card) and run `node tools/stamp.mjs`.

## Making the platforms re-read the card

After changing the card or `og:image`, clear the scrapers' caches: re-scrape the URL in the
[Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/) and check it in the
[X Card Validator](https://cards-dev.twitter.com/validator).
