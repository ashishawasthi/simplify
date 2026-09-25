// About you: the name, where the coach works (one or more institutions from
// the admin's list, and/or a school or centre not in the list yet, in their
// own words — the admin adds it) and a note that let the admin check a coach
// is who they say, before approving them. Only the coach and the admin see it
// (firestore.rules, coaches/{uid}). The sign-in email is kept with it, and
// can't be changed here. A new profile waits for the admin's approval.

import { h, field, notice, busyButton } from "./dom.js";
import { institutionPicker } from "./institution-picker.js";
import { coachGate } from "./institutions.js";

export function profileScreen(root, ctx, { isNew }) {
  const { cloud, user, toast } = ctx;
  const saved = ctx.profile ?? {};
  const gate = coachGate(ctx.profile);
  let alive = true;

  const name = field({ label: "Your name", maxLength: 60, autocomplete: "name", value: saved.name ?? user.name ?? "" });
  const note = field({
    label: "How can the admin check who you are?", multiline: true, rows: 4, maxLength: 300, value: saved.note ?? "",
    hint: "For example: your role, and a work email or phone number the admin can check.",
  });
  const where = h("div", null, h("p", { class: "loading", role: "status" }, "Loading the institutions…"));
  const other = field({
    label: "Not in the list? Type the name of your school or centre", maxLength: 120, value: saved.otherPlace ?? "",
    hint: "The admin adds it to the list.",
  });
  const problem = h("div");
  const save = h("button", { class: "btn btn-primary", type: "submit" }, isNew || gate === "about" ? "Save and continue" : "Save");
  let picker = null;

  // a name and at least one place (listed, or typed); Save waits for them rather than refusing
  const update = () => {
    save.disabled = !name.input.value.trim() || !picker || (!picker.value().length && !other.input.value.trim());
  };
  name.input.addEventListener("input", update);
  other.input.addEventListener("input", update);
  update();

  async function loadInstitutions() {
    try {
      const institutions = await cloud.listInstitutions();
      if (!alive) return;
      picker = institutionPicker({ institutions, chosen: saved.institutions ?? [], onChange: update });
      where.replaceChildren(picker.el);
    } catch (err) {
      if (!alive) return;
      where.replaceChildren(notice(err.message, { tone: "problem",
        action: h("button", { class: "btn btn-secondary", type: "button", onclick: loadInstitutions }, "Try again") }));
    }
    update();
  }

  const form = h("form", { class: "stack form-narrow", novalidate: true },
    name.field, where, other.field, note.field,
    h("p", { class: "small" }, "Signed in as ", h("strong", null, user.email), "."),
    problem,
    h("div", { class: "actions" }, save));
  form.addEventListener("submit", (e) => e.preventDefault());
  busyButton(save, async () => {
    problem.replaceChildren();
    const next = {
      name: name.input.value.trim(), note: note.input.value.trim(), institutions: picker?.value() ?? [],
      otherPlace: other.input.value.trim().replace(/\s+/g, " "),
    };
    if (!next.name || (!next.institutions.length && !next.otherPlace)) return;
    const creating = !ctx.profile;
    try {
      await cloud.saveProfile(user, next, { isNew: creating, before: ctx.profile });
    } catch (err) {
      problem.append(notice(err.message, { tone: "problem" }));
      return;
    }
    const { otherPlace, ...rest } = { ...saved, ...next };
    ctx.setProfile({ ...rest, ...(otherPlace ? { otherPlace } : {}), email: user.email, ...(creating ? { status: "pending" } : {}) });
    toast.show(creating ? "Saved. The admin will look at it." : "Saved");
    ctx.go("#classes");
  });

  const lead = isNew
    ? "The admin checks this before you can use Simplify. Only you and the admin see it."
    : gate === "about"
      ? "Simplify now asks where you work. Only you and the admin see this."
      : "Only you and the admin see this.";
  root.append(h("section", { class: "screen" },
    h("h1", null, "About you"),
    h("p", { class: "lead" }, lead),
    gate === "approved" ? h("p", { class: "small" }, "If you change where you work, the admin sees that you changed it.") : null,
    form));

  loadInstitutions();
  return () => { alive = false; };
}
