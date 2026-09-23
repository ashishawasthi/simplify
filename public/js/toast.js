// The undo toast: one line of what just happened and a "↩ Put it back"
// button. Every tool undoes this way instead of asking "are you sure?" first —
// the change happens at once, and taking it back is one tap.
//
// It stays for SHOW_FOR, and as long as a finger, the mouse or the keyboard
// is on it, so the undo can't vanish while someone is reaching for it.
// Screen readers hear it from a status line that is always on the page (a
// live region that only appears when needed is often not read out), with
// the button's name, so they know there is an undo. After an undo, focus
// goes back to the control that made the change, or else to the screen's
// title, never to nowhere.

const SHOW_FOR = 8000; // ms
const UNDO_NAME = "Put it back";

let els = null;
let timer = null;
let undo = null;
let from = null; // the control that made the change, to come back to
let shown = 0; // bumped by every show and hide, so a late status line never reads an old toast

export function initToast(elements) {
  els = elements; // { toast, text, undo, status, home }
  els.undo.addEventListener("click", () => {
    const [undoFn, control] = [undo, from];
    hideToast();
    undoFn?.();
    refocus(control);
  });
  // held open while in use; the full time again once it is let go
  els.toast.addEventListener("pointerenter", () => clearTimeout(timer));
  els.toast.addEventListener("focusin", () => clearTimeout(timer));
  els.toast.addEventListener("pointerleave", restart);
  els.toast.addEventListener("focusout", (e) => {
    if (!els.toast.contains(e.relatedTarget)) restart();
  });
}

// undoFn runs if "Put it back" is tapped while the toast is showing
export function showToast(text, undoFn) {
  els.text.textContent = text;
  undo = undoFn;
  const focused = document.activeElement;
  from = focused && focused !== document.body && !els.toast.contains(focused) ? focused : null;
  els.toast.hidden = false;
  // emptied first, so the same words twice in a row are still read out
  els.status.textContent = "";
  const which = ++shown;
  setTimeout(() => {
    if (which === shown && !els.toast.hidden) els.status.textContent = `${text}. ${UNDO_NAME}.`;
  }, 100);
  restart();
}

export function hideToast() {
  shown++;
  clearTimeout(timer);
  els.toast.hidden = true;
  els.status.textContent = "";
  undo = null;
  from = null;
}

function restart() {
  clearTimeout(timer);
  if (!els.toast.hidden) timer = setTimeout(hideToast, SHOW_FOR);
}

// Back to where the change was made, if it is still there to use — but never
// into a text box, whose keyboard would jump up over the screen.
function refocus(control) {
  const usable = control?.isConnected && control.getClientRects().length > 0 &&
    !control.matches("input, textarea, select, [contenteditable]");
  (usable ? control : els.home).focus({ preventScroll: true });
}
