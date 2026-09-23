// Build public/img/pic/ — the pictures listed in public/js/pictures.js.
//
//   node tools/make-pictures.mjs          all of them
//   node tools/make-pictures.mjs bus kopi only these files (names without .svg)
//
// Two kinds of file, both written minified:
// - Noto Emoji SVGs (NOTO_FILES in pictures.js), downloaded from a pinned
//   release of googlefonts/noto-emoji — the svg/ folder is Apache-2.0 (its
//   own svg/LICENSE; the fonts are OFL) — and cached in the system temp
//   folder, so a re-run needs no network. The minifier is lossless: it drops
//   what Illustrator adds (comments, ids nothing uses, style="" → attributes,
//   duplicate clip outlines) and never rounds a number, so every picture
//   renders pixel-for-pixel as upstream.
// - Our own drawings (DRAWINGS below): the Singapore things Noto doesn't have,
//   and a few pictures it has none for. Some are built around Noto parts
//   (hands, faces, an apple, a spoon, bubbles), placed with part(); `parts`
//   lists them, and THIRD_PARTY_NOTICES.md must name every Noto file used
//   either way — node tools/test-pictures.mjs checks it.
// The menu's icons (MENU_ICONS in pictures.js) are built the same way.
//
// Apache-2.0 asks that whoever gets the files gets the licence, and that a
// changed file says it was changed. Hosting serves only public/, so every
// file with Noto in it starts with a comment naming its upstream file(s) and
// what was changed, and this script writes public/img/pic/LICENSE.txt beside
// them: the copyright line, the changes, the file list and the licence text
// (taken from THIRD_PARTY_NOTICES.md).
//
// The drawings follow Noto's look so they sit well beside it: a 128×128 box,
// flat Material colours, one darker shade and one highlight, rounded shapes,
// no outlines. Generic, never an operator's or brand's design: no logos, no
// livery, no card artwork, no lettering except a bus route number (drawn as
// LED segments, so no font is involved). Each must read at 48 px and at
// 200 px.
//
// To update Noto: change NOTO_TAG/NOTO_COMMIT (a release whose svg/LICENSE
// is still Apache-2.0 — on main the folder is now 2D/svg), run this, then
// look at every picture again. Afterwards: node tools/test-pictures.mjs, and
// bump CACHE in public/sw.js.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PICTURES, NOTO_FILES, MENU_ICONS } from "../public/js/pictures.js";

export const NOTO_TAG = "v2.051";
export const NOTO_COMMIT = "8998f5dd683424a73e2314a8c1f1e359c19e8742";
const NOTO_URL = (name) => `https://raw.githubusercontent.com/googlefonts/noto-emoji/${NOTO_COMMIT}/svg/${name}`;
const CACHE = join(tmpdir(), `noto-emoji-${NOTO_COMMIT.slice(0, 7)}`);
const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const OUT = join(ROOT, "public", "img", "pic");

// Every file the app uses: the pictures, then the menu-only icons.
export const FILES = [...new Set([...PICTURES.map((p) => p.file), ...Object.values(MENU_ICONS)])];
export const COPYRIGHT = "Copyright 2013 Google, Inc. All Rights Reserved.";
export const LICENSE_FILE = "LICENSE.txt";

// ---------------------------------------------------------------- minifier

// Enough XML for SVG files that hold only elements: no text, no CDATA.
function parse(src) {
  const root = { name: "#root", attrs: [], kids: [] };
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/([\w:-]+)\s*>|<([\w:-]+)((?:\s+[\w:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/y;
  while (re.lastIndex < src.length) {
    const m = re.exec(src);
    if (!m) throw new Error(`cannot read the SVG near: ${src.slice(re.lastIndex, re.lastIndex + 40)}`);
    const [, close, open, attrText, selfClose, text] = m;
    if (close) {
      const top = stack.pop();
      if (top.name !== close) throw new Error(`</${close}> closes <${top.name}>`);
    } else if (open) {
      const attrs = [];
      for (const a of attrText.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs.push([a[1], a[2] ?? a[3]]);
      const el = { name: open, attrs, kids: [] };
      stack.at(-1).kids.push(el);
      if (!selfClose) stack.push(el);
    } else if (text?.trim()) {
      throw new Error(`text in an SVG: ${text.trim().slice(0, 40)}`);
    }
  }
  if (stack.length !== 1) throw new Error(`<${stack.at(-1).name}> is never closed`);
  const svg = root.kids.find((k) => k.name === "svg");
  if (!svg) throw new Error("no <svg>");
  return svg;
}

const get = (el, name) => el.attrs.find(([k]) => k === name)?.[1];
const set = (el, name, value) => {
  const a = el.attrs.find(([k]) => k === name);
  if (a) a[1] = value; else el.attrs.push([name, value]);
};
const del = (el, name) => { el.attrs = el.attrs.filter(([k]) => k !== name); };
const walk = (el, fn, parent = null) => { fn(el, parent); for (const k of el.kids) walk(k, fn, el); };
const serialize = (el) => {
  const attrs = el.attrs.map(([k, v]) => ` ${k}="${v.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"`).join("");
  return el.kids.length ? `<${el.name}${attrs}>${el.kids.map(serialize).join("")}</${el.name}>` : `<${el.name}${attrs}/>`;
};

// A number written as briefly as it can be, with its value unchanged
// ("0.50" → ".5", "-0.8" → "-.8"). Never rounded: rounding even a
// gradient's matrix to 3 decimals visibly moved some of Noto's edges.
const NUMBER = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/y;
function shortNumber(text) {
  const n = Number(text);
  if (!Number.isFinite(n)) throw new Error(`not a number: ${text}`);
  const plain = String(n); // shortest exact form; may be "1.16e-10"
  return plain.replace(/^(-?)0\./, "$1.");
}

// Path data and number lists: shortest numbers, separators only where a
// reader needs them, and a command letter dropped where it repeats (its
// numbers carry on the one before; not M/m, whose extra pairs mean L/l).
function numbers(text) {
  let out = "";
  let prev = null; // the last number written, while it is the last token
  let prevCommand = null;
  for (let i = 0; i < text.length;) {
    const c = text[i];
    if (/[\s,]/.test(c)) { i++; continue; }
    if (/[a-zA-Z]/.test(c) && !/[eE]/.test(c)) {
      if (!(c === prevCommand && !/[mMzZ]/.test(c) && prev !== null)) { out += c; prev = null; }
      prevCommand = c;
      i++;
      continue;
    }
    NUMBER.lastIndex = i;
    const m = NUMBER.exec(text);
    if (!m) throw new Error(`bad number list near: ${text.slice(i, i + 20)}`);
    const t = shortNumber(m[0]);
    if (prev !== null && !(t.startsWith("-") || (t.startsWith(".") && /[.eE]/.test(prev)))) out += " ";
    out += t;
    prev = t;
    i = NUMBER.lastIndex;
  }
  return out;
}

function color(v) {
  v = v.trim();
  if (!/^#(?:[0-9a-f]{3}){1,2}$/i.test(v)) return v; // url(#…), none: as they are
  v = v.toLowerCase();
  const m = /^#([0-9a-f])\1([0-9a-f])\2([0-9a-f])\3$/.exec(v);
  return m ? `#${m[1]}${m[2]}${m[3]}` : v;
}

const PRESENTATION = new Set([
  "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit",
  "stroke-dasharray", "stroke-dashoffset", "stroke-opacity", "fill-opacity", "fill-rule", "clip-rule",
  "opacity", "stop-color", "stop-opacity", "clip-path", "display", "visibility",
]);
// enable-background is Illustrator's; overflow on a <use> in a clipPath does nothing
const DROPPED_STYLE = new Set(["enable-background", "overflow"]);
const DEFAULTS = { opacity: "1", "fill-opacity": "1", "stroke-opacity": "1", "stop-opacity": "1" };
const NUMERIC = /^(?:x|y|x1|y1|x2|y2|cx|cy|r|rx|ry|fx|fy|fr|width|height|offset|stroke-width|stroke-miterlimit|opacity|fill-opacity|stroke-opacity|stop-opacity)$/;

export function minify(src) {
  const svg = parse(src);
  const viewBox = get(svg, "viewBox");
  if (!viewBox) throw new Error("no viewBox");
  svg.attrs = [["xmlns", "http://www.w3.org/2000/svg"], ["viewBox", numbers(viewBox)]];

  walk(svg, (el) => {
    const style = get(el, "style");
    if (style !== undefined) {
      del(el, "style");
      for (const decl of style.split(";")) {
        const i = decl.indexOf(":");
        if (i < 0) continue;
        const k = decl.slice(0, i).trim(), v = decl.slice(i + 1).trim();
        if (DROPPED_STYLE.has(k)) continue;
        if (!PRESENTATION.has(k)) throw new Error(`style property ${k} is not handled`);
        set(el, k, v);
      }
    }
    if (el !== svg) for (const k of ["xml:space", "version", "xmlns", "xmlns:xlink"]) del(el, k);
    for (const a of el.attrs) {
      const [k, v] = a;
      if (k === "xlink:href") a[0] = "href"; // iOS 15.4+ and Android Chrome read plain href
      if (k === "fill" || k === "stroke" || k === "stop-color") a[1] = color(v);
      else if (k === "d" || k === "points" || NUMERIC.test(k)) a[1] = numbers(v);
      else if (k === "transform" || k === "gradientTransform") a[1] = v.trim().replace(/\s*\(([^)]*)\)\s*/g, (_, inner) => `(${numbers(inner)})`);
    }
    for (const [k, v] of Object.entries(DEFAULTS)) if (get(el, k) === v) del(el, k);
  });

  // what refers to what
  const refs = new Map();
  const countRefs = () => {
    refs.clear();
    walk(svg, (el) => {
      for (const [k, v] of el.attrs) {
        for (const m of v.matchAll(/url\(#([^)]+)\)/g)) refs.set(m[1], (refs.get(m[1]) ?? 0) + 1);
        if (k === "href" && v.startsWith("#")) refs.set(v.slice(1), (refs.get(v.slice(1)) ?? 0) + 1);
      }
    });
  };
  countRefs();

  // <defs><path id=p/></defs><clipPath><use href=#p/></clipPath>
  //   → <clipPath><path/></clipPath>
  const byId = new Map();
  walk(svg, (el, parent) => { const id = get(el, "id"); if (id) byId.set(id, { el, parent }); });
  walk(svg, (el) => {
    if (el.name !== "clipPath" || el.kids.length !== 1 || el.kids[0].name !== "use") return;
    const use = el.kids[0];
    const target = get(use, "href")?.slice(1);
    const found = target && byId.get(target);
    if (!found || refs.get(target) !== 1 || found.parent?.name !== "defs") return;
    if (use.attrs.some(([k]) => k !== "href")) return;
    found.parent.kids = found.parent.kids.filter((k) => k !== found.el);
    del(found.el, "id");
    el.kids = [found.el];
  });

  // Illustrator repeats a shape's outline in the clipPath that clips its
  // shading. When nothing is transformed, both copies are in the same
  // coordinates, so the clipPath can use the visible copy.
  let transformed = false;
  walk(svg, (el) => { if (get(el, "transform") !== undefined) transformed = true; });
  if (!transformed) {
    const visible = new Map();
    const scan = (el, hidden) => {
      for (const k of el.kids) {
        const h = hidden || k.name === "defs" || k.name === "clipPath";
        if (!h && k.name === "path" && !visible.has(get(k, "d"))) visible.set(get(k, "d"), k);
        scan(k, h);
      }
    };
    scan(svg, false);
    let twins = 0;
    walk(svg, (el) => {
      if (el.name !== "clipPath" || el.kids.length !== 1 || el.kids[0].name !== "path") return;
      const shape = el.kids[0];
      if (shape.attrs.some(([k]) => k !== "d")) return;
      const twin = visible.get(get(shape, "d"));
      if (!twin) return;
      if (!get(twin, "id")) set(twin, "id", `twin-${twins++}`);
      el.kids = [{ name: "use", attrs: [["href", `#${get(twin, "id")}`]], kids: [] }];
    });
  }
  walk(svg, (el) => { el.kids = el.kids.filter((k) => !(k.name === "defs" && k.kids.length === 0)); });
  countRefs();

  // ids: only the ones something refers to, renamed a, b, … z, A, … aa
  const ABC = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const shortName = (i) => { let s = ""; do { s = ABC[i % 52] + s; i = Math.floor(i / 52) - 1; } while (i >= 0); return s; };
  const rename = new Map([...refs.keys()].map((id, i) => [id, shortName(i)]));
  walk(svg, (el) => {
    const id = get(el, "id");
    if (id !== undefined) { if (rename.has(id)) set(el, "id", rename.get(id)); else del(el, "id"); }
    for (const a of el.attrs) {
      a[1] = a[1].replace(/url\(#([^)]+)\)/g, (_, id) => `url(#${rename.get(id) ?? id})`);
      if (a[0] === "href" && a[1].startsWith("#")) a[1] = `#${rename.get(a[1].slice(1)) ?? a[1].slice(1)}`;
    }
  });

  // a <g> with no attributes does nothing; an empty one draws nothing
  const tidy = (el) => {
    el.kids = el.kids.flatMap((k) => {
      tidy(k);
      if (k.name === "g" && k.kids.length === 0) return [];
      return k.name === "g" && k.attrs.length === 0 ? k.kids : [k];
    });
  };
  tidy(svg);
  return serialize(svg);
}

// ---------------------------------------------------------------- Noto

async function notoSource(name) {
  const cached = join(CACHE, name);
  if (existsSync(cached)) return readFileSync(cached, "utf8");
  const res = await fetch(NOTO_URL(name));
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status} from ${NOTO_URL(name)}`);
  const text = await res.text();
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(cached, text);
  return text;
}

// A Noto file's drawing, to go inside one of ours: its 128×128 box placed
// with its top-left corner at (x, y), scaled by s, mirrored left-right with
// flip, turned by rotate degrees (clockwise, about its centre) and, with
// clip [x, y, width, height] in its own units, cut down to that rectangle.
// Its ids get a prefix, so two parts (or a part and the drawing) never share
// one. What was done to each part is recorded for the notices.
let partCount = 0;
const partsUsed = new Map(); // upstream name → Set of changes, for the drawing being made
async function part(name, { x = 0, y = 0, s = 1, flip = false, rotate = 0, clip = null } = {}) {
  const changes = partsUsed.get(name) ?? new Set();
  partsUsed.set(name, changes);
  if (x || y) changes.add("moved");
  if (s !== 1) changes.add("scaled");
  if (flip) changes.add("mirrored");
  if (rotate) changes.add("rotated");
  if (clip) changes.add("cropped");
  const svg = parse(minify(await notoSource(name)));
  const prefix = `p${++partCount}-`;
  walk(svg, (el) => {
    for (const a of el.attrs) {
      if (a[0] === "id") a[1] = prefix + a[1];
      a[1] = a[1].replace(/url\(#([^)]+)\)/g, (_, id) => `url(#${prefix}${id})`);
      if (a[0] === "href" && a[1].startsWith("#")) a[1] = `#${prefix}${a[1].slice(1)}`;
    }
  });
  const t = [`translate(${x + (flip ? 128 * s : 0)} ${y})`];
  if (s !== 1 || flip) t.push(`scale(${flip ? -s : s} ${s})`);
  if (rotate) t.push(`rotate(${rotate} 64 64)`);
  let body = svg.kids.map(serialize).join("");
  if (clip) {
    const [cx, cy, cw, ch] = clip;
    body = `<clipPath id="${prefix}cut"><rect x="${cx}" y="${cy}" width="${cw}" height="${ch}"/></clipPath>` +
      `<g clip-path="url(#${prefix}cut)">${body}</g>`;
  }
  return `<g transform="${t.join(" ")}">${body}</g>`;
}

// ---------------------------------------------------------------- drawing kit

const svg = (...body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">${body.join("")}</svg>`;
const attrs = (a) => Object.entries(a).map(([k, v]) => ` ${k}="${v}"`).join("");
const rect = (x, y, width, height, fill, rx = 0, more = {}) => `<rect${attrs({ x, y, width, height, ...(rx ? { rx } : {}), fill, ...more })}/>`;
const circle = (cx, cy, r, fill, more = {}) => `<circle${attrs({ cx, cy, r, fill, ...more })}/>`;
const ellipse = (cx, cy, rx, ry, fill, more = {}) => `<ellipse${attrs({ cx, cy, rx, ry, fill, ...more })}/>`;
const path = (d, fill, more = {}) => `<path${attrs({ d, fill, ...more })}/>`;
const line = (d, stroke, width, more = {}) => path(d, "none", { stroke, "stroke-width": width, "stroke-linecap": "round", "stroke-linejoin": "round", ...more });
const g = (more, ...body) => `<g${attrs(more)}>${body.join("")}</g>`;

// Material colours, as Noto uses them
const C = {
  red: "#e53935", redDark: "#c62828",
  green: "#43a047", greenDark: "#2e7d32", greenLight: "#66bb6a",
  blue: "#1e88e5", blueDark: "#1565c0",
  sky: "#4fc3f7", skyLight: "#b3e5fc", skyPale: "#e1f5fe", skyMid: "#81d4fa",
  amber: "#ffca28", yellowPale: "#fff59d",
  brown: "#8d6e63", brownDark: "#6d4c41", brownDeep: "#5d4037", brownLight: "#a1887f",
  white: "#fafafa", grey50: "#f5f5f5", grey100: "#eeeeee", grey200: "#e0e0e0", grey400: "#bdbdbd",
  grey500: "#9e9e9e", grey600: "#757575", grey700: "#616161", grey800: "#424242", grey900: "#212121",
  bg100: "#cfd8dc", bg200: "#b0bec5", bg300: "#90a4ae", bg400: "#78909c", bg600: "#546e7a", bg700: "#455a64", bg800: "#37474f",
};

// One LED "8": the segments of a 7-segment digit, top-left at (x, y).
const led8 = (x, y, w, h, t, fill) => {
  const v = (h - 3 * t) / 2;
  return [
    rect(x + t, y, w - 2 * t, t, fill), rect(x + t, y + (h - t) / 2, w - 2 * t, t, fill), rect(x + t, y + h - t, w - 2 * t, t, fill),
    rect(x, y + t, t, v, fill), rect(x + w - t, y + t, t, v, fill),
    rect(x, y + (h + t) / 2, t, v, fill), rect(x + w - t, y + (h + t) / 2, t, v, fill),
  ].join("");
};

const n2 = (v) => Math.round(v * 100) / 100;

// ")))": contactless waves, arcs of 80° opening to the right from (cx, cy).
// Three arcs, not the four of the payment networks' own symbol.
const waves = (cx, cy, radii, stroke, width) => radii.map((r) => {
  const a = (40 * Math.PI) / 180;
  const x = n2(cx + r * Math.cos(a)), y1 = n2(cy - r * Math.sin(a)), y2 = n2(cy + r * Math.sin(a));
  return line(`M${x} ${y1}A${n2(r)} ${n2(r)} 0 0 1 ${x} ${y2}`, stroke, width);
}).join("");

// A card seen flat: blue, a darker lower band, a soft shine, contactless
// waves. Plain on purpose: no bank's or operator's colours or artwork.
let cards = 0;
const card = (x, y, w, h) => {
  const id = `card${++cards}`;
  const rx = n2(h * 0.14);
  return `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"/></clipPath>` +
    g({ "clip-path": `url(#${id})` },
      rect(x, y, w, h, C.blue),
      rect(x, n2(y + h * 0.74), w, n2(h * 0.26), C.blueDark),
      path(`M${x} ${y}h${n2(w * 0.5)}l-${n2(w * 0.22)} ${n2(h * 0.74)}H${x}z`, "#42a5f5", { opacity: 0.55 }),
    ) +
    waves(n2(x + w * 0.6), n2(y + h * 0.44), [h * 0.11, h * 0.23, h * 0.35], "#ffffff", n2(Math.max(3, h * 0.065)));
};

// A tray with a plate of rice, a bowl of soup and a cup, 128 wide at (0, 0).
const TRAY = { front: "#7b4a1f", rim: "#a1662f", floor: "#c4884b" };
const trayWithFood = () => [
  rect(6, 60, 116, 50, TRAY.front, 12),
  rect(6, 54, 116, 50, TRAY.rim, 12),
  rect(13, 60, 102, 38, TRAY.floor, 8),
  // cup, at the back
  rect(98, 56, 16, 18, C.white, 3), ellipse(106, 56, 8, 3, "#795548"), line("M114 60c5 0 5 9 0 9", C.white, 3),
  // plate of rice and greens
  ellipse(38, 80, 25, 12, C.grey200), ellipse(38, 78, 25, 12, C.white), ellipse(38, 78, 17, 8, C.grey100),
  ellipse(35, 75, 11, 6, "#fffde7"), ellipse(46, 78, 7, 4, "#7cb342"),
  // bowl of soup
  path("M62 72c1 14 9 20 21 20s20-6 21-20z", C.white), path("M83 92c12 0 20-6 21-20h-6c-1 12-7 18-15 20z", C.grey200),
  ellipse(83, 72, 21, 6, C.grey100), ellipse(83, 72, 17, 4.5, "#ffb74d"),
];

// A tap on a wall at the left. In its own units the spout's mouth is at
// x 60–76, y 45; (x, y) and s place it.
const tap = (x, y, s = 1) => g({ transform: `translate(${x} ${y})${s === 1 ? "" : ` scale(${s})`}` },
  rect(0, 6, 12, 26, C.bg400, 3),
  path("M10 10h44c12 0 20 8 20 20v10H62v-6c0-6-4-10-10-10H10z", C.bg200),
  path("M10 10h44c9 0 16 5 18.5 13H10z", C.bg100),
  rect(60, 38, 16, 7, C.bg400, 2),
  rect(26, -2, 9, 14, C.bg300, 3),
  rect(16, -6, 30, 7, C.bg200, 3.5),
);

// A striped towel hanging on a rail.
const towel = () => [
  rect(26, 16, 76, 14, "#00897b", 4),
  path("M24 20h80v84c0 3-2 5-5 5H29c-3 0-5-2-5-5z", "#26a69a"),
  rect(24, 20, 80, 8, "#00897b"),
  rect(24, 84, 80, 5, "#80cbc4"), rect(24, 93, 80, 3, "#80cbc4"),
  line("M30 110v6M38 110v6M46 110v6M54 110v6M62 110v6M70 110v6M78 110v6M86 110v6M94 110v6", "#26a69a", 2.5),
  rect(8, 14, 112, 8, C.bg200, 4), circle(10, 18, 6, C.bg300), circle(118, 18, 6, C.bg300),
];

// ---------------------------------------------------------------- our drawings

export const DRAWINGS = {
  // The front of a metro train on its track: white, a dark windscreen, one
  // red band, two lamps. No operator's livery or logo.
  "mrt-train.svg": { parts: [], draw: async () => svg(
    rect(14, 114, 100, 8, C.brown, 3),
    line("M45 100L37 124", C.bg400, 6), line("M83 100L91 124", C.bg400, 6),
    path("M26 106V36C26 16 42 6 64 6s38 10 38 30v70z", C.grey100),
    path("M102 36v70h-8V38c0-13-5-23-13-29 13 4 21 14 21 27z", C.bg100),
    rect(34, 20, 60, 38, C.bg800, 10),
    path("M42 55l17-32h11L53 55z", C.bg600),
    rect(50, 11, 28, 5, C.bg700, 2.5),
    rect(26, 64, 76, 9, C.red),
    rect(33, 79, 16, 9, C.yellowPale, 4.5), rect(79, 79, 16, 9, C.yellowPale, 4.5),
    rect(26, 94, 76, 12, C.bg200),
    rect(54, 96, 20, 10, C.bg600, 3),
  ) },

  // A Singapore-style double-deck bus, side on, facing left with its doors
  // towards us (Singapore drives on the left). Plain green, route 88 on
  // the side display.
  "bus.svg": { parts: [], draw: async () => svg(
    `<clipPath id="body"><path d="M6 34C6 22 14 14 26 14h86c6 0 10 4 10 10v68c0 3-3 6-6 6H12c-3 0-6-3-6-6z"/></clipPath>`,
    g({ "clip-path": "url(#body)" },
      rect(0, 0, 128, 128, C.green),
      rect(0, 14, 128, 6, C.greenLight),
      rect(0, 47, 128, 4, "#388e3c"),
      rect(0, 86, 128, 12, C.greenDark),
      circle(36, 98, 15, "#1b5e20"), circle(100, 98, 15, "#1b5e20"),
    ),
    // upper deck: one long window, rounded at the front
    path("M10 37c0-8 6-14 14-14h92v22H10z", C.skyLight),
    path("M14 45l10-22h7L21 45zM98 45l10-22h5l-10 22z", C.skyPale),
    ...[34, 54, 74, 94].map((x) => rect(x, 23, 3, 22, C.green)),
    // lower deck: front door, the route number, the middle door, windows
    rect(10, 55, 14, 33, C.skyLight, 2), rect(16, 55, 2, 33, C.green),
    rect(28, 55, 34, 20, C.skyLight, 3),
    rect(31, 57, 28, 16, C.grey900, 2),
    led8(34, 59, 10, 12, 2.2, "#ffb300"), led8(46, 59, 10, 12, 2.2, "#ffb300"),
    rect(66, 55, 14, 33, C.skyLight, 2), rect(72, 55, 2, 33, C.green),
    rect(84, 55, 32, 20, C.skyLight, 3), rect(99, 55, 3, 20, C.green),
    path("M86 75l8-20h5l-8 20z", C.skyPale),
    // mirror, headlight, wheels
    line("M7 50c-3 0-5 2-5 5", C.grey800, 2.5), rect(0, 54, 5, 12, C.grey800, 2),
    rect(6, 78, 5, 7, C.yellowPale, 1.5),
    circle(36, 98, 11, C.grey800), circle(36, 98, 5, C.bg200),
    circle(100, 98, 11, C.grey800), circle(100, 98, 5, C.bg200),
  ) },

  // A contactless travel card with a small bus on it, so it reads as a card
  // for travel. No operator's name, colours or artwork.
  "travel-card.svg": { parts: [], draw: async () => svg(
    card(10, 30, 108, 68),
    // a small bus, so it reads as a card for travel
    rect(22, 44, 26, 28, "#ffffff", 6),
    rect(26, 48, 18, 10, C.blue, 2.5),
    circle(28.5, 63.5, 2.2, C.blue), circle(41.5, 63.5, 2.2, C.blue),
    rect(23, 70, 6, 6, "#ffffff", 2), rect(41, 70, 6, 6, "#ffffff", 2),
  ) },

  // A payment terminal with a card touching it: paying by card, and the
  // Steps card "Tap card" (the same picture).
  "card-reader.svg": { parts: [], draw: async () => svg(
    rect(30, 36, 64, 88, C.grey800, 12),
    rect(30, 36, 60, 84, C.grey700, 11),
    rect(38, 46, 44, 26, "#80deea", 4),
    ...[0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => rect(40 + c * 14, 80 + r * 12, 11, 8, c === 2 && r === 2 ? C.green : C.grey400, 2.5))),
    g({ transform: "rotate(-18 82 30)" }, card(52, 8, 60, 38)),
  ) },

  // A phone's camera scanning a stall's QR code: the dark camera view, the
  // code on its white sign, and the scanner's corner brackets around it.
  // (At a stall you scan the stall's code, not show your own.) The pattern
  // is QR-like, not a readable code.
  "pay-qr.svg": { parts: [], draw: async () => {
    const m = 4.2, q = 64 - 4.5 * m; // one module; the pattern's top-left corner (9 × 9 modules, centred)
    const finder = (x, y) => rect(x, y, 3 * m, 3 * m, C.grey900, 1.5) + rect(x + m * 0.45, y + m * 0.45, m * 2.1, m * 2.1, C.white, 0.8) + rect(x + m * 0.9, y + m * 0.9, m * 1.2, m * 1.2, C.grey900, 0.6);
    const dots = [[3, 0], [5, 0], [4, 1], [3, 2], [5, 2], [0, 3], [2, 3], [4, 3], [6, 3], [8, 3], [1, 4], [3, 4], [5, 4], [7, 4],
      [0, 5], [4, 5], [6, 5], [8, 5], [3, 6], [5, 6], [7, 6], [4, 7], [6, 7], [8, 7], [3, 8], [5, 8], [8, 8]];
    const b = 25, k = 10; // brackets: half the square they frame, and each arm's length
    const bracket = (sx, sy) => line(`M${64 + sx * b} ${n2(64 + sy * (b - k))}V${64 + sy * b}H${n2(64 + sx * (b - k))}`, C.amber, 4.5);
    return svg(
      rect(32, 6, 64, 116, C.grey900, 12),
      rect(37, 16, 54, 94, C.bg700, 4),
      rect(56, 10, 16, 3, C.grey700, 1.5),
      rect(q - 4, q - 4, 9 * m + 8, 9 * m + 8, C.white, 3),
      finder(q, q), finder(q + 6 * m, q), finder(q, q + 6 * m),
      ...dots.map(([c, r]) => rect(n2(q + c * m), n2(q + r * m), m, m, C.grey900)),
      bracket(-1, -1), bracket(1, -1), bracket(-1, 1), bracket(1, 1),
    );
  } },

  // A food tray with a plate of rice, a bowl of soup and a cup.
  "tray.svg": { parts: [], draw: async () => svg(...trayWithFood()) },

  // A tray-return rack: trays in its slots, and one going in.
  "tray-return.svg": { parts: [], draw: async () => svg(
    rect(62, 6, 60, 116, C.bg100, 4),
    ...[28, 50, 94].map((y) => rect(66, y, 52, 6, TRAY.rim, 2) + ellipse(80, y - 3, 9, 3.5, C.white) + path(`M93 ${y - 6}c0 4 3 6 7 6s7-2 7-6z`, C.grey200)),
    rect(66, 74, 52, 3, C.bg300, 1.5),
    rect(62, 6, 6, 116, C.bg300, 3), rect(116, 6, 6, 116, C.bg300, 3),
    rect(62, 116, 60, 6, C.bg400, 3), rect(62, 6, 60, 6, C.bg400, 3),
    g({ transform: "translate(0 38) scale(.46)" }, ...trayWithFood()),
    path("M8 44h30v-9l18 15-18 15v-9H8z", C.green),
  ) },

  // A kopi cup on its saucer: thick white china with green leaves.
  "kopi.svg": { parts: [], draw: async () => svg(
    line("M50 34c-6-8 6-14 0-24", C.bg100, 4), line("M76 34c-6-8 6-14 0-24", C.bg100, 4),
    ellipse(64, 106, 54, 14, C.grey200), ellipse(64, 102, 54, 14, C.white), ellipse(64, 101, 32, 7, C.grey100),
    line("M96 58c16 0 17 24 1 26", C.white, 8), line("M96 58c16 0 17 24 1 26", C.grey100, 3),
    path("M30 48c0 22 5 47 16 52h36c11-5 16-30 16-52z", C.white),
    path("M98 48c0 22-5 47-16 52h-8c10-6 14-30 14-52z", C.grey100),
    ellipse(64, 48, 34, 10, C.grey50),
    ellipse(64, 49, 29, 7.5, "#8d5b3e"), ellipse(60, 48, 16, 3.5, "#a1714f"),
    line("M34 62c20 5 40 5 60 0", C.greenLight, 3),
    path("M56 78c4-8 12-8 16 0-4 8-12 8-16 0z", C.green), circle(64, 78, 3, C.amber),
    path("M44 76c3-5 8-5 10-1-3 5-8 5-10 1z", C.greenLight), path("M74 75c2-4 7-4 10 1-3 4-8 4-10-1z", C.greenLight),
  ) },

  // A hawker stall: sign (a bowl, no words), striped awning, steel counter.
  "hawker-stall.svg": { parts: [], draw: async () => svg(
    rect(16, 30, 96, 58, "#ffe0b2"),
    rect(16, 4, 96, 20, C.amber, 4),
    path("M53 12h22c0 6-5 10-11 10s-11-4-11-10z", C.red),
    line("M59 10l6-6M64 10l7-6", C.brownDeep, 2),
    // a pot with steam
    line("M31 58c-3-4 3-6 0-10M43 58c-3-4 3-6 0-10", C.bg200, 2.5),
    rect(16, 66, 6, 5, C.grey600, 2), rect(52, 66, 6, 5, C.grey600, 2),
    rect(20, 62, 34, 22, C.grey500, 4), rect(20, 76, 34, 8, C.grey600, 3),
    rect(18, 59, 38, 6, C.grey400, 3),
    // the menu: pictures of dishes, no words
    rect(64, 52, 42, 28, C.white, 3),
    circle(73, 62, 5, "#ef9a9a"), circle(85, 62, 5, "#a5d6a7"), circle(97, 62, 5, "#90caf9"),
    rect(68, 71, 34, 3, C.grey400, 1.5),
    ...[0, 1, 2, 3, 4, 5].map((i) => path(`M${10 + i * 18} 22h18v14a9 9 0 0 1-18 0z`, i % 2 ? C.white : C.red)),
    rect(10, 84, 108, 36, C.bg200, 4),
    rect(10, 84, 108, 7, C.grey100, 3),
    rect(18, 98, 92, 3, C.bg300, 1.5), rect(18, 108, 92, 3, C.bg300, 1.5),
  ) },

  // A lunch box for recess: rice with an egg and greens, a whole apple,
  // carrot sticks. (Noto's bento has sausages, and cut apple drawn small
  // looked like meat; food pictures stay halal-safe, so nothing may.)
  "recess.svg": { parts: ["emoji_u1f34e.svg"], draw: async () => svg(
    rect(16, 12, 96, 34, C.skyMid, 12), rect(24, 18, 80, 6, C.skyLight, 3),
    rect(8, 40, 112, 76, "#0288d1", 16),
    rect(8, 36, 112, 72, C.sky, 16),
    rect(15, 43, 98, 58, "#e1f5fe", 10),
    rect(66, 43, 5, 58, C.sky), rect(71, 77, 42, 5, C.sky),
    // rice, a fried egg, broccoli
    path("M16 100V68c5-6 10-7 15-10 6-4 13-4 19-1 6 3 11 5 15 10v33z", "#fff8e1"),
    path("M16 100v-8c16 4 33 4 49 0v8z", "#ffecb3"),
    ellipse(41, 71, 15, 10, "#ffffff"), circle(43, 70, 6, C.amber),
    circle(24, 94, 6, "#7cb342"), circle(33, 96, 6, "#689f38"), circle(29, 90, 5, "#8bc34a"),
    // a whole apple
    await part("emoji_u1f34e.svg", { x: 75.5, y: 44, s: 0.27 }),
    // carrot sticks
    ...[77, 87, 97].map((x, i) => rect(x, 84 + i * 0.5, 7, 15, "#fb8c00", 3.5)),
  ) },

  // A glass of water: "Water" in I need, and "Drink water" in My day.
  "water.svg": { parts: [], draw: async () => svg(
    path("M31 12h66l-8 102c-.3 3-3 5-6 5H45c-3 0-5.7-2-6-5z", C.skyLight),
    path("M35 16h58l-7.5 94c-.2 2-2 3.5-4 3.5h-35c-2 0-3.8-1.5-4-3.5z", C.skyPale),
    path("M37 40h54l-5.5 70c-.2 2-2 3.5-4 3.5h-35c-2 0-3.8-1.5-4-3.5z", C.sky),
    path("M37 40h54l-.5 6H37.5z", C.skyMid),
    line("M45 24l4 80", "#ffffff", 5, { opacity: 0.7 }),
  ) },

  // A tablet, landscape, apps on its screen.
  "tablet.svg": { parts: [], draw: async () => {
    const colours = ["#0288d1", "#ff80ab", "#fb8c00", "#81d4fa", "#00bfa5", "#eab56e", "#7cb342", "#ffca28", "#ba68c8", "#ef5350"];
    return svg(
      rect(6, 22, 116, 84, C.grey800, 11),
      rect(14, 29, 100, 70, C.grey900, 3),
      circle(10, 64, 1.6, C.grey600),
      ...[0, 1, 2].flatMap((r) => [0, 1, 2, 3, 4].map((c) => rect(21 + c * 18, 35 + r * 19, 12, 12, colours[(r * 5 + c) % colours.length], 3))),
    );
  } },

  // A hand on the tap's lever, turning it on: water starts to run into the
  // basin. (The first step of washing hands: the hand shows the action.)
  "tap-water.svg": { parts: ["emoji_u1faf3.svg"], draw: async () => svg(
    path("M36 102h88c0 12-12 20-26 20H62c-14 0-26-8-26-20z", C.grey100),
    path("M36 102h88c0 3-1 6-2.5 8.5h-83C37 108 36 105 36 102z", C.bg100),
    tap(6, 30),
    path("M68 75h12c0 12 1 22 3 31H65c2-9 3-19 3-31z", C.sky),
    path("M72 75h3c0 12 .5 22 1.5 31h-3.5c1-9 1-19-1-31z", C.skyLight),
    circle(60, 104, 3, C.skyMid), circle(90, 103, 3.5, C.skyMid), circle(96, 96, 2.5, C.skyMid), circle(54, 97, 2.5, C.skyMid),
    await part("emoji_u1faf3.svg", { x: 20, y: -2, s: 0.4, flip: true }),
    line("M64 12c8 1 13 5 15 11", C.bg400, 3.5), path("M83 22l-4 6-4-6z", C.bg400),
  ) },

  // Hands under running water: washing, and rinsing (the same picture).
  "wash-hands.svg": { parts: ["emoji_u1f932.svg"], draw: async () => svg(
    tap(2, 8, 0.85),
    path("M55 46h10c0 12 1 22 2 30H53c1-8 2-18 2-30z", C.sky),
    path("M58.5 46h2.5c0 12 .5 22 1 30h-3c.5-8 .5-18-.5-30z", C.skyLight),
    await part("emoji_u1f932.svg", { x: 20.3, y: 54, s: 0.62 }),
    circle(33, 68, 3.5, C.sky), circle(88, 66, 3.5, C.sky), circle(26, 80, 2.5, C.sky), circle(95, 78, 2.5, C.sky),
  ) },

  // Two hands palm to palm, sliding past each other in soap bubbles, with
  // arcs for the back-and-forth: rubbing hands with soap. (Not the folded
  // hands of Please, which a child would copy instead.)
  "rub-hands.svg": { parts: ["emoji_u1faf1.svg", "emoji_u1faf2.svg", "emoji_u1fae7.svg"], draw: async () => svg(
    await part("emoji_u1faf1.svg", { x: 0, y: 24, s: 0.64 }),
    await part("emoji_u1faf2.svg", { x: 46, y: 38, s: 0.64 }),
    await part("emoji_u1fae7.svg", { x: 84, y: 0, s: 0.36 }),
    await part("emoji_u1fae7.svg", { x: 0, y: 84, s: 0.34, flip: true }),
    // arrows: the top hand slides right, the bottom one left
    line("M30 24c9-6 20-7 30-3", C.bg400, 4), path("M58 14l9 9-12 3z", C.bg400),
    line("M98 112c-9 6-20 7-30 3", C.bg400, 4), path("M70 122l-9-9 12-3z", C.bg400),
  ) },

  // Hands pressing a towel on its rail: drying hands.
  "dry-hands.svg": { parts: ["emoji_u1f91a.svg"], draw: async () => svg(
    ...towel(),
    await part("emoji_u1f91a.svg", { x: 4, y: 58, s: 0.44, flip: true }),
    await part("emoji_u1f91a.svg", { x: 70, y: 58, s: 0.44 }),
  ) },

  // Two hands carrying a tray.
  "carry-tray.svg": { parts: ["emoji_u1faf4.svg"], draw: async () => svg(
    g({ transform: "translate(12 -14) scale(.82)" }, ...trayWithFood()),
    await part("emoji_u1faf4.svg", { x: 4, y: 52, s: 0.5 }),
    await part("emoji_u1faf4.svg", { x: 60, y: 52, s: 0.5, flip: true }),
  ) },

  // A hand wiping a table with a cloth.
  "wipe-table.svg": { parts: ["emoji_u1faf3.svg"], draw: async () => svg(
    rect(14, 90, 9, 32, C.brownDark, 2), rect(105, 90, 9, 32, C.brownDark, 2),
    path("M16 62h96l12 22H4z", C.brownLight),
    rect(4, 84, 120, 8, "#795548", 3),
    path("M38 64h42l6 13H32z", "#aed581"), path("M32 77h54l-1.5 3h-51z", "#8bc34a"),
    await part("emoji_u1faf3.svg", { x: 28, y: 28, s: 0.46 }),
    line("M20 44c-6 6-6 14 0 20M11 40c-8 9-8 20 0 28", C.bg300, 3.5),
    path("M104 40l3 7 7 3-7 3-3 7-3-7-7-3 7-3z", C.amber), path("M116 22l2 4 4 2-4 2-2 4-2-4-4-2 4-2z", C.amber),
  ) },

  // Hands over the ears, eyes shut: too loud.
  "too-loud.svg": { parts: ["emoji_u1f623.svg", "emoji_u1f91a.svg"], draw: async () => svg(
    await part("emoji_u1f623.svg", { x: 18, y: 16, s: 0.72 }),
    await part("emoji_u1f91a.svg", { x: -2, y: 36, s: 0.46, flip: true }),
    await part("emoji_u1f91a.svg", { x: 76, y: 36, s: 0.46 }),
    line("M6 30c-5 4-5 12 0 16M122 30c5 4 5 12 0 16", C.bg400, 3.5),
  ) },

  // Home: an HDB block of flats, where most children in Singapore live — a
  // tall block, rows of windows and corridors, the lift core rising above
  // the roof, the open void deck at the bottom, and laundry drying on poles
  // out of two windows. Generic: no town's colours, no block number, no
  // logo. (Not a house with a chimney: that is also the app's 🏠 button,
  // which means "back to the menu".)
  "home.svg": { parts: [], draw: async () => {
    const facade = "#fff3e0", side = "#ffe0b2", ledge = "#ffb74d";
    const windowsAt = [21, 33, 45, 75, 87, 99];
    const laundry = (y, colour) => line(`M24 ${y}H2`, C.brown, 2.2) +
      path(`M5 ${y}h11l3 5-3.5 1.5V${y + 15}h-10V${y + 6.5}L2 ${y + 5}z`, colour);
    return svg(
      rect(4, 108, 120, 14, "#9ccc65", 7),
      rect(14, 12, 100, 86, facade),
      rect(108, 12, 6, 86, side),
      rect(10, 8, 108, 7, C.bg200, 2),
      rect(56, 2, 16, 96, side), rect(54, 0, 20, 5, C.bg300, 2),
      ...[0, 1, 2, 3, 4, 5].flatMap((i) => {
        const y = 18 + i * 12;
        return [...windowsAt.map((x) => rect(x, y, 8, 7, C.skyLight, 1.5)), rect(14, y + 8, 42, 3, ledge), rect(72, y + 8, 42, 3, ledge)];
      }),
      rect(14, 90, 100, 20, C.bg600),
      ...[14, 36, 60, 84, 106].map((x) => rect(x, 90, 8, 20, facade)),
      rect(10, 88, 108, 4, C.bg200, 2),
      circle(14, 112, 9, "#7cb342"), circle(114, 112, 9, "#7cb342"),
      laundry(33, "#ef5350"), laundry(57, "#42a5f5"),
    );
  } },

  // Eat: a plate with a fork and a spoon, as people eat in Singapore (Noto's
  // plate and fork, its knife cut away, and Noto's spoon turned upright).
  "eat.svg": { parts: ["emoji_u1f37d.svg", "emoji_u1f944.svg"], draw: async () => svg(
    await part("emoji_u1f37d.svg", { x: 0, y: 12, s: 0.84, clip: [0, 0, 107, 128] }),
    await part("emoji_u1f944.svg", { x: 76, y: 38, s: 0.48, rotate: 43.7 }),
  ) },

  // Therapy: an adult and a child at a table with picture cards. The adult
  // wears a headscarf (people in Singapore's schools and clinics do).
  "therapy.svg": { parts: ["emoji_u1f9d5.svg", "emoji_u1f9d2.svg"], draw: async () => svg(
    await part("emoji_u1f9d5.svg", { x: 0, y: 6, s: 0.5 }),
    await part("emoji_u1f9d2.svg", { x: 68, y: 22, s: 0.42 }),
    path("M14 72h100l12 26H2z", C.brownLight),
    rect(2, 98, 124, 7, C.brownDark, 2),
    rect(10, 104, 8, 20, C.brownDark, 2), rect(110, 104, 8, 20, C.brownDark, 2),
    ...[[22, C.red], [54, C.greenLight], [86, C.blue]].map(([x, colour]) =>
      path(`M${x + 2} 78h18l2 14H${x}z`, C.white) + circle(x + 11, 85, 4, colour)),
  ) },

  // The bus's red stop button on its pole, and a finger pressing it.
  "bell.svg": { parts: ["emoji_u1f448.svg"], draw: async () => svg(
    rect(24, 0, 14, 128, C.bg200), rect(24, 0, 4, 128, C.bg100),
    rect(16, 38, 62, 46, C.grey100, 10), rect(16, 76, 62, 8, C.grey200, 4),
    circle(47, 61, 17, C.redDark), circle(47, 60, 15, C.red),
    path("M47 50c-5 0-8 4-8 9v5l-3 3h22l-3-3v-5c0-5-3-9-8-9zM44 69a3 3 0 0 0 6 0z", "#ffffff"),
    await part("emoji_u1f448.svg", { x: 60, y: 33, s: 0.52 }),
  ) },
};

// ---------------------------------------------------------------- build

const list = (words) => words.length < 2 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
const CHANGE_ORDER = ["moved", "scaled", "mirrored", "rotated", "cropped"];
const changeWords = (set) => list(CHANGE_ORDER.filter((c) => set.has(c)));

// The comment at the top of a file with Noto in it: which upstream file(s),
// the copyright and licence, and what was changed (Apache-2.0, section 4).
export function noticeComment(file, parts = null) {
  const where = `Noto Emoji ${NOTO_TAG} (github.com/googlefonts/noto-emoji)`;
  const text = parts
    ? `Parts from ${where}: ${[...parts].map(([name, changes]) => `svg/${name} (${changeWords(changes)})`).join(", ")}, ` +
      `placed in a picture drawn for Simplify. ${COPYRIGHT.split(" All")[0]} Apache License 2.0.`
    : `From ${where} svg/${NOTO_FILES[file]}, minified and renamed by Simplify. ${COPYRIGHT.split(" All")[0]} Apache License 2.0.`;
  if (text.includes("--")) throw new Error(`${file}: "--" cannot go in a comment`);
  return `<!-- ${text} See LICENSE.txt -->`;
}
const withNotice = (text, comment) => text.replace(/^<svg[^>]*>/, (tag) => tag + comment);

// → { text, parts }: parts is null for a whole Noto file, else Map(upstream name → Set of changes)
async function build(file) {
  const upstream = NOTO_FILES[file];
  if (upstream) return { text: withNotice(minify(await notoSource(upstream)), noticeComment(file)), parts: null };
  const drawing = DRAWINGS[file];
  if (!drawing) throw new Error(`${file}: not in NOTO_FILES and no drawing`);
  partsUsed.clear();
  let text = minify(await drawing.draw());
  const parts = new Map([...partsUsed].sort(([a], [b]) => a.localeCompare(b)));
  const used = [...parts.keys()].join(" "), listed = [...drawing.parts].sort().join(" ");
  if (used !== listed) throw new Error(`${file}: uses Noto parts [${used}] but lists [${listed}]`);
  if (parts.size) text = withNotice(text, noticeComment(file, parts));
  return { text, parts };
}

// public/img/pic/LICENSE.txt: what a visitor's device gets along with the
// pictures. The licence text is the one in THIRD_PARTY_NOTICES.md.
export function apacheText() {
  const notices = readFileSync(join(ROOT, "THIRD_PARTY_NOTICES.md"), "utf8");
  const m = /### Apache License, Version 2\.0\n\n```text\n([\s\S]*?)\n```/.exec(notices);
  if (!m) throw new Error("THIRD_PARTY_NOTICES.md has no Apache License text block");
  return m[1];
}

function licenseText(partsByFile) {
  const rows = FILES.filter((f) => NOTO_FILES[f] || partsByFile.get(f)?.size).sort().map((f) => {
    const parts = partsByFile.get(f);
    const from = NOTO_FILES[f] ?? `parts: ${[...parts].map(([name, changes]) => `${name} (${changeWords(changes)})`).join(", ")}`;
    return `${f.padEnd(22)} ${from}`;
  });
  const own = FILES.filter((f) => !NOTO_FILES[f] && !partsByFile.get(f)?.size).sort();
  const wrap = (words, width = 72) => words.reduce((lines, w) => {
    if (lines.length && (lines.at(-1) + " " + w).length <= width) lines[lines.length - 1] += " " + w;
    else lines.push(w);
    return lines;
  }, []).join("\n");
  return `Pictures in this folder: where they come from, and their licence
=================================================================

Most of these pictures are from Noto Emoji by Google, or contain parts of it:

  https://github.com/googlefonts/noto-emoji
  release ${NOTO_TAG} (commit ${NOTO_COMMIT}), folder svg/

  ${COPYRIGHT}
  Licensed under the Apache License, Version 2.0 (the full text is at
  the end of this file): https://www.apache.org/licenses/LICENSE-2.0

Changes made by Simplify (https://simplify.whiz.coach/)
- Every Noto file used was minified: comments, editor attributes and
  unused ids removed, style attributes turned into presentation
  attributes, numbers written more briefly. Nothing was rounded, so a
  file taken whole draws exactly as its upstream file; it was renamed.
- In the files marked "parts", Noto drawings were placed in a picture
  drawn for Simplify: moved, scaled and, where it says so, mirrored,
  rotated or cropped.
- Each of these files has a comment at the top naming its upstream
  file(s) and what was changed.

File in this folder    From Noto Emoji svg/
${rows.join("\n")}

The other files are drawn for Simplify, with no Noto parts:
${wrap(own)}

------------------------------------------------------------------------

${apacheText()}
`;
}

async function main() {
  const only = new Set(process.argv.slice(2).map((a) => a.replace(/\.svg$/, "") + ".svg"));
  for (const f of only) if (!FILES.includes(f)) throw new Error(`${f} is not a picture or menu icon in pictures.js`);
  mkdirSync(OUT, { recursive: true });
  const partsByFile = new Map();
  for (const file of FILES) {
    // every file is made (the licence lists them all); only the asked-for ones are written
    const { text, parts } = await build(file);
    if (parts) partsByFile.set(file, parts);
    if (only.size && !only.has(file)) continue;
    writeFileSync(join(OUT, file), text);
    console.log(`${file.padEnd(22)} ${String(text.length).padStart(6)} B  ${NOTO_FILES[file] ?? (parts?.size ? `own, parts: ${[...parts.keys()].join(" ")}` : "own drawing")}`);
  }
  writeFileSync(join(OUT, LICENSE_FILE), licenseText(partsByFile));
  const onDisk = readdirSync(OUT).filter((f) => !f.startsWith("."));
  const stray = onDisk.filter((f) => f !== LICENSE_FILE && !FILES.includes(f));
  if (stray.length) console.log(`\nnot in pictures.js (delete them?): ${stray.join(" ")}`);
  const total = onDisk.reduce((n, f) => n + readFileSync(join(OUT, f)).length, 0);
  console.log(`\npublic/img/pic: ${onDisk.length - 1} pictures and ${LICENSE_FILE}, ${(total / 1024).toFixed(1)} KB (Noto Emoji ${NOTO_TAG})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
