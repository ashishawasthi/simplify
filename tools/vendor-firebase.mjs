// Vendor the coach app's two libraries into public/coach/vendor/, so the
// coach pages load nothing from other sites (their CSP is script-src 'self'):
//
//   node tools/vendor-firebase.mjs
//
// 1. The Firebase JS SDK, modular ESM builds, pinned to FIREBASE below:
//    https://www.gstatic.com/firebasejs/<ver>/firebase-{app,auth,firestore,storage,functions}.js
//    → public/coach/vendor/firebase/<ver>/. The builds import each other by
//    absolute gstatic URL; those import specifiers are rewritten to relative
//    ones ("./firebase-app.js"), and the sourceMappingURL comments are dropped
//    (the .map files are not vendored). Nothing else in the files changes.
// 2. uqr (MIT; a port of Project Nayuki's QR Code generator), pinned to UQR,
//    from npm via jsdelivr → public/coach/vendor/uqr/<ver>/uqr.js — the class
//    poster's QR code. Byte for byte as published.
//
// Each folder gets its licence and a README with the source URLs and SHA-256
// sums. To upgrade: change the version here, run this, update the import
// paths in public/coach/js/cloud.js (Firebase) or public/coach/js/qr.js
// (uqr), and delete the old version's folder. Node 22, nothing to install.
//
// firebase.json serves /coach/vendor/** as immutable for a year, so a
// version's folder must never change once deployed: anything new — even the
// same version vendored differently — goes in a folder of its own.

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const FIREBASE = "12.19.0";
const MODULES = ["app", "auth", "firestore", "storage", "functions"];
const UQR = "0.1.3";

const VENDOR = join(fileURLToPath(new URL(".", import.meta.url)), "..", "public", "coach", "vendor");
const sha256 = (text) => createHash("sha256").update(text).digest("hex");

async function download(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.text();
}

// ---------- Firebase ----------

const GSTATIC = `https://www.gstatic.com/firebasejs/${FIREBASE}/`;
const fbDir = join(VENDOR, "firebase", FIREBASE);
mkdirSync(fbDir, { recursive: true });

// static imports and re-exports (`from"…"`), side-effect imports (`import"…"`)
// and dynamic imports (`import("…")`) — minified or not
const SPECIFIER = /(\bfrom\s*|\bimport\s*\(?\s*)(["'])([^"']+)\2/g;

const rows = [];
for (const name of MODULES) {
  const file = `firebase-${name}.js`;
  const url = GSTATIC + file;
  const original = await download(url);
  const imported = [];
  const rewritten = original
    .replace(SPECIFIER, (all, lead, quote, spec) => {
      if (!spec.startsWith("https://") && !spec.startsWith("./")) return all; // not a module URL
      if (!spec.startsWith(GSTATIC)) throw new Error(`${file} imports ${spec}, outside ${GSTATIC}`);
      const target = spec.slice(GSTATIC.length);
      if (!MODULES.some((m) => `firebase-${m}.js` === target)) {
        throw new Error(`${file} imports ${target}, which is not vendored (add it to MODULES)`);
      }
      imported.push(target);
      return `${lead}${quote}./${target}${quote}`;
    })
    .replace(/\n\/\/# sourceMappingURL=\S+\s*$/, "\n");
  // no module URL may be left pointing at gstatic
  for (const [, , , spec] of rewritten.matchAll(SPECIFIER)) {
    if (spec.startsWith("https://")) throw new Error(`${file}: still imports ${spec}`);
  }
  writeFileSync(join(fbDir, file), rewritten);
  rows.push({ file, url, original: sha256(original), vendored: sha256(rewritten), imports: [...new Set(imported)] });
  console.log(`firebase ${FIREBASE}  ${file}  ${(rewritten.length / 1024).toFixed(0)} KB` +
    (imported.length ? `  (imports ${[...new Set(imported)].join(", ")})` : ""));
}

// The SDK is Apache-2.0; the files carry no licence text of their own (only
// firebase-app.js keeps its @license comments), so the licence goes beside them.
const apache = await download("https://www.apache.org/licenses/LICENSE-2.0.txt");
if (!apache.includes("Apache License") || !apache.includes("Version 2.0, January 2004")) {
  throw new Error("the Apache-2.0 licence text did not download as expected");
}
writeFileSync(join(fbDir, "LICENSE.txt"), apache);

writeFileSync(join(fbDir, "README.md"), `# Firebase JS SDK ${FIREBASE} (vendored)

The modular ESM builds the coach app (/coach/) imports, from Google's CDN, so
the coach pages load no script from another site. Written by
\`node tools/vendor-firebase.mjs\` — do not edit by hand.

Changes from the published files, and nothing else: import specifiers
\`https://www.gstatic.com/firebasejs/${FIREBASE}/firebase-*.js\` rewritten to
\`./firebase-*.js\`, and the trailing \`//# sourceMappingURL\` comment removed.

Licence: Apache License 2.0 (LICENSE.txt; https://github.com/firebase/firebase-js-sdk).

| File | Source | SHA-256 of the source | SHA-256 here |
|---|---|---|---|
${rows.map((r) => `| ${r.file} | ${r.url} | \`${r.original}\` | \`${r.vendored}\` |`).join("\n")}
`);

// ---------- uqr ----------

const uqrDir = join(VENDOR, "uqr", UQR);
mkdirSync(uqrDir, { recursive: true });
const uqrUrl = `https://cdn.jsdelivr.net/npm/uqr@${UQR}/dist/index.mjs`;
const uqrLicenceUrl = `https://cdn.jsdelivr.net/npm/uqr@${UQR}/LICENSE`;
const uqr = await download(uqrUrl);
if (/\bimport\b[^(]/.test(uqr.replace(/\/\/.*$/gm, ""))) throw new Error("uqr now imports something; check it");
const uqrLicence = await download(uqrLicenceUrl);
if (!uqrLicence.startsWith("MIT License")) throw new Error("uqr's licence is no longer MIT; check it");
writeFileSync(join(uqrDir, "uqr.js"), uqr);
writeFileSync(join(uqrDir, "LICENSE.txt"), uqrLicence);
writeFileSync(join(uqrDir, "README.md"), `# uqr ${UQR} (vendored)

QR codes for the class poster (/coach/, public/coach/js/qr.js): \`encode()\`
gives the modules, which the coach app draws as SVG itself. uqr is a port of
Project Nayuki's QR Code generator library. Written by
\`node tools/vendor-firebase.mjs\` — do not edit by hand.

uqr.js is \`dist/index.mjs\` of the npm package, unchanged (renamed so every
host serves it as JavaScript).

Licence: MIT (LICENSE.txt; https://github.com/unjs/uqr).

| File | Source | SHA-256 |
|---|---|---|
| uqr.js | ${uqrUrl} | \`${sha256(uqr)}\` |
| LICENSE.txt | ${uqrLicenceUrl} | \`${sha256(uqrLicence)}\` |
`);
console.log(`uqr ${UQR}  uqr.js  ${(uqr.length / 1024).toFixed(0)} KB`);
console.log(`\nwrote public/coach/vendor/firebase/${FIREBASE}/ and public/coach/vendor/uqr/${UQR}/`);
