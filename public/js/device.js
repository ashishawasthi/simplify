// Settings for this one device, made by an adult on the set-up page (#setup):
// which tools the menu shows, pictures only, the speak button, the class, and
// each tool's own choices. A shared class iPad and a student's own phone can
// each be set up differently, and nothing about them leaves the device.
//
// Saved under "simplify-device-v1" as
//   { hidden: [tool ids], picturesOnly: false, speak: true, classCode: null,
//     className: null, tools: {} }
//     hidden        tools left off the menu (their links still work, so I
//                   need's Break can open Wait on a device whose menu hides it)
//     picturesOnly  hide the words marked .pic-words, for students who don't
//                   read (see tools.js)
//     speak         show the Speak button on cards
//     classCode     the class this device follows in My class, or null
//     className     that class's name as its coach wrote it ("3 Kindness"),
//                   for showing only — the code is what counts; null without one
//     tools         each tool's own settings, by tool id: { "i-need": {…} }.
//                   The tool's section on the set-up page writes them
//                   (setToolSettings); the tool reads them as shell.settings.
//
// getDevice() hands out a frozen copy, all the way down, so only setDevice()
// can change it.

const KEY = "simplify-device-v1";

const DEFAULTS = Object.freeze({
  hidden: Object.freeze([]),
  picturesOnly: false,
  speak: true,
  classCode: null,
  className: null,
  tools: Object.freeze({}),
});
const NO_SETTINGS = Object.freeze({});

const listeners = new Set();
let current = read();

function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

// Whatever is stored — an older shape, a hand edit, junk — comes back as a
// usable settings object: a bad value falls back to its default, never an error.
function clean(raw) {
  const s = isRecord(raw) ? raw : {};
  const hidden = Array.isArray(s.hidden)
    ? [...new Set(s.hidden.filter((id) => typeof id === "string"))]
    : DEFAULTS.hidden;
  const code = typeof s.classCode === "string" ? s.classCode.trim() : "";
  const name = typeof s.className === "string" ? s.className.trim().slice(0, 60) : "";
  // tool ids only (kebab-case), each with an object of settings; fromEntries
  // makes own properties, so not even "__proto__" can reach the prototype
  const tools = isRecord(s.tools)
    ? Object.fromEntries(Object.entries(s.tools).filter(([id, v]) => /^[a-z][a-z0-9-]*$/.test(id) && isRecord(v)))
    : DEFAULTS.tools;
  return deepFreeze({
    ...s, // keys a newer version added ride along untouched
    hidden,
    picturesOnly: typeof s.picturesOnly === "boolean" ? s.picturesOnly : DEFAULTS.picturesOnly,
    speak: typeof s.speak === "boolean" ? s.speak : DEFAULTS.speak,
    classCode: code || null,
    className: code && name ? name : null,
    tools,
  });
}

function read() {
  try {
    return clean(JSON.parse(localStorage.getItem(KEY)));
  } catch {
    return clean(null); // storage blocked or unreadable: the defaults
  }
}

export function getDevice() {
  return current;
}

// patch: any of the keys above. Saved at once — settings change rarely, and
// an adult setting up a device may close the app right after. Kept exactly
// as it is stored (JSON), so what a tool reads now is what it reads tomorrow.
export function setDevice(patch) {
  current = clean(JSON.parse(JSON.stringify({ ...current, ...patch })));
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // storage full or blocked — the change still holds until the app closes
  }
  notify();
  return current;
}

// One tool's own settings: {} until its set-up section saves some.
export function toolSettings(id) {
  return Object.hasOwn(current.tools, id) ? current.tools[id] : NO_SETTINGS;
}

// settings: the tool's whole settings object (plain data), replacing the old one
export function setToolSettings(id, settings) {
  return setDevice({ tools: { ...current.tools, [id]: settings } });
}

// fn(device) after every change; returns a function that stops listening
export function onDeviceChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  for (const fn of listeners) {
    try {
      fn(current);
    } catch (err) {
      console.error("a device settings listener failed", err); // the others still hear
    }
  }
}

// The set-up page may be open in another tab — in a browser, the guide opens
// in its own — so a change made there shows here without a reload.
addEventListener("storage", (e) => {
  if (e.key !== KEY && e.key !== null) return; // null: all storage was cleared
  current = read();
  notify();
});
