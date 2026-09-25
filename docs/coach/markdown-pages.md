---
type: Product Contract
title: Markdown Pages
description: The exact markdown subset a class page may use (headings, lines, bold and italic, lists, shelf pictures and videos, YouTube cards, link buttons, --- screens), what happens to anything else, the limits, and how public/js/class-markdown.js is the one parser shared by the learner reader, the coach preview and the Cloud Functions.
tags: [markdown, class-page, youtube, link-buttons, parser, screens, text-nodes]
status: stable
---

A class has one published page at a time, written in a small markdown subset and shown to learners one screen at a time. This document owns that subset and the module that reads it, `public/js/class-markdown.js`. How learners read the page (Back and Next, "Updated …", offline copies) is in [My class](/learner/my-class.md), and how coaches write it is in [the coach app](/coach/coach-app.md).

## One parser for everyone

`public/js/class-markdown.js` is the only definition of the subset. It has no imports and touches no DOM until `renderScreen()` is called, so the same file runs in the browser and in Node. It has three users:

| User | How it gets the file |
|---|---|
| The learner reader, `public/js/tools/my-class.js` (and `public/js/class-data.js`, which uses `pageMedia` to know which files to cache) | a normal import |
| The coach preview, `public/coach/js/preview.js` | `import("/js/class-markdown.js")` from the same origin, styled by `/css/tools/my-class.css` |
| The Cloud Functions, `functions/check.js` | `functions/class-markdown.js`, a **byte-identical copy** |

Functions deploy from `functions/` alone, so the copy is kept by `tools/copy-class-markdown.mjs`:

- `node tools/copy-class-markdown.mjs` copies the file. `firebase.json` runs it as the functions `predeploy` step, so a deploy always ships the current parser.
- `node tools/copy-class-markdown.mjs --check` exits 1 if the copy is missing or differs by one byte. `tools/test-functions.mjs` runs it first.

Never edit `functions/class-markdown.js` by hand. Edit the public file and copy it.

## The subset

| Write | Learners see |
|---|---|
| `# Title` | a big heading (`h2.cm-h1`) |
| `## Heading` (and `###` to `######`, which count as `##`) | a smaller heading (`h3.cm-h2`) |
| a line of text | its own paragraph. **Every line is its own paragraph**: learners see the lines exactly as typed, and blank lines only space the source |
| `**bold**`, `*italic*`, `***both***` | the same, inside any line |
| `- item` (also `*`, `+`, `•`) or `1. item` (also `1)`) | a list with big bullets or numbers, one level, keeping its starting number |
| `![words](pictures/<id>.jpg)` | a picture from the class's shelf, full width; the words are its alt text |
| `![words](videos/<id>.mp4)` | an approved video from the class's shelf, never autoplaying (see [videos](/coach/videos.md#what-learners-get)) |
| a YouTube link alone on its line, `[words](URL)` or just the URL | a YouTube card (see below) |
| `[words](https://…)` | one big button naming the site |
| `---` (also `***`, `___`, `- - -`) | the next screen |

How the details work:

- **Headings**: `#hashtag` (no space) is not a heading, and a closing run of `#` after a space is dropped.
- **Emphasis**: a run of stars opens only before a non-space and closes only after one, and it closes the nearest open run of the same length. So `2 * 3` stays as typed, and an unpaired `**` is just two stars. Underscores are never emphasis.
- **Lists**: an indented `  - item` is just another item, because lists have one level. A list item that is only a link, picture or video becomes that block. A heading or list item with a picture, video or link inside shows the text first and the block after it. When a numbered item has a block inside, the list pauses for that block and then carries on counting. Otherwise each list starts at the number written first.
- **Pictures and videos**: the target must be exactly `pictures/<id>.jpg` or `videos/<id>.mp4` (id: letters, digits, `_`, `-`). Pictures are always `.jpg` and videos always `.mp4`. A picture inside a paragraph splits the paragraph at that point. Any other image (`![x](https://…)`, `![x](videos/a.jpg)`) **shows nothing at all**. A picture or video whose id is not on the class's shelf (or a video not yet approved) also shows nothing, because the renderer's `mediaUrl` returns `null` for it.
- **Link buttons**: https only, with no user name or password in the address (`https://bank.example@evil.example` is refused), and at most 2,048 characters. The button shows the words with the site's host under them, or just the host (without `www.`) if there are no words. It opens only on a tap, in a new tab, with `rel="noopener noreferrer"`. A link inside a sentence keeps its words in the sentence, and the button comes after that paragraph. `http://` links and other schemes are not buttons: their words stay as text. A bare `www.…` line becomes an https button.
- **A line made only of links, pictures and videos** (and spaces) is those blocks, one after another.
- **Screens**: a page with no text has no screens, and empty screens are dropped.

## YouTube

A YouTube link **alone on its line** (as `[words](URL)`, a bare URL, or a list item that is only the link) becomes a card, not a button. `youtubeId()` accepts:

- `youtu.be/<id>`
- `youtube.com/watch?v=<id>`
- `youtube.com/shorts/<id>`
- `youtube.com/embed/<id>`
- `youtube-nocookie.com/embed/<id>`

each with or without `www.` or `m.`, over `https`, `http` or no scheme, with no port, credentials or spaces, and with an id of exactly 11 characters from `A–Z a–z 0–9 _ -`. Channels, playlists, `/live/` links and `music.youtube.com` are not videos to the parser. A YouTube link inside a sentence is an ordinary link button to YouTube's site, not a card.

The coach app's **YouTube** button (`public/coach/js/youtube.js`, with `youtubeId` in `public/coach/js/edit.js`) is more forgiving about what is pasted: it also takes `/live/`, `/v/` and the `music.` host. It always writes the canonical line `[words](https://youtu.be/<id>)`, which the parser reads as a card. It says "Public and unlisted videos play; private ones don't", because that is YouTube's rule.

On the learner's screen:

- The card reads the words (or "Video") and "Watch on YouTube (needs the internet)". **Nothing is loaded from YouTube until it is tapped.** Tapped while offline, it says "No internet now. Try again with the internet." and loads nothing.
- On a tap, the card is replaced by an iframe of `youtubeEmbed(id)`, which is `https://www.youtube-nocookie.com/embed/<id>?rel=0&playsinline=1`: the privacy-enhanced player, related videos limited to the same channel, playing in the page. It has `allow="encrypted-media; picture-in-picture; fullscreen"`.
- The iframe carries `referrerpolicy="strict-origin-when-cross-origin"`. The site's own `Referrer-Policy` is `no-referrer`, and YouTube refuses a player that arrives with no referrer (Error 153), so this one frame sends the site's origin. The CSP side (`frame-src https://www.youtube-nocookie.com`) is in [security](/platform/security.md).
- Only the id is ever used. The player's address is always built by `youtubeEmbed`, never taken from the page.

## Anything else

Anything outside the subset is **shown as the plain text it is**: HTML tags, tables, code fences, `>` quotes, underscores, footnotes. Nothing is ever HTML. `renderScreen` builds elements with `createElement` and sets `textContent`, and runs become text nodes wrapped in `<strong>`/`<em>`. A page cannot run a script, and it loads nothing except what `mediaUrl()` hands it (and YouTube's player after a tap). Pages the AI writes go through a stricter check before a coach sees them (no HTML, only shelf media, only links the coach gave): see [Write with AI](/coach/ai-helper.md#what-the-function-checks).

## Limits

| Limit | Value | Enforced by |
|---|---|---|
| Page markdown | 20,000 characters | the editor (`MAX_MARKDOWN`), `firestore.rules` (`pages` and `latest`), `writePage` |
| Page name | 80 characters | the editor, `firestore.rules`, `cleanTitle` in `functions/check.js` |
| Link address | 2,048 characters (longer stays text) | `MAX_URL` in the parser |
| Words of a link, picture or video | 300 characters in the parser; the coach app writes at most 80 (`cleanWords`) | `MAX_WORDS` |
| Picture and video ids | 1–128 characters in the parser; the rules and functions only ever create 1–40 | `MEDIA_PATH`, `isId`, `cleanId` |

## The module's API

- `parseClassMarkdown(text)` returns `{ screens: [[block, …], …] }`. It is pure. The block types are `heading` (`level` 1 or 2, `inline`), `paragraph`, `list` (`ordered`, `start`, `items`), `picture` and `video` (`id`, `words`), `link` (`url`, `host`, `words`) and `youtube` (`id`, `words`). `inline` is `[{ text, bold, italic }]`.
- `renderScreen(screen, { mediaUrl, doc })` returns a `DocumentFragment` of `cm-*` elements, styled by `css/tools/my-class.css` inside any `.class-page`. `mediaUrl(kind, id)` returns the URL to show or `null`. The learner reader passes cached `blob:` URLs, and the coach preview passes Storage URLs for shelf items only.
- `pageMedia(page)` returns every picture and video once, in order.
- The module also exports `plainText(inline)`, `youtubeId(link)` and `youtubeEmbed(id)`.

The scanner runs in linear time and never looks more than 2,048 characters ahead, so no page can make it slow.

## Tests

`node tools/test-class.mjs` covers the parser block by block (and `pageMedia`, `youtubeId`, `youtubeEmbed`). `node tools/smoke.mjs my-class` renders it in real Chrome. `tools/test-functions.mjs` checks the copy and the helper's page check.
