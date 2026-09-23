// Sign in: one button, Google's own window. Inside an app's built-in browser
// (WhatsApp, Telegram, Instagram …) Google refuses to sign anyone in, so the
// page says so first — and again if the window can't open.

import { h, notice, busyButton } from "./dom.js";
import { looksLikeInAppBrowser } from "./format.js";

const BROWSER_PROBLEMS = new Set([
  "popup-blocked", "operation-not-supported-in-this-environment", "web-storage-unsupported",
]);

function openInBrowser() {
  const copy = h("button", { class: "btn btn-secondary", type: "button" }, "Copy the link");
  const done = h("span", { class: "copy-done", role: "status" });
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText("https://simplify.whiz.coach/coach/");
      done.textContent = "Copied. Paste it into Chrome or Safari.";
    } catch {
      done.textContent = "Copy it from here: simplify.whiz.coach/coach/";
    }
  });
  return notice("Google sign-in doesn't work inside WhatsApp, Telegram or other apps. " +
    "Open this page in Chrome or Safari: simplify.whiz.coach/coach/",
  { tone: "warning", action: h("div", { class: "notice-actions" }, copy, done) });
}

export function signInScreen(root, { cloud }) {
  const problem = h("div", { class: "signin-problem" });
  const button = busyButton(h("button", { class: "btn btn-primary btn-big", type: "button" }, "Sign in with Google"),
    async () => {
      problem.replaceChildren();
      try {
        await cloud.signIn();
      } catch (err) {
        if (err.code === "cancelled") return; // the coach closed Google's window: nothing to say
        problem.append(notice(err.message, { tone: "problem" }));
        if (BROWSER_PROBLEMS.has(err.code)) problem.append(openInBrowser());
      }
    });

  root.append(h("section", { class: "signin" },
    h("h1", null, "Simplify for coaches"),
    h("p", { class: "lead" }, "Write your class's page. Your learners see it in My class in the Simplify app."),
    looksLikeInAppBrowser(navigator.userAgent, navigator.maxTouchPoints) ? openInBrowser() : null,
    button,
    problem,
    h("p", { class: "small" },
      "Any Google account works: Gmail, or a Google account made with a school email. ",
      "You stay signed in until you close this tab or sign out."),
  ));
}
