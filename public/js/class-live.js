// Hearing about a new class page at once, without asking again and again:
// while the app — or a guide page — is on screen on a device that follows a
// class, it keeps one stream open to the class's push signal in Firebase's
// Realtime Database (docs/learner/my-class.md#hearing-about-a-new-page):
//
//   GET <database>/signals/<code>.json   Accept: text/event-stream (EventSource)
//
// The signal is { at, force } — when the page was published, and whether
// the coach asked for it to be shown at once — or null (nothing published).
// A Cloud Function writes it (functions/signal.js); the rules let anyone read
// one class's node by its exact code and nobody list or write
// (database.rules.json). No SDK, no account, no ID: like the page's own
// request, only the class code leaves the device, and nothing is ever
// written from it — so nobody, coach included, can see who has the app open.
//
// On each signal: a page that is not the one saved is fetched at once
// (refreshClass, class-data.js), and My class, if open, shows it. A forced
// page also opens My class — onForce() — but only on a screen that was
// already open when it was pushed:
//   - the first signal after the page loads is never forced (the app was
//     opened after the push: the page just waits in My class);
//   - a signal arriving on an open stream is forced;
//   - the first signal of a stream opened again (the app back on screen,
//     the internet back) is forced only within FORCE_WINDOW of the push.
// While the app is in the background the stream is closed: less battery,
// and no "this device is open" for anyone to see.

import { getDevice, onDeviceChange } from "./device.js";
import { endpoints, matchesSignal, refreshClass, savedClass, signalUrl } from "./class-data.js";

export const FORCE_WINDOW = 5 * 60 * 1000;
const RETRY_FIRST = 5 * 1000; // a stream that failed: ask again after this, doubling
const RETRY_MOST = 5 * 60 * 1000;

// A signal as sent, or garbage, as { at, force } or null.
export function cleanSignal(raw) {
  if (!raw || typeof raw !== "object" || !Number.isFinite(raw.at)) return null;
  return { at: raw.at, force: raw.force === true };
}

// The node after one stream event ("put" or "patch", with its JSON data
// { path, data }), from what it was before.
export function applyEvent(value, type, event) {
  const path = String(event?.path ?? "/").split("/").filter(Boolean);
  const data = event?.data ?? null;
  if (!path.length) {
    return type === "patch" ? { ...(value && typeof value === "object" ? value : {}), ...data } : data;
  }
  const next = { ...(value && typeof value === "object" ? value : {}) };
  if (path.length === 1) next[path[0]] = data; // at or force; nothing deeper is ever sent
  return next;
}

// Should this signal open My class now?
//   heard   the signal heard before on this page (undefined: none yet)
//   live    it arrived on a stream that was already open
//   forced  the at of the last page forced here
export function shouldForce({ signal, heard, live, now, forced }) {
  if (!signal?.force || heard === undefined) return false;
  if (heard?.at === signal.at || forced === signal.at) return false;
  return live || Math.abs(now - signal.at) < FORCE_WINDOW;
}

// Start listening. onForce() opens My class. Returns a function that stops.
export function listenToClass({ onForce }) {
  let stream = null; // { es, code, first, value }
  let heard; // undefined until the first signal for this class on this page
  let forced = null;
  let code = getDevice().classCode;
  let retryIn = RETRY_FIRST;
  let retryTimer = 0;
  let stopped = false;
  let refused = false; // the rules said no (a code no class has): not again until the class changes

  function close() {
    stream?.es.close();
    stream = null;
    clearTimeout(retryTimer);
    retryTimer = 0;
  }

  function open() {
    close();
    const ep = endpoints();
    if (stopped || refused || !code || !ep || document.hidden || typeof EventSource !== "function") return;
    const s = { es: new EventSource(signalUrl(code, ep)), code, first: true, value: undefined };
    stream = s;
    const onEvent = (type) => (e) => {
      if (stream !== s) return;
      let event;
      try {
        event = JSON.parse(e.data);
      } catch {
        return;
      }
      s.value = applyEvent(s.value, type, event);
      const live = !s.first;
      s.first = false;
      retryIn = RETRY_FIRST;
      heardSignal(cleanSignal(s.value), live);
    };
    s.es.addEventListener("put", onEvent("put"));
    s.es.addEventListener("patch", onEvent("patch"));
    s.es.addEventListener("cancel", () => {
      if (stream !== s) return;
      refused = true;
      close();
    });
    s.es.addEventListener("error", () => {
      // EventSource tries again by itself, unless the answer was not a stream
      if (stream !== s || s.es.readyState !== EventSource.CLOSED) return;
      close();
      retryTimer = setTimeout(open, retryIn);
      retryIn = Math.min(retryIn * 2, RETRY_MOST);
    });
  }

  function heardSignal(signal, live) {
    const force = shouldForce({ signal, heard, live, now: Date.now(), forced });
    heard = signal;
    if (force) forced = signal.at;
    const forClass = code;
    const show = (cls) => {
      if (force && !stopped && getDevice().classCode === forClass && matchesSignal(cls, signal)) onForce();
    };
    if (matchesSignal(savedClass(), signal)) {
      show(savedClass());
      return;
    }
    // a read already on its way (My class just opened) may have left before
    // this publish: then once more
    const refresh = () => refreshClass({ pushed: true }).then(({ cls }) => cls);
    refresh()
      .then((cls) => (matchesSignal(cls, signal) ? cls : refresh()))
      .then(show, () => {});
  }

  const onVisibility = () => (document.hidden ? close() : open());
  const onOnline = () => {
    if (!stream) {
      retryIn = RETRY_FIRST;
      open();
    }
  };
  document.addEventListener("visibilitychange", onVisibility);
  addEventListener("online", onOnline);
  const stopDevice = onDeviceChange((device) => {
    if (device.classCode === code) return;
    code = device.classCode;
    heard = undefined; // another class: its first signal is only where it stands
    forced = null;
    refused = false;
    retryIn = RETRY_FIRST;
    open();
  });
  open();

  return () => {
    stopped = true;
    close();
    document.removeEventListener("visibilitychange", onVisibility);
    removeEventListener("online", onOnline);
    stopDevice?.();
  };
}
