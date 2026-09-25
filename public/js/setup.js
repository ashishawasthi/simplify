// Set up this device (#setup) — for the adult who looks after it: a teacher
// with a class iPad, a parent with a phone. Nothing on the menu leads here;
// the user guide does. A big "Hold to open set-up" button comes first, so a
// child exploring the app can't change anything by accident: press and hold
// while a ring fills. No PIN and nothing to get wrong — let go early and
// nothing happens.
//
// Behind it, each saved the moment it changes and undone from the toast:
//   My class           class-setup.js mounts into div#class-setup-slot —
//                      first, as typing the class code is what most adults
//                      come here for (the poster sends them)
//   Show on the menu   a switch per tool, grouped like the menu
//   Words and sound    pictures only (hide words); the Speak button on cards
//   <each tool's own>  a section per tool whose module exports setup(), in
//                      menu order — the contract is in tools.js
// Opened by a class's QR code (#join=<CODE>), the page skips the hold and
// shows only the class section: whoever scanned it says "yes, my class".

import { GROUPS, TOOLS } from "./tools.js";
import { getDevice, setDevice, toolSettings, setToolSettings } from "./device.js";
import { mountClassSetup } from "./class-setup.js";
import { DEFAULT_CURRENCY, moneySvg } from "./currency-data.js";

const HOLD_MS = 1500; // long enough not to happen by accident, short enough not to annoy

function make(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
}

export function mountSetup(block, shell) {
  let lastParams = new URLSearchParams();

  // ---- the hold ----
  const gate = make("div", "setup-gate");
  const hold = holdButton(({ byPointer }) => {
    if (byPointer) ignoreClicksUntilLifted();
    open(lastParams, { joining: false });
  });
  gate.append(hold.button);

  // ---- the settings ----
  const settings = make("div", "setup-settings");
  settings.hidden = true;

  // The finger that held the button is still down when the settings appear,
  // and lifting it could count as a tap on whatever switch is now under it.
  let quiet = false;
  let quietUntil = 0;
  settings.addEventListener("click", (e) => {
    if (quiet || performance.now() < quietUntil) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, { capture: true });
  function ignoreClicksUntilLifted() {
    quiet = true;
    const done = new AbortController();
    const lifted = () => {
      done.abort(); // one lift is enough: stop listening for both
      quiet = false;
      quietUntil = performance.now() + 500; // the tap's click comes just after
    };
    addEventListener("pointerup", lifted, { capture: true, signal: done.signal });
    addEventListener("pointercancel", lifted, { capture: true, signal: done.signal });
  }

  const menuSection = make("section", "setup-section");
  const menuHeading = make("h2", null, "Show on the menu");
  menuHeading.id = "setup-menu-h";
  menuHeading.tabIndex = -1; // focus lands here once the hold opens the page, if My class can't
  menuSection.setAttribute("aria-labelledby", menuHeading.id);
  menuSection.append(menuHeading);

  const toolSwitches = new Map(); // tool id → its switch
  for (const group of GROUPS) {
    const tools = TOOLS.filter((t) => t.group === group.id);
    if (!tools.length) continue;
    const label = make("h3", "setup-group-label");
    const icon = groupIcon(group.id) ?? make("span", null, group.icon);
    icon.setAttribute("aria-hidden", "true");
    label.append(icon, ` ${group.label}`);
    const list = make("ul", "setup-list");
    for (const tool of tools) {
      const sw = switchButton(tool.title, menuIcon(tool.id));
      sw.addEventListener("click", () => toggleTool(tool));
      toolSwitches.set(tool.id, sw);
      const li = make("li");
      li.append(sw);
      list.append(li);
    }
    menuSection.append(label, list);
  }

  const wordsSection = make("section", "setup-section");
  const wordsHeading = make("h2", null, "Words and sound");
  wordsHeading.id = "setup-words-h";
  wordsSection.setAttribute("aria-labelledby", wordsHeading.id);
  const picturesSwitch = switchButton("Pictures only (hide words)");
  const speakSwitch = switchButton("Speak button on cards");
  const wordsList = make("ul", "setup-list");
  for (const sw of [picturesSwitch, speakSwitch]) {
    const li = make("li");
    li.append(sw);
    wordsList.append(li);
  }
  wordsSection.append(wordsHeading, wordsList);

  picturesSwitch.addEventListener("click", () => {
    const was = getDevice().picturesOnly;
    setDevice({ picturesOnly: !was });
    shell.showToast(`Pictures only: ${was ? "off" : "on"}`, () => setDevice({ picturesOnly: was }));
  });
  speakSwitch.addEventListener("click", () => {
    const was = getDevice().speak;
    setDevice({ speak: !was });
    shell.showToast(`Speak button: ${was ? "off" : "on"}`, () => setDevice({ speak: was }));
  });

  // Each tool's own section: its module's setup() builds it the first time
  // the settings open (see tools.js), under the tool's name and picture.
  const toolSections = TOOLS.filter((tool) => typeof tool.setup === "function").map((tool) => {
    const section = make("section", "setup-section setup-tool");
    const heading = make("h2", "setup-tool-heading");
    heading.id = `setup-${tool.id}-h`;
    const icon = menuIcon(tool.id);
    if (icon) heading.append(icon);
    heading.append(make("span", null, tool.title));
    section.setAttribute("aria-labelledby", heading.id);
    const content = make("div", "setup-tool-content");
    section.append(heading, content);
    // api: what setup() returned, once it has run; broken: it threw, so the section stays out
    return { tool, section, content, api: undefined, broken: false };
  });

  // The class section is another module's (class-setup.js); until it renders,
  // this placeholder holds its place.
  const classSlot = make("div", "setup-section");
  classSlot.id = "class-setup-slot";
  classSlot.append(make("h2", null, "My class"), make("p", "setup-note", "Being built."));

  settings.append(classSlot, menuSection, wordsSection, ...toolSections.map((t) => t.section));
  block.append(gate, settings);

  function toggleTool(tool) {
    const before = getDevice().hidden;
    const hiding = !before.includes(tool.id);
    setDevice({ hidden: hiding ? [...before, tool.id] : before.filter((id) => id !== tool.id) });
    shell.showToast(`${tool.title}: ${hiding ? "off" : "on"} the menu`, () => setDevice({ hidden: before }));
  }

  // the switches follow the settings, including a "Put it back"
  function render(device) {
    for (const [id, sw] of toolSwitches) setSwitch(sw, !device.hidden.includes(id));
    setSwitch(picturesSwitch, device.picturesOnly);
    setSwitch(speakSwitch, device.speak);
  }
  render(getDevice());
  shell.onDeviceChange(render);

  // ---- opening and closing ----
  let classSection; // what mountClassSetup returned; undefined until it has run

  function open(params, { joining }) {
    gate.hidden = true;
    settings.hidden = false;
    menuSection.hidden = joining;
    wordsSection.hidden = joining;
    // other modules' sections: if one breaks, the rest of the page still works
    for (const t of toolSections) {
      t.section.hidden = joining || t.broken;
      if (t.section.hidden) continue;
      try {
        if (t.api === undefined) t.api = t.tool.setup(t.content, sectionShell(t.tool, shell)) ?? null;
        else t.api?.show?.();
      } catch (err) {
        t.broken = true; // left out from now on
        t.section.hidden = true;
        console.error(`${t.tool.title}: its set-up section could not open`, err);
      }
    }
    try {
      if (classSection === undefined) classSection = mountClassSetup(classSlot, shell, params) ?? null;
      else classSection?.show?.(params);
    } catch (err) {
      console.error("the class section could not open", err);
    }
    // the hold button just went away: to the first section's heading
    if (!joining) (classSlot.querySelector("#setup-class-h") ?? menuHeading).focus({ preventScroll: true });
  }

  // back behind the hold: every visit starts with it again
  function lock() {
    if (!settings.hidden) {
      for (const t of toolSections) {
        if (t.section.hidden) continue;
        try {
          t.api?.hide?.();
        } catch (err) {
          console.error(`${t.tool.title}: its set-up section could not close`, err);
        }
      }
      try {
        classSection?.hide?.();
      } catch (err) {
        console.error("the class section could not close", err);
      }
    }
    hold.reset();
    gate.hidden = false;
    settings.hidden = true;
  }

  return {
    show(params) {
      lastParams = params;
      if (params.has("join")) open(params, { joining: true });
      else lock();
    },
    hide: lock,
  };
}

// What a tool's set-up section works with (tools.js): its own settings, and
// the set-up page's toast, since that page is the one on screen.
function sectionShell(tool, page) {
  return Object.freeze({
    id: tool.id,
    title: tool.title,
    get settings() {
      return toolSettings(tool.id);
    },
    saveSettings: (next) => {
      setToolSettings(tool.id, next);
    },
    get device() {
      return getDevice();
    },
    onDeviceChange: page.onDeviceChange,
    showToast: page.showToast,
  });
}

// A group's picture from its heading on the menu
function groupIcon(id) {
  return document.querySelector(`#menu h2[data-group="${id}"] > [aria-hidden="true"]`)?.cloneNode(true) ?? null;
}

// The tool's picture from the menu, so a switch shows what the adult sees
// there. Drawn notes and coins are drawn afresh: a copied drawing would keep
// pointing at its gradient inside the hidden menu, and paint nothing.
function menuIcon(id) {
  const source = document.querySelector(`#menu [data-tool="${id}"] .tool-icon`);
  if (!source) return null;
  const icon = source.cloneNode(true);
  if (icon.dataset.picture) {
    icon.innerHTML = icon.dataset.picture
      .split(" ")
      .map((cents) => moneySvg(DEFAULT_CURRENCY, Number(cents)))
      .join("");
  }
  return icon;
}

// A whole row that switches: [picture] name ········ [● On]. Its state is in
// colour (green or white), a mark (✔ or none), the knob's side and a word.
function switchButton(name, icon = null) {
  const sw = make("button", "setup-switch");
  sw.type = "button";
  sw.setAttribute("role", "switch");
  if (icon) sw.append(icon);
  const state = make("span", "switch-state");
  state.setAttribute("aria-hidden", "true"); // aria-checked says it
  state.append(make("span", "switch-knob"), make("span", "switch-word"));
  sw.append(make("span", "setup-switch-name", name), state);
  return sw;
}

function setSwitch(sw, on) {
  sw.setAttribute("aria-checked", String(on));
  sw.querySelector(".switch-knob").textContent = on ? "✔" : "";
  sw.querySelector(".switch-word").textContent = on ? "On" : "Off";
}

// Press and hold for HOLD_MS while a ring fills; letting go sooner just
// resets it. Works with a finger, a mouse, or Space/Enter held down. Under
// reduced motion there is no ring, only the hold.
function holdButton(onDone) {
  const button = make("button", "hold-btn");
  button.type = "button";
  button.style.setProperty("--hold-ms", `${HOLD_MS}ms`);

  const ns = "http://www.w3.org/2000/svg";
  const ring = document.createElementNS(ns, "svg");
  ring.setAttribute("class", "hold-ring");
  ring.setAttribute("viewBox", "0 0 100 100");
  ring.setAttribute("aria-hidden", "true");
  for (const part of ["track", "fill"]) {
    const circle = document.createElementNS(ns, "circle");
    circle.setAttribute("class", `hold-ring-${part}`);
    circle.setAttribute("cx", "50");
    circle.setAttribute("cy", "50");
    circle.setAttribute("r", "44"); // setup.css dashes it by its length, 2π × 44
    ring.append(circle);
  }
  const face = make("span", "hold-face");
  face.append(ring);
  const icon = make("span", "hold-icon", "⚙️");
  icon.setAttribute("aria-hidden", "true");
  face.append(icon);
  button.append(face, make("span", "hold-text", "Hold to open set-up"));

  let timer = null;
  const start = (byPointer) => {
    if (timer) return;
    button.classList.add("is-holding");
    timer = setTimeout(() => {
      timer = null;
      button.classList.remove("is-holding");
      onDone({ byPointer });
    }, HOLD_MS);
  };
  const reset = () => {
    clearTimeout(timer);
    timer = null;
    button.classList.remove("is-holding");
  };

  button.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    // a finger that wanders a little off the button still counts as holding
    try {
      button.setPointerCapture(e.pointerId);
    } catch {
      // no live pointer to capture (a synthetic event): hold without it
    }
    start(true);
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture", "blur"]) {
    button.addEventListener(type, reset);
  }
  button.addEventListener("keydown", (e) => {
    if (e.key !== " " && e.key !== "Enter") return;
    e.preventDefault(); // no click, no page scroll
    if (!e.repeat) start(false);
  });
  button.addEventListener("keyup", (e) => {
    if (e.key === " " || e.key === "Enter") reset();
  });
  // a long press must not open a menu or start selecting text
  button.addEventListener("contextmenu", (e) => e.preventDefault());

  return { button, reset };
}
