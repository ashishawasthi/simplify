// A modal dialog for one small choice — which picture, which video, which
// YouTube link — built fresh each time and gone when it closes. Esc, the ✕
// and a tap outside all close it; focus goes back where it was.
//
//   const dialog = openDialog({ title: "Put a picture in the page", body })
//   dialog.close()          closes it (from inside the body)
//   dialog.closed           a promise, settled when it has gone

import { h } from "./dom.js";

export function openDialog({ title, body, wide = false }) {
  const back = document.activeElement;
  const heading = h("h2", { class: "dialog-title", tabindex: "-1" }, title);
  const close = h("button", { class: "icon-close", type: "button", "aria-label": "Close" }, "✕");
  const box = h("dialog", { class: `dialog${wide ? " is-wide" : ""}`, "aria-label": title },
    h("div", { class: "dialog-head" }, heading, close), h("div", { class: "dialog-body" }, body));
  let settle;
  const closed = new Promise((resolve) => { settle = resolve; });
  close.addEventListener("click", () => box.close());
  // a tap on the backdrop (the dialog element itself, outside its content)
  box.addEventListener("click", (e) => {
    if (e.target === box) box.close();
  });
  box.addEventListener("close", () => {
    box.remove();
    if (back?.isConnected) back.focus({ preventScroll: true });
    settle();
  });
  document.body.append(box);
  box.showModal();
  heading.focus({ preventScroll: true });
  return { close: () => box.open && box.close(), closed, element: box };
}
