// My classes: the classes this coach is approved for (name, code, what
// learners see now), the requests still waiting for the admin, and the two
// ways to get a class — ask for a new one, or ask to join a colleague's by
// its code.

import { h, field, notice, busyButton, statusLine } from "./dom.js";
import { formatCode, normaliseCode, isClassCode, CODE_LENGTH } from "./class-code.js";
import { whenText } from "./format.js";

function classCard(cls) {
  const code = formatCode(cls.id);
  if (cls.unreadable) {
    return h("li", { class: "class-card is-paused" },
      h("div", { class: "class-card-body" },
        h("span", { class: "class-card-name" }, "A class"),
        h("span", { class: "code-text" }, code),
        h("span", { class: "chip is-paused" }, "Can't be opened"),
        h("span", { class: "class-card-state" }, "The admin may have paused it.")));
  }
  const paused = cls.status !== "active";
  const state = paused ? "Paused by the admin"
    : cls.latest ? `Learners see “${cls.latest.title || "Untitled page"}”, published ${whenText(cls.latest.publishedAt)}`
      : "Nothing published yet";
  return h("li", { class: `class-card${paused ? " is-paused" : ""}` },
    h("a", { class: "class-card-body", href: `#class/${cls.id}` },
      h("span", { class: "class-card-name" }, cls.name),
      h("span", { class: "code-text", "aria-label": `Code ${[...cls.id].join(" ")}` }, code),
      paused ? h("span", { class: "chip is-paused" }, "Paused") : null,
      h("span", { class: "class-card-state" }, state),
      h("span", { class: "class-card-go", "aria-hidden": "true" }, "›")));
}

function requestLine(req) {
  const what = req.kind === "join-class"
    ? `Join the class ${formatCode(req.classCode)}`
    : `New class: ${req.className}`;
  const [chip, words] = req.status === "declined"
    ? [h("span", { class: "chip is-no" }, "Not approved"), `Decided ${whenText(req.decidedAt ?? req.createdAt)}`]
    : [h("span", { class: "chip is-waiting" }, "Waiting for the admin"), `Asked ${whenText(req.createdAt)}`];
  return h("li", { class: "request-line" }, h("span", { class: "request-what" }, what), chip,
    h("span", { class: "request-when" }, words));
}

export function classesScreen(root, ctx) {
  const { cloud, user, profile, toast } = ctx;
  let alive = true;

  const list = h("ul", { class: "class-list", "aria-label": "Your classes" });
  const listState = h("div", { class: "list-state" }, h("p", { class: "loading", role: "status" }, "Loading your classes…"));
  const requests = h("ul", { class: "request-list" });
  const requestsBox = h("section", { class: "section", hidden: true, "aria-labelledby": "requests-h" },
    h("h2", { id: "requests-h" }, "Your requests"), requests);

  async function refresh() {
    try {
      const [classes, asked] = await Promise.all([cloud.myClasses(user.uid), cloud.myRequests(user.uid)]);
      if (!alive) return;
      list.replaceChildren(...classes.map(classCard));
      listState.replaceChildren(classes.length ? "" : h("p", { class: "empty" },
        "No classes yet. Ask for a new class, or ask to join a colleague's class. The admin approves each one."));
      const open = asked.filter((r) => r.status === "pending" || r.status === "declined");
      requests.replaceChildren(...open.map(requestLine));
      requestsBox.hidden = !open.length;
    } catch (err) {
      if (!alive) return;
      const retry = h("button", { class: "btn btn-secondary", type: "button", onclick: refresh }, "Try again");
      listState.replaceChildren(notice(err.message, { tone: "problem", action: retry }));
    }
  }

  // ---- ask for a class ----

  const newName = field({ label: "Class name", maxLength: 30, hint: "Learners see it when they join, for example 3 Kindness." });
  const newOrg = field({ label: "Organisation or school", maxLength: 80, value: profile?.org ?? "" });
  const newNote = field({
    label: "Note for the admin (if you like)", multiline: true, rows: 3, maxLength: 300,
    hint: "Anything that helps the admin check this class is yours.",
  });
  const newSend = h("button", { class: "btn btn-primary", type: "submit" }, "Send to the admin");
  const newProblem = h("div");
  const newForm = h("form", { class: "stack", novalidate: true }, newName.field, newOrg.field, newNote.field, newProblem,
    h("div", { class: "actions" }, newSend));
  const syncNew = () => { newSend.disabled = !newName.input.value.trim(); };
  newName.input.addEventListener("input", syncNew);
  syncNew();

  const joinCode = field({
    label: "Class code", maxLength: 20, autocomplete: "off", autocapitalize: "characters", spellcheck: "false",
    hint: "Ask a coach of the class. It is on the class's QR poster, for example K7M-3RQ-P9T.",
  });
  const joinEcho = statusLine("code-echo");
  const joinNote = field({ label: "Note for the admin (if you like)", multiline: true, rows: 3, maxLength: 300 });
  const joinSend = h("button", { class: "btn btn-primary", type: "submit" }, "Send to the admin");
  const joinProblem = h("div");
  const joinForm = h("form", { class: "stack", novalidate: true }, joinCode.field, joinEcho, joinNote.field, joinProblem,
    h("div", { class: "actions" }, joinSend));
  // the code is forgiven as it is typed: case, dashes and spaces don't matter
  const syncJoin = () => {
    const code = normaliseCode(joinCode.input.value);
    joinSend.disabled = !isClassCode(code);
    joinEcho.textContent = !code ? ""
      : code.length < CODE_LENGTH ? `${formatCode(code)} — ${CODE_LENGTH - code.length} more to go`
        : code.length === CODE_LENGTH ? `${formatCode(code)}` : `A code has ${CODE_LENGTH} characters: ${formatCode(code)}`;
  };
  joinCode.input.addEventListener("input", syncJoin);
  syncJoin();

  for (const form of [newForm, joinForm]) form.addEventListener("submit", (e) => e.preventDefault());

  busyButton(newSend, async () => {
    newProblem.replaceChildren();
    const className = newName.input.value.trim();
    if (!className) return;
    try {
      await cloud.askForNewClass(user.uid, { className, org: newOrg.input.value.trim(), note: newNote.input.value.trim() });
    } catch (err) {
      newProblem.append(notice(err.message, { tone: "problem" }));
      return;
    }
    newName.input.value = "";
    newNote.input.value = "";
    syncNew();
    newBox.open = false;
    toast.show(`Sent: “${className}”. The admin will look at it.`);
    refresh();
  });

  busyButton(joinSend, async () => {
    joinProblem.replaceChildren();
    const classCode = normaliseCode(joinCode.input.value);
    if (!isClassCode(classCode)) return;
    try {
      await cloud.askToJoinClass(user.uid, { classCode, org: profile?.org ?? "", note: joinNote.input.value.trim() });
    } catch (err) {
      joinProblem.append(notice(err.message, { tone: "problem" }));
      return;
    }
    joinCode.input.value = "";
    joinNote.input.value = "";
    syncJoin();
    joinBox.open = false;
    toast.show(`Sent: join ${formatCode(classCode)}. The admin will look at it.`);
    refresh();
  });

  const newBox = h("details", { class: "fold" }, h("summary", null, "Ask for a new class"), newForm);
  const joinBox = h("details", { class: "fold" }, h("summary", null, "Join a colleague's class"), joinForm);

  root.append(h("section", { class: "screen" },
    h("h1", null, "My classes"),
    profile?.suspended ? notice("The admin has paused your account, so your classes can't be changed. Contact the admin.",
      { tone: "warning" }) : null,
    list,
    listState,
    requestsBox,
    h("section", { class: "section", "aria-labelledby": "get-h" },
      h("h2", { id: "get-h" }, "Get a class"),
      newBox,
      joinBox)));

  refresh();
  return () => { alive = false; };
}
