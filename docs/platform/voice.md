---
type: System Reference
title: The Recorded Voice
description: How Speak sounds — every fixed sentence a card can say is a pre-recorded MP3 clip in one Google Cloud Chirp 3 HD voice (en-GB-Chirp3-HD-Erinome; there is no en-SG Chirp 3 HD voice), kept on the device by the service worker, with the device's own speechSynthesis voice only for typed words; which sentences get clips, tools/make-voice.mjs (hash-named clips, retakes of cut-off takes, the map and sw.js list it writes), say-aloud.js's playback rules, the tests, sizes and costs.
tags: [speech, voice, speak, tts, chirp, clips, audio, offline, say-aloud]
status: stable
---

Speak on a full-screen card ([Show a card](/learner/show-card.md#the-full-screen-card), used by
[I need](/learner/i-need.md) too) plays a **recorded voice**: one clear voice for every fixed sentence, the same on
every phone and iPad, online or not. Words nobody could record in advance — a stop name, words typed into I want — are
read by the device's own voice. This document owns the clips, the generator that makes them and the playback in
`public/js/say-aloud.js`.

## The voice

`VOICE` in `tools/make-voice.mjs` is the one place the voice is named: **`en-GB-Chirp3-HD-Erinome`**, a female Chirp 3
HD voice Google describes as clear, at pace `RATE` 0.9 (a little slower, for a noisy bus or canteen — the same pace
the device's voice is asked for).

Singapore English was the aim, but **Google has no `en-SG` Chirp 3 HD voice**: checked on 2026-09-24 against the
Text-to-Speech API's voice list (English voices exist for en-AU, en-GB, en-IN and en-US only; asking for
`en-SG-Chirp3-HD-Erinome` is refused as "does not exist", and the locale-free `Erinome` refuses `en-SG`) and against
the Chirp 3 HD language table. British English is the nearest — it is also where say-aloud.js falls back for the
device's own voice when a phone has no Singapore voice. To change the voice, edit `VOICE` and run the generator: every
clip is recorded again.

## Which sentences have a clip

`phrases()` in the generator collects them from the tools' own modules, never from a copy, so a reworded card shows up
in the next run and in `node tools/test-voice.mjs` until then:

| From | Sentences |
|---|---|
| `i-need-cards.js` `CARDS` | every card's `sentence` ("I need help" … "I am all done") |
| `hurtsSentence()` × `REGIONS` × `SIZES` | all 36 Hurts answers, My back included ("It hurts here: tummy. A lot.") |
| `wantSentence()` × `pictures.js` `PICTURES` | "I want: <words>" for every picture's own words, which is what I want shows unless words are typed |
| `show-card-cards.js` `cardFor()` | the six cards' words, LTA's three exactly |
| `cardLines("please", …)` × `DISCLOSURES` | the two optional second lines ("I have a hidden disability.", "I am autistic.") |

That is 137 sentences, 137 clips. A stop name, typed I want words, a card opened by code with other words, and any
part in another language have no clip.

## The clips and the map

- **Files:** `public/audio/voice/<12 hex>.mp3`, the name the first 12 hex digits of a SHA-256 of the voice, the audio
  settings and the words sent. Re-running records only sentences that are new or changed, so it costs nothing when
  nothing changed; a clip no sentence names any more is deleted.
- **Words sent:** keyed by the words exactly as the card shows them, but the text sent may differ in punctuation and
  capitals only (`speechText()`): every sentence ends with a full stop (no rising end), and Hurts puts the place in a
  sentence of its own — "It hurts here. Ear. A lot." — because "here: ear" ran together into "here, here" when heard
  back. "I want: Stop" keeps its colon: without it, or with a comma, it came out as "I won't stop".
- **Audio:** asked for as LINEAR16 at 24 kHz, then encoded by ffmpeg (LAME) to MP3, 32 kbit/s mono, with the silence
  at the start cut to 50 ms (Chirp starts some takes with up to 0.8 s, which would feel like Speak not working). MP3
  plays on iOS Safari and Android Chrome. Clips run 0.9–4.7 s, about 9 KB each, **1.2 MB in all**.
- **Cut-off takes:** Chirp 3 HD now and then stops mid-word (about one take in four at this pace) and says a sentence a
  little differently each time. The generator measures the last 100 ms of each take and asks again, up to 6 times,
  while speech is still going at the very end (louder than -35 dB), keeping the take that ends quietest — with a
  warning if none ended cleanly. A clip that sounds wrong for any other reason: delete its file and run again.
- **The map:** `public/js/voice-clips.js`, written by the generator (its header says so — never edit it by hand):
  `VOICE` and `CLIPS`, a frozen object from the on-screen sentence to its clip's URL.
- **Offline:** the generator writes the clip list into `ASSETS` in `public/sw.js`, between the `>>> the recorded
  voice` and `<<< the recorded voice` comment lines, so every device keeps every clip (see
  [offline and updates](/platform/offline-and-updates.md)). An `<audio>` element asks for a byte range; the worker
  answers from the cache with that range (`206`), which Safari needs in order to play. Hosting serves `.mp3` with
  `max-age=3600`, like the pictures, so a release only revalidates them.

```sh
node tools/make-voice.mjs           # record what is missing, delete orphans, write the map and sw.js's list
node tools/make-voice.mjs --check   # no network, no changes: exit 1 if anything is out of date
```

It needs Node 22, ffmpeg with LAME, and `gcloud auth login` with an account that may use Cloud Text-to-Speech on
`simplify-special` (the API is enabled there; requests carry `X-Goog-User-Project: simplify-special`). After a run that
changed anything: `node tools/test-voice.mjs`, `node tools/test-assets.mjs`, and bump `CACHE` in `public/sw.js`.

## Playback: say-aloud.js

`say(text | [{ text, lang }])`, `stop()` and `canSpeak(what?)`, called straight from a tap.

- Each part is looked up by its words, spaces tidied (`CLIPS` keys are tidy too). An English part with a clip plays
  it; any other part is read by `speechSynthesis` with the voice rules in
  [Show a card › Speech](/learner/show-card.md#speech). **One part is never half clip, half device voice.**
- Parts play **one after another** on one `<audio>` element (iOS lets an element that a tap started play again
  later); consecutive device-voice parts are queued together, as before.
- When a device-voice part comes after a clip (a stop name under LTA's words), an empty utterance wakes speech inside
  the tap; when a clip comes after a device-voice part, that clip is started muted inside the tap and paused until its
  turn. So a phone that only lets sound start from a tap still plays the whole card.
- A clip that can't play (not yet downloaded, an error) is read by the device's voice instead.
- `stop()` cuts off both, and runs when the card closes, the screen changes or the app goes to the background.
- `canSpeak()` is true when there are clips (and `Audio`) or `speechSynthesis`; `canSpeak(what)` is true when at least
  one part of `what` can be said here. The card shows Speak only when the device's `speak` setting is on and
  `canSpeak(its words and lines)`.

## Tests

- `node tools/test-voice.mjs` — every sentence the tools can show has a clip and nothing else does; every clip file is
  in the map and every entry has a file; keys are exactly the on-screen strings (checked against the tools' functions
  and a few literals); words sent differ only in punctuation and capitals; every clip is an MP3 under 40 KB and the set
  is under 2 MB; `plan()` gives the same answer twice; `voice-clips.js` and sw.js's list are what the generator would
  write. It needs no network or ffmpeg, so it runs on CI.
- `node tools/smoke.mjs shared i-need show-card` — with `HTMLMediaElement.prototype.play` stubbed to record the clip:
  Speak on an I need card, a Hurts answer, an I want picture and every Show a card card (with its second line) plays
  its clip and nothing through `speechSynthesis`; typed I want words and a stop name go to `speechSynthesis`; clip then
  voice and voice then clip in order; a failing clip falls back; `stop()` pauses; another language never plays an
  English clip; with no `speechSynthesis` the clips still play.

## The listen check (2026-09-24)

No one could listen, so every clip was checked two ways. **Durations** (ffprobe): 0.86–4.7 s, none out of line for
its words once leading silence was cut. **Heard back**: each clip transcribed by `gemini-3.7-flash` on Vertex AI
(`global`) with no context; a take heard wrong ("I won't stop", "It hurts here, here") was retaken until heard right,
and doubtful ones transcribed three times (the transcriber itself varies). What remains differs only as a listener
without context would guess — "Kopi" heard as "copy", "We are OK" as "okay", "I want: Shop" and "I want: Use soap"
with a "to" added — except **"I want: Halal side"**, heard as "hillside" in every take: the British voice's "halal"
is not Singapore's. That clip should be listened to by a person.

## Costs

Cloud Text-to-Speech bills Chirp 3 HD per character sent (list price 30 USD per million, after any monthly free
allowance). The 137 sentences are about 2,800 characters; with retakes a full recording sends about 4,000–5,000
(≈ 0.15 USD). A run that changes nothing sends nothing. Making and checking this first set, with experiments, sent
about 22,000 characters (≈ 0.70 USD at list price).
