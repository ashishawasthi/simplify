// Gets a new deploy onto the screen without anyone hunting for a refresh
// button — an installed app has none. sw.js downloads a new version in the
// background and takes over the page, but the page on screen is still the
// old one until it reloads. This reloads at a moment that cannot disrupt:
// straight away if the screen hasn't been touched since the app opened or
// came back to the front, otherwise the next time it goes to the background.
// Never while a window is open (the picker, speak, Show me), so a count in
// progress can't vanish, and never while a tool says it is busy (a Wait timer
// running), so the shrinking disc doesn't blink out and back in front of
// someone who is watching it.

import { flush } from "./storage.js";

const CHECK_EVERY = 10 * 60 * 1000; // ms between checks when the app is resumed

// ids of the tools that are busy right now (shell.setBusy in app.js)
const busy = new Set();

// A busy tool only holds the reload off. Becoming idle doesn't start one:
// that is exactly when "Done" is on screen, so the reload waits for the
// app's next trip to the background instead.
export function setBusy(id, isBusy) {
  if (isBusy) busy.add(id);
  else busy.delete(id);
}

export function initUpdates() {
  if (!("serviceWorker" in navigator)) return;
  const sw = navigator.serviceWorker;

  // the very first install takes control too, but that is the version
  // already on screen — only a change of controller after that is an update
  let hasController = !!sw.controller;
  let updated = false;
  let touched = false; // since the page loaded or last came to the front
  let lastCheck = Date.now(); // the page load itself just checked

  for (const type of ["pointerdown", "keydown"]) {
    addEventListener(type, () => { touched = true; }, { capture: true, passive: true });
  }

  const reloadIfSafe = () => {
    if (!updated || document.querySelector("dialog[open]") || busy.size > 0) return;
    if (touched && !document.hidden) return; // mid-task: wait for the background
    flush();
    location.reload();
  };

  sw.addEventListener("controllerchange", () => {
    if (!hasController) {
      hasController = true;
      return;
    }
    updated = true;
    reloadIfSafe();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      reloadIfSafe();
      return;
    }
    touched = false;
    // coming back from the app switcher isn't a page load, so the browser
    // won't look for a new version by itself — ask, but not on every switch
    if (Date.now() - lastCheck > CHECK_EVERY) {
      lastCheck = Date.now();
      sw.getRegistration().then((reg) => reg?.update()).catch(() => {
        // offline: the next check will try again
      });
    }
  });

  sw.register("/sw.js").catch(() => {
    // offline support is a bonus, never a blocker
  });
}
