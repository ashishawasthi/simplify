// The coach app's undo toast: one line of what just happened and "Undo".
// Nothing asks "are you sure?" first — the change happens (or, for a delete,
// is shown as done) at once, and Undo takes it back.
//
//   toast.show("Page deleted", { undo, commit })
//     undo()    runs if Undo is tapped
//     commit()  runs once the toast has gone without an Undo: when it times
//               out, when another toast takes its place, or when the tab is
//               closed or signed out of (flush) — so a delete can wait for
//               its Undo and still happen for sure.
// It stays while the pointer or keyboard focus is on it. Screen readers hear
// it from a status line that is always on the page.

const SHOW_FOR = 8000; // ms

export function createToast({ box, text, undo: undoButton, status }) {
  let current = null; // { undo, commit }
  let timer = null;

  function settle(how) {
    const was = current;
    current = null;
    clearTimeout(timer);
    box.hidden = true;
    status.textContent = "";
    if (!was) return;
    try {
      if (how === "undo") was.undo?.();
      else was.commit?.();
    } catch (err) {
      console.error("toast", err);
    }
  }

  function restart() {
    clearTimeout(timer);
    if (current) timer = setTimeout(() => settle("commit"), SHOW_FOR);
  }

  undoButton.addEventListener("click", () => settle("undo"));
  box.addEventListener("pointerenter", () => clearTimeout(timer));
  box.addEventListener("focusin", () => clearTimeout(timer));
  box.addEventListener("pointerleave", restart);
  box.addEventListener("focusout", (e) => {
    if (!box.contains(e.relatedTarget)) restart();
  });
  addEventListener("pagehide", () => settle("commit"));

  return {
    show(message, { undo, commit } = {}) {
      settle("commit"); // the one before goes through
      current = { undo, commit };
      text.textContent = message;
      undoButton.hidden = !undo;
      box.hidden = false;
      status.textContent = "";
      setTimeout(() => {
        if (current && !box.hidden) status.textContent = undo ? `${message}. Undo.` : message;
      }, 100);
      restart();
    },
    // the toast goes, and what it was waiting for happens now
    flush: () => settle("commit"),
  };
}
