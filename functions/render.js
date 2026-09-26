// The page videos are made by the video renderer, a Cloud Run job
// (video/page.mjs, docs/coach/videos.md): makeVideo starts one run of it for
// one video, and checkVideo asks how that run went. Through the Cloud Run
// Admin API with the functions' own account (roles/run.developer on the job).
//
// In the emulator and the tests (SIMPLIFY_AI_FAKE=1, as ai.js) the job is
// stood in for: by marker in the page's markdown,
//   "[fail-start]" → the run cannot start   "[fail-render]" → it fails
//   "[slow]"       → it never finishes      anything else  → it succeeds
// and a successful fake run is finished by checkVideo, which saves the
// 3-second functions/test/sample.mp4 as the draft, as the job would.

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { applicationDefault } from "firebase-admin/app";
import { aiIsFake } from "./ai.js";
import { PROJECT_ID } from "./lib.js";

export const RENDER_REGION = "asia-southeast1";
export const RENDER_JOB = process.env.SIMPLIFY_RENDER_JOB || "simplify-video";
const API = "https://run.googleapis.com/v2";

async function run(method, path, body) {
  const { access_token: token } = await applicationDefault().getAccessToken();
  const res = await fetch(`${API}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body && JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Cloud Run ${res.status}: ${json.error?.message ?? "no answer"}`);
  return json;
}

// One run of the job for this video. Returns the execution's name.
export async function startRender({ code, videoId, markdown }) {
  if (aiIsFake()) {
    if (markdown.includes("[fail-start]")) throw new Error("fake render failure");
    const kind = markdown.includes("[fail-render]") ? "fail" : markdown.includes("[slow]") ? "slow" : "ok";
    return `fake-${kind}-${randomUUID()}`;
  }
  const op = await run("POST", `projects/${PROJECT_ID}/locations/${RENDER_REGION}/jobs/${RENDER_JOB}:run`, {
    overrides: { containerOverrides: [{ args: ["page", code, videoId] }], taskCount: 1 },
  });
  const name = op.metadata?.name;
  if (!name) throw new Error("the job started without an execution name");
  return name;
}

// How the run went: "running", "succeeded" or "failed"
export async function readRender(execution) {
  if (aiIsFake()) {
    if (execution.startsWith("fake-ok-")) return "succeeded";
    if (execution.startsWith("fake-slow-")) return "running";
    return "failed";
  }
  const e = await run("GET", execution);
  if ((e.failedCount ?? 0) > 0 || (e.cancelledCount ?? 0) > 0) return "failed";
  if ((e.succeededCount ?? 0) > 0) return "succeeded";
  return "running";
}

let sample;
// what the fake job leaves behind: a real (tiny) MP4
export function fakeRenderClip() {
  sample ??= readFileSync(new URL("./test/sample.mp4", import.meta.url));
  return sample;
}
