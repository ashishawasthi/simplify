// The Cloud Functions check the page helper's markdown with the learner app's
// own parser, so both agree on what a page shows — and a video's overlays
// with the coach app's own shape checks, so both agree on what is drawn.
// Functions deploy from functions/ alone, so they get byte-identical copies:
//
//   node tools/copy-class-markdown.mjs          copy both modules → functions/
//   node tools/copy-class-markdown.mjs --check  exit 1 if a copy is missing or differs
//
// firebase.json runs the copy before every functions deploy (predeploy), and
// tools/test-functions.mjs runs the check. No dependencies.

import { copyFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const COPIES = [
  ["public/js/class-markdown.js", "functions/class-markdown.js"],
  ["public/coach/js/overlay.js", "functions/overlay.js"],
];
const path = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));

const read = (p) => {
  try {
    return readFileSync(path(p));
  } catch {
    return null;
  }
};

if (process.argv.includes("--check")) {
  let failed = false;
  for (const [source, copy] of COPIES) {
    const from = read(source);
    const to = read(copy);
    if (!from) {
      console.log(`FAIL  ${source} is missing`);
      failed = true;
    } else if (!to || !to.equals(from)) {
      console.log(`FAIL  ${copy} is not a copy of ${source} — run: node tools/copy-class-markdown.mjs`);
      failed = true;
    } else {
      console.log(`ok    ${copy} is byte-identical to ${source}`);
    }
  }
  if (failed) process.exit(1);
} else {
  for (const [source, copy] of COPIES) {
    copyFileSync(path(source), path(copy));
    console.log(`copied ${source} → ${copy}`);
  }
}
