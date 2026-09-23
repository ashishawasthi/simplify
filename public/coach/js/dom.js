// Building the coach app's screens: elements made with createElement and
// textContent only — never innerHTML, so nothing a coach (or the AI helper)
// wrote can ever become markup.
//
//   h("button", { class: "btn", type: "button", onclick: fn }, "Save")
//   h("p", null, "Signed in as ", h("strong", null, email))
// Attributes: class, text (textContent), hidden, disabled, value, checked,
// on<event> (a listener), dataset ({…}), aria-*/data-*/others as attributes.
// Children: strings (text nodes), nodes, arrays, null/false (skipped).

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value == null || value === false) continue;
    if (key === "class") el.className = value;
    else if (key === "text") el.textContent = value;
    else if (key === "dataset") Object.assign(el.dataset, value);
    else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2), value);
    else if (["hidden", "disabled", "checked", "required", "multiple", "readOnly"].includes(key)) el[key] = Boolean(value);
    else if (["value", "maxLength", "rows", "tabIndex", "min", "max", "step"].includes(key)) el[key] = value;
    else el.setAttribute(key, value === true && !key.startsWith("aria-") ? "" : String(value));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children) {
    if (child == null || child === false) continue;
    if (Array.isArray(child)) append(el, child);
    else el.append(child instanceof Node ? child : String(child));
  }
}

let ids = 0;
export const uid = (prefix = "c") => `${prefix}-${++ids}`;

// A labelled text box or area: the label above, a hint under the label,
// linked for screen readers. Returns { field (the wrapper), input }.
export function field({ label, hint, multiline = false, ...attrs }) {
  const id = uid("f");
  const input = h(multiline ? "textarea" : "input", { id, ...(multiline ? {} : { type: "text" }), ...attrs });
  const hintEl = hint ? h("span", { class: "field-hint", id: `${id}-hint` }, hint) : null;
  if (hintEl) input.setAttribute("aria-describedby", hintEl.id);
  return { field: h("div", { class: "field" }, h("label", { for: id }, label), hintEl, input), input };
}

// A small status line that a screen reader reads out when it changes
export function statusLine(className = "status-line") {
  return h("p", { class: className, role: "status", "aria-live": "polite" });
}

// A calm box for something that went wrong: plain words, never red panic.
export function notice(text, { tone = "info", action } = {}) {
  return h("div", { class: `notice is-${tone}`, role: tone === "problem" ? "alert" : null },
    h("p", null, text), action ?? null);
}

// The same click can't run twice while its work is still going: the button
// is disabled until fn's promise settles.
export function busyButton(button, fn) {
  button.addEventListener("click", async (e) => {
    if (button.disabled) return;
    button.disabled = true;
    try {
      await fn(e);
    } finally {
      if (button.isConnected) button.disabled = false;
    }
  });
  return button;
}

// el's children replaced by these (nulls and false skipped, as in h())
export function fill(el, ...children) {
  el.replaceChildren();
  append(el, children);
  return el;
}
