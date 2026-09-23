// Puts the institutions coaches choose from into Firestore (institutions/{id}),
// from tools/seed/institutions.json — an array of
//   { id, name, org, type, area, source }
// (source is where the entry was checked; it is not stored). Safe to run again:
//
//   node tools/seed-institutions.mjs --dry-run            what would change (production)
//   node tools/seed-institutions.mjs                      write it (production, as the owner)
//   node tools/seed-institutions.mjs --emulator 127.0.0.1:8080   the emulator instead
//   --file <path>                                         another file (the tests use a sample)
//
// An entry that is new is created active. One that exists gets its name, org,
// type and area from the file only if they differ — its `active` stays as the
// admin left it, so an entry the admin retired stays retired. Entries only in
// Firestore (added or kept by the admin) are left alone and listed. The whole
// file is checked first, against the same limits as firestore.rules, and
// nothing is written if any entry is wrong.
//
// Production uses `gcloud auth print-access-token` (docs/coach/admin-and-approvals.md).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { connect, parseArgs, SERVER_TIME } from "./firestore-rest.mjs";

const DEFAULT_FILE = fileURLToPath(new URL("./seed/institutions.json", import.meta.url));
const ID = /^[A-Za-z0-9_-]{1,60}$/;
const FIELDS = ["name", "org", "type", "area"];
const LIMITS = { name: 80, org: 60, type: 60, area: 40 };

// the file's entries, cleaned — or every problem with them, in words
export function checkSeed(list) {
  const problems = [];
  if (!Array.isArray(list)) return { problems: ["the file is not a JSON array"], entries: [] };
  const seen = new Set();
  const entries = list.map((raw, i) => {
    const where = `entry ${i + 1}${raw?.id ? ` (${raw.id})` : ""}`;
    const e = { id: String(raw?.id ?? "") };
    if (!ID.test(e.id)) problems.push(`${where}: the id must be 1–60 letters, digits, - or _`);
    if (seen.has(e.id)) problems.push(`${where}: the id is used twice`);
    seen.add(e.id);
    for (const key of FIELDS) {
      const value = typeof raw?.[key] === "string" ? raw[key].replace(/\s+/g, " ").trim() : raw?.[key] == null ? "" : null;
      if (value === null) problems.push(`${where}: ${key} is not text`);
      else if (value.length > LIMITS[key]) problems.push(`${where}: ${key} is over ${LIMITS[key]} characters`);
      e[key] = value ?? "";
    }
    if (!e.name) problems.push(`${where}: no name`);
    if (!e.org) problems.push(`${where}: no org`);
    return e;
  });
  return { problems, entries };
}

// what to write: { writes, created, updated, unchanged, onlyInFirestore }
export function plan(entries, existing) {
  const have = new Map(existing.map((d) => [d.id, d.data]));
  const wanted = new Set(entries.map((e) => e.id));
  const writes = [];
  const created = [];
  const updated = [];
  const unchanged = [];
  for (const e of entries) {
    const now = have.get(e.id);
    const data = Object.fromEntries(FIELDS.map((k) => [k, e[k]]));
    if (!now) {
      writes.push({ path: `institutions/${e.id}`, data: { ...data, active: true, updatedAt: SERVER_TIME }, create: true });
      created.push(e.id);
    } else if (FIELDS.some((k) => (now[k] ?? "") !== e[k])) {
      writes.push({ path: `institutions/${e.id}`, data: { ...data, updatedAt: SERVER_TIME }, mask: [...FIELDS, "updatedAt"] });
      updated.push(e.id);
    } else {
      unchanged.push(e.id);
    }
  }
  const onlyInFirestore = existing.filter((d) => !wanted.has(d.id)).map((d) => d.id);
  return { writes, created, updated, unchanged, onlyInFirestore };
}

async function main() {
  const args = parseArgs();
  const file = args.values.file ?? DEFAULT_FILE;
  let list;
  try {
    list = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    console.error(`Could not read ${file}: ${err.message}`);
    process.exit(1);
  }
  const { problems, entries } = checkSeed(list);
  if (problems.length) {
    console.error(`${file} has ${problems.length} problem(s); nothing was written:\n  ${problems.join("\n  ")}`);
    process.exit(1);
  }
  const fs = connect({ emulator: args.values.emulator, project: args.values.project });
  const existing = await fs.listAll("institutions");
  const p = plan(entries, existing);
  const dry = args.flags.has("dry-run");
  console.log(`${entries.length} in ${file}; ${fs.where}${dry ? " (dry run: nothing written)" : ""}`);
  console.log(`  new: ${p.created.length}${p.created.length ? ` (${p.created.join(", ")})` : ""}`);
  console.log(`  changed: ${p.updated.length}${p.updated.length ? ` (${p.updated.join(", ")})` : ""}`);
  console.log(`  unchanged: ${p.unchanged.length}`);
  if (p.onlyInFirestore.length) console.log(`  only in Firestore, left alone: ${p.onlyInFirestore.join(", ")}`);
  if (!dry && p.writes.length) {
    await fs.commit(p.writes);
    console.log(`wrote ${p.writes.length}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
