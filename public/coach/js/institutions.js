// Institutions (institutions/{id}: name, org, type, area, active) — the pure
// parts, tested by tools/test-coach.mjs: finding them as a coach types,
// grouping them by organisation, and naming a coach's choices.

export const MAX_INSTITUTIONS = 10; // as firestore.rules allow on a profile

// lower case, no accents, one space: "  Rainbow   Centre–Yishun " → "rainbow centre-yishun"
export function fold(text) {
  return String(text ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[‐-―]/g, "-").toLowerCase().replace(/\s+/g, " ").trim();
}

// every word typed appears somewhere in the name, organisation, area or type
export function matches(inst, query) {
  const words = fold(query).split(" ").filter(Boolean);
  if (!words.length) return true;
  const hay = fold(`${inst.name} ${inst.org} ${inst.area} ${inst.type}`);
  return words.every((w) => hay.includes(w));
}

const byText = (key) => (a, b) => fold(a[key]).localeCompare(fold(b[key]));

// The ones to offer: active (or already chosen — a retired one stays shown
// so it can be taken off), matching the words typed, grouped by organisation
// A–Z, each group's places A–Z: [{ org, items }]
export function groupByOrg(list, query = "", chosen = []) {
  const keep = new Set(chosen);
  const groups = new Map();
  for (const inst of [...list].sort(byText("name"))) {
    if (!(inst.active || keep.has(inst.id)) || !matches(inst, query)) continue;
    const key = fold(inst.org);
    if (!groups.has(key)) groups.set(key, { org: inst.org, items: [] });
    groups.get(key).items.push(inst);
  }
  return [...groups.values()].sort(byText("org"));
}

// the small line under a name: "Ang Mo Kio · Special education school"
export function placeLine(inst) {
  return [inst.area, inst.type].map((s) => String(s ?? "").trim()).filter(Boolean).join(" · ");
}

// a coach's institutions by name, in their order; an id no longer in the
// list (or retired) still shows, so nothing is silently lost
export function namesOf(ids, list) {
  const byId = new Map(list.map((i) => [i.id, i]));
  return (Array.isArray(ids) ? ids : []).map((id) => {
    const inst = byId.get(id);
    if (!inst) return "An institution no longer listed";
    return inst.active ? inst.name : `${inst.name} (retired)`;
  });
}

export function sameList(a, b) {
  const x = Array.isArray(a) ? a : [];
  const y = Array.isArray(b) ? b : [];
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

// Which screen a signed-in person gets, from their profile:
//   "about"    no profile yet, or one from before institutions (choose them first)
//   "pending"  waiting for the admin      "declined"  the admin said no
//   "approved" may use the platform (a suspended coach is told so on My classes)
export function coachGate(profile) {
  if (!profile || !Array.isArray(profile.institutions) || !profile.institutions.length) return "about";
  if (profile.status === "approved") return "approved";
  if (profile.status === "declined") return "declined";
  return "pending";
}

// the admin's list says so when an approved coach changed their institutions afterwards
export function changedAfterApproval(coach) {
  const changed = coach?.institutionsChangedAt?.getTime?.();
  const decided = coach?.decidedAt?.getTime?.();
  return coach?.status === "approved" && Number.isFinite(changed) && (!Number.isFinite(decided) || changed > decided);
}
