// Checks the helper's page before the coach sees it: only the allowed markdown,
// only pictures and videos on the class's shelf, only links the coach gave, and
// the length limit. The learner app draws pages with the same parser —
// class-markdown.js here is a byte-identical copy of public/js/class-markdown.js
// (tools/copy-class-markdown.mjs) — so what passes here is exactly what learners see.

import { parseClassMarkdown, youtubeId } from "./class-markdown.js";

export { youtubeId };
export const MAX_MARKDOWN = 20000;
export const MAX_TITLE = 80;

// an address in running text: https://…, or a YouTube link written without https://
const ADDRESS = /(?:https?:\/\/|www\.youtube\.com\/|m\.youtube\.com\/|youtube\.com\/|youtu\.be\/|www\.youtube-nocookie\.com\/|youtube-nocookie\.com\/)[^\s<>()[\]"'`]+/gi;
const trimEnd = (url) => url.replace(/[.,;:!?]+$/, "");
// [words](target), as the parser reads it: the target may be <in angle brackets>
// and may be followed by a "title" (ignored). Groups: words, <target>, target.
// Every repeat is bounded, so no model answer can make these slow; anything
// longer is still caught by the parser pass in cleanPage.
const LINK = String.raw`\[([^\]\n]{0,500})\]\([ \t]{0,40}(?:<([^>\n]{0,2048})>|([^)\s]{0,2048}))(?:[ \t]{1,40}(?:"[^"\n]{0,500}"|'[^'\n]{0,500}'|\([^)\n]{0,500}\)))?[ \t]{0,40}\)`;
const MEDIA_LINK = new RegExp(`!${LINK}`, "g");
const TEXT_LINK = new RegExp(`(?<!!)${LINK}`, "g");
// an HTML tag: a real tag name (so <https://…> is not one)
const HTML_TAG = /<\/?[A-Za-z][A-Za-z0-9-]{0,40}(?:\s[^<>\n]{0,500})?\/?>/g;
// the parser's next-screen line: ---, *** or ___ (spaces allowed between)
const SCREEN_BREAK = /^([-*_])(?:[ \t]*\1){2,}$/;

const normalUrl = (url) => {
  try {
    return new URL(url).href;
  } catch {
    return null;
  }
};

// Every link in the coach's own words (instruction, answers, current page): the
// only links the helper may put in a page. https links as they are; YouTube
// links in any form the learner app plays, as https://youtu.be/<id>.
export function linksIn(...texts) {
  const found = new Set();
  for (const text of texts) {
    for (const [raw] of String(text ?? "").matchAll(ADDRESS)) {
      const address = trimEnd(raw);
      const video = youtubeId(address);
      if (video) found.add(`https://youtu.be/${video}`);
      else if (/^https:\/\//i.test(address) && normalUrl(address)) found.add(normalUrl(address));
    }
  }
  return [...found];
}

// Returns { markdown, dropped }: the page as learners may see it, and how many
// things had to be taken out.
export function cleanPage(markdown, { pictureIds, videoIds, links }) {
  const allowedUrls = new Set(links.map(normalUrl).filter(Boolean));
  const allowedVideos = new Set(links.map(youtubeId).filter(Boolean));
  const allowed = {
    picture: (id) => pictureIds.has(id),
    video: (id) => videoIds.has(id),
    youtube: (id) => allowedVideos.has(id),
    link: (url) => {
      const video = youtubeId(url);
      if (video) return allowedVideos.has(video);
      return /^https:\/\//i.test(url) && allowedUrls.has(normalUrl(url));
    },
  };
  let dropped = 0;

  let text = String(markdown ?? "").replace(/\r\n?/g, "\n");
  // no HTML, ever (learners would only see it as text, but it has no place here)
  text = text.replace(HTML_TAG, () => (dropped++, ""));
  // pictures and videos: only the exact shelf paths
  text = text.replace(MEDIA_LINK, (whole, words, angled, plain) => {
    const target = (angled ?? plain).trim();
    const picture = /^pictures\/([A-Za-z0-9_-]{1,40})\.jpg$/.exec(target);
    const video = /^videos\/([A-Za-z0-9_-]{1,40})\.mp4$/.exec(target);
    if ((picture && allowed.picture(picture[1])) || (video && allowed.video(video[1]))) return whole;
    dropped++;
    return "";
  });
  // links: only the coach's; anything else keeps just its words
  text = text.replace(TEXT_LINK, (whole, words, angled, plain) => {
    if (allowed.link((angled ?? plain).trim())) return whole;
    dropped++;
    return words;
  });
  // bare addresses the coach did not give (a made-up address helps nobody)
  text = text.replace(ADDRESS, (raw, offset, all) => {
    if (/\]\(<?$/.test(all.slice(Math.max(0, offset - 3), offset))) return raw; // a kept link's own address
    if (allowed.link(trimEnd(raw))) return raw;
    dropped++;
    return raw.slice(trimEnd(raw).length); // keep the full stop after it
  });

  // The learner app's parser has the last word, line by line (it reads every
  // line on its own): a line it would still draw as a picture, video, YouTube
  // card or link button that is not allowed — in a form the steps above do not
  // know — is taken out whole.
  text = text.split("\n").filter((line) => {
    if (!unexpected(parseClassMarkdown(line), allowed)) return true;
    dropped++;
    return false;
  }).join("\n");

  text = tidy(text);

  if (text.length > MAX_MARKDOWN) {
    // cut at the last whole screen that fits, else at the last whole line
    const head = text.slice(0, MAX_MARKDOWN);
    const screen = head.lastIndexOf("\n\n---\n\n");
    const line = head.lastIndexOf("\n");
    text = (screen > 0 ? head.slice(0, screen) : line > 0 ? head.slice(0, line) : head).trim();
    dropped++;
  }

  const surprise = unexpected(parseClassMarkdown(text), allowed);
  if (surprise) throw new Error(`page check: the parser still finds ${surprise}`);
  return { markdown: text, dropped };
}

// No trailing spaces, at most one blank line in a row, and screens that have
// something on them, each break written as "---" between blank lines.
function tidy(text) {
  const screens = [[]];
  for (const raw of text.split("\n")) {
    const line = raw.replace(/[ \t]+$/, "");
    if (SCREEN_BREAK.test(line.trim())) screens.push([]);
    else screens.at(-1).push(line);
  }
  return screens
    .map((lines) => lines.join("\n").replace(/\n{3,}/g, "\n\n").trim())
    .filter(Boolean)
    .join("\n\n---\n\n");
}

export function cleanTitle(title) {
  const text = String(title ?? "").replace(/[#*_`[\]]/g, "").replace(/\s+/g, " ").trim();
  return text.length > MAX_TITLE ? text.slice(0, MAX_TITLE).replace(/\s+\S*$/, "").trim() : text;
}

// the first picture / video / YouTube card / link button the parsed page would
// show that is not allowed, described for the log — or null
function unexpected(page, allowed) {
  for (const screen of page?.screens ?? []) {
    for (const block of screen) {
      if (block.type === "picture" && !allowed.picture(block.id)) return `picture ${block.id}`;
      if (block.type === "video" && !allowed.video(block.id)) return `video ${block.id}`;
      if (block.type === "youtube" && !allowed.youtube(block.id)) return `YouTube ${block.id}`;
      if (block.type === "link" && !allowed.link(block.url)) return `link ${block.url}`;
    }
  }
  return null;
}
