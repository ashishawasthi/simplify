---
type: Operations Runbook
title: Guide Videos and the Video Renderer
description: The video renderer in video/ end to end — how it films the real app over the DevTools protocol (screencast, a finger's taps and typing), the stage that composes each frame (phone frame, camera, tap rings, captions, chapter cards, swipes, progress bar) at 30 fps, the voice (Chirp 3 HD) and code-made music, the storyboards for the three guide videos, the commands, the Cloud Run job simplify-video and its image, the public guide-videos bucket and how the guides load from it, what it costs, and troubleshooting.
tags: [video, guide-videos, video-renderer, cloud-run, devtools-protocol, ffmpeg, text-to-speech, storage, runbook]
status: stable
---

The renderer in `video/` makes two kinds of video from the real app, never from a model:

- **three guide videos**, about 45 seconds each, shown in "Watch" folds on the learner guide and the coach guide;
- **page videos**, which coaches make of their own class pages ([videos](/coach/videos.md)).

Both come from `renderBoard()` in `video/render.mjs`. It needs Node 22, Chrome and ffmpeg, and nothing from npm. This document owns how it works, how to run it locally and on Cloud Run, and where its guide videos live. The cloud resources are listed in [cloud project](/operations/cloud-project.md#the-video-renderer).

## How a video is made

A **storyboard** says what to film: an intro card, chapters of shots, and an end card. Each shot has a title, a caption line, an icon, a spoken line (`say`, by default the caption) and what to do in the app (`shot`: `{ path, prep, expect, steps }`). The renderer then:

1. **Films every shot in the real app.** `video/lib/chrome.mjs` starts headless Chrome and serves `public/` itself (with clean URLs); `video/lib/record.mjs` drives the page over the DevTools protocol at a phone's size (375 × 812 at twice the pixels; the coach video 390 × 844). `prep` sets the starting state out of sight, `expect` waits for it, and then the steps run the way a finger would: `tap`, `type` (one character at a time), `hold` (a press-and-hold), `focus`, `scroll`, `wait`, `until`, `js`, and `overlay` (marks over a picture). Chrome's own screencast (`Page.startScreencast`, JPEG) films it. Nothing is drawn over the app while filming: the recording is what the shipped markup does, and each step is noted as an event (where and when a tap was).
2. **Speaks each line.** `video/lib/voice.mjs` sends it to Cloud Text-to-Speech in the app's own voice (`en-IN-Chirp3-HD-Erinome`, from `tools/make-voice.mjs`), at rate 1.0 — the app speaks a little slower for noisy places, but a video can be replayed. A take that ends cut off is retaken (up to 4 times), leading and trailing silence is trimmed, and each line is cached by its text in `video/.cache/voice`, so a re-render only pays for lines that changed. A line's length sets how long its shot lasts (at least 1.8 s); a long recording plays up to 2.8 times faster to fit.
3. **Makes the music.** `video/lib/music.mjs` writes it in code, so there is no licence to worry about: a soft four-chord loop (C – Am – F – G) at 92 beats a minute — a plucked arpeggio, a warm pad and a quiet bass — exactly as long as the video, fading in and out. It is calm on purpose, as the [design principles](/product/design-principles.md) ask.
4. **Draws every frame on a stage.** `video/stage/` (`index.html`, `stage.css`, `stage.js`) is a 720 × 1280 page with a branded background, the phone frame with the recording inside it, a camera that eases towards the last tap or focus, a ring where a finger taps (a filling ring while it holds), the caption band (title and line), chapter, intro and end cards, a swipe from one shot to the next (none between screens of the same page), and a progress bar. `renderAt(t)` sets everything for time `t` alone — nothing animates by itself — so the renderer steps it frame by frame at **30 fps**, captures each frame as a JPEG and pipes it into ffmpeg. The result is the same on every run, however fast the machine.
5. **Encodes.** ffmpeg mixes the voice track over the music, which ducks under the voice (a sidechain compressor) and passes a limiter, and writes H.264 (CRF 21, `yuv420p`, `+faststart`) with AAC at 128 kb/s: a **720 × 1280 portrait** MP4, 4–7 MB for a guide video, plus a JPEG poster taken from the first shot.

Marks over a picture are drawn by the same `overlaySvg()` the coach app uses (`public/coach/js/overlay.js`), so the stage never draws anything a model wrote.

## The storyboards

`video/storyboards/`, one module per guide video:

| Video | Shots |
|---|---|
| `learner-basics` | the menu; Can I buy?, What is the change?, Next dollar, Make the amount; Now and next, Wait, Steps; I need, Show a card; Stop and check |
| `learner-more` | open set-up (press and hold), Show on the menu, tucked away; join a class, the My class page; count your notes, Show me, the shopping list, Next note; Time sums |
| `coach` | sign in, About you, make a class, the QR poster; write, pictures, a picture in the page, Write with AI, publish |

The learner boards start from the same helpers and states as the guide screenshots (`HELPERS`, `MORNING`, `CLASS` … exported from `tools/guide-scenes.mjs`), so a change that breaks a guide scene breaks its shot too. The coach board films the real coach app against the **in-memory stand-in** for `public/coach/js/cloud.js` (`STUBS` from `tools/smoke/coach.mjs`, served through DevTools request interception, with the service worker removed), seeded like the coach guide's screenshots (`klass`, `pictures`, `HANDS` … from `tools/shoot-coach-guide.mjs`): no sign-in, network or emulator. Its shelf plays `functions/test/sample.mp4`, which is why the job's image carries that one file from `functions/`.

## Commands

```sh
node video/render.mjs learner-basics             # → video/out/learner-basics.mp4 and .jpg
node video/render.mjs all                        # all three
node video/render.mjs all --upload               # and put them in the public bucket
VIDEO_SHOTS=3 node video/render.mjs coach        # only the first three shots, for a quick look
node video/render.mjs page --local spec.json     # try a page video (below)
```

It needs Node 22, Chrome (`CHROME=<path>` for another binary; the default is the macOS app, then `/usr/bin/chromium`), ffmpeg, and `gcloud auth login` for the voice (the token of `gcloud auth print-access-token`, billed to `simplify-special`). Outputs go to `video/out/` and the voice cache to `video/.cache/`, both ignored by git (`video/.gitignore`); `VIDEO_OUT` and `VIDEO_CACHE` move them. `--upload` writes to `GUIDE_VIDEO_BUCKET` (default `simplify-guide-videos`).

Remake the guide videos whenever the screens they show change, and only after the change is tested — the same rule as the guide's screenshots ([release and deploy](/operations/release-and-deploy.md#the-guide-comes-after-testing)).

### Trying a page video

`node video/render.mjs page --local spec.json` makes a page video from a file, with no Firestore or Storage, into `video/out/page-local.mp4`:

```json
{
  "classCode": "K7M3RQP9T", "className": "3 Kindness", "title": "Washing my hands",
  "markdown": "# Washing my hands\n![The tap](pictures/tap1.jpg)\nTurn on the tap.\n---\nAll done.",
  "readAloud": true, "music": true,
  "overlays": { "tap1": [{ "type": "arrow", "from": [900, 120], "to": [560, 330] }] },
  "pictureFiles": { "tap1": "tap.jpg" }
}
```

A picture file's path is from the spec's folder. What a coach's run does differently (reading the video document, uploading the draft, marking it ready) is in [videos](/coach/videos.md#what-the-renderer-does).

## The Cloud Run job

One job, **`simplify-video`**, in `asia-southeast1`: 2 CPU, 4 GiB, one task, a 30-minute task timeout and **no retries** (a run is not repeated behind anyone's back). It runs as `simplify-video@simplify-special.iam.gserviceaccount.com`, which may write only what the renderer writes ([cloud project](/operations/cloud-project.md#the-video-renderer)). It has two uses:

- `makeVideo` starts it with the arguments `page <classCode> <videoId>` for each page video ([videos](/coach/videos.md#2-make));
- the owner runs it with `all --upload` (the image's default) to remake the guide videos with Android's fonts.

The image is `asia-southeast1-docker.pkg.dev/simplify-special/simplify/video:latest` in the Artifact Registry repository `simplify`. `video/Dockerfile` is `node:22-bookworm-slim` with Chromium, ffmpeg and the fonts a learner's Android phone draws with: `fonts-roboto` (Android's own), `fonts-noto-core`, `fonts-noto-cjk` (for the full-width ＋ the app's buttons use) and `fonts-noto-color-emoji`, with `video/fonts.conf` making `system-ui` and `sans-serif` Roboto. It copies `public/`, `tools/`, `video/` and `functions/test/sample.mp4`; `.gcloudignore` keeps the upload to exactly those. Build it from the repository root:

```sh
gcloud builds submit --config video/cloudbuild.yaml . --project simplify-special
gcloud run jobs update simplify-video --region asia-southeast1 --project simplify-special \
  --image asia-southeast1-docker.pkg.dev/simplify-special/simplify/video:latest
```

The second command makes the job use the image just built (a job keeps the image it was given until updated). **Rebuild it whenever `video/` changes, or anything the renderer films or uses**: the learner reader (`public/js/class-markdown.js`, My class and its CSS), `public/coach/js/overlay.js`, the guide scenes, the coach app and its stand-in, or `tools/make-voice.mjs`. Otherwise page videos show the old reader. No workflow builds it: CI deploys the functions and the website, not this image.

Remaking the guide videos on the job (after rebuilding the image, since it films its own copy of the app; `--args=coach,--upload` for one):

```sh
gcloud run jobs execute simplify-video --region asia-southeast1 --project simplify-special --args=all,--upload --wait
```

## The guide-videos bucket

`gs://simplify-guide-videos`, `asia-southeast1`, uniform access, **public to read** (`allUsers` has `roles/storage.objectViewer`). It holds only `learner-basics`, `learner-more` and `coach`, each as `.mp4` and `.jpg` poster, uploaded with `Cache-Control: public, max-age=3600`, so a remade video reaches everyone within the hour. Nothing else goes in it — never a class's file, which stays in the private class bucket. The videos are at `https://storage.googleapis.com/simplify-guide-videos/<name>.mp4`.

**How the guides load them.** The learner guide (`public/guide.html`) has two folds under its title, "▶ Watch: the basics" and "▶ Watch: set-up and more", and the coach guide (`public/coach/guide.html`) one, "▶ Watch: the coach app" (`<details class="tour">`, with the video's length). In both guides, each `<video>` holds its addresses only as `data-src` and `data-poster`, with `preload="none"`, and `public/js/guide-video.js` sets `src` and `poster` only when its fold is opened, and pauses it when closed: **nothing is fetched from Google until someone taps Watch**, so reading the learner guide still asks nobody else for anything. Both CSPs allow the guide-videos bucket only, `https://storage.googleapis.com/simplify-guide-videos/`, in `img-src` and `media-src` ([security](/platform/security.md#headers)).md#headers)). The videos are online only: the service worker never precaches them ([offline and updates](/platform/offline-and-updates.md#the-guide-videos)).

## Costs

| What | Cost |
|---|---|
| A page video on the job | about **US$0.01** of Cloud Run (2 CPU and 4 GiB for a minute or two), plus the voice below |
| The voice | Chirp 3 HD, list price US$30 per million characters (after any monthly free allowance): a page of 1,000 characters about US$0.03. A page is cut at 20 screens of at most 600 characters, so at most about US$0.36. The job's voice cache lasts only for its run |
| Remaking the three guide videos | a few cents (their lines are short) |
| The guide bucket | a few tens of MB stored; each full view downloads 4–7 MB from Google, about a tenth of a US cent |

The budget and the monthly limits are in [costs and limits](/operations/costs-and-limits.md).

## Troubleshooting

| What you see | Why, and what to do |
|---|---|
| A box (tofu) instead of ＋ in a video from the job | The app's ＋ is full-width (U+FF0B), which Roboto and Noto Sans don't have; `fonts-noto-cjk` does. Keep it in the Dockerfile |
| Emoji and letters look like a Mac's in a local render | Local Chrome draws with the machine's own fonts. Make the published guide videos on the job, whose fonts match Android |
| `no access token from gcloud auth print-access-token` | Sign in locally with `gcloud auth login` |
| `Text-to-Speech 403` on the job | The job's account needs `roles/serviceusage.serviceUsageConsumer` (the voice is billed to the project) and the Text-to-Speech API on |
| A shot never starts (its `expect` stays false) or `no element for …` | The app changed under the storyboard. Run the guide screenshots and smoke tests; fix the scene or the step. `VIDEO_SHOTS=3` films only the first few |
| The coach video fails in the image without `functions/test/sample.mp4` | The stand-in's video shelf plays it; `.gcloudignore` and the Dockerfile keep that one file |
| Chrome will not start in the container | It runs as root there, so `chrome.mjs` adds `--no-sandbox` for root only |
| A page video stays "Being made" | `checkVideo` fails it within 30 minutes. Meanwhile: `gcloud run jobs executions list --job simplify-video --region asia-southeast1` and `gcloud logging read 'resource.type="cloud_run_job" AND resource.labels.job_name="simplify-video"' --limit 50` |
| The log says "not marked ready … the video changed meanwhile" | The video document changed after the job read it (discarded, or given up on); the draft is not used |
| `makeVideo` says "The video could not be started" | The functions' account lacks `roles/run.developer` on the job or `roles/iam.serviceAccountUser` on `simplify-video@`, or the job does not exist ([cloud project](/operations/cloud-project.md#the-video-renderer)) |
