// Until the admin approves a coach: a calm "Waiting for approval" that says
// what happens next and shows what the admin sees — or, if the admin said
// no, a plain note to contact them. The coach can still change About you.
// The screen changes by itself when the admin decides (main.js watches the
// profile).

import { h, notice } from "./dom.js";
import { namesOf } from "./institutions.js";

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
  cloud.listInstitutions().then((list) => {
    places.replaceChildren(h("ul", { class: "plain-list" }, namesOf(profile.institutions, list).map((n) => h("li", null, n))));
  }, () => {
    places.textContent = `${profile.institutions.length} chosen`;
  });
}

export function waitingScreen(root, ctx) {
  const { user, profile } = ctx;
  const screen = h("section", { class: "screen waiting" },
    h("h1", null, "Waiting for approval"),
    h("p", { class: "lead" }, `Thank you, ${profile.name}. The admin checks who you are and where you work before you can use Simplify as a coach.`),
    h("section", { class: "section", "aria-labelledby": "next-h" },
      h("h2", { id: "next-h" }, "What happens next"),
      h("ol", { class: "next-steps" },
        h("li", null, "The admin reads About you, and may contact you to check."),
        h("li", null, "When the admin approves you, this page changes by itself. You can close it and come back later: sign in again with ",
          h("strong", null, user.email), "."),
        h("li", null, "Then you can make your classes, or join a colleague's class."))));
  root.append(screen);
  whatTheAdminSees(screen, ctx);
}

export function declinedScreen(root, ctx) {
  const screen = h("section", { class: "screen waiting" },
    h("h1", null, "Not approved"),
    notice("The admin has not approved you as a coach. If you think this is a mistake, contact the admin.", { tone: "warning" }),
    h("p", null, "If something in About you was missing or wrong, change it and tell the admin."));
  root.append(screen);
  whatTheAdminSees(screen, ctx);
}
