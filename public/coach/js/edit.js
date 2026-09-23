// The page editor's toolbar as pure functions of the text and its selection:
// each takes { text, start, end } (a textarea's value, selectionStart and
// selectionEnd) and returns the new { text, start, end }. The markdown they
// write is the subset learners see (public/js/class-markdown.js; specs in
// docs/daily-life-tools.md section 8). No DOM: node tools/test-coach.mjs.

export const MAX_WORDS = 80;
export const NEXT_SCREEN = "---";

// Words describing a picture or video, or a link's text: one line, no square
// brackets (they would end the markdown early), at most 80 characters.
export function cleanWords(words, max = MAX_WORDS) {
  return String(words ?? "")
    .replace(/[[\]\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
}

export const pictureMarkdown = (id, words) => `![${cleanWords(words)}](pictures/${id}.jpg)`;
export const videoMarkdown = (id, words) => `![${cleanWords(words)}](videos/${id}.mp4)`;
export const youtubeMarkdown = (id, words) => `[${cleanWords(words) || "Video"}](https://youtu.be/${id})`;

// The video's id from a YouTube link as people copy it: youtube.com/watch?v=,
// youtu.be/, /shorts/, /embed/, /live/, the m. and music. hosts and
// youtube-nocookie.com — with or without https://. null for anything else
// (a channel, a playlist, another site).
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
export function youtubeId(input) {
  let text = String(input ?? "").trim();
  if (!text) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) text = `https://${text}`;
  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
  const [first, second] = url.pathname.split("/").filter(Boolean);
  let id = null;
  if (host === "youtu.be") id = first;
  else if (host === "youtube.com") {
    if (first === "watch") id = url.searchParams.get("v");
    else if (["shorts", "embed", "live", "v"].includes(first)) id = second;
  } else if (host === "youtube-nocookie.com" && first === "embed") id = second;
  return id && YOUTUBE_ID.test(id) ? id : null;
}

// block as a paragraph of its own where the cursor is (in place of any
// selection): a blank line before and after it, and the cursor on the line
// after that, ready to go on writing.
export function insertBlock({ text, start, end }, block) {
  let before = text.slice(0, start);
  const after = text.slice(end).replace(/^[ \t]*\n?[ \t]*\n?/, "");
  if (/\S/.test(before)) before = before.replace(/\s*$/, "\n\n");
  else before = "";
  const head = before + block + "\n\n";
  return { text: head + after, start: head.length, end: head.length };
}

// the lines the selection touches: [from, to) — a selection that ends just
// after a line's newline does not take in the next line
function lineRange(text, start, end) {
  const from = text.lastIndexOf("\n", start - 1) + 1;
  const last = end > start && text[end - 1] === "\n" ? end - 1 : end;
  const to = text.indexOf("\n", last);
  return [from, to === -1 ? text.length : to];
}

// Each touched line (blank ones aside) gets prefix, or — when every one has
// it already — loses it. strip is what an old prefix looks like, taken off
// first ("# Title" becomes "## Title", not "## # Title").
function toggleLines({ text, start, end }, prefix, strip) {
  const [from, to] = lineRange(text, start, end);
  const lines = text.slice(from, to).split("\n");
  const filled = lines.filter((l) => l.trim());
  const remove = filled.length > 0 && filled.every((l) => l.startsWith(prefix));
  const changed = lines.map((l) => {
    if (!l.trim()) return l;
    return remove ? l.slice(prefix.length) : prefix + l.replace(strip, "");
  });
  const block = changed.join("\n");
  const next = text.slice(0, from) + block + text.slice(to);
  if (start === end && lines.length === 1) {
    const caret = Math.max(from, Math.min(from + block.length, start + block.length - (to - from)));
    return { text: next, start: caret, end: caret };
  }
  return { text: next, start: from, end: from + block.length };
}

export const toggleHeading = (state) => toggleLines(state, "## ", /^#{1,6}\s+/);
export const toggleList = (state) => toggleLines(state, "- ", /^(\d+[.)]|[-*+])\s+/);

// **bold**: the selection's words (each line on its own — bold cannot cross
// a line), with spaces kept outside the stars, where markdown needs them; or,
// if they are bold already, not any more. With nothing selected, "bold words"
// goes in, selected, to be typed over.
export function toggleBold({ text, start, end }) {
  if (start === end || !/\S/.test(text.slice(start, end))) {
    const words = "bold words";
    return { text: `${text.slice(0, start)}**${words}**${text.slice(end)}`, start: start + 2, end: start + 2 + words.length };
  }
  const selected = text.slice(start, end);
  const parts = selected.split("\n").map((line) => {
    const [, lead, core, trail] = line.match(/^(\s*)(.*?)(\s*)$/);
    return { lead, core, trail };
  });
  const filled = parts.filter((p) => p.core);
  // already bold: the stars are inside the selection, or just outside it
  const inside = filled.every((p) => p.core.length >= 4 && p.core.startsWith("**") && p.core.endsWith("**"));
  const outside = parts.length === 1 && !parts[0].lead && !parts[0].trail &&
    text.slice(start - 2, start) === "**" && text.slice(end, end + 2) === "**";
  if (outside) {
    const s = start - 2;
    const e = end + 2;
    return { text: text.slice(0, s) + selected + text.slice(e), start: s, end: s + selected.length };
  }
  const body = parts.map(({ lead, core, trail }) => {
    if (!core) return lead + trail;
    return lead + (inside ? core.slice(2, -2) : `**${core}**`) + trail;
  }).join("\n");
  return { text: text.slice(0, start) + body + text.slice(end), start, end: start + body.length };
}
