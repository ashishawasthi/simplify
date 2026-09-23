// localStorage persistence so the app remembers everything offline —
// count your notes at home, reopen at the shop, the numbers are still there.
// Each tool keeps its own key, so switching tools never loses anything.

let saveTimer = null;
const pending = new Map(); // key → latest state not yet written

export function load(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function save(key, state) {
  pending.set(key, state);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 200);
}

// Write now instead of after the debounce: the page is about to reload or
// may be killed in the background, and the last keystroke must survive.
export function flush() {
  clearTimeout(saveTimer);
  for (const [key, state] of pending) {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      // storage full or blocked — the app still works, just without memory
    }
  }
  pending.clear();
}
