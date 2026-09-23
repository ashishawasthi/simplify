// localStorage persistence so the app remembers everything offline —
// count your notes at home, reopen at the shop, the numbers are still there.

const KEY = "afford-it-v1";
let saveTimer = null;
let pending = null; // latest state not yet written

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function save(state) {
  pending = state;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 200);
}

// Write now instead of after the debounce: the page is about to reload or
// may be killed in the background, and the last keystroke must survive.
export function flush() {
  clearTimeout(saveTimer);
  if (pending == null) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(pending));
  } catch {
    // storage full or blocked — the app still works, just without memory
  }
  pending = null;
}
