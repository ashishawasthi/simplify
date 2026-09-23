// Checks the picture set: public/js/pictures.js against public/img/pic/, each
// file's safety and shape, the size budget, and the Noto licence notices (in
// each file, in public/img/pic/LICENSE.txt and in THIRD_PARTY_NOTICES.md). No
// dependencies, no runner:
//
//   node tools/test-pictures.mjs
//
// The files are made by tools/make-pictures.mjs; run this after it.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PICTURE_GROUPS, PICTURES, NOTO_FILES, MENU_ICONS, pictureSrc, pictureImg, menuIconSrc,
} from "../public/js/pictures.js";
import { DRAWINGS, NOTO_TAG, COPYRIGHT, LICENSE_FILE, apacheText } from "./make-pictures.mjs";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const DIR = join(ROOT, "public", "img", "pic");
const BUDGET = 500 * 1024; // the whole folder
const FILE_MAX = 16 * 1024; // one picture: a bigger one is usually gradients, pick a simpler one

// The ids the tools are written against (the picture list they were built
// from). Removing or renaming one breaks a saved card or a tool's own list.
const REQUIRED = {
  day: "school home bus mrt-train walk car taxi eat snack drink-water recess hawker-stall kopi play playground park " +
    "swim music draw read homework computer tablet tv game toilet wash-hands brush-teeth shower get-dressed sleep " +
    "pack-bag doctor haircut shop library lift cook clean-up exercise quiet-time therapy changed all-done",
  need: "help break toilet water too-loud stop hurts want more-time dont-understand all-done yes no",
  out: "seat bus-stop bell cannot-talk please thank-you family space travel-card card-reader pay-qr tray tray-return receipt phone",
  steps: "tap-water soap rub-hands rinse dry-hands carry-tray wipe-table check-amount tap-card",
};

// The menu's tools and group headings that have an icon (ids from js/tools.js).
const MENU_IDS = "my-class my-day now-next wait steps talk i-need show-card";

const results = [];
const check = (name, problems) => results.push([name, problems.filter(Boolean)]);

// ---- the list ----
const ids = PICTURES.map((p) => p.id);
check("ids are unique", ids.filter((id, i) => ids.indexOf(id) !== i).map((id) => `${id} twice`));
check("ids are kebab-case", ids.filter((id) => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)));
check("entries are { id, file, words, group }", PICTURES
  .filter((p) => Object.keys(p).sort().join() !== "file,group,id,words").map((p) => p.id));
check("groups: My day, I need, Going out, Steps", [
  PICTURE_GROUPS.map((g) => `${g.id}:${g.label}`).join(" ") === "day:My day need:I need out:Going out steps:Steps"
    ? null : `got ${PICTURE_GROUPS.map((g) => `${g.id}:${g.label}`).join(", ")}`,
]);
const groupIds = new Set(PICTURE_GROUPS.map((g) => g.id));
check("every picture is in a group", PICTURES.filter((p) => !groupIds.has(p.group)).map((p) => `${p.id}: ${p.group}`));
check("every group has pictures", PICTURE_GROUPS.filter((g) => !PICTURES.some((p) => p.group === g.id)).map((g) => g.id));
check("words: 1–3 words, a capital first", PICTURES.map((p) => {
  const n = p.words.split(" ").length;
  if (p.words !== p.words.trim() || /\s{2}/.test(p.words)) return `${p.id}: stray spaces`;
  if (n < 1 || n > 3 || !p.words) return `${p.id}: ${n} words`;
  if (!/^[A-Z]/.test(p.words)) return `${p.id}: "${p.words}"`;
  return null;
}));
const byId = new Map(PICTURES.map((p) => [p.id, p]));
check("every required id is there", Object.values(REQUIRED).join(" ").split(" ").filter((id) => !byId.has(id)));
check("required ids are in their group, or an earlier one", Object.entries(REQUIRED).flatMap(([group, list]) => {
  const order = PICTURE_GROUPS.map((g) => g.id);
  return list.split(" ").filter((id) => byId.has(id) && order.indexOf(byId.get(id).group) > order.indexOf(group))
    .map((id) => `${id} is in ${byId.get(id).group}, not ${group}`);
}));

// ---- the menu's icons ----
const pictureFiles = new Set(PICTURES.map((p) => p.file));
check("MENU_ICONS: the menu's tools and headings, each a file", [
  Object.keys(MENU_ICONS).sort().join(" ") === MENU_IDS.split(" ").sort().join(" ")
    ? null : `keys ${Object.keys(MENU_ICONS).join(" ")}, expected ${MENU_IDS}`,
  ...Object.entries(MENU_ICONS).filter(([, f]) => !/^[a-z0-9]+(-[a-z0-9]+)*\.svg$/.test(f)).map(([k, f]) => `${k}: ${f}`),
]);
check("menu-only icons are named menu-*.svg, and never in the picker", [
  ...Object.entries(MENU_ICONS).filter(([, f]) => !pictureFiles.has(f) && !f.startsWith("menu-")).map(([k, f]) => `${k}: ${f}`),
  ...PICTURES.filter((p) => p.file.startsWith("menu-")).map((p) => `${p.id} uses ${p.file}`),
]);

// ---- the files ----
// Hosting ignores dotfiles (firebase.json), so a .DS_Store is not served.
const onDisk = readdirSync(DIR).filter((f) => !f.startsWith("."));
const svgsOnDisk = onDisk.filter((f) => f !== LICENSE_FILE);
const used = [...new Set([...PICTURES.map((p) => p.file), ...Object.values(MENU_ICONS)])];
check("file names are <kebab>.svg", used.filter((f) => !/^[a-z0-9]+(-[a-z0-9]+)*\.svg$/.test(f)));
check("every entry's file exists", used.filter((f) => !onDisk.includes(f)));
check(`every file in public/img/pic is used (and ${LICENSE_FILE})`, svgsOnDisk.filter((f) => !used.includes(f)));

// What an SVG shown through <img> may contain: shapes, groups, gradients and
// clip paths — nothing that runs, loads or embeds (script, style,
// foreignObject, image, a, animation, filters). Each attribute is one we
// know, and its value is what that attribute should hold: numbers, path
// data, a colour, a transform, or a reference to an id in the same file.
// So no url() to anything else, no CSS escapes (\72), no character
// references (&#117;), no style="".
const ELEMENTS = new Set(["svg", "g", "defs", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
  "clipPath", "use", "linearGradient", "radialGradient", "stop"]);
const NUM = /^[-+.\d\seE,%]+$/;
const ID = /^[A-Za-z][\w-]*$/;
const REF = /^url\(#[A-Za-z][\w-]*\)$/;
const COLOUR = /^(?:#[\da-fA-F]{3}(?:[\da-fA-F]{3})?|[a-zA-Z]+)$/;
const PAINT = new RegExp(`${COLOUR.source}|${REF.source}`);
const TRANSFORM = /^(?:\s*(?:matrix|translate|scale|rotate|skewX|skewY)\s*\([-+.\deE\s,]*\)\s*,?)+$/;
const one = (...words) => new RegExp(`^(?:${words.join("|")})$`);
const ATTRIBUTES = {
  xmlns: /^http:\/\/www\.w3\.org\/2000\/svg$/, viewBox: NUM, id: ID, href: /^#[A-Za-z][\w-]*$/,
  d: /^[MmZzLlHhVvCcSsQqTtAa\d\s,.eE+-]*$/, points: NUM, transform: TRANSFORM, gradientTransform: TRANSFORM,
  x: NUM, y: NUM, width: NUM, height: NUM, rx: NUM, ry: NUM, cx: NUM, cy: NUM, r: NUM, fx: NUM, fy: NUM, fr: NUM,
  x1: NUM, y1: NUM, x2: NUM, y2: NUM, offset: NUM,
  fill: PAINT, stroke: PAINT, "stop-color": COLOUR, "clip-path": REF,
  opacity: NUM, "fill-opacity": NUM, "stroke-opacity": NUM, "stop-opacity": NUM,
  "stroke-width": NUM, "stroke-miterlimit": NUM, "stroke-dasharray": NUM, "stroke-dashoffset": NUM,
  "stroke-linecap": one("butt", "round", "square"), "stroke-linejoin": one("miter", "round", "bevel"),
  "fill-rule": one("nonzero", "evenodd"), "clip-rule": one("nonzero", "evenodd"),
  gradientUnits: one("userSpaceOnUse", "objectBoundingBox"), clipPathUnits: one("userSpaceOnUse", "objectBoundingBox"),
  spreadMethod: one("pad", "reflect", "repeat"), display: one("none", "inline"), visibility: one("visible", "hidden"),
};

// A small XML reader: one root, elements and comments only (no text, no
// processing instruction, no DOCTYPE or CDATA), every attribute quoted and
// given once. → { shape: [...], safety: [...] }, the problems of each kind.
function checkSvg(text) {
  const shape = [], safety = [], stack = [], elements = [];
  let root = null;
  const re = /<\?([\s\S]*?)\?>|<!--([\s\S]*?)-->|<\/([A-Za-z][\w:.-]*)\s*>|<([A-Za-z][\w:.-]*)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)|(<)/y;
  while (re.lastIndex < text.length) {
    const m = re.exec(text);
    const [, pi, comment, close, open, attrText, self, chars, stray] = m;
    if (pi !== undefined) { safety.push(`processing instruction <?${pi.slice(0, 30)}?>`); continue; }
    if (comment !== undefined) { if (comment.includes("--")) shape.push("a comment with -- in it"); continue; }
    if (stray) { shape.push(`not well-formed near "${text.slice(m.index, m.index + 30)}"`); break; }
    if (chars) { if (chars.trim()) shape.push(`text "${chars.trim().slice(0, 20)}"`); continue; }
    if (close) {
      const top = stack.pop();
      if (top?.name !== close) shape.push(`</${close}> closes <${top?.name}>`);
      continue;
    }
    const attrs = {};
    for (const a of attrText.matchAll(/([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      if (Object.hasOwn(attrs, a[1])) shape.push(`<${open}> has ${a[1]} twice`);
      attrs[a[1]] = a[2] ?? a[3];
    }
    const el = { name: open, attrs };
    if (stack.length === 0) {
      if (root) shape.push(`a second root <${open}>`);
      else root = el;
    }
    if (!self) stack.push(el);
    elements.push(el);
  }
  if (stack.length) shape.push(`<${stack.at(-1).name}> never closed`);
  if (root?.name !== "svg") shape.push(`root is <${root?.name}>, not <svg>`);
  else {
    if (root.attrs.xmlns !== "http://www.w3.org/2000/svg") shape.push("no SVG xmlns");
    if (!root.attrs.viewBox) shape.push("no viewBox");
    else if (root.attrs.viewBox.trim().split(/[\s,]+/).map(Number).join(" ") !== "0 0 128 128") {
      shape.push(`viewBox "${root.attrs.viewBox}" — pictureImg() says 128×128`);
    }
  }
  const idsHere = new Set(elements.map((el) => el.attrs.id).filter(Boolean));
  for (const el of elements) {
    if (!ELEMENTS.has(el.name)) safety.push(`<${el.name}>`);
    for (const [k, v] of Object.entries(el.attrs)) {
      if (k === "xmlns" && el !== root) safety.push(`xmlns on <${el.name}>`);
      if (!Object.hasOwn(ATTRIBUTES, k)) safety.push(`${k}= on <${el.name}>`);
      else if (!ATTRIBUTES[k].test(v)) safety.push(`${k}="${v.slice(0, 40)}" on <${el.name}>`);
      else {
        const refs = k === "href" ? [v.slice(1)] : [...v.matchAll(/url\(#([\w-]+)\)/g)].map((r) => r[1]);
        for (const id of refs) if (!idsHere.has(id)) shape.push(`${k}="${v}": no #${id}`);
      }
    }
  }
  return { shape, safety };
}

let total = 0;
const svgProblems = [], safety = [], big = [];
for (const f of onDisk) {
  const buf = readFileSync(join(DIR, f));
  total += buf.length;
  if (f === LICENSE_FILE) continue;
  if (buf.length > FILE_MAX) big.push(`${f}: ${buf.length} B`);
  const found = checkSvg(buf.toString("utf8"));
  for (const p of found.shape) svgProblems.push(`${f}: ${p}`);
  for (const p of found.safety) safety.push(`${f}: ${p}`);
}
check("each file is an <svg> with viewBox 0 0 128 128, well-formed, its references resolve", svgProblems);
check("nothing that runs or loads: only known elements and attributes, each value of its kind", safety);
check(`each picture at most ${FILE_MAX / 1024} KB`, big);
check(`total at most ${BUDGET / 1024} KB (now ${(total / 1024).toFixed(1)} KB)`, [total > BUDGET ? `${total} B` : null]);

// The checker itself: each of these must be refused, and the clean one pass.
const svg = (body, rootAttrs = "") => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"${rootAttrs}>${body}</svg>`;
const square = `<path d="M0 0h1v1z"/>`;
const CLEAN = svg(`<!-- a notice --><defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="1" gradientUnits="userSpaceOnUse" ` +
  `gradientTransform="matrix(1 0 0 1 0 0)"><stop offset=".5" stop-color="#fafafa" stop-opacity=".4"/></linearGradient>` +
  `<clipPath id="b"><rect x="1" y="1" width="9" height="9" rx="2"/></clipPath></defs>` +
  `<g clip-path="url(#b)" transform="translate(2 3)scale(.5)rotate(10 64 64)"><path id="c" d="M1 2c3 4 5-6 7 8z" fill="url(#a)"/></g>` +
  `<use href="#c"/><circle cx="4" cy="4" r="2" fill="none" stroke="#123" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`);
const PLANTED = {
  "<script>": svg(`<script>alert(1)</script>`),
  "onload=": svg(square, ` onload="alert(1)"`),
  "ONCLICK=": svg(`<rect width="1" height="1" ONCLICK="alert(1)"/>`),
  "<foreignObject>": svg(`<foreignObject width="9" height="9"></foreignObject>`),
  "<image> from another site": svg(`<image href="https://evil.example/x.png" width="9" height="9"/>`),
  "<image> as data:": svg(`<image href="data:image/png;base64,AAAA" width="9" height="9"/>`),
  "<style> with @import": svg(`<style>@import url(https://evil.example/x.css);</style>`),
  "style= attribute": svg(`<rect width="1" height="1" style="fill:red"/>`),
  "<use> of another file": svg(`<use href="https://evil.example/x.svg#a"/>`),
  "xlink:href to another site": svg(`<use xlink:href="//evil.example/x.svg#a"/>`, ` xmlns:xlink="http://www.w3.org/1999/xlink"`),
  "<a> to javascript:": svg(`<a href="javascript:alert(1)">${square}</a>`),
  "url() to another site": svg(`<rect width="1" height="1" fill="url(https://evil.example/x#a)"/>`),
  "url() quoted": svg(`<rect width="1" height="1" fill="url('//evil.example/x#a')"/>`),
  "url() CSS-escaped": svg(`<rect width="1" height="1" fill="u\\72l(\\2f\\2f evil.example/x#a)"/>`),
  "url() CSS-escaped in style=": svg(`<rect width="1" height="1" style="fill:u\\72l(#a)"/>`),
  "url() as character references": svg(`<rect width="1" height="1" fill="&#117;rl(//evil.example/x#a)"/>`),
  "clip-path from another file": svg(`<rect width="1" height="1" clip-path="url(x.svg#a)"/>`),
  "<?xml-stylesheet?>": `<?xml-stylesheet type="text/css" href="https://evil.example/x.css"?>${svg(square)}`,
  "<?xml?> (never written)": `<?xml version="1.0"?>${svg(square)}`,
  "<!DOCTYPE> with an entity": `<!DOCTYPE svg [<!ENTITY e "x">]>${svg(square)}`,
  "CDATA": svg(`<![CDATA[x]]>`),
  "<animate>": svg(`<rect width="1" height="1"><animate attributeName="fill" to="url(//evil.example/x#a)"/></rect>`),
  "<set>": svg(`<set attributeName="href" to="javascript:alert(1)"/>`),
  "<feImage>": svg(`<filter id="f"><feImage href="https://evil.example/x.png"/></filter>`),
  "HTML <iframe>": svg(`<h:iframe xmlns:h="http://www.w3.org/1999/xhtml" src="https://evil.example/"/>`),
  "xml:base": svg(`<g xml:base="https://evil.example/">${square}</g>`),
  "unknown attribute": svg(`<rect width="1" height="1" requiredExtensions="https://evil.example/"/>`),
  "text": svg(`hello`),
  "unquoted attribute": svg(`<rect width=1 height="1"/>`),
  "wrong viewBox": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${square}</svg>`,
  "no SVG namespace": `<svg viewBox="0 0 128 128">${square}</svg>`,
  "two roots": svg(square) + svg(square),
  "never closed": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><g>`,
  "-- in a comment": svg(`<!-- a -- b -->${square}`),
  "a reference to a missing id": svg(`<rect width="1" height="1" fill="url(#nope)"/>`),
};
const clean = checkSvg(CLEAN);
check(`the file check passes a clean file and refuses ${Object.keys(PLANTED).length} planted bad ones`, [
  ...[...clean.shape, ...clean.safety].map((p) => `clean file: ${p}`),
  ...Object.entries(PLANTED).map(([name, text]) => {
    const found = checkSvg(text);
    return found.shape.length + found.safety.length ? null : `not refused: ${name}`;
  }),
]);

// ---- where the files come from, and the licence ----
const notoValues = Object.values(NOTO_FILES);
check("NOTO_FILES: every key is a used file", Object.keys(NOTO_FILES).filter((f) => !used.includes(f)));
check("NOTO_FILES: upstream names look like emoji_u<hex>[_<hex>…].svg",
  notoValues.filter((v) => !/^emoji_u[0-9a-f]{2,6}(?:_[0-9a-f]{2,6})*\.svg$/.test(v)));
check("every other file is one of our drawings (tools/make-pictures.mjs)",
  used.filter((f) => !NOTO_FILES[f] && !DRAWINGS[f]).map((f) => `${f}: no source`));
check("every drawing is used, and none is also a Noto file", Object.keys(DRAWINGS).map((f) =>
  !used.includes(f) ? `${f}: not in pictures.js` : NOTO_FILES[f] ? `${f}: in NOTO_FILES too` : null));

// Apache-2.0 §4: whoever gets the files gets the licence, and a changed file
// says so. Hosting serves only public/, so this is in the folder itself.
const withParts = Object.entries(DRAWINGS).filter(([f, d]) => d.parts.length && used.includes(f));
const copyrightShort = COPYRIGHT.split(" All")[0];
check("each file with Noto in it says so in a comment at the top", [
  ...Object.entries(NOTO_FILES).map(([f, up]) => [f, [up]]),
  ...withParts.map(([f, d]) => [f, d.parts]),
].map(([f, ups]) => {
  if (!existsSync(join(DIR, f))) return null; // reported above
  const comment = /^<svg[^>]*><!--([\s\S]*?)-->/.exec(readFileSync(join(DIR, f), "utf8"))?.[1] ?? "";
  const missing = [...ups.map((up) => `svg/${up}`), `Noto Emoji ${NOTO_TAG}`, copyrightShort, "Apache License 2.0", LICENSE_FILE]
    .filter((w) => !comment.includes(w));
  return missing.length ? `${f}: no ${missing.join(", ")}` : null;
}));
const license = existsSync(join(DIR, LICENSE_FILE)) ? readFileSync(join(DIR, LICENSE_FILE), "utf8") : "";
const row = (f) => new RegExp(`^${f.replace(/\./g, "\\.")} +(.*)$`, "m").exec(license)?.[1] ?? "";
check(`public/img/pic/${LICENSE_FILE}: the copyright, the licence text and every Noto file`, license ? [
  license.includes(COPYRIGHT) ? null : "no copyright line",
  license.includes(apacheText()) ? null : "not the licence text of THIRD_PARTY_NOTICES.md",
  license.includes("https://www.apache.org/licenses/LICENSE-2.0") ? null : "no licence URL",
  ...Object.entries(NOTO_FILES).map(([f, up]) => row(f) === up ? null : `${f} ← ${up}`),
  ...withParts.flatMap(([f, d]) => d.parts.filter((up) => !row(f).startsWith("parts:") || !row(f).includes(up)).map((up) => `${f} ← part ${up}`)),
] : ["missing — run node tools/make-pictures.mjs"]);
const notices = readFileSync(join(ROOT, "THIRD_PARTY_NOTICES.md"), "utf8");
check("THIRD_PARTY_NOTICES.md names every Noto file used, and its licence", [
  ...Object.entries(NOTO_FILES).filter(([ours, up]) => !notices.includes(`\`${ours}\` | \`${up}\``)).map(([o, u]) => `${o} ← ${u}`),
  ...withParts.filter(([f]) => !notices.includes(`\`${f}\``)).map(([f]) => `${f} (has Noto parts)`),
  ...withParts.flatMap(([, d]) => d.parts).filter((p) => !notices.includes(`\`${p}\``)),
  notices.includes("Apache License, Version 2.0") && notices.includes("https://www.apache.org/licenses/LICENSE-2.0")
    ? null : "the Apache-2.0 licence and its URL",
  notices.includes(`public/img/pic/${LICENSE_FILE}`) ? null : `public/img/pic/${LICENSE_FILE}`,
]);

// ---- the API ----
const first = PICTURES[0];
const odd = ["no-such-picture", "toString", "__proto__", "constructor", "hasOwnProperty", "", undefined, null, 1];
check("pictureSrc", [
  pictureSrc(first.id) === `/img/pic/${first.file}` ? null : `${first.id} → ${pictureSrc(first.id)}`,
  pictureSrc("drink-water") === "/img/pic/water.svg" ? null : `drink-water → ${pictureSrc("drink-water")}`,
  ...odd.map((id) => pictureSrc(id) === null ? null : `${String(id)} → ${pictureSrc(id)}`),
  ...Object.values(MENU_ICONS).filter((f) => f.startsWith("menu-")).map((f) => f.slice(5, -4))
    .map((id) => pictureSrc(id) === null ? null : `${id} is a menu icon, not a picture`),
]);
check("menuIconSrc", [
  menuIconSrc("show-card") === "/img/pic/menu-show-card.svg" ? null : `show-card → ${menuIconSrc("show-card")}`,
  menuIconSrc("wait") === "/img/pic/more-time.svg" ? null : `wait → ${menuIconSrc("wait")}`,
  ...odd.map((id) => menuIconSrc(id) === null ? null : `${String(id)} → ${menuIconSrc(id)}`),
]);
// a stand-in document: pictureImg only creates an element and sets properties
globalThis.document = { createElement: (tag) => ({ tagName: tag.toUpperCase() }) };
const img = pictureImg("bus"), named = pictureImg("bus", { alt: "Bus" });
check("pictureImg", [
  pictureImg("no-such-picture") === null ? null : "unknown id should give null",
  img?.tagName === "IMG" ? null : "not an <img>",
  img?.src === "/img/pic/bus.svg" ? null : `src ${img?.src}`,
  img?.alt === "" ? null : `default alt "${img?.alt}"`,
  named?.alt === "Bus" ? null : `alt "${named?.alt}"`,
  img?.width === 128 && img?.height === 128 ? null : `size ${img?.width}×${img?.height}`,
  img?.decoding === "async" ? null : `decoding ${img?.decoding}`,
  img?.draggable === false ? null : `draggable ${img?.draggable}`,
]);
delete globalThis.document;

// ---- report ----
let failed = 0;
for (const [name, problems] of results) {
  if (problems.length) failed++;
  console.log(`${problems.length ? "FAIL" : "ok  "}  ${name}`);
  for (const p of problems.slice(0, 12)) console.log(`        ${p}`);
  if (problems.length > 12) console.log(`        … and ${problems.length - 12} more`);
}
const menuOnly = used.filter((f) => !pictureFiles.has(f)).length;
const noto = used.filter((f) => NOTO_FILES[f]).length;
console.log(`\n${PICTURES.length} pictures and ${Object.keys(MENU_ICONS).length} menu icons in ${used.length} files ` +
  `(${used.length - menuOnly} pictures, ${menuOnly} menu only; ${noto} Noto, ${used.length - noto} ours, ` +
  `${withParts.length} of them with Noto parts) and ${LICENSE_FILE}: ${(total / 1024).toFixed(1)} KB`);
console.log(failed ? `${failed} of ${results.length} checks failed` : `all ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
