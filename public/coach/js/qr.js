// A QR code as an SVG drawn with DOM calls (no markup strings, no image
// file): black squares on white with the standard 4-module quiet zone, sharp
// at any print size. The modules come from uqr (vendored, MIT — see
// vendor/uqr/). Error correction level Q (a quarter of it can be smudged or
// covered): a class link still fits version 4, 33 × 33 modules.

import { encode } from "../vendor/uqr/0.1.3/uqr.js";

const SVG = "http://www.w3.org/2000/svg";

export function qrSvg(text, label) {
  const { data, size } = encode(text, { ecc: "Q", border: 4 });
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
  svg.setAttribute("class", "qr");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", label);
  svg.setAttribute("shape-rendering", "crispEdges");
  const paper = document.createElementNS(SVG, "rect");
  paper.setAttribute("width", size);
  paper.setAttribute("height", size);
  paper.setAttribute("fill", "#ffffff");
  let d = "";
  data.forEach((row, y) => row.forEach((dark, x) => {
    if (dark) d += `M${x} ${y}h1v1h-1z`;
  }));
  const ink = document.createElementNS(SVG, "path");
  ink.setAttribute("d", d);
  ink.setAttribute("fill", "#000000");
  svg.append(paper, ink);
  return svg;
}
