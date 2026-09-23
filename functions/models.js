// The Gemini models the functions call, in ONE place: a model change is a
// one-line edit here, and no other file writes a model id.
//
// Both run on Vertex AI's `global` endpoint (checked on this project on
// 2026-09-23): gemini-3.7-flash does not answer in us-central1, and Omni's
// text-to-video works only on `global` with the `response_format` request shape
// (us-central1, or the older `response_modalities` field, give a generic 500).

export const VERTEX_LOCATION = "global";

// Text: the page helper (writePage) and the video planner (planVideo). Gemini 3.x
// rejects temperature / topP / topK, so none is ever sent; thinking is low or medium.
export const FLASH = "gemini-3.7-flash";
export const THINKING = {
  writePage: "medium", // judging write / ask / decline and writing for learners
  planVideo: "low", // a short, rule-bound rewrite
};

// Text-to-video (preview): 3–10 s, 16:9, 720p, returned inline as a base64 MP4.
export const OMNI = "gemini-omni-flash-preview";
