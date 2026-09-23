// One-off, for the switch to coach approval (docs/product/decisions.md,
// 2026-09-24): gives every coach profile made before it a `status`, so the
// coaches already working keep working.
//
//   node tools/migrate-coaches.mjs                        what it would do (production)
//   node tools/migrate-coaches.mjs --apply                do it (production, as the owner)
//   node tools/migrate-coaches.mjs --emulator 127.0.0.1:8080 [--apply]
//
// A profile with no status becomes
//   "approved" (decidedBy "migration") if the coach is listed for any class —
//              the admin approved them for that class under the old rules;
//   "pending"  otherwise — they had not been approved for anything yet.
// A profile that already has a status is left alone, so running it twice
// changes nothing. Old profiles have no institutions: the coach app asks the
// coach to choose them (About you) before anything else; their old free-text
// `org` is kept, unread, and shown to the admin as it was.

import { fileURLToPath } from "node:url";
import { connect, parseArgs, SERVER_TIME } from "./firestore-rest.mjs";

export function plan(coaches, classCoaches) {
  const listed = new Set(classCoaches.flatMap((d) => (Array.isArray(d.data.uids) ? d.data.uids : [])));
  const writes = [];
  const approved = [];
  const pending = [];
  for (const c of coaches) {
    if (c.data.status != null) continue;
    if (listed.has(c.id)) {
      writes.push({ path: `coaches/${c.id}`, data: { status: "approved", decidedAt: SERVER_TIME, decidedBy: "migration" }, mask: ["status", "decidedAt", "decidedBy"] });
      approved.push(c);
    } else {
      writes.push({ path: `coaches/${c.id}`, data: { status: "pending" }, mask: ["status"] });
      pending.push(c);
    }
  }
  return { writes, approved, pending };
}

async function main() {
  const args = parseArgs();
  const fs = connect({ emulator: args.values.emulator, project: args.values.project });
  const [coaches, classCoaches] = await Promise.all([fs.listAll("coaches"), fs.listAll("classCoaches")]);
  const p = plan(coaches, classCoaches);
  const apply = args.flags.has("apply");
  const who = (c) => `${c.data.name ?? "?"} <${c.data.email ?? c.id}>`;
  console.log(`${coaches.length} coach profiles in ${fs.where}${apply ? "" : " (a dry run: add --apply to write)"}`);
  console.log(`  → approved (listed for a class): ${p.approved.length}${p.approved.length ? `\n      ${p.approved.map(who).join("\n      ")}` : ""}`);
  console.log(`  → pending (no class yet): ${p.pending.length}${p.pending.length ? `\n      ${p.pending.map(who).join("\n      ")}` : ""}`);
  console.log(`  already have a status: ${coaches.length - p.writes.length}`);
  if (apply && p.writes.length) {
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
