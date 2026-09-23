// The owner's one-off data tools, against the Firestore emulator:
// tools/seed-institutions.mjs with the real tools/seed/institutions.json
// (so a broken seed file fails here first), and tools/migrate-coaches.mjs.
//
//   node tools/test-seed.mjs
//
// It starts the Firestore emulator itself, from a temporary firebase.json with
// ports of its own, runs both tools as the owner would (child processes with
// --emulator), and checks what they wrote. Needs Java and the Firebase CLI.

import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PROJECT = "simplify-special";

if (process.env.SIMPLIFY_SEED_INSIDE !== "1") {
  const dir = mkdtempSync(join(tmpdir(), "simplify-seed-"));
  writeFileSync(join(dir, "firebase.json"), JSON.stringify({
    firestore: { rules: join(ROOT, "firestore.rules") },
    emulators: {
      firestore: { port: 8331, websocketPort: 9531 },
      hub: { port: 4431 },
      logging: { port: 4531 },
      ui: { enabled: false },
    },
  }, null, 2));
  const child = spawn("firebase", [
    "emulators:exec", "--only", "firestore", "--config", join(dir, "firebase.json"), "--project", PROJECT,
    `node "${fileURLToPath(import.meta.url)}"`,
  ], { cwd: dir, env: { ...process.env, SIMPLIFY_SEED_INSIDE: "1", TMPDIR: dir }, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  child.stdout.on("data", (d) => {
    log += d;
    for (const line of String(d).split("\n")) if (/^(ok  |FAIL|all |\d+ of |—)/.test(line)) console.log(line);
  });
  child.stderr.on("data", (d) => { log += d; });
  child.on("exit", (code) => {
    if (code !== 0 && !/\d+ of \d+ failed/.test(log)) console.log(log);
    rmSync(dir, { recursive: true, force: true });
    process.exit(code ?? 1);
  });
} else {
  await runInside();
}

async function runInside() {
  const { connect, SERVER_TIME } = await import("./firestore-rest.mjs");
  const EMU = process.env.FIRESTORE_EMULATOR_HOST;
  const { readFileSync } = await import("node:fs");
  const SEED = join(ROOT, "tools", "seed", "institutions.json");
  const seeded = JSON.parse(readFileSync(SEED, "utf8"));
  const N = seeded.length;
  const [first, second] = seeded.map((e) => e.id);
  const fs = connect({ emulator: EMU });
  let failed = 0;
  let count = 0;
  const check = (what, got, want) => {
    count++;
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${what.padEnd(58)} ${JSON.stringify(got).slice(0, 80)}${ok ? "" : `\n      expected ${JSON.stringify(want)}`}`);
  };
  const tool = (name, ...args) => spawnSync(process.execPath, [join(ROOT, "tools", name), "--emulator", EMU, ...args], { encoding: "utf8" });
  const institutions = async () => Object.fromEntries((await fs.listAll("institutions")).map((d) => [d.id, d.data]));

  console.log("— seed-institutions");
  let r = tool("seed-institutions.mjs", "--file", SEED, "--dry-run");
  check("the seed file has entries, each with an id", [N > 0, seeded.every((e) => e.id)], [true, true]);
  check("a dry run says what it would add", [r.status, new RegExp(`new: ${N}`).test(r.stdout)], [0, true]);
  check("... and writes nothing", Object.keys(await institutions()).length, 0);
  r = tool("seed-institutions.mjs", "--file", SEED);
  let all = await institutions();
  check("the first run adds every entry", [r.status, Object.keys(all).sort()], [0, seeded.map((e) => e.id).sort()]);
  check("... with its fields (not the source)", Object.keys(all[first]).sort(), ["active", "area", "name", "org", "type", "updatedAt"]);
  check("... as in the file", seeded.every((e) => ["name", "org", "type", "area"].every((k) => all[e.id][k] === (e[k] ?? "").trim())), true);
  check("... all active", Object.values(all).every((i) => i.active === true), true);

  // the admin retires one and adds one of their own
  await fs.commit([
    { path: `institutions/${second}`, data: { active: false, updatedAt: SERVER_TIME }, mask: ["active", "updatedAt"] },
    { path: "institutions/admins-own", data: { name: "Admin's own", org: "Other", type: "", area: "", active: true, updatedAt: SERVER_TIME } },
  ]);
  const before = all[first].updatedAt.getTime();
  r = tool("seed-institutions.mjs", "--file", SEED);
  all = await institutions();
  check("a second run changes nothing", [r.status, /new: 0/.test(r.stdout), /changed: 0/.test(r.stdout), new RegExp(`unchanged: ${N}`).test(r.stdout)], [0, true, true, true]);
  check("... keeps what the admin retired retired", all[second].active, false);
  check("... leaves the admin's own entry alone, and says so", [all["admins-own"].name, /only in Firestore, left alone: admins-own/.test(r.stdout)], ["Admin's own", true]);
  check("... and does not touch an unchanged entry", all[first].updatedAt.getTime(), before);

  // a file that corrects a name
  const fixed = seeded.map((e) => (e.id === second ? { ...e, name: `${e.name} (Main)` } : e));
  const tmp = join(process.env.TMPDIR, "fixed.json");
  writeFileSync(tmp, JSON.stringify(fixed));
  r = tool("seed-institutions.mjs", "--file", tmp);
  all = await institutions();
  check("a changed entry is updated", [r.status, all[second].name], [0, fixed.find((e) => e.id === second).name]);
  check("... and still retired", all[second].active, false);

  // a bad file writes nothing
  writeFileSync(tmp, JSON.stringify([...fixed, { id: "bad id!", name: "X", org: "Y" }, { id: first, name: "Twice", org: "Y" }, { id: "no-org", name: "Z", org: " " }]));
  r = tool("seed-institutions.mjs", "--file", tmp);
  check("a bad file is refused with every problem", [r.status, (r.stderr.match(/entry \d+/g) ?? []).length], [1, 3]);
  check("... and nothing is written", Object.keys(await institutions()).length, N + 1);

  console.log("— migrate-coaches");
  const past = new Date("2026-09-01T02:00:00Z");
  await fs.commit([
    { path: "coaches/old1", data: { name: "Old One", org: "AWWA School @ Napiri", note: "", email: "old1@example.com", createdAt: past } },
    { path: "coaches/old2", data: { name: "Old Two", org: "AWWA School @ Napiri", note: "", email: "old2@example.com", createdAt: past } },
    { path: "coaches/new1", data: { name: "New", note: "", institutions: [first], email: "new1@example.com", status: "declined", createdAt: past } },
    { path: "classCoaches/K7M3RQP9T", data: { uids: ["old1", "new1"] } },
  ]);
  const coaches = async () => Object.fromEntries((await fs.listAll("coaches")).map((d) => [d.id, d.data]));
  r = tool("migrate-coaches.mjs");
  check("without --apply it only says what it would do", [r.status, /approved \(listed for a class\): 1/.test(r.stdout), (await coaches()).old1.status ?? null], [0, true, null]);
  r = tool("migrate-coaches.mjs", "--apply");
  const c = await coaches();
  check("a coach listed for a class is approved", [c.old1.status, c.old1.decidedBy, c.old1.decidedAt instanceof Date], ["approved", "migration", true]);
  check("a coach with no class waits for the admin", [c.old2.status, c.old2.decidedAt ?? null], ["pending", null]);
  check("a coach with a status is left alone", c.new1.status, "declined");
  check("the old org is kept", c.old1.org, "AWWA School @ Napiri");
  r = tool("migrate-coaches.mjs", "--apply");
  check("a second run writes nothing", [r.status, /wrote/.test(r.stdout)], [0, false]);

  console.log(failed ? `\n${failed} of ${count} failed` : `\nall ${count} passed`);
  process.exit(failed ? 1 : 0);
}
