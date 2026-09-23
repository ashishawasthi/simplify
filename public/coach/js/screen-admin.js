// The admin's screen (only when admins/{uid} exists — set by the owner, never
// from here): the requests waiting for a decision, every coach (suspend or
// let back in), every class (suspend, or take its page down), and the
// monthly limits for each coach.
//
// Approving a new class gives it a new random code (cloud.approveRequest).
// Decline, suspend and take-down all have an Undo; approve does not (a new
// class is fixed by suspending it).

import { h, field, notice, busyButton } from "./dom.js";
import { formatCode } from "./class-code.js";
import { whenText } from "./format.js";

export function adminScreen(root, ctx) {
  const { cloud, toast, user } = ctx;
  let alive = true;
  const body = h("div", { class: "admin-body" }, h("p", { class: "loading", role: "status" }, "Loading…"));
  root.append(h("section", { class: "screen admin-screen" },
    h("h1", null, "Admin"),
    h("p", { class: "lead" }, "Approve each coach for each class only after checking they really are a coach of that class."),
    body));

  let data = null; // { requests, coaches, classes, limits }
  const hiddenRequests = new Set(); // declined, waiting for the Undo to run out

  async function load() {
    try {
      const [requests, coaches, classes, limits] = await Promise.all([
        cloud.pendingRequests(), cloud.allCoaches(), cloud.allClasses(), cloud.getLimits(),
      ]);
      if (!alive) return;
      data = { requests, coaches, classes, limits };
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

  function render() {
    const requests = data.requests.filter((r) => !hiddenRequests.has(r.id));
    body.replaceChildren(
      h("section", { class: "section", "aria-labelledby": "adm-req-h" },
        h("h2", { id: "adm-req-h" }, `Requests waiting (${requests.length})`),
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
      limitsForm());
  }

  function facts(pairs) {
    return h("dl", { class: "facts" }, pairs.filter(([, value]) => value).map(([term, value]) =>
      [h("dt", null, term), h("dd", null, value)]));
  }

  function requestCard(req) {
    const coach = coachOf(req.uid);
    const joining = req.kind === "join-class";
    const cls = joining ? classOf(req.classCode) : null;
    const what = joining
      ? `Join ${formatCode(req.classCode)}${cls ? ` (${cls.name})` : " — no class has this code"}`
      : `New class: ${req.className}`;
    const approve = h("button", { class: "btn btn-primary btn-small", type: "button", disabled: joining && !cls }, "Approve");
    const decline = h("button", { class: "btn btn-secondary btn-small", type: "button" }, "Decline");
    const problem = h("div");
    busyButton(approve, async () => {
      problem.replaceChildren();
      try {
        const code = await cloud.approveRequest(req, user.uid);
        toast.show(joining
          ? `Approved: ${coachName(req.uid)} can now work on ${cls?.name ?? formatCode(code)}.`
          : `Approved: “${req.className}”, code ${formatCode(code)}.`);
        load();
      } catch (err) {
        problem.append(notice(err.message, { tone: "problem" }));
      }
    });
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
    return h("li", { class: "admin-card" },
      h("h3", null, what),
      facts([
        ["Coach", coach ? `${coach.name} (${coach.email})` : "No profile yet"],
        ["Organisation", req.org || coach?.org],
        ["How to check them", coach?.note],
        ["Their note", req.note],
        ["Asked", whenText(req.createdAt)],
      ]),
      problem,
      h("div", { class: "actions" }, approve, decline));
  }

  function coachCard(coach) {
    const classes = data.classes.filter((c) => c.uids.includes(coach.id)).map((c) => c.name);
    const button = h("button", { class: "btn btn-secondary btn-small", type: "button" },
      coach.suspended ? "Let back in" : "Suspend");
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
    return h("li", { class: "admin-card" },
      h("h3", null, coach.name || "No name", coach.suspended ? h("span", { class: "chip is-no" }, "Suspended") : null),
      facts([
        ["Email", coach.email],
        ["Organisation", coach.org],
        ["How to check them", coach.note],
        ["Classes", classes.join(", ") || "None yet"],
      ]),
      h("div", { class: "actions" }, button));
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
        ["Organisation", cls.org],
        ["Learners see", cls.latest ? `“${cls.latest.title || "Untitled page"}”, published ${whenText(cls.latest.publishedAt)}` : "Nothing"],
        ["Coaches", cls.uids.map(coachName).join(", ") || "None"],
      ]),
      h("div", { class: "actions" }, status, takeDown));
  }

  function limitsForm() {
    const flash = field({ label: "Helper requests per coach per month", type: "number", inputmode: "numeric", min: 0, max: 5000, step: 1, value: String(data.limits.flashPerMonth) });
    const videos = field({ label: "Videos per coach per month", type: "number", inputmode: "numeric", min: 0, max: 100, step: 1, value: String(data.limits.videosPerMonth) });
    const save = h("button", { class: "btn btn-primary", type: "submit" }, "Save the limits");
    const form = h("form", { class: "stack form-narrow", novalidate: true },
      h("p", { class: "field-hint" }, "The same for every coach, counted in Singapore months. Helper requests are the page helper and video planning (Gemini Flash); each video costs about US$0.80."),
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
      toast.show(`Limits saved: ${next.flashPerMonth} helper requests and ${next.videosPerMonth} videos a month`, {
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
