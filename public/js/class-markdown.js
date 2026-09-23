// The page a class's coach writes and its learners read in My class, in a
// small markdown subset. ONE module for everyone who reads it: the learner
// app (js/tools/my-class.js), the coach's live preview (/coach/ imports this
// file, same origin) and the Cloud Functions, which check what the AI helper
// writes with the same rules (tools/copy-class-markdown.mjs copies this file
// into functions/, byte for byte). No imports and no DOM until renderScreen()
// is called, so it runs in Node as it is.
//
// ---- What a coach can write ----
//   # Title                 a big heading; ## Heading a smaller one (### … count as ##)
//   a line of text          a paragraph. Every line is its own, so learners
//                           see the lines just as the coach typed them.
//   **bold**, *italic*      inside any line (***both***)
//   - item, 1. item         a list, one level. *, + and • work as -, and 1) as 1.
//   [words](https://…)      one big button that names the site; https only.
//                           Inside a sentence the words stay in it, and the
//                           button comes after that paragraph.
//   ![words](pictures/<id>.jpg)   a picture from the class's shelf
//   ![words](videos/<id>.mp4)     a video from the class's shelf
//                           Any other image shows nothing at all. Inside a
//                           paragraph a picture splits it there; inside a
//                           heading or a list item it comes just after it.
//   a YouTube link alone on its line — [words](URL) or just the URL, for
//   youtube.com/watch?v=, youtu.be/, youtube.com/shorts/, youtube.com/embed/
//   or youtube-nocookie.com/embed/ — a card; nothing is loaded from YouTube
//   until it is tapped, then YouTube's privacy-enhanced player
//   ---                     the next screen (*** and ___ too)
// A line of nothing but links, pictures and videos is those blocks, one
// after another. Anything else is shown as the plain text it is. Nothing is
// ever HTML: the renderer makes elements and sets textContent, so a page
// can't run a script, and it loads nothing but what mediaUrl() hands it —
// and YouTube's player, after a tap.
//
// ---- API ----
// parseClassMarkdown(text) → { screens: [ [block, …], … ] }
//   Pure. Empty screens are left out: no text at all is { screens: [] }.
//   A block is one of
//     { type: "heading", level: 1 | 2, inline }
//     { type: "paragraph", inline }
//     { type: "list", ordered: bool, start: n, items: [inline, …] }
//     { type: "picture", id, words }      the file pictures/<id>.jpg
//     { type: "video", id, words }        the file videos/<id>.mp4
//     { type: "link", url, host, words }  url: https only, normalised; host
//                                         without "www."; words may be ""
//     { type: "youtube", id, words }      id: YouTube's 11 characters; words may be ""
//   inline is [{ text, bold, italic }, …]: the runs of a line, in order.
// renderScreen(screen, { mediaUrl, doc }) → DocumentFragment
//   screen    one of screens: an array of blocks
//   mediaUrl  (kind, id) → the URL to show that picture or video from — kind
//             is "picture" or "video" — or null if it isn't on the class's
//             shelf: that block then shows nothing
//   doc       the document to build in (default: document)
//   The blocks come out side by side, one element each and no wrapper, with
//   class names starting cm-. css/tools/my-class.css styles them inside any
//   element with class "class-page" — the learners' look, for a preview too.
// pageMedia(page) → [{ kind, id }, …]: every picture and video a parsed page
//   uses, once each, in order — the files to fetch, or to check against the
//   class's shelf.
// plainText(inline) → the runs' text, without the formatting
// youtubeId(link) → the id of the YouTube video a link points to, or null
// youtubeEmbed(id) → the address of the player a tapped card shows

const MAX_URL = 2048; // an address longer than this is left as text
const MAX_WORDS = 300; // alt text and button words: never a wall of text
const MEDIA_PATH = /^(pictures|videos)\/([A-Za-z0-9_-]{1,128})\.(jpg|mp4)$/;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const SCREEN_BREAK = /^([-*_])(?:[ \t]*\1){2,}$/; // ---, ***, ___, - - -
const BULLET = /^[-*+•][ \t]+(.*)$/;
const NUMBERED = /^(\d{1,9})[.)][ \t]+(.*)$/;
// a line that is only an address: https://…, http://…, www.…, youtu.be/…
const BARE_URL = /^(?:https?:\/\/|www\.|m\.youtube\.com\/|youtube\.com\/|youtu\.be\/|youtube-nocookie\.com\/)\S+$/i;

// ▶ as a shape, not the colour emoji iOS and Android would otherwise draw
const PLAY = "\u25B6\uFE0E";

export const youtubeEmbed = (id) => `https://www.youtube-nocookie.com/embed/${id}?rel=0&playsinline=1`;

// ---------- parsing ----------

export function parseClassMarkdown(text) {
  const screens = [];
  let blocks = [];
  let list = null; // the list the last line added to, while it goes on

  const add = (block) => {
    list = null;
    blocks.push(block);
  };
  const nextScreen = () => {
    list = null;
    if (blocks.length) screens.push(blocks);
    blocks = [];
  };

  const source = typeof text === "string" ? text : "";
  for (const raw of source.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) continue; // a blank line separates nothing: every line is its own
    if (SCREEN_BREAK.test(line)) {
      nextScreen();
      continue;
    }

    const heading = headingParts(line);
    if (heading) {
      const { runs, after } = lineParts(heading.content);
      if (runs.length) add({ type: "heading", level: heading.level, inline: runs });
      for (const block of after) add(block);
      continue;
    }

    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    if (bullet || numbered) {
      const content = bullet ? bullet[1] : numbered[2];
      const ordered = !!numbered;
      // an item that is only a link, a picture or a video is just that
      const alone = onlyBlocks(content);
      if (alone) {
        for (const block of alone) add(block);
        continue;
      }
      const { runs, after } = lineParts(content);
      if (runs.length) {
        if (!list || list.ordered !== ordered) {
          list = { type: "list", ordered, start: ordered ? Number(numbered[1]) : 1, items: [] };
          blocks.push(list);
        }
        list.items.push(runs);
      }
      if (after.length) {
        // what was inside the item comes after it, and a numbered list goes
        // on counting from where it was
        const next = list ? list.start + list.items.length : 1;
        for (const block of after) add(block);
        if (ordered) {
          list = { type: "list", ordered, start: next, items: [] };
          blocks.push(list); // left out below if nothing more comes
        }
      }
      continue;
    }

    const alone = onlyBlocks(line);
    if (alone) {
      for (const block of alone) add(block);
      continue;
    }
    for (const block of paragraphBlocks(line)) add(block);
  }
  nextScreen();

  return {
    screens: screens
      .map((screen) => screen.filter((block) => block.type !== "list" || block.items.length))
      .filter((screen) => screen.length),
  };
}

// "# Title", "## Heading", "### …" → { level, content }; "#hashtag" is no heading
function headingParts(line) {
  let hashes = 0;
  while (line[hashes] === "#") hashes++;
  if (hashes === 0 || hashes > 6) return null;
  if (hashes < line.length && line[hashes] !== " " && line[hashes] !== "\t") return null;
  let content = line.slice(hashes).trim();
  // a closing run of #, after a space: "# Title #"
  let end = content.length;
  while (end > 0 && content[end - 1] === "#") end--;
  if (end < content.length && (end === 0 || content[end - 1] === " " || content[end - 1] === "\t")) {
    content = content.slice(0, end).trim();
  }
  return { level: hashes === 1 ? 1 : 2, content };
}

// A line made of nothing but links, pictures and videos (and spaces): those
// blocks, in order — an image not from the shelf adds none. null when the
// line is more than that, or has a link that can't be a button.
function onlyBlocks(line) {
  if (!/\s/.test(line) && BARE_URL.test(line)) {
    const id = youtubeId(line);
    if (id) return [{ type: "youtube", id, words: "" }];
    const url = httpsUrl(/^www\./i.test(line) ? `https://${line}` : line);
    return url ? [linkBlock(url, "")] : null; // an http:// address stays text
  }
  const blocks = [];
  for (const piece of scanLine(line)) {
    if (piece.kind === "text") {
      if (piece.text.trim()) return null;
    } else if (piece.kind === "media") {
      blocks.push(piece.block);
    } else if (piece.kind === "link") {
      const words = wordsOf(piece.words);
      const id = youtubeId(piece.target);
      const url = id ? null : httpsUrl(piece.target);
      if (id) blocks.push({ type: "youtube", id, words });
      else if (url) blocks.push(linkBlock(url, words));
      else return null;
    }
    // "drop": an image that isn't on the shelf shows nothing
  }
  return blocks;
}

// A paragraph's blocks: its text, split where a picture or video sits in
// it; each part's link buttons come after that part.
function paragraphBlocks(line) {
  const out = [];
  let text = "";
  let links = [];
  const flush = () => {
    const runs = emphasis(text.trim());
    if (runs.length) out.push({ type: "paragraph", inline: runs });
    out.push(...links);
    text = "";
    links = [];
  };
  for (const piece of scanLine(line)) {
    if (piece.kind === "text") {
      text += piece.text;
    } else if (piece.kind === "link") {
      text += piece.words;
      const url = httpsUrl(piece.target);
      if (url) links.push(linkBlock(url, wordsOf(piece.words)));
    } else if (piece.kind === "media") {
      flush();
      out.push(piece.block);
    }
  }
  flush();
  return out;
}

// A heading's or a list item's text as runs, and the pictures, videos and
// link buttons written inside it, which follow it.
function lineParts(content) {
  let text = "";
  const after = [];
  for (const piece of scanLine(content)) {
    if (piece.kind === "text") {
      text += piece.text;
    } else if (piece.kind === "link") {
      text += piece.words;
      const url = httpsUrl(piece.target);
      if (url) after.push(linkBlock(url, wordsOf(piece.words)));
    } else if (piece.kind === "media") {
      after.push(piece.block);
    }
  }
  return { runs: emphasis(text.trim()), after };
}

function linkBlock(url, words) {
  return { type: "link", url: url.href, host: url.hostname.replace(/^www\./, ""), words };
}

// the words of a link or an image, as plain text
const wordsOf = (words) => plainText(emphasis(words.trim())).trim().slice(0, MAX_WORDS);

// ---------- links and images inside a line ----------

// A line as pieces, in order:
//   { kind: "text", text }
//   { kind: "link", words, target }   [words](target) — the target not checked yet
//   { kind: "media", block }          ![words](pictures/<id>.jpg) or (videos/<id>.mp4)
//   { kind: "drop" }                  any other ![…](…): shows nothing
// Brackets that make no link stay text. Linear time: the next ] and [ after
// every place are worked out once, and nothing looks further than MAX_URL.
function scanLine(s) {
  const n = s.length;
  const nextClose = new Int32Array(n + 2).fill(n);
  const nextOpen = new Int32Array(n + 2).fill(n);
  for (let i = n - 1; i >= 0; i--) {
    nextClose[i] = s[i] === "]" ? i : nextClose[i + 1];
    nextOpen[i] = s[i] === "[" ? i : nextOpen[i + 1];
  }

  const pieces = [];
  let text = "";
  let i = 0;
  while (i < n) {
    const isImage = s[i] === "!" && s[i + 1] === "[";
    if (isImage || s[i] === "[") {
      const found = bracketLink(s, isImage ? i + 1 : i, nextClose, nextOpen);
      if (found) {
        if (text) pieces.push({ kind: "text", text });
        text = "";
        pieces.push(isImage ? mediaPiece(found.words, found.target) : { kind: "link", ...found });
        i = found.end;
        continue;
      }
    }
    text += s[i];
    i++;
  }
  if (text) pieces.push({ kind: "text", text });
  return pieces;
}

// the first of chars at or after `from`, looking no further than MAX_URL; -1 if none
function findWithin(s, chars, from) {
  const stop = Math.min(s.length, from + MAX_URL);
  for (let p = from; p < stop; p++) if (chars.includes(s[p])) return p;
  return -1;
}

// [words](target) or [words](target "title") with s[open] === "[" → { words, target, end }, or null
function bracketLink(s, open, nextClose, nextOpen) {
  const close = nextClose[open + 1];
  if (close >= s.length || s[close + 1] !== "(") return null;
  if (nextOpen[open + 1] < close) return null; // [a [b](…): the inner [ is the link
  let p = close + 2;
  while (s[p] === " " || s[p] === "\t") p++;
  let target;
  if (s[p] === "<") {
    const end = findWithin(s, ">", p + 1); // <an address with spaces>
    if (end === -1) return null;
    target = s.slice(p + 1, end);
    p = end + 1;
  } else {
    const start = p;
    let depth = 0; // (brackets) inside an address, as Wikipedia has
    for (; p < s.length; p++) {
      if (p - start > MAX_URL) return null;
      const c = s[p];
      if (c === " " || c === "\t") break;
      if (c === "(") depth++;
      else if (c === ")" && depth-- === 0) break;
    }
    target = s.slice(start, p);
  }
  while (s[p] === " " || s[p] === "\t") p++;
  const quote = { '"': '"', "'": "'", "(": ")" }[s[p]];
  if (quote) {
    const end = findWithin(s, quote, p + 1); // a title: allowed, and ignored
    if (end === -1) return null;
    p = end + 1;
    while (s[p] === " " || s[p] === "\t") p++;
  }
  if (s[p] !== ")") return null;
  return { words: s.slice(open + 1, close), target: target.trim(), end: p + 1 };
}

function mediaPiece(words, target) {
  const m = MEDIA_PATH.exec(target);
  const kind = m && (m[1] === "pictures" ? "picture" : "video");
  // pictures are .jpg and videos .mp4, never the other way round
  if (!m || (kind === "picture") !== (m[3] === "jpg")) return { kind: "drop" };
  return { kind: "media", block: { type: kind, id: m[2], words: wordsOf(words) } };
}

// ---------- bold and italic ----------

// The runs of a line: *italic*, **bold**, ***both***. A run of stars can open
// when a non-space follows it and close when a non-space comes before it, and
// closes the nearest open run of the same length — so "2 * 3" stays as it
// is, and a ** with no partner is just two stars. Linear time.
function emphasis(text) {
  const tokens = [];
  for (let i = 0; i < text.length;) {
    if (text[i] === "*") {
      let j = i;
      while (text[j] === "*") j++;
      const stars = j - i;
      const before = i > 0 ? text[i - 1] : " ";
      const after = j < text.length ? text[j] : " ";
      tokens.push({ stars, text: text.slice(i, j), role: null,
        canOpen: stars <= 3 && !/\s/.test(after), canClose: stars <= 3 && !/\s/.test(before) });
      i = j;
    } else {
      const j = text.indexOf("*", i) === -1 ? text.length : text.indexOf("*", i);
      tokens.push({ stars: 0, text: text.slice(i, j) });
      i = j;
    }
  }
  const waiting = [null, [], [], []]; // open runs of 1, 2 and 3 stars
  for (const token of tokens) {
    if (!token.stars || token.stars > 3) continue;
    const open = waiting[token.stars];
    if (token.canClose && open.length) {
      open.pop().role = "open";
      token.role = "close";
    } else if (token.canOpen) {
      open.push(token);
    }
  }
  const runs = [];
  let bold = 0;
  let italic = 0;
  for (const token of tokens) {
    if (token.role) {
      const step = token.role === "open" ? 1 : -1;
      if (token.stars !== 2) italic += step;
      if (token.stars !== 1) bold += step;
      continue;
    }
    const last = runs.at(-1);
    if (last && last.bold === bold > 0 && last.italic === italic > 0) last.text += token.text;
    else if (token.text) runs.push({ text: token.text, bold: bold > 0, italic: italic > 0 });
  }
  return runs;
}

export function plainText(inline) {
  return Array.isArray(inline) ? inline.map((run) => String(run?.text ?? "")).join("") : "";
}

// ---------- addresses ----------

// An https address a button may open, as a URL, or null: no other scheme,
// and no user name or password in it (https://bank.example@evil.example).
function httpsUrl(target) {
  if (typeof target !== "string" || !target || target.length > MAX_URL) return null;
  let url;
  try {
    url = new URL(target);
  } catch {
    return null;
  }
  return url.protocol === "https:" && url.hostname && !url.username && !url.password ? url : null;
}

// The id of the video a YouTube link points to — youtube.com/watch?v=ID,
// youtu.be/ID, youtube.com/shorts/ID, youtube.com/embed/ID or
// youtube-nocookie.com/embed/ID; www. and m. too; http, https or no scheme
// — or null. Only the id is ever used: the player's address is always our
// own (youtubeEmbed).
export function youtubeId(link) {
  if (typeof link !== "string") return null;
  let text = link.trim();
  if (!text || text.length > MAX_URL || /\s/.test(text)) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) text = `https://${text}`;
  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase().replace(/^(?:www\.|m\.)/, "");
  const parts = url.pathname.split("/").filter(Boolean);
  let id = null;
  if (host === "youtu.be" && parts.length === 1) id = parts[0];
  else if (host === "youtube.com" && parts.length === 1 && parts[0] === "watch") id = url.searchParams.get("v");
  else if (host === "youtube.com" && parts.length === 2 && (parts[0] === "shorts" || parts[0] === "embed")) id = parts[1];
  else if (host === "youtube-nocookie.com" && parts.length === 2 && parts[0] === "embed") id = parts[1];
  return id && YOUTUBE_ID.test(id) ? id : null;
}

export function pageMedia(page) {
  const seen = new Set();
  const out = [];
  for (const screen of page?.screens ?? []) {
    for (const block of screen) {
      if (block.type !== "picture" && block.type !== "video") continue;
      const key = `${block.type}/${block.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ kind: block.type, id: block.id });
    }
  }
  return out;
}

// ---------- rendering ----------

export function renderScreen(screen, { mediaUrl = () => null, doc = globalThis.document } = {}) {
  const out = doc.createDocumentFragment();
  for (const block of Array.isArray(screen) ? screen : []) {
    const render = RENDER.get(block?.type);
    const node = render?.(block, { mediaUrl, doc });
    if (node) out.append(node);
  }
  return out;
}

function el(doc, tag, className, text) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function hiddenIcon(doc, className, text) {
  const icon = el(doc, "span", className, text);
  icon.setAttribute("aria-hidden", "true");
  return icon;
}

// runs as text nodes, inside <strong> and <em> where they are bold or italic
function withRuns(doc, parent, inline) {
  for (const run of Array.isArray(inline) ? inline : []) {
    let node = doc.createTextNode(String(run?.text ?? ""));
    for (const [on, tag] of [[run?.italic, "em"], [run?.bold, "strong"]]) {
      if (!on) continue;
      const wrap = doc.createElement(tag);
      wrap.append(node);
      node = wrap;
    }
    parent.append(node);
  }
  return parent;
}

function mediaSrc(mediaUrl, kind, id) {
  try {
    const url = mediaUrl(kind, id);
    return typeof url === "string" && url ? url : null;
  } catch {
    return null;
  }
}

const RENDER = new Map([
  ["heading", (block, { doc }) =>
    withRuns(doc, el(doc, block.level === 1 ? "h2" : "h3", `cm-heading cm-h${block.level === 1 ? 1 : 2}`), block.inline)],

  ["paragraph", (block, { doc }) => withRuns(doc, el(doc, "p", "cm-p"), block.inline)],

  ["list", (block, { doc }) => {
    const list = el(doc, block.ordered ? "ol" : "ul", "cm-list");
    if (block.ordered && Number.isInteger(block.start) && block.start !== 1) list.start = block.start;
    for (const item of Array.isArray(block.items) ? block.items : []) list.append(withRuns(doc, el(doc, "li"), item));
    return list;
  }],

  ["picture", (block, { mediaUrl, doc }) => {
    const src = mediaSrc(mediaUrl, "picture", block.id);
    if (!src) return null;
    const img = el(doc, "img", "cm-picture");
    img.alt = block.words ?? "";
    img.decoding = "async";
    img.draggable = false;
    img.src = src;
    return img;
  }],

  // Never plays by itself: the native controls, and a big ▶ over the middle
  // until it has played once (and again at the end), for small fingers.
  ["video", (block, { mediaUrl, doc }) => {
    const src = mediaSrc(mediaUrl, "video", block.id);
    if (!src) return null;
    const box = el(doc, "div", "cm-video");
    const video = el(doc, "video");
    video.controls = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.preload = "metadata";
    video.setAttribute("aria-label", block.words || "Video");
    video.src = src;
    const play = el(doc, "button", "cm-video-play");
    play.type = "button";
    play.setAttribute("aria-label", block.words ? `Play: ${block.words}` : "Play the video");
    play.append(hiddenIcon(doc, "cm-video-play-icon", PLAY));
    // a file that can't play says so in its own controls
    play.addEventListener("click", () => video.play()?.catch?.(() => {}));
    video.addEventListener("play", () => { play.hidden = true; });
    video.addEventListener("ended", () => { play.hidden = false; });
    box.append(video, play);
    return box;
  }],

  // One big button naming the site it opens: only on a tap, in a new tab
  // (from an installed app, the browser), never with a referrer.
  ["link", (block, { doc }) => {
    if (!/^https:\/\//i.test(block.url ?? "")) return null;
    const a = el(doc, "a", "cm-link");
    a.href = block.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    const text = el(doc, "span", "cm-link-text");
    text.append(el(doc, "span", "cm-link-words", block.words || block.host));
    if (block.words && block.words !== block.host) text.append(el(doc, "span", "cm-link-host", block.host));
    a.append(hiddenIcon(doc, "cm-link-icon", "🔗"), text);
    return a;
  }],

  // A card until it is tapped: nothing comes from YouTube before that. Then
  // YouTube's privacy-enhanced player, in the page, sending our origin as its
  // referrer — YouTube refuses a player with none (Error 153), and the
  // site's own Referrer-Policy is no-referrer.
  ["youtube", (block, { doc }) => {
    if (!YOUTUBE_ID.test(block.id ?? "")) return null;
    const box = el(doc, "div", "cm-youtube");
    const card = el(doc, "button", "cm-youtube-card");
    card.type = "button";
    const note = el(doc, "span", "cm-youtube-note", "Watch on YouTube (needs the internet)");
    const text = el(doc, "span", "cm-youtube-text");
    text.append(el(doc, "span", "cm-youtube-words", block.words || "Video"), note);
    card.append(hiddenIcon(doc, "cm-youtube-icon", PLAY), text);
    card.addEventListener("click", () => {
      if (doc.defaultView?.navigator?.onLine === false) {
        note.textContent = "No internet now. Try again with the internet.";
        card.classList.add("is-offline");
        return;
      }
      const frame = el(doc, "iframe");
      frame.src = youtubeEmbed(block.id);
      frame.title = block.words || "YouTube video";
      frame.setAttribute("allow", "encrypted-media; picture-in-picture; fullscreen");
      frame.setAttribute("allowfullscreen", "");
      frame.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
      const holder = el(doc, "div", "cm-youtube-frame");
      holder.append(frame);
      box.replaceChildren(holder);
      box.classList.add("is-open");
    });
    box.append(card);
    return box;
  }],
]);
