// The admin's screen (only when admins/{uid} exists — set by the owner, never
// from here): the coaches waiting for approval (approve or decline), the
// requests to join a class, every coach (suspend, let back in, approve
// later), every class (suspend, or take its page down), the monthly limits,
// and the institutions coaches choose from (add, edit, retire).
//
// Approving or declining a coach, declining a request, suspending, retiring,
// taking a page down and the limits all have an Undo. A coach's decision is
// written when its toast goes (so Undo costs nothing); the rest at once.
// Approving a join request has no Undo (suspend the coach instead).

import { h, field, notice, busyButton, uid as newId } from "./dom.js";
import { formatCode } from "./class-code.js";
import { whenText } from "./format.js";
import { changedAfterApproval, groupByOrg, namesOf, placeLine } from "./institutions.js";
import { SEARCH_FROM } from "./institution-picker.js";

const STATUS_CHIP = {
  approved: ["is-yes", "Approved"],
  pending: ["is-waiting", "Waiting for approval"],
  declined: ["is-no", "Not approved"],
};

export function adminScreen(root, ctx) {
  const { cloud, toast, user } = ctx;
  let alive = true;
  const body = h("div", { class: "admin-body" }, h("p", { class: "loading", role: "status" }, "Loading…"));
  root.append(h("section", { class: "screen admin-screen" },
    h("h1", null, "Admin"),
    h("p", { class: "lead" }, "Approve a coach only after checking who they are and where they work. Let a coach join a class only after checking they really coach it."),
    body));

  let data = null; // { requests, coaches, classes, institutions, limits }
  const hiddenRequests = new Set(); // declined, waiting for the Undo to run out
  const deciding = new Map(); // coach uid → the status shown until the toast goes
  let search = ""; // the institutions filter
  let editing = null; // the institution id being edited, or "new"

  async function load() {
    try {
      const [requests, coaches, classes, institutions, limits] = await Promise.all([
        cloud.pendingRequests(), cloud.allCoaches(), cloud.allClasses(), cloud.listInstitutions(), cloud.getLimits(),
      ]);
      if (!alive) return;
      data = { requests, coaches, classes, institutions, limits };
      render();
    } catch (err) {
      if (!alive) return;
      body.replaceChildren(notice(err.message, { tone: "problem",
        action: h("button", { class: "btn btn-secondary", type: "button", onclick: load }, "Try again") }));
    }
  }

  const coachOf = (uid) => data.coaches.find((c) => c.id === uid);
  const classOf = (code) => data.classes.find((c) => c.id === code);
  const coachName = (uid) => coachOf(uid)?.name || "A coach with no profile";
  const statusOf = (coach) => deciding.get(coach.id) ?? coach.status ?? "pending"; // no status: from before approvals
  const placesOf = (ids) => namesOf(ids, data.institutions);
  const institutionName = (id) => data.institutions.find((i) => i.id === id)?.name ?? "An institution no longer listed";

  function render() {
    // keep the keyboard where it was across a redraw (the institutions search box)
    const refocus = document.activeElement?.dataset?.keep;
    const waiting = data.coaches.filter((c) => statusOf(c) === "pending" && !deciding.has(c.id))
      .sort((a, b) => (a.createdAt?.getTime?.() ?? 0) - (b.createdAt?.getTime?.() ?? 0));
    const requests = data.requests.filter((r) => !hiddenRequests.has(r.id));
    body.replaceChildren(
      h("section", { class: "section", "aria-labelledby": "adm-wait-h" },
        h("h2", { id: "adm-wait-h" }, `Coaches waiting for approval (${waiting.length})`),
        waiting.length ? h("ul", { class: "admin-list" }, waiting.map(waitingCard))
          : h("p", { class: "empty" }, "Nobody is waiting.")),
      h("section", { class: "section", "aria-labelledby": "adm-req-h" },
        h("h2", { id: "adm-req-h" }, `Requests to join a class (${requests.length})`),
        requests.length ? h("ul", { class: "admin-list" }, requests.map(requestCard))
          : h("p", { class: "empty" }, "Nothing is waiting.")),
      h("section", { class: "section", "aria-labelledby": "adm-coach-h" },
        h("h2", { id: "adm-coach-h" }, "Coaches"),
        data.coaches.length ? h("ul", { class: "admin-list" }, data.coaches.map(coachCard))
          : h("p", { class: "empty" }, "No coaches yet.")),
      h("section", { class: "section", "aria-labelledby": "adm-class-h" },
        h("h2", { id: "adm-class-h" }, "Classes"),
        data.classes.length ? h("ul", { class: "admin-list" }, data.classes.map(classCard))
          : h("p", { class: "empty" }, "No classes yet.")),
      limitsForm(),
      institutionsSection()); // last: the longest list
    if (refocus) {
      const el = body.querySelector(`[data-keep="${refocus}"]`);
      el?.focus();
      if (el?.setSelectionRange) el.setSelectionRange(el.value.length, el.value.length);
    }
  }

  function facts(pairs) {
    return h("dl", { class: "facts" }, pairs.filter(([, value]) => value && (!Array.isArray(value) || value.length)).map(([term, value]) =>
      [h("dt", null, term), h("dd", null, Array.isArray(value) ? h("ul", { class: "plain-list" }, value.map((v) => h("li", null, v))) : value)]));
  }

  // Approve / decline / approve later: shown at once, written when the toast
  // goes (Undo puts it back and writes nothing).
  function decide(coach, status) {
    deciding.set(coach.id, status);
    render();
    const word = status === "approved" ? "Approved" : "Declined";
    toast.show(`${word}: ${coach.name || coach.email}`, {
      undo: () => {
        deciding.delete(coach.id);
        render();
      },
      commit: () => cloud.decideCoach(coach.id, status, user.uid).then(() => {
        deciding.delete(coach.id);
        Object.assign(coach, { status, decidedAt: new Date(), decidedBy: user.uid });
        if (alive) render();
      }, (err) => {
        deciding.delete(coach.id);
        toast.show(err.message);
        if (alive) load();
      }),
    });
  }

  function waitingCard(coach) {
    const approve = h("button", { class: "btn btn-primary btn-small", type: "button", onclick: () => decide(coach, "approved") }, "Approve");
    const decline = h("button", { class: "btn btn-secondary btn-small", type: "button", onclick: () => decide(coach, "declined") }, "Decline");
    return h("li", { class: "admin-card" },
      h("h3", null, coach.name || "No name"),
      facts([
        ["Email", coach.email],
        ["Works at", placesOf(coach.institutions)],
        ["Organisation", coach.org], // written before institutions existed
        ["How to check them", coach.note || "Nothing written"],
        ["Asked", whenText(coach.createdAt)],
      ]),
      h("div", { class: "actions" }, approve, decline));
  }

  function requestCard(req) {
    const coach = coachOf(req.uid);
    const joining = req.kind === "join-class";
    const cls = joining ? classOf(req.classCode) : null;
    const what = joining
      ? `Join ${formatCode(req.classCode)}${cls ? ` (${cls.name})` : " — no class has this code"}`
      : `New class: ${req.className}`;
    // an older "new class" request: coaches make their own classes now
    const approve = joining ? h("button", { class: "btn btn-primary btn-small", type: "button", disabled: !cls }, "Approve") : null;
    const decline = h("button", { class: "btn btn-secondary btn-small", type: "button" }, "Decline");
    const problem = h("div");
    if (approve) {
      busyButton(approve, async () => {
        problem.replaceChildren();
        try {
          await cloud.approveRequest(req, user.uid);
          toast.show(`Approved: ${coachName(req.uid)} can now work on ${cls?.name ?? formatCode(req.classCode)}.`);
          load();
        } catch (err) {
          problem.append(notice(err.message, { tone: "problem" }));
        }
      });
    }
    decline.addEventListener("click", () => {
      hiddenRequests.add(req.id);
      render();
      toast.show("Declined", {
        undo: () => {
          hiddenRequests.delete(req.id);
          render();
        },
        commit: () => cloud.declineRequest(req, user.uid).then(load, (err) => {
          hiddenRequests.delete(req.id);
          toast.show(err.message);
          load();
        }),
      });
    });
    const status = coach ? statusOf(coach) : null;
    return h("li", { class: "admin-card" },
      h("h3", null, what),
      facts([
        ["Coach", coach ? `${coach.name} (${coach.email})` : "No profile yet"],
        ["Coach's status", status && status !== "approved" ? STATUS_CHIP[status][1] : null],
        ["Works at", coach ? placesOf(coach.institutions) : null],
        ["The class is at", cls?.institution ? institutionName(cls.institution) : cls?.org],
        ["How to check them", coach?.note],
        ["Their note", req.note],
        ["Asked", whenText(req.createdAt)],
      ]),
      joining ? null : h("p", { class: "small" }, "An older request: coaches now make their own classes once approved."),
      problem,
      h("div", { class: "actions" }, approve, decline));
  }

  function coachCard(coach) {
    const status = statusOf(coach);
    const classes = data.classes.filter((c) => c.uids.includes(coach.id)).map((c) => c.name);
    const [chipClass, chipText] = STATUS_CHIP[status] ?? STATUS_CHIP.pending;
    const buttons = [];
    if (status === "approved" && !deciding.has(coach.id)) {
      const button = h("button", { class: "btn btn-secondary btn-small", type: "button" }, coach.suspended ? "Let back in" : "Suspend");
      busyButton(button, async () => {
        const was = coach.suspended === true;
        try {
          await cloud.setCoachSuspended(coach.id, !was);
        } catch (err) {
          toast.show(err.message);
          return;
        }
        coach.suspended = !was;
        render();
        toast.show(was ? `${coach.name} can work again` : `${coach.name} is suspended`, {
          undo: () => cloud.setCoachSuspended(coach.id, was).then(() => {
            coach.suspended = was;
            render();
          }, (err) => toast.show(err.message)),
        });
      });
      buttons.push(button);
    } else if (status === "declined" && !deciding.has(coach.id)) {
      buttons.push(h("button", { class: "btn btn-secondary btn-small", type: "button", onclick: () => decide(coach, "approved") }, "Approve"));
    }
    const changed = changedAfterApproval(coach) ? `Changed ${whenText(coach.institutionsChangedAt)}, after approval` : null;
    return h("li", { class: "admin-card" },
      h("h3", null, coach.name || "No name", h("span", { class: `chip ${chipClass}` }, chipText),
        coach.suspended ? h("span", { class: "chip is-no" }, "Suspended") : null),
      coachFacts(coach, classes, changed, status),
      buttons.length ? h("div", { class: "actions" }, buttons) : null);
  }

  // the coach's facts, with "changed after approval" marked under Works at
  function coachFacts(coach, classes, changed, status) {
    const places = Array.isArray(coach.institutions) && coach.institutions.length ? placesOf(coach.institutions) : ["Not chosen yet"];
    const worksAt = h("dd", null, h("ul", { class: "plain-list" }, places.map((v) => h("li", null, v))),
      changed ? h("span", { class: "chip is-waiting" }, changed) : null);
    const rows = [
      ["Email", coach.email],
      ["Works at", worksAt],
      ["Organisation", coach.org], // written before institutions existed
      ["How to check them", coach.note],
      ["Classes", classes.join(", ") || "None yet"],
      ["Decided", status !== "pending" && coach.decidedAt && !deciding.has(coach.id) ? whenText(coach.decidedAt) : null],
    ];
    return h("dl", { class: "facts" }, rows.filter(([, v]) => v).map(([term, v]) => [h("dt", null, term), v instanceof Node ? v : h("dd", null, v)]));
  }

  function classCard(cls) {
    const active = cls.status === "active";
    const status = h("button", { class: "btn btn-secondary btn-small", type: "button" }, active ? "Suspend the class" : "Make it active again");
    busyButton(status, async () => {
      const was = cls.status;
      const next = was === "active" ? "suspended" : "active";
      try {
        await cloud.setClassStatus(cls.id, next);
      } catch (err) {
        toast.show(err.message);
        return;
      }
      cls.status = next;
      render();
      toast.show(next === "active" ? `${cls.name} is active` : `${cls.name} is suspended`, {
        undo: () => cloud.setClassStatus(cls.id, was).then(() => {
          cls.status = was;
          render();
        }, (err) => toast.show(err.message)),
      });
    });
    const takeDown = cls.latest ? h("button", { class: "btn btn-secondary btn-small", type: "button" }, "Take the page down") : null;
    if (takeDown) {
      busyButton(takeDown, async () => {
        const before = cls.latest;
        try {
          await cloud.adminSetLatest(cls.id, null);
        } catch (err) {
          toast.show(err.message);
          return;
        }
        cls.latest = null;
        render();
        toast.show(`${cls.name}: the page is down`, {
          undo: () => cloud.adminSetLatest(cls.id, before).then(() => {
            cls.latest = before;
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
        ["Coaches", cls.uids.map(coachName).join(", ") || "None"],
      ]),
      h("div", { class: "actions" }, status, takeDown));
  }

  // ---------- institutions ----------

  function institutionForm(inst) {
    const types = [...new Set(data.institutions.map((i) => i.type).filter(Boolean))].sort();
    const listId = newId("types");
    const name = field({ label: "Name", maxLength: 80, value: inst?.name ?? "", hint: "The place itself, for example AWWA School @ Napiri." });
    const org = field({ label: "Organisation", maxLength: 60, value: inst?.org ?? "", hint: "Places of one organisation are listed together." });
    const type = field({ label: "Type (if you like)", maxLength: 60, value: inst?.type ?? "", list: listId });
    const area = field({ label: "Area (if you like)", maxLength: 40, value: inst?.area ?? "" });
    const save = h("button", { class: "btn btn-primary btn-small", type: "submit" }, inst ? "Save" : "Add");
    const cancel = h("button", { class: "btn btn-quiet btn-small", type: "button", onclick: () => { editing = null; render(); } }, "Cancel");
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
        id = await cloud.saveInstitution(inst?.id ?? null, next);
      } catch (err) {
        problem.append(notice(err.message, { tone: "problem" }));
        return;
      }
      if (inst) Object.assign(inst, next);
      else data.institutions.push({ id, ...next });
      editing = null;
      render();
      toast.show(inst ? `Saved: ${next.name}` : `Added: ${next.name}`);
    });
    queueMicrotask(() => name.input.focus());
    return form;
  }

  function institutionRow(inst) {
    if (editing === inst.id) return h("li", { class: "inst-row is-editing" }, institutionForm(inst));
    const users = data.coaches.filter((c) => c.institutions?.includes(inst.id)).length;
    const retire = h("button", { class: "btn btn-quiet btn-small", type: "button" }, inst.active ? "Retire" : "Bring back");
    busyButton(retire, async () => {
      const was = inst.active !== false;
      try {
        await cloud.setInstitutionActive(inst.id, !was);
      } catch (err) {
        toast.show(err.message);
        return;
      }
      inst.active = !was;
      render();
      toast.show(was ? `Retired: ${inst.name}` : `Back in the list: ${inst.name}`, {
        undo: () => cloud.setInstitutionActive(inst.id, was).then(() => {
          inst.active = was;
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
    if (!long) search = "";
    const box = !long ? null : h("input", {
      type: "search", class: "pick-search", value: search, placeholder: "Search: a name, organisation or area",
      "aria-label": "Search the institutions", dataset: { keep: "inst-search" },
      oninput: (e) => { search = e.target.value; render(); },
    });
    // retired ones too (groupByOrg keeps the "chosen" ones: here, all of them)
    const groups = groupByOrg(data.institutions, search, data.institutions.map((i) => i.id));
    const add = editing === "new"
      ? institutionForm(null)
      : h("button", { class: "btn btn-secondary btn-small", type: "button", onclick: () => { editing = "new"; render(); } }, "Add an institution");
    return h("section", { class: "section", "aria-labelledby": "adm-inst-h" },
      h("h2", { id: "adm-inst-h" }, `Institutions (${active} in the list)`),
      h("p", { class: "field-hint inst-hint" }, "Coaches choose where they work from this list. Retire a place that has closed: coaches no longer see it, but nothing that points at it breaks."),
      h("div", { class: "inst-tools" }, box, add),
      groups.length ? h("div", { class: "inst-groups" }, groups.map((g) => h("section", { class: "inst-group", "aria-label": g.org },
        h("h3", null, g.org),
        h("ul", { class: "inst-list" }, g.items.map(institutionRow)))))
        : h("p", { class: "empty" }, search.trim() ? `Nothing matches “${search.trim()}”.` : "No institutions yet. Add one, or seed the list (tools/seed-institutions.mjs)."));
  }

  function limitsForm() {
    const flash = field({ label: "AI requests per coach per month", type: "number", inputmode: "numeric", min: 0, max: 5000, step: 1, value: String(data.limits.flashPerMonth) });
    const videos = field({ label: "Videos per coach per month", type: "number", inputmode: "numeric", min: 0, max: 100, step: 1, value: String(data.limits.videosPerMonth) });
    const save = h("button", { class: "btn btn-primary", type: "submit" }, "Save the limits");
    const form = h("form", { class: "stack form-narrow", novalidate: true },
      h("p", { class: "field-hint" }, "The same for every coach, counted in Singapore months. AI requests are writing pages and planning videos (Gemini Flash); each video costs about US$0.80."),
      flash.field, videos.field, h("div", { class: "actions" }, save));
    // numbers only, within the limits the rules allow: forgiven as typed, never refused
    const clamp = (input, max) => Math.min(max, Math.max(0, Math.round(Number(input.value) || 0)));
    form.addEventListener("submit", (e) => e.preventDefault());
    busyButton(save, async () => {
      const next = { flashPerMonth: clamp(flash.input, 5000), videosPerMonth: clamp(videos.input, 100) };
      const before = { ...data.limits };
      try {
        await cloud.saveLimits(user.uid, next);
      } catch (err) {
        toast.show(err.message);
        return;
      }
      data.limits = next;
      flash.input.value = String(next.flashPerMonth);
      videos.input.value = String(next.videosPerMonth);
      toast.show(`Limits saved: ${next.flashPerMonth} AI requests and ${next.videosPerMonth} videos a month`, {
        undo: () => cloud.saveLimits(user.uid, before).then(() => {
          data.limits = before;
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
