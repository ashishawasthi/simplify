// Calls to Gemini through Vertex AI (@google/genai), and the deterministic fakes
// used by the emulator and the tests (SIMPLIFY_AI_FAKE=1), so the whole coach
// flow runs offline and costs nothing.

import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { FLASH, VERTEX_LOCATION } from "./models.js";
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
// image: { data (base64), mimeType } — a picture the model looks at with the words.
export async function askFlash({ system, schema, input, image, thinking, feature, fake }) {
  if (aiIsFake()) return { answer: fake() };
  const started = Date.now();
  const parts = image ? [{ inlineData: { data: image.data, mimeType: image.mimeType } }, { text: input }] : [{ text: input }];
  const response = await genai().models.generateContent({
    model: FLASH,
    contents: [{ role: "user", parts }],
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

// ---------- the fakes ----------
//
// Flash (writePage), by keyword in the coach's text:
//   "beer"                  → decline
//   "?" with no answers yet → ask
//   "[fail]"                → the model call fails (the request is given back)
//   anything else           → write (a small page using the shelf)
// Flash (planOverlay), by keyword in the coach's words:
//   "[fail]" → the call fails     "beer" → decline     "nothing" → nothing found
//   anything else → a ring round the middle of the picture, and an arrow to it

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

export function fakeOverlay({ request }) {
  if (request.includes("[fail]")) throw new Error("fake Flash failure");
  const understood = `I understood: ${request.replace(/\s+/g, " ").slice(0, 200)}`;
  if (/beer/i.test(request)) return { understood, action: "decline", marks: [], note: "I can only mark things for a class page." };
  if (/nothing/i.test(request)) return { understood, action: "none", marks: [], note: "" };
  return {
    understood,
    action: "draw",
    marks: [
      { kind: "circle", target: [350, 350, 650, 650], text: "" },
      { kind: "arrow", target: [350, 350, 650, 650], text: "" },
    ],
    note: "",
  };
}
