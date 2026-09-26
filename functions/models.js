// The Gemini models the functions call, in ONE place: a model change is a
// one-line edit here, and no other file writes a model id.
//
// Flash runs on Vertex AI's `global` endpoint (checked on this project on
// 2026-09-23): gemini-3.7-flash does not answer in us-central1. (Videos are no
// longer made by a model: the renderer films the class page — docs/coach/videos.md.)

export const VERTEX_LOCATION = "global";

// Text (and a picture): the page helper (writePage) and the overlay planner
// (planOverlay). Gemini 3.x rejects temperature / topP / topK, so none is ever
// sent; thinking is low or medium.
export const FLASH = "gemini-3.7-flash";
export const THINKING = {
  writePage: "medium", // judging write / ask / decline and writing for learners
  planOverlay: "low", // find one thing in a picture, choose a mark
};
