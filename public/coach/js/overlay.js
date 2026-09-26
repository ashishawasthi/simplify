// Overlays: simple marks drawn over a picture — an arrow pointing at
// something, a ring around it, a box, a short label. Gemini Flash chooses
// the marks from the coach's words (functions: planOverlay), but only as data:
// shapes with numbers from 0 to 1000 across and down the picture. This file
// turns them into SVG, the same way in the coach app's preview and in the
// video renderer (video/stage), so no SVG written by a model is ever shown.
//
//   { type: "arrow",  from: [x, y], to: [x, y] }       the head is at `to`
//   { type: "circle", at: [x, y], r }                   r: of the picture's shorter side
//   { type: "box",    from: [x, y], to: [x, y] }
//   { type: "label",  at: [x, y], text }                at most 30 characters

export const SHAPES = ["arrow", "circle", "box", "label"];
export const MAX_SHAPES = 4;
export const MAX_LABEL = 30;

const INK = "#ffca28"; // bright yellow, outlined in dark: seen on light and dark photos
const EDGE = "#1a1a1a";

const n = (v) => Number.isFinite(Number(v)) ? Math.min(1000, Math.max(0, Math.round(Number(v)))) : null;
const point = (p) => Array.isArray(p) && p.length === 2 && n(p[0]) !== null && n(p[1]) !== null ? [n(p[0]), n(p[1])] : null;

// Shapes as they may be stored and drawn: anything unknown or out of range is
// dropped, never guessed at. The functions check with a byte-for-byte copy
// (functions/overlay.js, kept by tools/copy-class-markdown.mjs).
export function cleanShapes(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const s of list) {
    if (!s || !SHAPES.includes(s.type)) continue;
    if (s.type === "arrow" || s.type === "box") {
      const from = point(s.from);
      const to = point(s.to);
      if (from && to && (from[0] !== to[0] || from[1] !== to[1])) out.push({ type: s.type, from, to });
    } else if (s.type === "circle") {
      const at = point(s.at);
      const r = n(s.r);
      if (at && r >= 20) out.push({ type: "circle", at, r: Math.min(r, 500) });
    } else {
      const at = point(s.at);
      const text = String(s.text ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_LABEL);
      if (at && text) out.push({ type: "label", at, text });
    }
    if (out.length === MAX_SHAPES) break;
  }
  return out;
}

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// The marks as an SVG string for a picture drawn w×h pixels. progress (0–1)
// draws them in: lines grow, labels fade in — for the video; 1 is finished.
export function overlaySvg(shapes, w, h, progress = 1) {
  const X = (v) => (v * w) / 1000;
  const Y = (v) => (v * h) / 1000;
  const side = Math.min(w, h);
  const stroke = Math.max(3, side * 0.018);
  const k = Math.min(1, Math.max(0, progress));
  const parts = [];
  cleanShapes(shapes).forEach((s, i) => {
    // one after another: each shape draws in its share of the time
    const count = Math.max(1, shapes.length);
    const own = Math.min(1, Math.max(0, k * count - i));
    if (own <= 0) return;
    const line = (d, len) => {
      const dash = `stroke-dasharray="${len} ${len}" stroke-dashoffset="${len * (1 - own)}"`;
      return `<path d="${d}" fill="none" stroke="${EDGE}" stroke-width="${stroke * 1.9}" stroke-linecap="round" stroke-linejoin="round" ${dash}/>`
        + `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" ${dash}/>`;
    };
    if (s.type === "arrow") {
      const [x1, y1, x2, y2] = [X(s.from[0]), Y(s.from[1]), X(s.to[0]), Y(s.to[1])];
      const len = Math.hypot(x2 - x1, y2 - y1);
      parts.push(line(`M${x1} ${y1}L${x2} ${y2}`, len));
      if (own > 0.8) {
        const a = Math.atan2(y2 - y1, x2 - x1);
        const head = stroke * 3.2;
        const p = (da) => `${x2 - head * Math.cos(a + da)} ${y2 - head * Math.sin(a + da)}`;
        const d = `M${p(0.5)}L${x2} ${y2}L${p(-0.5)}`;
        parts.push(`<path d="${d}" fill="none" stroke="${EDGE}" stroke-width="${stroke * 1.9}" stroke-linecap="round" stroke-linejoin="round"/>`
          + `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"/>`);
      }
    } else if (s.type === "circle") {
      const r = (s.r * side) / 1000;
      const [cx, cy] = [X(s.at[0]), Y(s.at[1])];
      parts.push(line(`M${cx + r} ${cy}A${r} ${r} 0 1 1 ${cx - r} ${cy}A${r} ${r} 0 1 1 ${cx + r} ${cy}`, 2 * Math.PI * r));
    } else if (s.type === "box") {
      const [x1, y1, x2, y2] = [X(Math.min(s.from[0], s.to[0])), Y(Math.min(s.from[1], s.to[1])), X(Math.max(s.from[0], s.to[0])), Y(Math.max(s.from[1], s.to[1]))];
      parts.push(line(`M${x1} ${y1}H${x2}V${y2}H${x1}Z`, 2 * (x2 - x1 + y2 - y1)));
    } else {
      const size = Math.max(14, side * 0.07);
      const [x, y] = [X(s.at[0]), Y(s.at[1])];
      parts.push(`<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-family="system-ui, sans-serif" font-weight="800"
        font-size="${size}" fill="${INK}" stroke="${EDGE}" stroke-width="${size * 0.18}" paint-order="stroke" opacity="${own}">${esc(s.text)}</text>`);
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">${parts.join("")}</svg>`;
}
