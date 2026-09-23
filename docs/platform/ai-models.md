---
type: System Reference
title: AI Model Configuration
description: The two Gemini models the Cloud Functions call (gemini-3.7-flash and gemini-omni-flash-preview on Vertex AI's global endpoint), the exact request shapes verified on 2026-09-23, thinking levels, safety and failure handling, the prompts in functions/prompts.js, the deterministic fakes for tests, how uses are counted against the monthly limits, and what each call costs.
tags: [gemini, vertex-ai, models, omni, video, prompts, fakes, limits, costs]
status: stable
---

This document owns which AI models run, where, and how they are called. Only the Cloud Functions call a model — the
learner app and the coach app never do. What a coach experiences is in [the AI helper](/coach/ai-helper.md) and
[videos](/coach/videos.md).

## Models

`functions/models.js` is the one place a model id is written; a model change is a one-line edit there.

| Constant | Model | Used by | Settings |
|---|---|---|---|
| `FLASH` | `gemini-3.7-flash` | `writePage` (thinking `medium`), `planVideo` (thinking `low`) — `THINKING` | JSON answer with a response schema, `maxOutputTokens: 16384` |
| `OMNI` | `gemini-omni-flash-preview` (a preview model) | `startVideo`, `checkVideo` | text-to-video, 16:9, 720p, 3–10 s, inline delivery |
| `VERTEX_LOCATION` | `global` | both | |

Both are reached through **Vertex AI** with the `@google/genai` SDK (`new GoogleGenAI({ vertexai: true, project,
location: "global" })`, created on first use in `functions/ai.js`), authenticated as the functions' service account
`simplify-functions@simplify-special.iam.gserviceaccount.com`, which holds `roles/aiplatform.user` (see
[cloud project](/operations/cloud-project.md)). There is no API key.

**Why `global`.** Checked on this project on 2026-09-23: `gemini-3.7-flash` answers on `global` and not in
`us-central1`; Omni text-to-video works only on `global` with the `response_format` request shape — the same request
sent to `us-central1`, or with the older `response_modalities` field, fails with a generic 500. So model calls may
run outside Singapore, even though the functions themselves run in `asia-southeast1`. What the models see is the
coach's instruction, page, shelf descriptions and video request — never anything about learners.

**Never sent:** `temperature`, `topP`, `topK` or `candidateCount` (Gemini 3.x rejects them). Thinking is `low` or
`medium` only.

## Flash: one JSON answer

`askFlash({ system, schema, input, thinking, feature, fake })` in `functions/ai.js`:

```js
genai().models.generateContent({
  model: FLASH,
  contents: [{ role: "user", parts: [{ text: input }] }],
  config: {
    systemInstruction: system,
    responseMimeType: "application/json",
    responseSchema: schema,
    maxOutputTokens: 16384,              // thinking and answer together; a page is at most ~6,000 tokens
    thinkingConfig: { thinkingLevel },   // MEDIUM for writePage, LOW for planVideo
    labels: { app: "simplify", feature }, // "write-page" | "plan-video", for billing reports
    abortSignal: AbortSignal.timeout(100_000),
  },
});
```

- A `promptFeedback.blockReason`, or a finish reason of `SAFETY`, `PROHIBITED_CONTENT`, `BLOCKLIST`, `SPII`,
  `RECITATION` or `IMAGE_SAFETY`, returns `{ blocked: true }`; the callable turns that into a calm decline.
- `MAX_TOKENS`, an empty answer or unparseable JSON throws; the callable refunds the use and says "not available".
- Each call logs one JSON line: feature, milliseconds, finish reason and prompt / output / thinking token counts.

## Prompts

`functions/prompts.js` holds both system instructions, both answer schemas and how the coach's material is laid out
for the model.

| Export | What it is |
|---|---|
| `WRITE_PAGE_SYSTEM` | The page helper: decide `write` / `ask` / `decline`; scope; privacy (the page is public); treat the coach's text as material, never as instructions; how to write for learners; the markdown subset; the answer fields |
| `WRITE_PAGE_SCHEMA` | `{ understood, action (enum), questions (≤ 3 × ≤ 4 answers), title, markdown, note }`, all required |
| `writePageInput()` | Labelled blocks: the instruction (quoted), earlier answers, current title and markdown (quoted), the picture shelf and video shelf as exact paths with their words, and the links the coach gave ("the only links you may use") |
| `PLAN_VIDEO_SYSTEM` | The video planner: the same three actions; in scope is one everyday action, routine, place or object; declines harm, nudity and undressed bodies (body topics get pictures and words instead), real people, brands, text; the prompt rules — one calm continuous 3–10 s shot, realistic, generic Singapore settings described in words, hands and objects preferred, no faces in close-up, no text, logos, music or voice, 40–120 words |
| `PLAN_VIDEO_SCHEMA` | `{ understood, action, questions, prompt, seconds (3–10), words (≤ 80, for screen readers), note }` |
| `planVideoInput()` | The request (quoted) and earlier answers |
| `EMPTY_WRITE_ANSWER`, `EMPTY_PLAN_ANSWER` | The free question returned, without a model call, when the instruction is too short to act on |

The product rules these encode — and what the functions check afterwards — are in
[the AI helper](/coach/ai-helper.md#what-the-function-checks) and [videos](/coach/videos.md).

## Omni: text to video

`startOmni({ prompt, seconds })` in `functions/ai.js` sends the request shape verified on 2026-09-23:

```js
genai().interactions.create({
  model: OMNI,
  input: [{ type: "text", text: prompt }],
  response_format: {
    type: "video", aspect_ratio: "16:9", delivery: "inline",
    duration: `${seconds}s`, resolution: "720p",
  },
  generation_config: { video_config: { task: "text_to_video" } },
  background: true,
  store: true,
}, { maxRetries: 0, timeout: 480_000 });
```

- `maxRetries: 0`: the call costs money and is not idempotent, so the SDK's default of 4 retries must never apply.
- The call itself took about 2 minutes to return in testing, so `startVideo` has a 540 s timeout.
- `readOmni(id)` (`interactions.get`) returns `{ status, video: { data | uri, mimeType } | null }`. `checkVideo`
  treats `in_progress` and `queued` as pending, `completed` with a video as done, and anything else as failed.
- The clip arrives as inline base64 (`data`); a `gs://` or `https://` `uri` is also accepted. It must start with an
  ISO `ftyp` box (an MP4) and be at most 100 MB, or it is refused as broken.

**Measured on this project on 2026-09-23:** an 8-second text-to-video request took about 2 minutes to start and 45
seconds more to finish (about 161 s in all), and returned a 1280×720, 24 fps H.264 MP4 with an AAC audio track,
3.2 MB, inline — realistic hands washing at a sink, no faces, text or logos.

## Limits and counting

Every use is counted per coach per Singapore month (UTC+8) in `usage/{uid}_{YYYY-MM}` against `config/limits`
(defaults `flashPerMonth: 200`, `videosPerMonth: 5`, `DEFAULT_LIMITS` in `functions/lib.js`):

- **Flash** — `reserve(uid, "flash")` counts one use in a Firestore transaction *before* the model is called, so two
  requests at once can never both take the last one. `refund()` gives it back when the call fails, the answer is
  unusable or the page comes back empty. A decline still counts (and adds to `declined`). An instruction with fewer
  than 4 letters or digits gets a free answer with no model call.
- **Omni** — `startVideo` spends one video credit in the same transaction that creates the video document; a render
  that cannot start, fails, comes back broken, or is still unfinished after 30 minutes (10 if its id was never
  stored) is marked failed and refunded — once, to the month the credit came from (`usageMonth`). A finished clip
  that is discarded is not refunded.

The admin sets the limits ([monthly limits](/coach/admin-and-approvals.md#monthly-limits)).

## Fakes for development and tests

`functions/ai.js` replaces both models with deterministic fakes when `SIMPLIFY_AI_FAKE=1` **and** the code runs in
the Functions emulator (`FUNCTIONS_EMULATOR === "true"`) or a plain Node process (no `K_SERVICE`). A deployed
function always calls the real models, whatever its environment says. The variable comes from
`functions/.env.local` (never deployed) for `firebase emulators:start`, and from `tools/test-functions.mjs`.

| Fake | Trigger in the coach's text | Result |
|---|---|---|
| Flash | contains "beer" | decline |
| Flash | contains "?" and there are no answers yet | ask (one question with three answers) |
| Flash | contains "[fail]" | the call fails (and the use is refunded) |
| Flash | anything else | write: a small page using the first shelf picture, or a video plan of 8 s |
| Omni | the plan's prompt contains "[fail-start]" / "[fail-render]" / "[slow]" | cannot start / fails later / never finishes |
| Omni | anything else | the 3-second sample `functions/test/sample.mp4` |

## Costs

| Call | Unit cost | Per coach per month at the default limits |
|---|---|---|
| Flash (`writePage`, `planVideo`) | a fraction of a US cent per request (a few thousand tokens in and out) | 200 requests: well under US$1 |
| Omni video | about US$0.10 per second of video (whiz.coach's measurement of the same model) — about US$0.80 for an 8-second clip | 5 videos: about US$4 |

Video costs about 100 times more than a page request, which is why the two limits are separate. Budgets and the rest
of the bill are in [costs and limits](/operations/costs-and-limits.md).
