// The class's QR poster, to print (A4, css/coach.css @media print): the
// class name, the QR code, the code in big letters, and three lines for the
// adult setting up a learner's phone or iPad. The QR code opens the learner
// app at "Is this your class?" (#join=<CODE>); the code is printed too, for
// an iPad whose camera opens Safari instead of the home-screen app, or a
// device with no camera. Nothing on it leads to the coach app.

import { h, notice } from "./dom.js";
import { formatCode, joinUrl } from "./class-code.js";
import { qrSvg } from "./qr.js";

export function posterScreen(root, { cloud }, code) {
  const name = h("p", { class: "poster-class" }, "");
  const printButton = h("button", { class: "btn btn-primary", type: "button", onclick: () => print() }, "Print");
  const state = h("div");
  const sheet = h("article", { class: "poster", "aria-label": "The class's QR poster" },
    h("p", { class: "poster-app" }, "Simplify · My class"),
    name,
    qrSvg(joinUrl(code), `QR code for the class ${formatCode(code)}`),
    h("p", { class: "poster-code-label" }, "Class code"),
    h("p", { class: "poster-code" }, formatCode(code)),
    h("ol", { class: "poster-steps" },
      h("li", null, "Point the learner's phone or iPad camera at the QR code, and open the link."),
      h("li", null, "Simplify asks “Is this your class?”. Tap Yes."),
      h("li", null, "No camera, or using Simplify from the home screen? Open Simplify's set-up page and type the class code.")),
    h("p", { class: "poster-site" }, "simplify.whiz.coach"));

  root.append(h("section", { class: "screen poster-screen" },
    h("div", { class: "poster-tools no-print" },
      h("a", { class: "back-link", href: `#class/${code}` }, h("span", { "aria-hidden": "true" }, "← "), "Back to the class"),
      h("h1", null, "QR poster"),
      h("p", { class: "lead" }, "Print it for the class, or show it on a screen. " +
        "Anyone with the code can see what you publish, so share it only with your class's families."),
      h("div", { class: "actions" }, printButton),
      state),
    sheet));

  let alive = true;
  cloud.getClass(code).then((cls) => {
    if (!alive) return;
    if (!cls) {
      state.append(notice("There is no class with this code.", { tone: "problem" }));
      return;
    }
    name.textContent = cls.name;
    document.title = `QR poster: ${cls.name} · Simplify for coaches`;
  }, (err) => {
    if (alive) state.append(notice(err.message, { tone: "problem" }));
  });
  return () => { alive = false; };
}
