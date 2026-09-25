// Until the admin approves a coach: a calm "Waiting for approval" that says
// what happens next and shows what the admin sees — or, if the admin said
// no, what the admin told them (if anything) and "Ask the admin again" once
// they have changed About you. The screen changes by itself when the admin
// decides (main.js watches the profile).

import { h, notice, busyButton } from "./dom.js";
import { workPlaces } from "./institutions.js";

function whatTheAdminSees(root, ctx) {
  const { cloud, profile } = ctx;
  const places = h("dd", null, "…");
  const box = h("section", { class: "section", "aria-labelledby": "sees-h" },
    h("h2", { id: "sees-h" }, "What the admin sees"),
    h("dl", { class: "facts facts-wide" },
      h("dt", null, "Name"), h("dd", null, profile.name),
      h("dt", null, "Where you work"), places,
      h("dt", null, "How to check you"), h("dd", null, profile.note || "Nothing yet")),
    h("div", { class: "actions" }, h("a", { class: "btn btn-secondary", href: "#about" }, "Change About you")));
  root.append(box);
  const show = (list) => places.replaceChildren(h("ul", { class: "plain-list" }, workPlaces(profile, list).map((n) => h("li", null, n))));
  cloud.listInstitutions().then(show, () => show([]));
}

export function waitingScreen(root, ctx) {
  const { user, profile } = ctx;
  const screen = h("section", { class: "screen waiting" },
    h("h1", null, "Waiting for approval"),
    h("p", { class: "lead" }, `Thank you, ${profile.name}. The admin checks who you are and where you work before you can use Simplify as a coach.`),
    h("section", { class: "section", "aria-labelledby": "next-h" },
      h("h2", { id: "next-h" }, "What happens next"),
      h("ol", { class: "next-steps" },
        h("li", null, "The admin checks you — for example, they may have seen you teach at your school, or they call it — and may contact you."),
        h("li", null, "When the admin approves you, this page changes by itself. You can close it and come back later: sign in again with ",
          h("strong", null, user.email), "."),
        h("li", null, "Then you can make your classes, or join a colleague's class."))));
  root.append(screen);
  whatTheAdminSees(screen, ctx);
}

export function declinedScreen(root, ctx) {
  const { cloud, profile, toast, user } = ctx;
  const message = String(profile.decisionMessage ?? "").trim();
  const problem = h("div");
  const again = h("button", { class: "btn btn-primary", type: "button" }, "Ask the admin again");
  busyButton(again, async () => {
    problem.replaceChildren();
    try {
      await cloud.askAgain(user.uid);
    } catch (err) {
      problem.append(notice(err.message, { tone: "problem" }));
      return;
    }
    toast.show("Sent. The admin will look again.");
    // the profile is watched: the screen becomes Waiting for approval by itself
  });
  const screen = h("section", { class: "screen waiting" },
    h("h1", null, "Not approved"),
    message
      ? notice(`The admin says: “${message}”`, { tone: "warning" })
      : notice("The admin has not approved you as a coach. If you think this is a mistake, contact the admin.", { tone: "warning" }),
    h("p", null, "If something in About you was missing or wrong, change it, then ask the admin again."),
    problem,
    h("div", { class: "actions" }, again));
  root.append(screen);
  whatTheAdminSees(screen, ctx);
}
