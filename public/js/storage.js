// localStorage persistence so the app remembers everything offline —
// count your notes at home, reopen at the shop, the numbers are still there.

const KEY = "afford-it-v1";
let saveTimer = null;

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function save(state) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      // storage full or blocked — the app still works, just without memory
    }
  }, 200);
}
