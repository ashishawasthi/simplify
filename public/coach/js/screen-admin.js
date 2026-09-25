// The admin's screen (only when admins/{uid} exists — set by the owner in
// the console, never from here), in tabs, each with its own address:
//
//   #admin            Waiting: coaches waiting for approval, requests to join a class
//   #admin/coaches    every coach: who approved them and how they were checked;
//                     suspend, let back in, approve later
//   #admin/classes    every class: suspend it, take its page down, take a coach off it
//   #admin/places     the institutions coaches choose from (add, edit, retire)
//   #admin/history    the admin log: who did what, when, and why
//   #admin/limits     the monthly AI and video limits
//
// Approving a coach or a join request asks how the admin checked them (at
// least MIN_CHECK characters — firestore.rules insist); declining asks what
// to tell the coach, suspending asks why (both if you like). Every action is
// written with its entry in the admin log (cloud.js), so the history says
// which admin approved which coach, and how they knew.
//
// Approving or declining a coach, declining a request, suspending, retiring,
// taking a page down, taking a coach off a class and the limits all have an
// Undo. A coach's decision is written when its toast goes (so Undo costs
// nothing); the rest at once (and Undo is logged too). Approving a join
// request has no Undo (take the coach off the class instead).

import { h, field, notice, busyButton, uid as newId } from "./dom.js";
import { formatCode } from "./class-code.js";
import { whenText } from "./format.js";
import { changedAfterApproval, fold, groupByOrg, namesOf, placeLine } from "./institutions.js";
import { SEARCH_FROM } from "./institution-picker.js";

export const MIN_CHECK = 10; // characters in "how did you check them?" (as firestore.rules)
const HISTORY_PAGE = 50;

const TABS = [
  { id: "waiting", label: "Waiting" },
  { id: "coaches", label: "Coaches" },
  { id: "classes", label: "Classes" },
  { id: "places", label: "Institutions" },
  { id: "history", label: "History" },
  { id: "limits", label: "Limits" },
];

const STATUS_CHIP = {
  approved: ["is-yes", "Approved"],
  pending: ["is-waiting", "Waiting for approval"],
  declined: ["is-no", "Not approved"],
};

export function adminScreen(root, ctx, tabArg = "") {
  const { cloud, toast, user } = ctx;
  let alive = true;
  let tab = TABS.some((t) => t.id === tabArg) ? tabArg : "waiting";
  const tabs = h("nav", { class: "admin-tabs", "aria-label": "Admin sections" });
  const body = h("div", { class: "admin-body" }, h("p", { class: "loading", role: "status" }, "Loading…"));
  root.append(h("section", { class: "screen admin-screen" },
    h("h1", null, "Admin"),
    tabs,
    body));

  let data = null; // { requests, coaches, classes, institutions, limits, log, logProblem }
  const logById = new Map();
  const hiddenRequests = new Set(); // declined, waiting for the Undo to run out
  const deciding = new Map(); // coach uid → the status shown until the toast goes
  const drafts = new Map(); // an open form's key → what was typed (kept across redraws and an Undo)
  let open = null; // the one form open in a card: "approve:<uid>", "decline:<uid>", "suspend:<uid>",
  //                  "join-approve:<id>", "join-decline:<id>", "place-new:<uid>", "place-pick:<uid>"
  let focusNext = null; // a form just opened: its box gets the keyboard
  const search = { places: "", coaches: "", history: "" };
  let editing = null; // the institution id being edited, or "new"
  let historyShown = HISTORY_PAGE;

  renderTabs();

  async function load() {
    try {
      const [requests, coaches, classes, institutions, limits, log] = await Promise.all([
        cloud.pendingRequests(), cloud.allCoaches(), cloud.allClasses(), cloud.listInstitutions(), cloud.getLimits(),
        cloud.adminLog().catch((err) => ({ problem: err.message })),
      ]);
      if (!alive) return;
      data = { requests, coaches, classes, institutions, limits, log: Array.isArray(log) ? log : [], logProblem: log.problem ?? null };
      logById.clear();
      for (const entry of data.log) logById.set(entry.id, entry);
      render();
      loadOlderEntries();
    } catch (err) {
      if (!alive) return;
      body.replaceChildren(notice(err.message, { tone: "problem",
        action: h("button", { class: "btn btn-secondary", type: "button", onclick: load }, "Try again") }));
    }
  }

  // the decisions older than the latest entries loaded: fetched one by one
  async function loadOlderEntries() {
    const ids = [...new Set(data.coaches.flatMap((c) => [c.decisionLog, c.suspendLog]).filter((id) => id && !logById.has(id)))];
    if (!ids.length) return;
    const found = await cloud.logEntries(ids);
    if (!alive) return;
    for (const entry of found) logById.set(entry.id, entry);
    if (found.length) render();
  }

  // an action just written: into the history at once, as the server has it
  function remember(entry) {
    const full = { at: new Date(), adminUid: user.uid, adminEmail: user.email, note: "", ...entry };
    logById.set(full.id ?? newId("local"), full);
    data.log.unshift(full);
  }

  const coachOf = (uid) => data.coaches.find((c) => c.id === uid);
  const classOf = (code) => data.classes.find((c) => c.id === code);
  const coachName = (uid) => coachOf(uid)?.name || "A coach with no profile";
  const statusOf = (coach) => deciding.get(coach.id) ?? coach.status ?? "pending"; // no status: from before approvals
  const institutionName = (id) => data.institutions.find((i) => i.id === id)?.name ?? "An institution no longer listed";
  const adminName = (entry) => coachOf(entry.adminUid)?.name || entry.adminEmail || "An admin";
  const waitingCoaches = () => data.coaches.filter((c) => statusOf(c) === "pending" && !deciding.has(c.id))
    .sort((a, b) => (a.reappliedAt ?? a.createdAt)?.getTime?.() - (b.reappliedAt ?? b.createdAt)?.getTime?.() || 0);
  const visibleRequests = () => data.requests.filter((r) => !hiddenRequests.has(r.id));
  // an example of what a check looks like, from where they say they work
  const example = (coach) => {
    const place = namesOf(coach?.institutions ?? [], data.institutions)[0] || coach?.otherPlace || "their school";
    return `For example: seen taking classes at ${place}`;
  };

  // ---------- the tabs ----------

  function tabHref(id) {
    return id === "waiting" ? "#admin" : `#admin/${id}`;
  }

  function setTab(id) {
    if (id === tab) return;
    tab = id;
    open = null;
    editing = null;
    history.replaceState(null, "", tabHref(id));
    render();
    window.scrollTo(0, 0);
  }

  function renderTabs() {
    const count = data ? waitingCoaches().length + visibleRequests().length : 0;
    tabs.replaceChildren(...TABS.map((t) => h("a", {
      class: "admin-tab", href: tabHref(t.id), "aria-current": t.id === tab ? "page" : null, dataset: { keep: `tab-${t.id}` },
      onclick: (e) => {
        e.preventDefault();
        setTab(t.id);
      },
    }, t.label, t.id === "waiting" && count
      ? [h("span", { class: "nav-count" }, String(count)), h("span", { class: "visually-hidden" }, " waiting")] : null)));
  }

  function render() {
    // keep the keyboard where it was across a redraw (a search box, a note being typed, a tab)
    const refocus = document.activeElement?.dataset?.keep;
    renderTabs();
    const views = { waiting: waitingTab, coaches: coachesTab, classes: classesTab, places: institutionsSection, history: historyTab, limits: limitsForm };
    body.replaceChildren(views[tab]());
    const target = focusNext ?? refocus;
    focusNext = null;
    if (target) {
      const el = root.querySelector(`[data-keep="${target}"]`);
      el?.focus();
      if (el?.setSelectionRange) el.setSelectionRange(el.value.length, el.value.length);
    }
  }

  function openForm(key) {
    open = key;
    focusNext = key;
    render();
  }

  function closeForm() {
    open = null;
    render();
  }

  // ---------- pieces ----------

  function facts(pairs) {
    return h("dl", { class: "facts" }, pairs.filter(([, value]) => value && (!Array.isArray(value) || value.length)).map(([term, value]) =>
      [h("dt", null, term), h("dd", null, value instanceof Node ? value
        : Array.isArray(value) ? h("ul", { class: "plain-list" }, value.map((v) => h("li", null, v))) : value)]));
  }

  const small = (text, onclick, kind = "secondary") => h("button", { class: `btn btn-${kind} btn-small`, type: "button", onclick }, text);

  // A note to go with a decision, in the card: the box, then the button that
  // does it (enabled once the note is long enough) and Cancel.
  function decisionForm({ key, label, hint, placeholder, min = 0, max = 500, confirmText, onConfirm, before }) {
    const box = field({ label, hint, placeholder, multiline: true, rows: 3, maxLength: max, value: drafts.get(key) ?? "", dataset: { keep: key } });
    const confirm = h("button", { class: "btn btn-primary btn-small", type: "button" }, confirmText);
    const left = min ? h("p", { class: "field-hint decision-left", "aria-live": "polite" }) : null;
    const problem = h("div");
    const sync = () => {
      drafts.set(key, box.input.value);
      const n = box.input.value.trim().length;
      confirm.disabled = n < min;
      if (left) left.textContent = n < min ? `${min - n} more ${min - n === 1 ? "letter" : "letters"} to go` : "";
    };
    box.input.addEventListener("input", sync);
    sync();
    busyButton(confirm, async () => {
      problem.replaceChildren();
      const note = box.input.value.trim();
      if (note.length < min) return;
      try {
        await onConfirm(note);
      } catch (err) {
        if (confirm.isConnected) problem.append(notice(err.message, { tone: "problem" }));
      }
    });
    return h("div", { class: "decision-form stack" }, before, box.field, left, problem,
      h("div", { class: "actions" }, confirm, small("Cancel", closeForm, "quiet")));
  }

  // ---------- Waiting ----------

  function waitingTab() {
    const waiting = waitingCoaches();
    const requests = visibleRequests();
    return h("div", null,
      h("section", { class: "section", "aria-labelledby": "adm-wait-h" },
        h("h2", { id: "adm-wait-h" }, `Coaches waiting for approval (${waiting.length})`),
        // what to check sits with what it is about, not above the whole screen
        waiting.length ? h("p", { class: "small" }, "Approve only after checking who they are and where they work. You write down how you checked.") : null,
        waiting.length ? h("ul", { class: "admin-list" }, waiting.map(waitingCard))
          : h("p", { class: "empty" }, "Nobody is waiting.")),
      h("section", { class: "section", "aria-labelledby": "adm-req-h" },
        h("h2", { id: "adm-req-h" }, `Requests to join a class (${requests.length})`),
        requests.length ? h("p", { class: "small" }, "Approve only after checking they really coach that class.") : null,
        requests.length ? h("ul", { class: "admin-list" }, requests.map(requestCard))
          : h("p", { class: "empty" }, "Nothing is waiting.")));
  }

  // Approve / decline: the note first; shown at once, written when the toast
  // goes (Undo opens the form again, with the note as it was).
  function decide(coach, status, note) {
    const key = `${status === "approved" ? "approve" : "decline"}:${coach.id}`;
    open = null;
    deciding.set(coach.id, status);
    render();
    const word = status === "approved" ? "Approved" : "Declined";
    toast.show(`${word}: ${coach.name || coach.email}`, {
      undo: () => {
        deciding.delete(coach.id);
        open = key;
        render();
      },
      commit: () => cloud.decideCoach(coach, status, user, { note, message: status === "declined" ? note : "" }).then((logId) => {
        deciding.delete(coach.id);
        drafts.delete(key);
        Object.assign(coach, { status, decidedAt: new Date(), decidedBy: user.uid, decisionLog: logId });
        if (status === "declined" && note) coach.decisionMessage = note;
        else delete coach.decisionMessage;
        remember({ id: logId, action: `coach-${status}`, coach: coach.id, coachName: coach.name, note });
        if (alive) render();
      }, (err) => {
        deciding.delete(coach.id);
        toast.show(err.message);
        if (alive) load();
      }),
    });
  }

  function approveForm(coach) {
    const noPlace = !(coach.institutions ?? []).length;
    return decisionForm({
      key: `approve:${coach.id}`, label: "How did you check them?", placeholder: example(coach), min: MIN_CHECK,
      hint: "Kept in the admin history with your name. The coach doesn't see it.",
      before: noPlace ? notice("None of their places is in the list yet. Add it first, or they can't make a class.", { tone: "warning" }) : null,
      confirmText: "Approve",
      onConfirm: (note) => decide(coach, "approved", note),
    });
  }

  function declineForm(coach) {
    return decisionForm({
      key: `decline:${coach.id}`, label: "What should they know? (if you like)", max: 300,
      placeholder: "For example: please choose your school, and add a work email I can check.",
      hint: "The coach sees this. It is kept in the admin history too.",
      confirmText: "Decline",
      onConfirm: (note) => decide(coach, "declined", note),
    });
  }

  function decisionButtons(coach, { approveOnly = false } = {}) {
    if (open === `approve:${coach.id}`) return approveForm(coach);
    if (open === `decline:${coach.id}`) return declineForm(coach);
    return h("div", { class: "actions" },
      h("button", { class: `btn ${approveOnly ? "btn-secondary" : "btn-primary"} btn-small`, type: "button", onclick: () => openForm(`approve:${coach.id}`) }, "Approve"),
      approveOnly ? null : small("Decline", () => openForm(`decline:${coach.id}`)));
  }

  function waitingCard(coach) {
    return h("li", { class: "admin-card" },
      h("h3", null, coach.name || "No name", coach.reappliedAt ? h("span", { class: "chip is-waiting" }, "Asked again") : null),
      facts([
        ["Email", coach.email],
        ["Works at", namesOf(coach.institutions, data.institutions)],
        ["Not in the list", otherPlaceBlock(coach)],
        ["Organisation", coach.org], // written before institutions existed
        ["How to check them", coach.note || "Nothing written"],
        ["Asked", whenText(coach.createdAt)],
        ["Asked again", coach.reappliedAt ? whenText(coach.reappliedAt) : null],
        ["Told before", coach.reappliedAt && coach.decisionMessage ? `“${coach.decisionMessage}”` : null],
      ]),
      decisionButtons(coach));
  }

  // ---- a place the coach wrote that is not in the list ----

  function otherPlaceBlock(coach) {
    const other = String(coach.otherPlace ?? "").trim();
    if (!other) return null;
    const words = h("span", { class: "other-place" }, `“${other}”`);
    if (open === `place-new:${coach.id}`) return h("div", null, words, institutionForm(null, { forCoach: coach, prefill: { name: other } }));
    if (open === `place-pick:${coach.id}`) return h("div", null, words, pickPlaceForm(coach));
    return h("div", null, words, h("div", { class: "actions" },
      small("Add it to the list", () => openForm(`place-new:${coach.id}`)),
      small("It's already listed", () => openForm(`place-pick:${coach.id}`), "quiet")));
  }

  function pickPlaceForm(coach) {
    const chosen = new Set(coach.institutions ?? []);
    const groups = groupByOrg(data.institutions.filter((i) => !chosen.has(i.id)), "");
    const id = newId("pick");
    const select = h("select", { id, class: "select", dataset: { keep: `place-pick:${coach.id}` } },
      h("option", { value: "" }, "Choose…"),
      groups.map((g) => h("optgroup", { label: g.org }, g.items.map((i) => h("option", { value: i.id }, i.name)))));
    const use = h("button", { class: "btn btn-primary btn-small", type: "button", disabled: true }, "Put it on their profile");
    select.addEventListener("change", () => { use.disabled = !select.value; });
    const problem = h("div");
    busyButton(use, async () => {
      problem.replaceChildren();
      const inst = data.institutions.find((i) => i.id === select.value);
      if (!inst) return;
      try {
        await cloud.addPlaceToCoach(coach, inst.id, inst, user);
      } catch (err) {
        problem.append(notice(err.message, { tone: "problem" }));
        return;
      }
      const wrote = coach.otherPlace;
      coach.institutions = [...(coach.institutions ?? []), inst.id];
      delete coach.otherPlace;
      remember({ action: "coach-place-added", coach: coach.id, coachName: coach.name, institution: inst.id, institutionName: inst.name, detail: wrote });
      open = null;
      render();
      toast.show(`${inst.name} is on ${coach.name}'s profile now`);
    });
    return h("div", { class: "decision-form stack" },
      h("div", { class: "field" }, h("label", { for: id }, "Which listed place is it?"), select),
      problem,
      h("div", { class: "actions" }, use, small("Cancel", closeForm, "quiet")));
  }

  // ---- requests to join a class ----

  function requestCard(req) {
    const coach = coachOf(req.uid);
    const joining = req.kind === "join-class";
    const cls = joining ? classOf(req.classCode) : null;
    const what = joining
      ? `Join ${formatCode(req.classCode)}${cls ? ` (${cls.name})` : " — no class has this code"}`
      : `New class: ${req.className}`;
    const decline = async (note) => {
      open = null;
      hiddenRequests.add(req.id);
      render();
      toast.show("Declined", {
        undo: () => {
          hiddenRequests.delete(req.id);
          open = `join-decline:${req.id}`;
          render();
        },
        commit: () => cloud.declineRequest(req, user, { note, coach, cls }).then(load, (err) => {
          hiddenRequests.delete(req.id);
          toast.show(err.message);
          load();
        }),
      });
    };
    let actions;
    if (open === `join-approve:${req.id}`) {
      const colleague = cls ? cls.uids.map(coachName)[0] : null;
      actions = decisionForm({
        key: `join-approve:${req.id}`, label: "How did you check they coach this class?", min: MIN_CHECK,
        placeholder: `For example: seen teaching ${cls?.name ?? "the class"}${colleague ? ` with ${colleague}` : ""}`,
        hint: "Kept in the admin history with your name.",
        confirmText: "Approve",
        onConfirm: async (note) => {
          await cloud.approveRequest(req, user, { note, coach, cls });
          drafts.delete(`join-approve:${req.id}`);
          open = null;
          toast.show(`Approved: ${coachName(req.uid)} can now work on ${cls?.name ?? formatCode(req.classCode)}.`);
          load();
        },
      });
    } else if (open === `join-decline:${req.id}`) {
      actions = decisionForm({
        key: `join-decline:${req.id}`, label: "Why? (if you like)", max: 300,
        hint: "Kept in the admin history. The coach sees only “Not approved”.",
        confirmText: "Decline", onConfirm: decline,
      });
    } else {
      // an older "new class" request: coaches make their own classes now
      actions = h("div", { class: "actions" },
        joining ? h("button", { class: "btn btn-primary btn-small", type: "button", disabled: !cls, onclick: () => openForm(`join-approve:${req.id}`) }, "Approve") : null,
        small("Decline", () => openForm(`join-decline:${req.id}`)));
    }
    const status = coach ? statusOf(coach) : null;
    return h("li", { class: "admin-card" },
      h("h3", null, what),
      facts([
        ["Coach", coach ? `${coach.name} (${coach.email})` : "No profile yet"],
        ["Coach's status", status && status !== "approved" ? STATUS_CHIP[status][1] : null],
        ["Works at", coach ? namesOf(coach.institutions, data.institutions) : null],
        ["The class is at", cls?.institution ? institutionName(cls.institution) : cls?.org],
        ["The class's coaches", cls ? cls.uids.map(coachName).join(", ") || "None" : null],
        ["How to check them", coach?.note],
        ["Their note", req.note],
        ["Asked", whenText(req.createdAt)],
      ]),
      joining ? null : h("p", { class: "small" }, "An older request: coaches now make their own classes once approved."),
      actions);
  }

  // ---------- Coaches ----------

  function coachMatches(coach, words) {
    const hay = fold([coach.name, coach.email, coach.otherPlace, coach.note, ...namesOf(coach.institutions, data.institutions),
      STATUS_CHIP[statusOf(coach)]?.[1], coach.suspended ? "suspended" : ""].join(" "));
    return words.every((w) => hay.includes(w));
  }

  function searchBox(which, placeholder, label) {
    return h("input", {
      type: "search", class: "pick-search", value: search[which], placeholder, "aria-label": label, dataset: { keep: `search-${which}` },
      oninput: (e) => {
        search[which] = e.target.value;
        if (which === "history") historyShown = HISTORY_PAGE;
        render();
      },
    });
  }

  function coachesTab() {
    const long = data.coaches.length > SEARCH_FROM;
    const words = fold(long ? search.coaches : "").split(" ").filter(Boolean);
    const shown = data.coaches.filter((c) => coachMatches(c, words));
    return h("section", { class: "section", "aria-labelledby": "adm-coach-h" },
      h("h2", { id: "adm-coach-h" }, `Coaches (${data.coaches.length})`),
      long ? h("div", { class: "inst-tools" }, searchBox("coaches", "Search: a name, email, school or status", "Search the coaches")) : null,
      shown.length ? h("ul", { class: "admin-list" }, shown.map(coachCard))
        : h("p", { class: "empty" }, words.length ? `Nobody matches “${search.coaches.trim()}”.` : "No coaches yet."));
  }

  // "Approved by Ms Tan · Tue 8:05 am" and how they checked, from the log
  function decisionRecord(coach, status) {
    if (status === "pending" || deciding.has(coach.id) || !coach.decidedAt) return null;
    const entry = coach.decisionLog ? logById.get(coach.decisionLog) : null;
    if (entry) {
      return h("div", { class: "record" },
        h("span", null, `${adminName(entry)} · ${whenText(entry.at)}`),
        entry.note ? h("span", { class: "record-note" }, status === "declined" ? "Told them: " : "Checked: ", h("q", null, entry.note)) : null);
    }
    if (coach.decisionLog) return h("span", null, `${whenText(coach.decidedAt)} (loading the record…)`);
    if (coach.decidedBy === "migration") return `${whenText(coach.decidedAt)}, when approvals began`;
    return h("span", null, `${whenText(coach.decidedAt)}. `,
      h("span", { class: "record-note" }, "Before the admin history began, so there is no note of how."));
  }

  function suspensionRecord(coach) {
    const entry = coach.suspended && coach.suspendLog ? logById.get(coach.suspendLog) : null;
    if (!entry) return null;
    return h("div", { class: "record" },
      h("span", null, `${adminName(entry)} · ${whenText(entry.at)}`),
      entry.note ? h("span", { class: "record-note" }, "Why: ", h("q", null, entry.note)) : null);
  }

  async function setSuspended(coach, suspended, note) {
    const was = coach.suspended === true;
    const logId = await cloud.setCoachSuspended(coach, suspended, user, note);
    Object.assign(coach, { suspended, suspendLog: logId });
    remember({ id: logId, action: suspended ? "coach-suspended" : "coach-unsuspended", coach: coach.id, coachName: coach.name, note });
    drafts.delete(`suspend:${coach.id}`);
    open = null;
    render();
    toast.show(suspended ? `${coach.name} is suspended` : `${coach.name} can work again`, {
      undo: () => cloud.setCoachSuspended(coach, was, user, "Undo").then((undoId) => {
        Object.assign(coach, { suspended: was, suspendLog: undoId });
        remember({ id: undoId, action: was ? "coach-suspended" : "coach-unsuspended", coach: coach.id, coachName: coach.name, note: "Undo" });
        render();
      }, (err) => toast.show(err.message)),
    });
  }

  function coachCard(coach) {
    const status = statusOf(coach);
    const classes = data.classes.filter((c) => c.uids.includes(coach.id)).map((c) => c.name);
    const [chipClass, chipText] = STATUS_CHIP[status] ?? STATUS_CHIP.pending;
    let actions = null;
    if (open === `suspend:${coach.id}`) {
      actions = decisionForm({
        key: `suspend:${coach.id}`, label: "Why? (if you like)", max: 500,
        hint: "Kept in the admin history. The coach sees that the admin has paused their account.",
        confirmText: "Suspend", onConfirm: (note) => setSuspended(coach, true, note),
      });
    } else if (status === "approved" && !deciding.has(coach.id)) {
      const button = coach.suspended ? small("Let back in", null) : small("Suspend", () => openForm(`suspend:${coach.id}`));
      if (coach.suspended) {
        busyButton(button, async () => {
          try {
            await setSuspended(coach, false, "");
          } catch (err) {
            toast.show(err.message);
          }
        });
      }
      actions = h("div", { class: "actions" }, button, historyLink(coach));
    } else if (status === "declined" && !deciding.has(coach.id)) {
      actions = open === `approve:${coach.id}` ? approveForm(coach)
        : h("div", { class: "actions" }, small("Approve", () => openForm(`approve:${coach.id}`)), historyLink(coach));
    } else if (status === "pending") {
      actions = h("div", { class: "actions" }, small("Go to Waiting", () => setTab("waiting"), "quiet"));
    }
    const changed = changedAfterApproval(coach) ? `Changed ${whenText(coach.institutionsChangedAt)}, after approval` : null;
    const places = (coach.institutions ?? []).length ? namesOf(coach.institutions, data.institutions) : [coach.otherPlace ? "Nothing from the list" : "Not chosen yet"];
    const worksAt = h("div", null, h("ul", { class: "plain-list" }, places.map((v) => h("li", null, v))),
      changed ? h("span", { class: "chip is-waiting" }, changed) : null);
    const decidedTerm = status === "approved" ? "Approved by" : status === "declined" ? "Declined by" : "Decided";
    return h("li", { class: "admin-card" },
      h("h3", null, coach.name || "No name", h("span", { class: `chip ${chipClass}` }, chipText),
        coach.suspended ? h("span", { class: "chip is-no" }, "Suspended") : null),
      facts([
        ["Email", coach.email],
        ["Works at", worksAt],
        ["Not in the list", otherPlaceBlock(coach)],
        ["Organisation", coach.org], // written before institutions existed
        ["How to check them", coach.note],
        ["Classes", classes.join(", ") || "None yet"],
        [decidedTerm, decisionRecord(coach, status)],
        ["Suspended by", suspensionRecord(coach)],
      ]),
      actions);
  }

  // this coach's entries in the history
  function historyLink(coach) {
    return small("History", () => {
      search.history = coach.email || coach.name || "";
      historyShown = HISTORY_PAGE;
      setTab("history");
    }, "quiet");
  }

  // ---------- Classes ----------

  function classesTab() {
    return h("section", { class: "section", "aria-labelledby": "adm-class-h" },
      h("h2", { id: "adm-class-h" }, `Classes (${data.classes.length})`),
      data.classes.length ? h("ul", { class: "admin-list" }, data.classes.map(classCard))
        : h("p", { class: "empty" }, "No classes yet."));
  }

  function classCoachesList(cls) {
    if (!cls.uids.length) return "None";
    return h("ul", { class: "plain-list class-coaches" }, cls.uids.map((uid) => {
      const coach = coachOf(uid) ?? { id: uid, name: coachName(uid), email: "" };
      const off = h("button", { class: "btn btn-quiet btn-small", type: "button", "aria-label": `Take ${coach.name} off ${cls.name}` }, "Take off");
      busyButton(off, async () => {
        try {
          await cloud.setCoachOfClass(cls, coach, false, user);
        } catch (err) {
          toast.show(err.message);
          return;
        }
        cls.uids = cls.uids.filter((u) => u !== uid);
        remember({ action: "coach-removed", coach: uid, coachName: coach.name, classCode: cls.id, className: cls.name });
        render();
        toast.show(`${coach.name} is off ${cls.name}`, {
          undo: () => cloud.setCoachOfClass(cls, coach, true, user, "Undo").then(() => {
            if (!cls.uids.includes(uid)) cls.uids.push(uid);
            remember({ action: "coach-added", coach: uid, coachName: coach.name, classCode: cls.id, className: cls.name, note: "Undo" });
            render();
          }, (err) => toast.show(err.message)),
        });
      });
      return h("li", { class: "class-coach" }, h("span", null, coach.name), off);
    }));
  }

  function classCard(cls) {
    const active = cls.status === "active";
    const status = h("button", { class: "btn btn-secondary btn-small", type: "button" }, active ? "Suspend the class" : "Make it active again");
    busyButton(status, async () => {
      const was = cls.status;
      const next = was === "active" ? "suspended" : "active";
      try {
        await cloud.setClassStatus(cls, next, user);
      } catch (err) {
        toast.show(err.message);
        return;
      }
      cls.status = next;
      remember({ action: next === "active" ? "class-restored" : "class-suspended", classCode: cls.id, className: cls.name });
      render();
      toast.show(next === "active" ? `${cls.name} is active` : `${cls.name} is suspended`, {
        undo: () => cloud.setClassStatus(cls, was, user, "Undo").then(() => {
          cls.status = was;
          remember({ action: was === "active" ? "class-restored" : "class-suspended", classCode: cls.id, className: cls.name, note: "Undo" });
          render();
        }, (err) => toast.show(err.message)),
      });
    });
    const takeDown = cls.latest ? h("button", { class: "btn btn-secondary btn-small", type: "button" }, "Take the page down") : null;
    if (takeDown) {
      busyButton(takeDown, async () => {
        const before = cls.latest;
        try {
          await cloud.adminSetLatest(cls, null, user);
        } catch (err) {
          toast.show(err.message);
          return;
        }
        cls.latest = null;
        remember({ action: "page-taken-down", classCode: cls.id, className: cls.name, detail: before.title || "Untitled page" });
        render();
        toast.show(`${cls.name}: the page is down`, {
          undo: () => cloud.adminSetLatest(cls, before, user, "Undo").then(() => {
            cls.latest = before;
            remember({ action: "page-put-back", classCode: cls.id, className: cls.name, detail: before.title || "Untitled page", note: "Undo" });
            render();
          }, (err) => toast.show(err.message)),
        });
      });
    }
    return h("li", { class: "admin-card" },
      h("h3", null, cls.name, " ", h("span", { class: "code-text" }, formatCode(cls.id)),
        active ? null : h("span", { class: "chip is-no" }, "Suspended")),
      facts([
        ["Institution", cls.institution ? institutionName(cls.institution) : null],
        ["Organisation", cls.org], // a class made before institutions existed
        ["Learners see", cls.latest ? `“${cls.latest.title || "Untitled page"}”, published ${whenText(cls.latest.publishedAt)}` : "Nothing"],
        ["Coaches", classCoachesList(cls)],
      ]),
      h("div", { class: "actions" }, status, takeDown));
  }

  // ---------- Institutions ----------

  // Add, edit — or add the place a coach wrote (forCoach): it goes on their
  // profile in place of their words, in the same write.
  function institutionForm(inst, { forCoach = null, prefill = {} } = {}) {
    const start = inst ?? prefill;
    const types = [...new Set(data.institutions.map((i) => i.type).filter(Boolean))].sort();
    const listId = newId("types");
    const keep = forCoach ? `place-new:${forCoach.id}` : `inst-${inst?.id ?? "new"}`;
    const name = field({ label: "Name", maxLength: 80, value: start.name ?? "", hint: "The place itself, for example AWWA School @ Napiri.", dataset: { keep } });
    const org = field({ label: "Organisation", maxLength: 60, value: start.org ?? "", hint: "Places of one organisation are listed together." });
    const type = field({ label: "Type (if you like)", maxLength: 60, value: start.type ?? "", list: listId });
    const area = field({ label: "Area (if you like)", maxLength: 40, value: start.area ?? "" });
    const save = h("button", { class: "btn btn-primary btn-small", type: "submit" }, inst ? "Save" : forCoach ? "Add, and put it on their profile" : "Add");
    const cancel = h("button", { class: "btn btn-quiet btn-small", type: "button", onclick: () => {
      if (forCoach) open = null;
      else editing = null;
      render();
    } }, "Cancel");
    const problem = h("div");
    const form = h("form", { class: "stack inst-form", novalidate: true },
      name.field, org.field, type.field, h("datalist", { id: listId }, types.map((t) => h("option", { value: t }))), area.field,
      problem, h("div", { class: "actions" }, save, cancel));
    const sync = () => { save.disabled = !name.input.value.trim() || !org.input.value.trim(); };
    name.input.addEventListener("input", sync);
    org.input.addEventListener("input", sync);
    sync();
    form.addEventListener("submit", (e) => e.preventDefault());
    busyButton(save, async () => {
      problem.replaceChildren();
      const next = {
        name: name.input.value.trim(), org: org.input.value.trim(), type: type.input.value.trim(), area: area.input.value.trim(),
        active: inst ? inst.active !== false : true,
      };
      if (!next.name || !next.org) return;
      let id;
      try {
        id = await cloud.saveInstitution(inst?.id ?? null, next, user, { forCoach });
      } catch (err) {
        problem.append(notice(err.message, { tone: "problem" }));
        return;
      }
      if (inst) Object.assign(inst, next);
      else data.institutions.push({ id, ...next });
      remember({ action: inst ? "institution-edited" : "institution-added", institution: id, institutionName: next.name,
        ...(forCoach ? { coach: forCoach.id, coachName: forCoach.name } : {}) });
      if (forCoach) {
        forCoach.institutions = [...(forCoach.institutions ?? []), id];
        delete forCoach.otherPlace;
        open = null;
      } else {
        editing = null;
      }
      render();
      toast.show(forCoach ? `Added ${next.name}, and put it on ${forCoach.name}'s profile` : inst ? `Saved: ${next.name}` : `Added: ${next.name}`);
    });
    if (!forCoach) queueMicrotask(() => name.input.focus());
    return form;
  }

  function institutionRow(inst) {
    if (editing === inst.id) return h("li", { class: "inst-row is-editing" }, institutionForm(inst));
    const users = data.coaches.filter((c) => c.institutions?.includes(inst.id)).length;
    const retire = h("button", { class: "btn btn-quiet btn-small", type: "button" }, inst.active ? "Retire" : "Bring back");
    busyButton(retire, async () => {
      const was = inst.active !== false;
      try {
        await cloud.setInstitutionActive(inst, !was, user);
      } catch (err) {
        toast.show(err.message);
        return;
      }
      inst.active = !was;
      remember({ action: was ? "institution-retired" : "institution-restored", institution: inst.id, institutionName: inst.name });
      render();
      toast.show(was ? `Retired: ${inst.name}` : `Back in the list: ${inst.name}`, {
        undo: () => cloud.setInstitutionActive(inst, was, user, "Undo").then(() => {
          inst.active = was;
          remember({ action: was ? "institution-restored" : "institution-retired", institution: inst.id, institutionName: inst.name, note: "Undo" });
          render();
        }, (err) => toast.show(err.message)),
      });
    });
    const line = placeLine(inst);
    return h("li", { class: `inst-row${inst.active ? "" : " is-retired"}` },
      h("span", { class: "inst-text" },
        h("span", { class: "inst-name" }, inst.name, inst.active ? null : h("span", { class: "chip is-no" }, "Retired")),
        h("span", { class: "inst-place" }, [line, users ? `${users} ${users === 1 ? "coach" : "coaches"}` : ""].filter(Boolean).join(" · "))),
      h("span", { class: "inst-actions" },
        h("button", { class: "btn btn-quiet btn-small", type: "button", onclick: () => { editing = inst.id; render(); } }, "Edit"),
        retire));
  }

  function institutionsSection() {
    const active = data.institutions.filter((i) => i.active).length;
    // a search box only for a long list, as in the coaches' picker
    const long = data.institutions.length > SEARCH_FROM;
    if (!long) search.places = "";
    const box = !long ? null : h("input", {
      type: "search", class: "pick-search", value: search.places, placeholder: "Search: a name, organisation or area",
      "aria-label": "Search the institutions", dataset: { keep: "inst-search" },
      oninput: (e) => { search.places = e.target.value; render(); },
    });
    // retired ones too (groupByOrg keeps the "chosen" ones: here, all of them)
    const groups = groupByOrg(data.institutions, search.places, data.institutions.map((i) => i.id));
    const add = editing === "new"
      ? institutionForm(null)
      : h("button", { class: "btn btn-secondary btn-small", type: "button", onclick: () => { editing = "new"; render(); } }, "Add an institution");
    // coaches who named a place not in the list: add it from their card
    const named = data.coaches.filter((c) => String(c.otherPlace ?? "").trim());
    return h("section", { class: "section", "aria-labelledby": "adm-inst-h" },
      h("h2", { id: "adm-inst-h" }, `Institutions (${active} in the list)`),
      h("div", { class: "inst-tools" }, box, add),
      named.length ? notice(`${named.length === 1 ? "A coach has" : `${named.length} coaches have`} named a place not in the list: ${named.map((c) => `“${c.otherPlace}”`).join(", ")}. Add it from their card.`,
        { action: small(named.some((c) => statusOf(c) === "pending") ? "Go to Waiting" : "Go to Coaches", () => setTab(named.some((c) => statusOf(c) === "pending") ? "waiting" : "coaches")) }) : null,
      groups.length ? h("div", { class: "inst-groups" }, groups.map((g) => h("section", { class: "inst-group", "aria-label": g.org },
        h("h3", null, g.org),
        h("ul", { class: "inst-list" }, g.items.map(institutionRow)))))
        : h("p", { class: "empty" }, search.places.trim() ? `Nothing matches “${search.places.trim()}”.` : "No institutions yet. Add one, or seed the list (tools/seed-institutions.mjs)."),
      h("p", { class: "field-hint inst-hint" }, "Coaches choose where they work from this list. Retire a place that has closed: coaches no longer see it, but nothing that points at it breaks."));
  }

  // ---------- History ----------

  const LABEL = {
    "coach-approved": "How they checked: ",
    "join-approved": "How they checked: ",
    "coach-declined": "Told the coach: ",
  };

  function sentence(e) {
    const b = (text) => h("strong", null, text);
    const who = b(e.coachName || coachName(e.coach));
    const cls = b(e.className ? `${e.className} (${formatCode(e.classCode)})` : e.classCode ? formatCode(e.classCode) : "a class");
    const inst = b(e.institutionName || institutionName(e.institution));
    switch (e.action) {
      case "coach-approved": return ["approved ", who, " as a coach"];
      case "coach-declined": return ["declined ", who];
      case "coach-pending": return ["put ", who, " back to waiting"];
      case "coach-suspended": return ["suspended ", who];
      case "coach-unsuspended": return ["let ", who, " back in"];
      case "join-approved": return ["added ", who, " to ", cls, ", as they asked"];
      case "join-declined": return ["declined ", who, "'s request to join ", cls];
      case "coach-removed": return ["took ", who, " off ", cls];
      case "coach-added": return ["put ", who, " back on ", cls];
      case "coach-place-added": return ["put ", inst, " on ", who, "'s profile", e.detail ? ` (they wrote “${e.detail}”)` : ""];
      case "institution-added": return ["added ", inst, " to the institutions", e.coach ? [" (named by ", who, ")"] : ""];
      case "institution-edited": return ["changed ", inst];
      case "institution-retired": return ["retired ", inst];
      case "institution-restored": return ["brought back ", inst];
      case "class-suspended": return ["suspended the class ", cls];
      case "class-restored": return ["made ", cls, " active again"];
      case "page-taken-down": return ["took “", e.detail || "the page", "” down from ", cls];
      case "page-put-back": return ["put “", e.detail || "the page", "” back on ", cls];
      case "limits-changed": return ["set the monthly limits: ", e.detail];
      default: return [e.action];
    }
  }

  function logRow(e) {
    return h("li", { class: "log-row" },
      h("p", { class: "log-what" }, h("strong", null, adminName(e)), " ", sentence(e)),
      e.note ? h("p", { class: "log-note" }, LABEL[e.action] ?? "Why: ", h("q", null, e.note)) : null,
      h("p", { class: "log-when" }, [whenText(e.at), e.adminEmail].filter(Boolean).join(" · ")));
  }

  function historyTab() {
    const words = fold(search.history).split(" ").filter(Boolean);
    const all = data.log.filter((e) => !words.length || words.every((w) => fold([adminName(e), e.adminEmail, e.coachName, e.coachEmail,
      e.className, e.classCode, e.institutionName, e.note, e.detail, sentence(e).flat().map((p) => (p instanceof Node ? p.textContent : p)).join("")].join(" ")).includes(w)));
    const shown = all.slice(0, historyShown);
    return h("section", { class: "section", "aria-labelledby": "adm-hist-h" },
      h("h2", { id: "adm-hist-h" }, "History"),
      data.logProblem ? notice(data.logProblem, { tone: "problem",
        action: h("button", { class: "btn btn-secondary", type: "button", onclick: load }, "Try again") }) : null,
      data.log.length ? h("div", { class: "inst-tools" }, searchBox("history", "Search: a coach, admin, class or word", "Search the history")) : null,
      shown.length ? h("ul", { class: "log-list" }, shown.map(logRow))
        : h("p", { class: "empty" }, words.length ? `Nothing matches “${search.history.trim()}”.` : "Nothing yet. Every approval and change an admin makes is listed here."),
      all.length > shown.length ? h("div", { class: "actions" }, small(`Show ${Math.min(HISTORY_PAGE, all.length - shown.length)} more`, () => {
        historyShown += HISTORY_PAGE;
        render();
      })) : null,
      h("p", { class: "field-hint inst-hint" }, "Who did what, newest first. Nobody can change or delete it from the app."));
  }

  // ---------- Limits ----------

  function limitsForm() {
    const flash = field({ label: "AI requests per coach per month", type: "number", inputmode: "numeric", min: 0, max: 5000, step: 1, value: String(data.limits.flashPerMonth) });
    const videos = field({ label: "Videos per coach per month", type: "number", inputmode: "numeric", min: 0, max: 100, step: 1, value: String(data.limits.videosPerMonth) });
    const save = h("button", { class: "btn btn-primary", type: "submit" }, "Save the limits");
    const form = h("form", { class: "stack form-narrow", novalidate: true },
      flash.field, videos.field, h("div", { class: "actions" }, save),
      h("p", { class: "field-hint" }, "The same for every coach, counted in Singapore months. AI requests are writing pages and planning videos (Gemini Flash); each video costs about US$0.80."));
    // numbers only, within the limits the rules allow: forgiven as typed, never refused
    const clamp = (input, max) => Math.min(max, Math.max(0, Math.round(Number(input.value) || 0)));
    form.addEventListener("submit", (e) => e.preventDefault());
    const said = (l) => `${l.flashPerMonth} AI requests and ${l.videosPerMonth} videos a month`;
    busyButton(save, async () => {
      const next = { flashPerMonth: clamp(flash.input, 5000), videosPerMonth: clamp(videos.input, 100) };
      const before = { ...data.limits };
      try {
        await cloud.saveLimits(user, next);
      } catch (err) {
        toast.show(err.message);
        return;
      }
      data.limits = next;
      remember({ action: "limits-changed", detail: said(next) });
      flash.input.value = String(next.flashPerMonth);
      videos.input.value = String(next.videosPerMonth);
      toast.show(`Limits saved: ${said(next)}`, {
        undo: () => cloud.saveLimits(user, before).then(() => {
          data.limits = before;
          remember({ action: "limits-changed", detail: said(before), note: "Undo" });
          render();
        }, (err) => toast.show(err.message)),
      });
    });
    return h("section", { class: "section", "aria-labelledby": "adm-limits-h" },
      h("h2", { id: "adm-limits-h" }, "Monthly limits"), form);
  }

  load();
  return () => { alive = false; };
}
