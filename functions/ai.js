// Calls to Gemini through Vertex AI (@google/genai), and the deterministic fakes
// used by the emulator and the tests (SIMPLIFY_AI_FAKE=1), so the whole coach
// flow runs offline and costs nothing.

import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { FLASH, OMNI, VERTEX_LOCATION } from "./models.js";
import { PROJECT_ID } from "./lib.js";

// The fakes answer only where they cannot reach learners' coaches by mistake:
// in the Functions emulator, or in a plain Node process (the tests). A deployed
// function (Cloud Run sets K_SERVICE) always calls the real models.
export function aiIsFake() {
  return process.env.SIMPLIFY_AI_FAKE === "1"
    && (process.env.FUNCTIONS_EMULATOR === "true" || !process.env.K_SERVICE);
}

let client;
// created on first use, so importing this file never touches credentials
const genai = () => (client ??= new GoogleGenAI({ vertexai: true, project: PROJECT_ID, location: VERTEX_LOCATION }));

// ---------- Flash: one JSON answer ----------

// finish reasons that mean the answer was withheld, not that the call broke
const BLOCKED = new Set(["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION", "IMAGE_SAFETY"]);

// Returns { answer } (the parsed JSON), or { blocked: true } when the model's
// safety filters withheld it. Throws when the call fails or the answer is unusable.
export async function askFlash({ system, schema, input, thinking, feature, fake }) {
  if (aiIsFake()) return { answer: fake() };
  const started = Date.now();
  const response = await genai().models.generateContent({
    model: FLASH,
    contents: [{ role: "user", parts: [{ text: input }] }],
    config: {
      systemInstruction: system,
      responseMimeType: "application/json",
      responseSchema: schema,
      // shared by thinking and the answer; a page is at most ~6,000 tokens
      maxOutputTokens: 16384,
      thinkingConfig: { thinkingLevel: thinking === "medium" ? ThinkingLevel.MEDIUM : ThinkingLevel.LOW },
      labels: { app: "simplify", feature },
      abortSignal: AbortSignal.timeout(100_000),
    },
  });
  const candidate = response.candidates?.[0];
  const finish = candidate?.finishReason;
  const usage = response.usageMetadata ?? {};
  console.log(JSON.stringify({
    event: "flash", feature, ms: Date.now() - started, finish,
    promptTokens: usage.promptTokenCount, outputTokens: usage.candidatesTokenCount, thoughtsTokens: usage.thoughtsTokenCount,
  }));
  if (response.promptFeedback?.blockReason || BLOCKED.has(finish)) return { blocked: true };
  if (finish === "MAX_TOKENS") throw new Error("the answer was cut off (MAX_TOKENS)");
  const text = response.text;
  if (!text) throw new Error(`empty answer (finish ${finish})`);
  return { answer: JSON.parse(text) };
}

// ---------- Omni: text to video ----------

// Start one render. The request shape is the one verified on this project on
// 2026-09-23; the call itself took about 2 minutes to return. It costs money and
// is not idempotent, so the SDK must never retry it (its default is 4 retries).
export async function startOmni({ prompt, seconds }) {
  if (aiIsFake()) return fakeOmniStart(prompt);
  const interaction = await genai().interactions.create({
    model: OMNI,
    input: [{ type: "text", text: prompt }],
    response_format: {
      type: "video",
      aspect_ratio: "16:9",
      delivery: "inline",
      duration: `${seconds}s`,
      resolution: "720p",
    },
    generation_config: { video_config: { task: "text_to_video" } },
    background: true,
    store: true,
  }, { maxRetries: 0, timeout: 480_000 });
  if (!interaction?.id) throw new Error(`no interaction id (status ${interaction?.status})`);
  return { id: interaction.id, status: interaction.status };
}

// Where a render is: { status, video: { data?, uri?, mimeType } | null }
export async function readOmni(id) {
  if (aiIsFake()) return fakeOmniRead(id);
  const interaction = await genai().interactions.get(id, null, { timeout: 120_000 });
  const video = interaction.output_video;
  return {
    status: interaction.status,
    video: video?.data || video?.uri
      ? { data: video.data, uri: video.uri, mimeType: video.mime_type || "video/mp4" }
      : null,
  };
}

// ---------- the fakes ----------
//
// Flash (writePage / planVideo), by keyword in the coach's text:
//   "beer"                  → decline
//   "?" with no answers yet → ask
//   "[fail]"                → the model call fails (the request is given back)
//   anything else           → write (a small page using the shelf; a video plan)
// Omni, by marker in the plan's prompt:
//   "[fail-start]"  → the render cannot start   "[fail-render]" → it fails later
//   "[slow]"        → it never finishes          anything else   → a 3-second sample MP4

export function fakeWritePage({ instruction, answers, title, pictures }) {
  const said = [instruction, ...answers.map((a) => a.answer)].join(" ");
  if (said.includes("[fail]")) throw new Error("fake Flash failure");
  const understood = `I understood: ${instruction.replace(/\s+/g, " ").slice(0, 200)}`;
  if (/beer/i.test(said)) {
    return { understood, action: "decline", questions: [], title: "", markdown: "",
      note: "I can only help with pages about school, learning and daily life." };
  }
  if (instruction.includes("?") && answers.length === 0) {
    return { understood, action: "ask", title: "", markdown: "", note: "",
      questions: [{ question: "Who is the page for?", answers: ["The learners", "Their parents", "Other coaches"] }] };
  }
  const picture = pictures[0] ? `![${pictures[0].words || "A picture"}](pictures/${pictures[0].id}.jpg)\n\n` : "";
  return {
    understood,
    action: "write",
    questions: [],
    title: title || "Our class page",
    markdown: `${picture}This page is about: ${instruction.replace(/\s+/g, " ").slice(0, 200)}\n\n---\n\nI read one screen at a time.`,
    note: answers.length ? "I used your answers." : "",
  };
}

export function fakePlanVideo({ request, answers }) {
  const said = [request, ...answers.map((a) => a.answer)].join(" ");
  if (said.includes("[fail]")) throw new Error("fake Flash failure");
  const understood = `I understood: a short video of ${request.replace(/\s+/g, " ").slice(0, 200)}`;
  if (/beer/i.test(said)) {
    return { understood, action: "decline", questions: [], prompt: "", seconds: 8, words: "",
      note: "I can only plan videos about school, learning and daily life." };
  }
  if (request.includes("?") && answers.length === 0) {
    return { understood, action: "ask", prompt: "", seconds: 8, words: "", note: "",
      questions: [{ question: "Where does it happen?", answers: ["At home", "At school", "At a hawker centre"] }] };
  }
  return {
    understood,
    action: "write",
    questions: [],
    prompt: `One calm, continuous shot at hand level with a steady camera: ${request}. Realistic, soft natural light, no text, no logos, no music.`,
    seconds: 8,
    words: request.slice(0, 80),
    note: "",
  };
}

function fakeOmniStart(prompt) {
  if (prompt.includes("[fail-start]")) throw new Error("fake Omni failure");
  const kind = prompt.includes("[fail-render]") ? "fail" : prompt.includes("[slow]") ? "slow" : "ok";
  return { id: `fake-${kind}-${randomUUID()}`, status: "in_progress" };
}

let sample;
function fakeOmniRead(id) {
  if (id.startsWith("fake-slow-")) return { status: "in_progress", video: null };
  if (id.startsWith("fake-fail-")) return { status: "failed", video: null };
  if (!id.startsWith("fake-ok-")) return { status: "failed", video: null };
  sample ??= readFileSync(new URL("./test/sample.mp4", import.meta.url)).toString("base64");
  return { status: "completed", video: { data: sample, mimeType: "video/mp4" } };
}
