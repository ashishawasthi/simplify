// My class on the set-up page: which class this device follows. setup.js
// mounts it into div#class-setup-slot, after the other sections — or on its
// own, with no hold, when a class's QR code opens the app at
// "#join=<CODE>": whoever scanned it (a student, a parent) answers "Is this
// your class?".
//
//   mountClassSetup(container, shell, params) → { show(params), hide() }
//     container  div#class-setup-slot: everything in it is replaced
//     shell      the set-up page's shell (showToast, go, device … — tools.js)
//     params     the address's URLSearchParams; params.get("join") is the
//                code a QR code brought
//
// Three states, one at a time:
//   find     a box for the class code. Typing is forgiven (upper case, the
//            dashes put in, anything that can't be in a code dropped, a
//            pasted link understood), and as soon as it holds 9 characters
//            the class is looked up — no button to press.
//   ask      "Is this your class?", its name, Yes / No. Yes saves it
//            (setDevice({ classCode, className }), and its page for My
//            class), with "Put it back" on the toast.
//   current  "This device follows 3 Kindness", the code, Change and Leave
//            (Leave: the toast's "Put it back" undoes it).
// A code that finds no class, or no internet to ask, is one calm line:
// "Can't find this class. Check the code, or try again with the internet."
// The same box is how an installed iPad app gets its class: a QR code opens
// Safari, whose storage is not the app's, so there the code is typed here.

import { setDevice } from "./device.js";
import {
  codeFromText, formatClassCode, isClassCode, fetchClass, followClass, savedSnapshot, restoreSnapshot, CODE_LENGTH,
} from "./class-data.js";
import { menuIconSrc } from "./pictures.js";

const NOT_FOUND = "Can't find this class. Check the code, or try again with the internet.";
const TOO_LONG = `A class code has ${CODE_LENGTH} letters and numbers.`;
const LOOKING = "Looking for the class…";

function make(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
}

// icon: a character, or a picture (an element)
function button(className, icon, words) {
  const b = make("button", `cs-btn ${className}`);
  b.type = "button";
  if (icon) {
    const i = make("span", "cs-btn-icon");
    i.setAttribute("aria-hidden", "true");
    i.append(icon);
    b.append(i);
  }
  b.append(make("span", null, words));
  return b;
}

// the menu's picture for My class, the same on every device
function schoolPicture() {
  const img = make("img");
  img.alt = "";
  img.width = 128;
  img.height = 128;
  img.draggable = false;
  img.src = menuIconSrc("my-class");
  return img;
}

// The class's name, or its code when it has none, for a toast
const nameOf = (cls) => cls.name || formatClassCode(cls.code);

export function mountClassSetup(container, shell, params) {
  // ---- the heading, with the menu's picture, like every tool's section ----
  const heading = make("h2", "setup-tool-heading");
  heading.id = "setup-class-h";
  heading.tabIndex = -1; // focus waits here after Leave, keyboard down, toast in sight
  const icon = make("span", "tool-icon");
  icon.setAttribute("aria-hidden", "true");
  icon.append(schoolPicture());
  heading.append(icon, make("span", null, "My class"));
  container.setAttribute("aria-labelledby", heading.id);

  // ---- current: the class this device follows ----
  const current = make("div", "cs-current");
  const currentName = make("p", "cs-name");
  const currentCode = make("p", "cs-code");
  const homeScreenNote = make("p", "setup-note cs-note",
    "Simplify on the Home Screen keeps its own settings: type this code on its set-up page too.");
  const openClass = button("cs-open", schoolPicture(), "Open My class");
  const change = button("cs-change", "✏️", "Change");
  const leave = button("cs-leave", "✕", "Leave");
  const currentActions = make("div", "cs-actions");
  currentActions.append(change, leave);
  current.append(make("p", "setup-note", "This device follows"), currentName, currentCode, homeScreenNote,
    openClass, currentActions);

  // ---- find: the code box ----
  const find = make("div", "cs-find");
  const input = make("input", "cs-input");
  input.id = "class-code-input";
  input.type = "text";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.setAttribute("autocapitalize", "characters");
  input.setAttribute("autocorrect", "off");
  input.setAttribute("enterkeyhint", "search");
    const label = make("label", "cs-label", "Class code");
  label.htmlFor = input.id;
  const hint = make("p", "setup-note cs-hint", `On the class's poster, under the QR code: ${CODE_LENGTH} letters and numbers.`);
  hint.id = "class-code-hint";
  input.setAttribute("aria-describedby", hint.id);
  const status = make("p", "cs-status");
  status.setAttribute("role", "status");
  const retry = button("cs-retry", "↻", "Try again");
  const keep = button("cs-keep", null, "Keep this class");
  find.append(label, hint, input, status, retry, keep);

  // ---- ask: is this your class? ----
  const ask = make("div", "cs-ask");
  const askName = make("p", "cs-name");
  const askCode = make("p", "cs-code");
  const yes = button("cs-yes", "✔", "Yes");
  const no = button("cs-no", "✕", "No");
  const askActions = make("div", "cs-actions");
  askActions.append(yes, no);
  const question = make("p", "cs-question", "Is this your class?");
  question.id = "class-question";
  ask.setAttribute("role", "group");
  ask.setAttribute("aria-labelledby", question.id);
  ask.append(question, askName, askCode, askActions);

  container.replaceChildren(heading, current, find, ask);

  // ---- state ----
  let state = "find";
  let found = null; // the class "ask" is asking about
  let changing = false; // Change was tapped: the code box, with the class still followed
  let joined = false; // opened by a QR code, or just said yes: offer to open My class
  let looking = null; // { code, controller } while a lookup is on its way
  let failed = null; // the code whose lookup found nothing, to try again

  function render() {
    const device = shell.device;
    current.hidden = state !== "current";
    find.hidden = state !== "find";
    ask.hidden = state !== "ask";
    if (state === "current") {
      currentName.textContent = device.className || formatClassCode(device.classCode);
      currentCode.textContent = `Code: ${formatClassCode(device.classCode)}`;
      // Safari on an iPad or iPhone, not the Home Screen app, whose storage is its own
      homeScreenNote.hidden = navigator.standalone !== false;
      openClass.hidden = !joined;
    } else if (state === "ask") {
      askName.textContent = found.name || "A class with no name";
      askCode.textContent = `Code: ${formatClassCode(found.code)}`;
    } else {
      keep.hidden = !(changing && device.classCode);
      keep.lastChild.textContent = `Keep ${device.className || formatClassCode(device.classCode ?? "")}`;
      retry.hidden = !failed;
    }
  }

  function setStatus(text) {
    if (status.textContent !== text) status.textContent = text;
  }

  // the state the device's settings call for, leaving any question behind
  function settle() {
    stopLooking();
    found = null;
    state = shell.device.classCode && !changing ? "current" : "find";
    render();
  }

  function stopLooking() {
    looking?.controller.abort();
    looking = null;
  }

  async function lookUp(code) {
    if (looking?.code === code) return;
    stopLooking();
    failed = null;
    setStatus(LOOKING);
    render();
    const controller = new AbortController();
    looking = { code, controller };
    const result = await fetchClass(code, { signal: controller.signal });
    if (looking?.controller !== controller) return; // typed on, or left
    looking = null;
    if (result.ok) {
      setStatus("");
      found = result.cls;
      state = "ask";
      render();
      yes.focus({ preventScroll: true });
    } else {
      failed = code;
      setStatus(NOT_FOUND);
      render();
    }
  }

  // the box: normalised and put in threes as it is typed, the caret kept
  // after the same character
  function tidy() {
    const raw = input.value;
    const code = codeFromText(raw);
    const formatted = formatClassCode(code);
    if (formatted !== raw) {
      // how many of the code's characters were before the caret (all of
      // them for a pasted link), and so where it goes among the threes
      const caret = input.selectionStart ?? raw.length;
      const n = /join=/i.test(raw) ? code.length : codeFromText(raw.slice(0, caret)).length;
      input.value = formatted;
      const pos = n === 0 ? 0 : n + Math.floor((n - 1) / 3);
      try {
        input.setSelectionRange(pos, pos);
      } catch {
        // not focused
      }
    }
    return code;
  }

  function typed() {
    const code = tidy();
    failed = null;
    if (code.length < CODE_LENGTH) {
      stopLooking();
      setStatus("");
      render();
    } else if (code.length > CODE_LENGTH) {
      stopLooking();
      setStatus(TOO_LONG);
      render();
    } else {
      lookUp(code);
    }
  }

  input.addEventListener("input", (e) => {
    if (!e.isComposing) typed();
  });
  input.addEventListener("compositionend", typed);
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const code = codeFromText(input.value);
    if (isClassCode(code)) {
      looking = null; // Enter asks again, even for the code just asked about
      lookUp(code);
    }
  });
  retry.addEventListener("click", () => {
    if (failed) lookUp(failed);
  });
  // no internet a moment ago: ask again as soon as there is
  addEventListener("online", () => {
    if (failed && state === "find" && !container.closest("[hidden]")) lookUp(failed);
  });

  yes.addEventListener("click", () => {
    if (!found) return;
    const device = shell.device;
    const before = { classCode: device.classCode, className: device.className };
    const beforeSaved = savedSnapshot();
    const cls = followClass(found);
    changing = false;
    joined = true;
    input.value = "";
    settle();
    shell.showToast(`My class: ${nameOf(cls)}`, () => {
      restoreSnapshot(beforeSaved);
      setDevice(before);
    });
    openClass.focus({ preventScroll: true });
  });
  no.addEventListener("click", () => {
    found = null;
    state = changing || !shell.device.classCode ? "find" : "current";
    render();
    if (state === "find") input.focus({ preventScroll: true });
  });
  change.addEventListener("click", () => {
    changing = true;
    input.value = "";
    failed = null;
    setStatus("");
    settle();
    input.focus({ preventScroll: true });
  });
  keep.addEventListener("click", () => {
    changing = false;
    settle();
    change.focus({ preventScroll: true });
  });
  leave.addEventListener("click", () => {
    const device = shell.device;
    const before = { classCode: device.classCode, className: device.className };
    changing = false;
    joined = false;
    setDevice({ classCode: null, className: null });
    shell.showToast(`Left ${before.className || formatClassCode(before.classCode)}`, () => setDevice(before));
    heading.focus({ preventScroll: true });
  });
  openClass.addEventListener("click", () => shell.go("my-class"));

  // an undo, or a change made in another tab
  shell.onDeviceChange(() => {
    if (state !== "ask") settle();
  });

  function show(p) {
    changing = false;
    failed = null;
    setStatus("");
    const join = p?.get("join");
    joined = join != null;
    if (join == null) {
      input.value = "";
      settle();
      return;
    }
    // a class's QR code: straight to the question
    const code = codeFromText(join);
    if (code === shell.device.classCode) {
      settle(); // already this class
      return;
    }
    state = "find";
    input.value = formatClassCode(code);
    if (isClassCode(code)) lookUp(code);
    else {
      failed = null;
      setStatus(NOT_FOUND);
      render();
    }
  }

  show(params);
  return {
    show,
    hide() {
      stopLooking();
      found = null;
      changing = false;
      joined = false;
    },
  };
}
