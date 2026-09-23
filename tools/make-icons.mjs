// The app's logo — the favicon and the home-screen icons — is the Seedling
// emoji (U+1F331), drawn from Noto Emoji like the rest of the picture set, so
// it looks the same on every phone and iPad instead of each system's emoji.
//
//   node tools/make-icons.mjs
//
// Writes public/favicon.svg (the minified Noto seedling, with its licence
// comment) and renders the PNG icons from it with headless Chrome:
//   img/icons/icon-192.png, icon-512.png  — white, the seedling 76% wide
//   img/icons/apple-touch-icon.png (180)  — the same; iOS rounds the corners
//   img/icons/icon-maskable-512.png       — white, the seedling 56% wide, inside
//                                          the circle Android may crop to
// Node 22 and Chrome, nothing to install (like tools/shoot-guide.mjs). Bump
// CACHE in public/sw.js after running it.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { minify, NOTO_TAG, NOTO_COMMIT } from "./make-pictures.mjs";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "public");
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const UPSTREAM = "emoji_u1f331.svg"; // 🌱 Seedling

const cache = join(tmpdir(), `noto-emoji-${NOTO_COMMIT.slice(0, 7)}`);
mkdirSync(cache, { recursive: true });
const cached = join(cache, UPSTREAM);
if (!existsSync(cached)) {
  const res = await fetch(`https://raw.githubusercontent.com/googlefonts/noto-emoji/${NOTO_COMMIT}/svg/${UPSTREAM}`);
  if (!res.ok) throw new Error(`${UPSTREAM}: HTTP ${res.status}`);
  writeFileSync(cached, await res.text());
}

const notice = `<!-- The Simplify logo: Seedling (U+1F331) from Noto Emoji ${NOTO_TAG} (github.com/googlefonts/noto-emoji) ` +
  `svg/${UPSTREAM}, minified by Simplify. Copyright 2013 Google, Inc. Apache License 2.0; the text is at /img/pic/LICENSE.txt -->`;
const svg = minify(readFileSync(cached, "utf8"));
const favicon = svg.replace(/^(<svg\b)/, `${notice}\n$1`);
writeFileSync(join(ROOT, "favicon.svg"), favicon.endsWith("\n") ? favicon : favicon + "\n");
console.log(`favicon.svg          ${favicon.length} B`);

const work = mkdtempSync(join(tmpdir(), "simplify-icons-"));
const icons = [
  ["img/icons/icon-192.png", 192, 0.76],
  ["img/icons/icon-512.png", 512, 0.76],
  ["img/icons/apple-touch-icon.png", 180, 0.76],
  ["img/icons/icon-maskable-512.png", 512, 0.56],
];
try {
  writeFileSync(join(work, "seedling.svg"), svg);
  for (const [out, size, share] of icons) {
    const px = Math.round(size * share);
    const page = join(work, "icon.html");
    writeFileSync(page, `<!doctype html><html><body style="margin:0;background:#fff;width:${size}px;height:${size}px;` +
      `display:grid;place-items:center;overflow:hidden"><img src="seedling.svg" width="${px}" height="${px}"></body></html>`);
    execFileSync(CHROME, [
      "--headless", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
      "--allow-file-access-from-files", `--window-size=${size},${size}`,
      `--screenshot=${join(ROOT, out)}`, `file://${page}`,
    ], { stdio: "ignore", timeout: 60_000 });
    console.log(`${out.padEnd(34)} ${size}×${size}, seedling ${px}px`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
