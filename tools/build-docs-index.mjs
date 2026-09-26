#!/usr/bin/env node
/**
 * Regenerates the docs/ navigation layer from per-doc OKF frontmatter.
 *
 *   node tools/build-docs-index.mjs           # write docs/index.md + docs/<area>/index.md
 *   node tools/build-docs-index.mjs --check   # write nothing; exit 1 on any problem
 *
 * The docs follow the Open Knowledge Format (OKF 0.2) used by the whiz.coach
 * repository, so the two bundles read the same way: every content document
 * carries `type`, `title`, `description`, `tags` and `status` frontmatter; the
 * index pages carry none and exist only to route; links between documents are
 * bundle-root-absolute (`/area/file.md`). This script is what makes those
 * claims true — it refuses a document without the five keys and a link that
 * doesn't resolve.
 *
 * Node builtins only, like every other script here. The frontmatter dialect
 * is a flat map of scalars plus one inline array (`tags`), so the parser is
 * deliberately tiny rather than pulling in a YAML dependency.
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, relative, resolve, posix } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DOCS_ROOT = join(REPO_ROOT, "docs");
const CHECK = process.argv.includes("--check");

/**
 * Area ordering and routing copy. Each level of the bundle owns its own text:
 *   - `summary` is the one-line row on docs/index.md (which questions live here);
 *   - `purpose` opens docs/<area>/index.md, the only page that lists the area's
 *     documents;
 *   - `lead` pins documents to the top of that list.
 */
const AREAS = [
  {
    dir: "platform",
    heading: "Platform",
    summary:
      "How the app is built — the static shell, the tool contract, offline and updates, security headers, data and AI models.",
    purpose:
      "The mechanics every screen inherits: how the static app is put together and routed, how a tool plugs in, how it works offline and updates itself, which security headers apply where, what is stored on the device and in the cloud, and which AI models run where. Read these before any change that spans more than one screen.",
    lead: ["architecture.md"],
  },
  {
    dir: "learner",
    heading: "Learner app",
    summary:
      "One document per screen a learner touches — the menu and set-up, the money tools, the daily-life tools, My class.",
    purpose:
      "The screens a learner (or the adult setting up their device) actually uses, one document per surface. Start with the menu and set-up document for how screens are found and hidden, then go to the screen that owns the rule you are changing.",
    lead: ["menu-and-setup.md"],
  },
  {
    dir: "coach",
    heading: "Coach platform",
    summary:
      "The coach app at /coach/ — classes, the markdown page, pictures, YouTube, Write with AI, videos, and the admin's approvals.",
    purpose:
      "Everything a coach or the admin does at /coach/, and the Cloud Functions behind it: asking for a class and being approved, writing the one markdown page learners see, the picture and video shelves, YouTube videos, Write with AI (it writes, asks or declines), videos of a page made by the video renderer (with marks the AI places on pictures), and the monthly limits. Learners never see these screens.",
    lead: ["coach-app.md"],
  },
  {
    dir: "operations",
    heading: "Operations",
    summary:
      "Running what exists — local development and tests, releasing, the cloud project, costs and limits.",
    purpose:
      "Running what is already built: how to work on it locally (servers, emulators, tests, screenshots), how a change is released and reaches devices that already have the app, what exists in the cloud project and how it was set up, and what things cost.",
    lead: ["local-development.md"],
  },
  {
    dir: "product",
    heading: "Product and research",
    summary:
      "Why the app is the way it is — the design rules for autistic learners, and the research behind the tools.",
    purpose:
      "The reasoning behind the product: the design rules every screen follows for autistic children and teens, and the research (needs, existing apps, evidence, Singapore facts) that chose the tools and the coach platform. These explain; the other areas specify.",
    lead: ["design-principles.md"],
  },
  {
    dir: "plans",
    heading: "Plans (not yet built)",
    summary:
      "Designs for work that does **not** exist in the code — never cite one as evidence that a capability ships.",
    purpose:
      "Design notes for work that does **not** exist in the code. Nothing in this section describes shipped behaviour — treat every document here as a proposal, and never cite one as evidence that a capability is present.",
    lead: [],
    unbuilt: true,
  },
];

const ORIENTATION = `This bundle is the reference for how Simplify works. Each document owns one
subject and states current behaviour.

**How to use it:** read this page, open the one area index whose purpose matches
your question, then open only the documents you need. Each level links down one
step and nothing is repeated between them — this page names the areas, an area
index names its documents, a document holds the detail.

Every *content* document carries \`type\`, \`title\`, \`description\`, \`tags\`, and
\`status\` frontmatter. The area index pages linked below carry no frontmatter:
they are OKF reserved filenames that exist only to route, and
\`node tools/build-docs-index.mjs\` writes them. Links between documents are
bundle-root-absolute (\`/area/file.md\`).

One exception to "current behaviour": [Plans](/plans/index.md) holds
designed-but-unbuilt work, so nothing there describes a shipped system.`;

const ELSEWHERE_HEADING = "Elsewhere in the repo";
const ELSEWHERE_INTRO =
  "Documentation that deliberately stays outside this bundle, because it is written for a different reader or lives next to what it describes.";
const ELSEWHERE = [
  {
    group: "Start here",
    note: null,
    links: [
      ["README", "../README.md", "what Simplify is, how to run it, test it and deploy it — the short version."],
    ],
  },
  {
    group: "Guides for people using the app",
    note: "Served with the app, written for learners' adults and for coaches, with screenshots of the real screens. They simplify and are not a specification.",
    links: [
      ["Learner guide", "../public/guide.html"],
      ["Coach guide", "../public/coach/guide.html"],
    ],
  },
  {
    group: "Licences",
    note: null,
    links: [
      ["Third-party notices", "../THIRD_PARTY_NOTICES.md", "the Noto Emoji pictures (Apache-2.0) and anything else not written here."],
    ],
  },
];

// ---------------------------------------------------------------------------
// Frontmatter
// ---------------------------------------------------------------------------

/** Strip one layer of matching quotes. */
function unquote(value) {
  const v = value.trim();
  if (v.length >= 2 && ((v[0] === '"' && v.at(-1) === '"') || (v[0] === "'" && v.at(-1) === "'"))) {
    return v.slice(1, -1);
  }
  return v;
}

/**
 * Parse the flat-scalar-plus-inline-array frontmatter dialect used in docs/.
 * Returns null when the file has no frontmatter block at all.
 */
function parseFrontmatter(source) {
  if (!source.startsWith("---\n")) return null;
  const end = source.indexOf("\n---", 3);
  if (end === -1) return null;
  const block = source.slice(4, end + 1);
  const data = {};
  for (const raw of block.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const sep = line.indexOf(":");
    if (sep === -1) continue;
    const key = line.slice(0, sep).trim();
    const value = line.slice(sep + 1).trim();
    if (value.startsWith("[") && value.endsWith("]")) {
      data[key] = value
        .slice(1, -1)
        .split(",")
        .map((item) => unquote(item))
        .filter(Boolean);
    } else {
      data[key] = unquote(value);
    }
  }
  return data;
}

// ---------------------------------------------------------------------------
// Walking
// ---------------------------------------------------------------------------

function walkMarkdown(dir, out = []) {
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walkMarkdown(full, out);
    else if (entry.endsWith(".md")) out.push(full);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function docRow(doc) {
  return `- [${doc.title}](/${doc.area}/${doc.file}) — ${doc.description}`;
}

function renderRootIndex(byArea) {
  const parts = ["---", 'okf_version: "0.2"', "---", "", "# Documentation", "", ORIENTATION, "", "## Areas", ""];
  // One row per area — the area's own index owns its document list.
  for (const area of AREAS) {
    const docs = byArea.get(area.dir) ?? [];
    if (docs.length === 0) continue;
    const count = docs.length === 1 ? "1 document" : `${docs.length} documents`;
    parts.push(`- [${area.heading}](/${area.dir}/index.md) (${count}) — ${area.summary}`);
  }
  parts.push("");
  parts.push(`## ${ELSEWHERE_HEADING}`, "", ELSEWHERE_INTRO, "");
  for (const group of ELSEWHERE) {
    parts.push(`### ${group.group}`, "");
    if (group.note) parts.push(group.note, "");
    for (const [label, href, summary] of group.links) {
      parts.push(summary ? `- [${label}](${href}) — ${summary}` : `- [${label}](${href})`);
    }
    parts.push("");
  }
  return `${parts.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
}

function renderAreaIndex(area, docs) {
  const parts = [`# ${area.heading}`, "", area.purpose, ""];
  if (area.unbuilt) {
    parts.push("> **Not implemented.** Every entry below is a design, not a description of running code.", "");
  }
  for (const doc of docs) parts.push(docRow(doc));
  parts.push("", "Back to the [documentation index](/index.md).");
  return `${parts.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
}

// ---------------------------------------------------------------------------
// Link checking
// ---------------------------------------------------------------------------

const LINK_RE = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

function checkLinks(absPath, source, problems) {
  const rel = relative(REPO_ROOT, absPath);
  // Code spans and fenced blocks hold examples, not links.
  const prose = source.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
  for (const match of prose.matchAll(LINK_RE)) {
    const target = match[1];
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue; // http:, mailto:, etc.
    if (target.startsWith("#")) continue; // same-page anchor
    const [pathPart] = target.split("#");
    if (!pathPart) continue;
    const resolved = pathPart.startsWith("/")
      ? join(DOCS_ROOT, pathPart.slice(1))
      : resolve(dirname(absPath), pathPart);
    if (!existsSync(resolved)) {
      problems.push(`${rel}: broken link ${target} -> ${relative(REPO_ROOT, resolved)} does not exist`);
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  if (!existsSync(DOCS_ROOT)) {
    console.error(`docs/ not found at ${DOCS_ROOT}`);
    process.exit(1);
  }

  const problems = [];
  const byArea = new Map();
  const knownAreas = new Set(AREAS.map((a) => a.dir));

  for (const absPath of walkMarkdown(DOCS_ROOT)) {
    const relDocs = posix.normalize(relative(DOCS_ROOT, absPath).split(/[\\/]/).join("/"));
    const source = readFileSync(absPath, "utf8");
    if (relDocs.endsWith("index.md")) continue;

    const segments = relDocs.split("/");
    if (segments.length !== 2) {
      problems.push(`docs/${relDocs}: expected a doc at docs/<area>/<file>.md`);
      continue;
    }
    const [area, file] = segments;
    if (!knownAreas.has(area)) {
      problems.push(`docs/${relDocs}: area "${area}" is not registered in AREAS (add it to tools/build-docs-index.mjs)`);
      continue;
    }

    const fm = parseFrontmatter(source);
    if (!fm) {
      problems.push(`docs/${relDocs}: missing YAML frontmatter`);
      continue;
    }
    // docs/index.md claims every content document carries these five keys,
    // so the generator is what makes that claim true.
    if (!fm.type) problems.push(`docs/${relDocs}: missing or empty \`type\``);
    if (!fm.description) problems.push(`docs/${relDocs}: missing or empty \`description\``);
    if (!fm.title) problems.push(`docs/${relDocs}: missing or empty \`title\``);
    if (!Array.isArray(fm.tags) || fm.tags.length === 0) {
      problems.push(`docs/${relDocs}: missing or empty \`tags\` (expected an inline array)`);
    }
    if (!fm.status) problems.push(`docs/${relDocs}: missing or empty \`status\``);

    if (!byArea.has(area)) byArea.set(area, []);
    byArea.get(area).push({
      area,
      file,
      title: fm.title || file.replace(/\.md$/, ""),
      description: fm.description || "",
    });
  }

  // Deterministic order: pinned lead files first, then alphabetical by filename.
  for (const area of AREAS) {
    const docs = byArea.get(area.dir);
    if (!docs) continue;
    const lead = area.lead ?? [];
    docs.sort((a, b) => {
      const ai = lead.indexOf(a.file);
      const bi = lead.indexOf(b.file);
      if (ai !== bi) return (ai === -1 ? lead.length : ai) - (bi === -1 ? lead.length : bi);
      return a.file.localeCompare(b.file);
    });
  }

  const generated = new Map();
  generated.set(join(DOCS_ROOT, "index.md"), renderRootIndex(byArea));
  for (const area of AREAS) {
    const docs = byArea.get(area.dir);
    if (!docs || docs.length === 0) continue;
    generated.set(join(DOCS_ROOT, area.dir, "index.md"), renderAreaIndex(area, docs));
  }

  if (CHECK) {
    for (const [absPath, content] of generated) {
      const rel = relative(REPO_ROOT, absPath);
      if (!existsSync(absPath)) {
        problems.push(`${rel}: missing — run \`node tools/build-docs-index.mjs\``);
      } else if (readFileSync(absPath, "utf8") !== content) {
        problems.push(`${rel}: stale — run \`node tools/build-docs-index.mjs\``);
      }
    }
    // Link-check on-disk docs plus the freshly generated index bodies, so a
    // broken link introduced by the generator is caught before it is written.
    for (const absPath of walkMarkdown(DOCS_ROOT)) {
      if (generated.has(absPath)) continue;
      checkLinks(absPath, readFileSync(absPath, "utf8"), problems);
    }
    for (const [absPath, content] of generated) checkLinks(absPath, content, problems);

    if (problems.length > 0) {
      console.error(`docs index check failed with ${problems.length} problem(s):`);
      for (const problem of problems) console.error(`  - ${problem}`);
      process.exit(1);
    }
    console.log(`docs index check passed (${generated.size} index files, all links resolve).`);
    return;
  }

  if (problems.length > 0) {
    console.error(`Refusing to write; ${problems.length} problem(s) found:`);
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }

  for (const [absPath, content] of generated) {
    const previous = existsSync(absPath) ? readFileSync(absPath, "utf8") : null;
    if (previous === content) continue;
    writeFileSync(absPath, content, "utf8");
    console.log(`${previous === null ? "created" : "updated"} ${relative(REPO_ROOT, absPath)}`);
  }
  console.log(`docs index built (${generated.size} files).`);
}

main();
