// About you: the name, organisation and a note that let the admin check a
// coach is who they say, before approving them for a class. Only the coach
// and the admin see it (firestore.rules, coaches/{uid}). The sign-in email is
// kept with it, and can't be changed here.

import { h, field, notice, busyButton } from "./dom.js";

export function profileScreen(root, ctx, { isNew }) {
  const { cloud, user, toast } = ctx;
  const saved = ctx.profile ?? {};

  const name = field({ label: "Your name", maxLength: 60, autocomplete: "name", value: saved.name ?? user.name ?? "" });
  const org = field({
    label: "Organisation or school", maxLength: 80, autocomplete: "organization", value: saved.org ?? "",
    hint: "For example: the school or centre where you teach.",
  });
  const note = field({
    label: "How can the admin check who you are?", multiline: true, rows: 4, maxLength: 300, value: saved.note ?? "",
    hint: "For example: your role, and a work email or phone number the admin can check.",
  });
  const problem = h("div");
  const save = h("button", { class: "btn btn-primary", type: "submit" }, isNew ? "Save and continue" : "Save");

  // a name is all that is needed; Save waits for one rather than refusing
  const update = () => { save.disabled = !name.input.value.trim(); };
  name.input.addEventListener("input", update);
  update();

  const form = h("form", { class: "stack form-narrow", novalidate: true },
    name.field, org.field, note.field,
    h("p", { class: "small" }, "Signed in as ", h("strong", null, user.email), "."),
    problem,
    h("div", { class: "actions" }, save));
  form.addEventListener("submit", (e) => e.preventDefault());
  busyButton(save, async () => {
    problem.replaceChildren();
    const next = { name: name.input.value.trim(), org: org.input.value.trim(), note: note.input.value.trim() };
    if (!next.name) return;
    try {
      await cloud.saveProfile(user, next, { isNew: !ctx.profile });
    } catch (err) {
      problem.append(notice(err.message, { tone: "problem" }));
      return;
    }
    ctx.setProfile({ ...saved, ...next, email: user.email });
    toast.show("Saved");
    ctx.go("#classes");
  });

  root.append(h("section", { class: "screen" },
    h("h1", null, "About you"),
    h("p", { class: "lead" }, isNew
      ? "Before you get a class, the admin checks who you are. Only the admin sees this."
      : "Only you and the admin see this."),
    form));
}
