// The body Hurts asks "Where?" with: a plain figure seen from the front, drawn
// in the page (inline SVG) rather than a picture file, so a region can light
// up. It is made of separate rounded parts, like an artist's wooden
// mannequin — head, ears, neck, chest, tummy, arms, hands, legs, feet — so
// each region reads as a piece of its own, with a face of two eyes and a
// mouth: age-neutral, no expression, no skin colour (a pale grey), no hair.
// Seen from behind (view "back", for "My back") it has hair and a spine.
//
// All of it is data here (plain numbers, no DOM), so node
// tools/test-i-need.mjs can check it: every region can be tapped, the tap
// areas don't overlap, and they are big enough on a phone. The DOM is only
// touched when bodyDrawing() is called.
//
//   VIEW    the drawing's own units (its viewBox): 200 wide, 378 tall
//   PARTS   the pieces of the figure, back to front; region: what tapping it
//           says (null: the head itself — the face has regions of its own)
//   MARKS   what lights up for a region that isn't a whole piece: the top of
//           the head, round the eyes, round the mouth
//   SPOTS   where to tap for each region: rectangles in the drawing's units,
//           none overlapping. A region that comes in two (ears, arms, hands)
//           has a spot on each side; main marks the one screen readers get,
//           so each region is named once.
//   CLOSE_UP  the head and neck only (a viewBox): a card about the face
//           shows this, so the lit eyes or ear are big enough to see
//
// Colours are the drawing's own attributes, not CSS, so it looks the same
// wherever it goes — on the tool's screen and on the shared card, which is
// outside the tool's block (and its stylesheet). Only the pressed and focused
// state ("is-lit") comes from css/tools/i-need.css, on the tool's screen.

import { REGIONS } from "./i-need-cards.js";

export const VIEW = Object.freeze({ width: 200, height: 378 });

export const COLOURS = Object.freeze({
  body: "#eceff1", // blue-grey 50: a body, not a skin colour
  line: "#37474f", // blue-grey 800: 9.9:1 on white, 8.6:1 on the body
  hair: "#546e7a",
  on: "#d32f2f", // it hurts here: red 700, 5:1 on white
});

// Where the face's regions are drawn — a card about one of them shows the
// close-up (the head, ears and neck) instead of the whole body
export const FACE_REGIONS = Object.freeze(["head", "eyes", "ear", "mouth", "throat"]);
export const CLOSE_UP = Object.freeze({ x: 22, y: 0, width: 156, height: 150 });
// head to hips, arms and hands: the My back button's picture, big enough to
// see the hair and the spine
export const UPPER = Object.freeze({ x: 12, y: 0, width: 176, height: 272 });

// ---- shapes ----

const r2 = (n) => Math.round(n * 100) / 100;

// A limb: the outline round two circles (centres x1,y1 and x2,y2, radii r1
// and r2) — a capsule that narrows from r1 to r2. SVG's y points down, so
// "sweep 0" runs anticlockwise on the screen: round the far end, back up the
// other side, and the long way round the near end.
export function capsule(x1, y1, rA, x2, y2, rB) {
  const length = Math.hypot(x2 - x1, y2 - y1);
  const ux = (x2 - x1) / length;
  const uy = (y2 - y1) / length;
  const s = (rA - rB) / length; // the sides lean in by this much
  const c = Math.sqrt(1 - s * s);
  const a = [-uy * c + ux * s, ux * c + uy * s]; // one side's outward normal
  const b = [uy * c + ux * s, -ux * c + uy * s]; // the other side's
  const at = (x, y, r, [nx, ny]) => `${r2(x + r * nx)} ${r2(y + r * ny)}`;
  return `M ${at(x1, y1, rA, a)} L ${at(x2, y2, rB, a)} A ${rB} ${rB} 0 0 0 ${at(x2, y2, rB, b)} ` +
    `L ${at(x1, y1, rA, b)} A ${rA} ${rA} 0 1 0 ${at(x1, y1, rA, a)} Z`;
}

const ellipse = (region, cx, cy, rx, ry, name = region) => Object.freeze({ kind: "ellipse", region, name, cx, cy, rx, ry });
const path = (region, d, name = region) => Object.freeze({ kind: "path", region, name, d });

// The head: its outline, and the top of it (the "head" region) — the part of
// the head above the eyebrows, drawn just inside the outline so the red
// never covers the line.
const HEAD = { cx: 100, cy: 54, rx: 38, ry: 48 };
function headTop(lineY, inset = 1.5) {
  const rx = HEAD.rx - inset;
  const ry = HEAD.ry - inset;
  const half = rx * Math.sqrt(1 - ((lineY - HEAD.cy) / ry) ** 2);
  return `M ${r2(HEAD.cx - half)} ${lineY} A ${rx} ${ry} 0 0 1 ${r2(HEAD.cx + half)} ${lineY} Z`;
}

// back to front: the ears sit behind the head, so only their outer halves show
export const PARTS = Object.freeze([
  ellipse("ear", 58, 58, 9, 14, "ear-left"),
  ellipse("ear", 142, 58, 9, 14, "ear-right"),
  ellipse(null, HEAD.cx, HEAD.cy, HEAD.rx, HEAD.ry, "head"),
  path("throat", "M 94 104 H 106 Q 113 104 113 111 V 130 H 87 V 111 Q 87 104 94 104 Z", "neck"),
  path("chest", "M 72 134 H 128 Q 146 134 147 152 L 143 196 H 57 L 53 152 Q 54 134 72 134 Z"),
  path("tummy", "M 57 200 H 143 L 145 246 Q 145 258 133 258 H 67 Q 55 258 55 246 Z"),
  path("arm", capsule(40, 144, 10, 31, 228, 7.5), "arm-left"),
  path("arm", capsule(160, 144, 10, 169, 228, 7.5), "arm-right"),
  ellipse("hand", 29, 252, 11, 14, "hand-left"),
  ellipse("hand", 171, 252, 11, 14, "hand-right"),
  path("leg", capsule(80, 278, 15, 81, 336, 9), "leg-left"),
  path("leg", capsule(120, 278, 15, 119, 336, 9), "leg-right"),
  ellipse("foot", 75, 358, 17, 9, "foot-left"),
  ellipse("foot", 125, 358, 17, 9, "foot-right"),
]);

// the face's regions, which light up without a piece of their own
export const MARKS = Object.freeze([
  path("head", headTop(36), "head-top"),
  ellipse("eyes", 85, 50, 10, 10, "eye-left"),
  ellipse("eyes", 115, 50, 10, 10, "eye-right"),
  ellipse("mouth", 100, 81, 15, 9, "mouth"),
]);

// the face itself (front) and the spine (back), drawn over everything
const EYES = [[85, 50], [115, 50]];
const MOUTH = "M 91 81 H 109";
const SPINE = ["M 100 142 V 188", "M 100 208 V 248"];

// ---- where to tap ----

const spot = (region, x, y, w, h, main = true) => Object.freeze({ region, x, y, w, h, main });

// Head to foot. Between them they cover the figure, with room to spare
// round the small parts: a finger on the neck, the ear or the eyes still
// finds them.
export const SPOTS = Object.freeze([
  spot("head", 50, 0, 100, 38),
  spot("eyes", 64, 38, 72, 28),
  spot("ear", 26, 38, 38, 52),
  spot("ear", 136, 38, 38, 52, false),
  spot("mouth", 64, 66, 72, 36),
  spot("throat", 60, 102, 80, 30),
  spot("chest", 52, 132, 96, 66),
  spot("tummy", 52, 198, 96, 62),
  spot("arm", 12, 132, 40, 104),
  spot("arm", 148, 132, 40, 104, false),
  spot("hand", 6, 236, 46, 36),
  spot("hand", 148, 236, 46, 36, false),
  spot("leg", 52, 260, 96, 86),
  spot("foot", 44, 346, 112, 32),
]);

// the regions the body map has, in screen-reader order — every region but
// My back, which is a button of its own
export const MAP_REGIONS = Object.freeze(REGIONS.filter((r) => r.id !== "back").map((r) => r.id));

// ---- the drawing ----

const NS = "http://www.w3.org/2000/svg";

function svgEl(tag, attrs) {
  const el = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value != null) el.setAttribute(name, String(value));
  }
  return el;
}

function shape(part, attrs) {
  return part.kind === "ellipse"
    ? svgEl("ellipse", { cx: part.cx, cy: part.cy, rx: part.rx, ry: part.ry, ...attrs })
    : svgEl("path", { d: part.d, ...attrs });
}

// The figure as an <svg>, decorative (aria-hidden): whatever it shows is also
// said in words beside it.
//   view    "front", or "back" (hair, a spine; chest and tummy are "back")
//   region  a region to show in red — it hurts here — or null
//   closeUp just the head and neck (CLOSE_UP)
//   upper   head to hips (UPPER)
//   line    the outline's width in the drawing's units: thicker for a small
//           drawing, so it doesn't fade to a hairline
// Every piece and mark carries data-region, for lighting a region up.
export function bodyDrawing({ view = "front", region = null, closeUp = false, upper = false, line = 3 } = {}) {
  const box = closeUp ? CLOSE_UP : upper ? UPPER : { x: 0, y: 0, ...VIEW };
  const svg = svgEl("svg", {
    viewBox: `${box.x} ${box.y} ${box.width} ${box.height}`,
    class: `need-body is-${view === "back" ? "back" : "front"}`,
    "aria-hidden": "true",
    focusable: "false",
  });
  const back = view === "back";
  const regionOf = (part) => (back && (part.region === "chest" || part.region === "tummy") ? "back" : part.region);

  for (const part of PARTS) {
    // head to hips: no legs or feet, whose tops would show as stray arcs
    if (upper && (part.region === "leg" || part.region === "foot")) continue;
    const r = regionOf(part);
    const hair = back && part.name === "head";
    svg.append(shape(part, {
      class: "need-part",
      "data-part": part.name,
      "data-region": r ?? undefined,
      fill: r && r === region ? COLOURS.on : hair ? COLOURS.hair : COLOURS.body,
      stroke: COLOURS.line,
      "stroke-width": line,
      "stroke-linejoin": "round",
    }));
  }

  if (back) {
    for (const d of SPINE) {
      svg.append(svgEl("path", { d, fill: "none", stroke: COLOURS.line, "stroke-width": line * 0.8, "stroke-linecap": "round" }));
    }
    return svg;
  }

  for (const mark of MARKS) {
    svg.append(shape(mark, {
      class: "need-mark",
      "data-part": mark.name,
      "data-region": mark.region,
      // transparent, not none: a mark lights up under a finger (is-lit)
      fill: mark.region === region ? COLOURS.on : "transparent",
    }));
  }
  for (const [cx, cy] of EYES) {
    svg.append(svgEl("ellipse", { cx, cy, rx: 4.5, ry: 6, fill: COLOURS.line }));
  }
  svg.append(svgEl("path", { d: MOUTH, fill: "none", stroke: COLOURS.line, "stroke-width": 3.5, "stroke-linecap": "round" }));
  return svg;
}
