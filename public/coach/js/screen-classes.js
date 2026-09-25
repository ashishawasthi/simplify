// My classes (for an approved coach): the classes this coach is a coach of
// (name, code, what learners see now), their requests to join a class still
// waiting for the admin, and the two ways to get a class — make a new one
// (at once, for one of their institutions), or ask the admin to join a
// colleague's by its code.

import { h, field, notice, busyButton, statusLine, uid } from "./dom.js";
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
    : `New class: ${req.className}`; // an older request, from before coaches made their own
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
        "No classes yet. Make a new class, or ask to join a colleague's class."));
      const open = asked.filter((r) => r.status === "pending" || r.status === "declined");
      requests.replaceChildren(...open.map(requestLine));
      requestsBox.hidden = !open.length;
    } catch (err) {
      if (!alive) return;
      const retry = h("button", { class: "btn btn-secondary", type: "button", onclick: refresh }, "Try again");
      listState.replaceChildren(notice(err.message, { tone: "problem", action: retry }));
    }
  }

  // ---- make a class ----

  const newName = field({ label: "Class name", maxLength: 30, hint: "Learners see it when they join, for example 3 Kindness." });
  const whereId = uid("f");
  const newWhere = h("select", { id: whereId, class: "select" }, h("option", { value: "" }, "Loading…"));
  const whereField = h("div", { class: "field" }, h("label", { for: whereId }, "Where is the class?"), newWhere);
  const newSend = h("button", { class: "btn btn-primary", type: "submit" }, "Make the class");
  const newProblem = h("div");
  const newForm = h("form", { class: "stack", novalidate: true }, newName.field, whereField, newProblem,
    h("div", { class: "actions" }, newSend));
  const syncNew = () => { newSend.disabled = !newName.input.value.trim() || !newWhere.value; };
  newName.input.addEventListener("input", syncNew);
  newWhere.addEventListener("change", syncNew);
  syncNew();

  // the coach's own institutions that are still listed
  async function loadPlaces() {
    let list = [];
    try {
      list = await cloud.listInstitutions();
    } catch (err) {
      if (!alive) return;
      newProblem.replaceChildren(notice(err.message, { tone: "problem" }));
    }
    if (!alive) return;
    const mine = (profile?.institutions ?? []).map((id) => list.find((i) => i.id === id)).filter((i) => i?.active);
    newWhere.replaceChildren(...mine.map((i) => h("option", { value: i.id }, i.area && !i.name.includes(i.area) ? `${i.name} (${i.area})` : i.name)));
    if (!mine.length && list.length) {
      newProblem.replaceChildren(notice("None of your institutions is listed any more. Change them in About you first.", { tone: "warning",
        action: h("a", { class: "btn btn-secondary", href: "#about" }, "About you") }));
    }
    syncNew();
  }

  const joinCode = field({
    label: "Class code", maxLength: 20, autocomplete: "off", autocapitalize: "characters", spellcheck: "false",
    hint: "Ask a coach of the class. It is on the class's QR poster, for example K7M-3RQ-P9T.",
  });
  const joinEcho = statusLine("code-echo");
  const joinNote = field({ label: "Note for the admin (if you like)", multiline: true, rows: 3, maxLength: 300 });
  const joinSend = h("button", { class: "btn btn-primary", type: "submit" }, "Send to the admin");
  const joinProblem = h("div");
  const joinForm = h("form", { class: "stack", novalidate: true },
    h("p", { class: "field-hint" }, "The admin checks you really coach that class, then adds you to it."),
    joinCode.field, joinEcho, joinNote.field, joinProblem,
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
    const institution = newWhere.value;
    if (!className || !institution) return;
    let code;
    try {
      code = await cloud.createClass(user.uid, { name: className, institution });
    } catch (err) {
      newProblem.append(notice(err.message, { tone: "problem" }));
      return;
    }
    toast.show(`Made “${className}”. Its code is ${formatCode(code)}.`);
    // writing its page is what comes next
    ctx.go(`#class/${code}`);
  });

  busyButton(joinSend, async () => {
    joinProblem.replaceChildren();
    const classCode = normaliseCode(joinCode.input.value);
    if (!isClassCode(classCode)) return;
    try {
      await cloud.askToJoinClass(user.uid, { classCode, note: joinNote.input.value.trim() });
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

  const newBox = h("details", { class: "fold" }, h("summary", null, "New class"), newForm);
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
  loadPlaces();
  return () => { alive = false; };
}
