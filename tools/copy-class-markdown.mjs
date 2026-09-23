// The Cloud Functions check the page helper's markdown with the learner app's
// own parser, so both agree on what a page shows. Functions deploy from
// functions/ alone, so they get a byte-identical copy of the module:
//
//   node tools/copy-class-markdown.mjs          copy public/js/class-markdown.js → functions/
//   node tools/copy-class-markdown.mjs --check  exit 1 if the copy is missing or differs
//
// firebase.json runs the copy before every functions deploy (predeploy), and
// tools/test-functions.mjs runs the check. No dependencies.

import { copyFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SOURCE = fileURLToPath(new URL("../public/js/class-markdown.js", import.meta.url));
const COPY = fileURLToPath(new URL("../functions/class-markdown.js", import.meta.url));

const read = (path) => {
  try {
    return readFileSync(path);
  } catch {
    return null;
  }
};

if (process.argv.includes("--check")) {
  const source = read(SOURCE);
  const copy = read(COPY);
  if (!source) {
    console.log("FAIL  public/js/class-markdown.js is missing");
    process.exit(1);
  }
  if (!copy || !copy.equals(source)) {
    console.log("FAIL  functions/class-markdown.js is not a copy of public/js/class-markdown.js — run: node tools/copy-class-markdown.mjs");
    process.exit(1);
  }
  console.log("ok    functions/class-markdown.js is byte-identical to public/js/class-markdown.js");
} else {
  copyFileSync(SOURCE, COPY);
  console.log("copied public/js/class-markdown.js → functions/class-markdown.js");
}
