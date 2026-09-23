// My class on the set-up page — a placeholder until the coach platform is
// built; the real class section replaces this whole file.
//
//   mountClassSetup(container, shell, params) → { show?(params), hide?() } or nothing
//     container  div#class-setup-slot on the set-up page. Replace everything
//                in it: it holds only a placeholder heading and paragraph.
//     shell      the set-up page's shell (showToast, device, go … — tools.js)
//     params     URLSearchParams of the address it opened with. A class's QR
//                code opens "#join=<CODE>", so params.get("join") is the code.
// Called once, the first time the set-up page's settings open: after the
// hold, or at once for #join= — whoever scanned the class's QR code (a
// student, a parent) answers "Is this your class?", so there is no hold, and
// the page shows only this section. show(params) and hide(), if returned,
// run on every later opening and leaving of the set-up page.
// Save the class with setDevice({ classCode, className }) from device.js
// (className only for showing: "This device follows 3 Kindness"); the menu's
// My class tile appears as soon as there is a code. The same section is how
// an installed iPad app gets its class: a QR code opens Safari, whose storage
// is not the app's, so the code is typed here instead — there the app opens
// the guide, and so this page, in its own window (app.js).

export function mountClassSetup(container, shell, params) {
  // nothing yet: the set-up page's placeholder stays in the container
}
