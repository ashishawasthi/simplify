---
type: System Reference
title: Pictures
description: The bundled picture set the daily-life tools use — public/js/pictures.js as the one list (ids, files, words, groups), the menu icons kept out of the picker, Noto Emoji (Apache-2.0) versus our own drawings of Singapore things, rebuilding with make-pictures.mjs, the safety and licence checks in test-pictures.mjs, the shared picture picker, and how to add a picture.
tags: [pictures, svg, noto-emoji, licence, picture-picker, make-pictures, safety]
status: stable
---

Now and next, My day, I need, Show a card, Wait's "While I wait" and Steps draw their pictures from one bundled set of
SVG files in `public/img/pic/`, so a card looks the same on every Android phone and iPad (emoji do not), works
offline, and stays same-origin under the CSP. The money tools' notes and coins are drawn separately, in
`public/js/currency-data.js` (see [money tools](/learner/money-tools.md#the-currency-drawings)).

## The list: `public/js/pictures.js`

The one list of pictures. Each entry, made with `pic(id, words, group, file = id)`:

| Field | Meaning |
|---|---|
| `id` | Stable forever — saved cards (Now and next, Wait) keep it, and tools pick their own cards by id |
| `file` | `<file>.svg` under `/img/pic/`; two ids share a file when they are the same picture (`drink-water`/`water`, `wait`/`more-time`, `wash-hands`/`rinse`, `card-reader`/`tap-card`) |
| `words` | Its default label: plain Singapore English, 1–3 literal words |
| `group` | Its section in the picker (`PICTURE_GROUPS`): **My day** (`day`), **I need** (`need`), **Going out** (`out`), **Steps** (`steps`); a picture in two groups is listed once, under the first |

Today: **84 pictures** in 80 files (45 My day, 11 I need, 15 Going out, 13 Steps), plus 8 menu icons, in **86 SVG
files** (59 from Noto Emoji, 27 our own, 12 of those built around Noto parts), about 344 KB in all.

Exports: `PICTURES`, `PICTURE_GROUPS`, `NOTO_FILES` (our file → its upstream Noto file), `MENU_ICONS`,
`pictureSrc(id)`, `menuIconSrc(id)` and `pictureImg(id, { alt })` (an `<img>` element). Lookups use `Object.hasOwn`,
so an id such as `toString` finds nothing.

## Menu icons

`MENU_ICONS` maps each menu tool and group heading (ids from `public/js/tools.js`) to a file. They are **not** in
`PICTURES`, so the picker never offers them as cards; menu-only files are named `menu-*.svg`. `app.js` fills each
`[data-menu-icon]` slot on the menu from `menuIconSrc`, and the set-up page uses the same icons.

## Where the files come from

- **Noto Emoji** by Google, release **v2.051** (`NOTO_TAG`, pinned to commit `NOTO_COMMIT` in
  `tools/make-pictures.mjs`), whose `svg/` folder is licensed **Apache-2.0** (only the fonts are OFL). Minified
  losslessly — Illustrator leftovers dropped, no number rounded — so each renders pixel for pixel as upstream.
- **Our own drawings** (`DRAWINGS` in `tools/make-pictures.mjs`) of the Singapore things Noto has no picture of — an
  HDB block for home, MRT train, bus (with the stop bell), travel card, card reader, paying by QR, hawker stall, kopi,
  food tray, tray return (and its halal side, marked green), a recess lunch box — plus the tablet, a glass of water,
  too loud, therapy, and the Steps pictures (the tap on and off, the reader's green tick, a plain bank card). Some are
  built around Noto parts (hands, faces, an apple, a spoon, bubbles).
- The drawings follow Noto's look: a 128×128 box, flat colours with one darker shade and one highlight, rounded
  shapes, no outlines, readable at 48 px and 200 px. **Generic, never an operator's or a brand's design**: no logo,
  livery or card artwork, and no lettering except a bus route number drawn as LED segments. This is the same rule as
  the money drawings; see [design principles](/product/design-principles.md).

## Licence

Apache-2.0 requires the licence to travel with the files and changed files to say so. Every file with Noto in it
starts with a comment naming its upstream file(s) and what was changed; `public/img/pic/LICENSE.txt` (served beside
them; not precached, as no device needs it offline) carries the copyright line, the changes, the file list and the licence text; the repository's
notice is `THIRD_PARTY_NOTICES.md`, which must name every Noto file used.

## Rebuilding: `tools/make-pictures.mjs`

```sh
node tools/make-pictures.mjs            # every file, and LICENSE.txt
node tools/make-pictures.mjs bus kopi   # only these (names without .svg)
node tools/test-pictures.mjs            # always afterwards
```

Noto files are downloaded once from the pinned commit and cached in the system temp folder, so a re-run needs no
network. To update Noto: change `NOTO_TAG` / `NOTO_COMMIT` to a release whose `svg/LICENSE` is still Apache-2.0, run
the script, look at every picture again, run the test, and `node tools/stamp.mjs`.

## Checks: `tools/test-pictures.mjs`

- The list against the folder: every required id is present and in its group, every entry's file exists, every file
  is used, names are `<kebab>.svg`, menu-only icons are `menu-*.svg` and never in the picker.
- **Safety**: each file is a well-formed `<svg>` with `viewBox="0 0 128 128"` whose references resolve, and contains
  nothing that could run or load — only known elements and attributes, each value of its kind (no scripts, event
  handlers, processing instructions, styles, external or escaped `url()`). The checker must refuse **35 planted bad
  files** and pass a clean one, so a weakened check fails too.
- **Size**: each picture at most 16 KB; the folder at most 500 KB.
- **Licence**: the Noto comment in each file, `LICENSE.txt` and `THIRD_PARTY_NOTICES.md`.

## The picture picker

`pickPicture({ title, allowWords = true, current })` in `public/js/picture-picker.js`: a full-screen sheet in the same
look as the notes-and-coins picker, built the first time it opens, with the pictures in their groups and a words box.

- Resolves to `{ picture, words }` — `picture` an id or null, `words` "" or up to 40 characters — or `null` for ✕,
  Esc, or Done with nothing picked and nothing typed ("nothing changes", never an error).
- Tapping a picture fills in its own words only when the box is empty or still holds the last picture's words, so
  nothing somebody typed is overwritten. Tapping the picked picture again un-picks it.
- `allowWords: false` offers pictures only. `closePicturePicker()` ends a pick as ✕ does; the shell calls it on every
  change of screen, so a pick never outlives the screen that asked for it.

## Adding a picture

1. Add the drawing to `DRAWINGS` in `tools/make-pictures.mjs` (or a Noto file to `NOTO_FILES`), and its entry to
   `PICTURES` in the right group.
2. `node tools/make-pictures.mjs <name>`, then `node tools/test-pictures.mjs`.
3. `node tools/stamp.mjs`, which adds the file to `ASSETS` in `public/sw.js` (`node tools/test-assets.mjs` catches a
   forgotten run) — see [offline and updates](/platform/offline-and-updates.md).

## The logo

The favicon and the home-screen icons are Noto's Seedling (🌱, U+1F331), from the same pinned release as the picture
set, so the app's icon looks the same on every device. `node tools/make-icons.mjs` rebuilds `public/favicon.svg` and
the four PNGs in `public/img/icons/` (the maskable one keeps the seedling inside the circle Android may crop to);
run `node tools/stamp.mjs` afterwards.
