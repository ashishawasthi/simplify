// Smoke scenes for the app itself: the menu, routing, the money tools, the
// set-up page and device settings, the update reload — node tools/smoke.mjs app
//
// Scene code is written as real functions, so Node checks their syntax when
// it loads this file, and sent to the page as source: they run there, and
// can use only the page's globals (plus the helpers HELPERS puts there).

import { SCENES as GUIDE, fill, panel } from "../guide-scenes.mjs";

const inPage = (fn) => `(${fn})()`; // an expect: its value, awaited
const run = (fn) => `await (${fn})();`; // a setup: run it to the end
// fill() is a run of statements with its own consts: one block per fill
const filled = (...args) => `{\n${fill(...args)}\n}\n`;

// shown(sel): on screen (not hidden, not inside something hidden)
// calls(): what the stand-in tools below were asked to do, in order
const HELPERS = `
  window.shown = (sel) => { const el = document.querySelector(sel); return !!el && el.getClientRects().length > 0; };
  window.pause = (ms) => new Promise((r) => setTimeout(r, ms));
  window.byName = (name) => [...document.querySelectorAll('#tool-setup .setup-switch')]
    .find((b) => b.querySelector('.setup-switch-name').textContent === name);
  window.calls = () => JSON.parse(sessionStorage.getItem("calls") ?? "[]");
`;

// A stand-in tool for the scenes about the shell (a scene's stubs): it
// writes down what the shell does to it — "wait show m=2 fresh", "wait hide"
// — in sessionStorage, which a reload keeps, and leaves its shell in
// window.shells for the scene to drive. screens: it also writes down every
// screen onScreenChange reports ("screen wait", "screen null").
const recorder = (id, { screens = false } = {}) => `
const log = (entry) => {
  const list = JSON.parse(sessionStorage.getItem("calls") ?? "[]");
  list.push(entry);
  sessionStorage.setItem("calls", JSON.stringify(list));
};
export function mount(block, shell) {
  (window.shells ??= {})[${JSON.stringify(id)}] = shell;
  ${screens ? "shell.onScreenChange((screen) => log('screen ' + screen));" : ""}
  return {
    show(params, { fresh }) {
      log(${JSON.stringify(id)} + " show" + (String(params) ? " " + params : "") + (fresh ? " fresh" : ""));
    },
    hide() { log(${JSON.stringify(id)} + " hide"); },
  };
}
`;
const recorders = (...ids) => Object.fromEntries(ids.map((id) => [`/js/tools/${id}.js`, recorder(id)]));
const TO_MENU = run(async () => {
  document.getElementById("to-menu").click();
  await pause(300);
});
// On the menu, with no step of the app's history behind it: Back leaves the app.
const AT_MENU_FIRST = inPage(() => shown("#menu") && location.hash === "" && navigation.currentEntry.index === 0);

// Press and hold "Hold to open set-up" the way a finger does, then lift it.
// The settings ignore a tap for a moment after the lift (it could be the
// same finger), so the scene waits that out before tapping anything.
const HOLD = run(async () => {
  const btn = document.querySelector("#tool-setup .hold-btn");
  const finger = { bubbles: true, pointerId: 7, button: 0, isPrimary: true, pointerType: "touch" };
  btn.dispatchEvent(new PointerEvent("pointerdown", finger));
  await pause(1700);
  btn.dispatchEvent(new PointerEvent("pointerup", finger));
  await pause(600);
  if (!shown("#tool-setup .setup-settings")) throw new Error("the hold did not open the settings");
});

const STUBS = [
  ["now-next", "Now and next"],
  ["wait", "Wait"],
  ["steps", "Steps"],
  ["i-need", "I need"],
  ["show-card", "Show a card"],
  ["my-class", "My class"],
];

export default [
  // ---------- the menu ----------
  {
    name: "menu: the three groups in order, every tool in its group, no My class tile",
    path: "/",
    init: HELPERS,
    expect: inPage(async () => {
      const { TOOLS, GROUPS } = await import("/js/tools.js");
      const idsIn = (sel) => [...document.querySelectorAll(sel)].map((li) => li.dataset.tool).join();
      const headings = [...document.querySelectorAll("#menu h2.group-label")];
      return shown("#menu") && !shown("#app-header") && !shown("#result") &&
        document.title === "Simplify" &&
        document.getElementById("menu").getAttribute("aria-label") === "Tools" &&
        document.getElementById("to-menu").getAttribute("aria-label") === "Menu" &&
        idsIn("#menu li[data-tool]") === TOOLS.map((t) => t.id).join() &&
        headings.map((h) => h.dataset.group).join() === GROUPS.map((g) => g.id).join() &&
        headings.every((h) => h.getClientRects().length > 0) &&
        GROUPS.every((g) => idsIn(`#menu ul[data-group="${g.id}"] li`) ===
          TOOLS.filter((t) => t.group === g.id).map((t) => t.id).join()) &&
        TOOLS.filter((t) => t.group).every((t) => shown(`#menu li[data-tool="${t.id}"]`)) &&
        !shown('#menu li[data-tool="my-class"]') &&
        document.getElementById("guide-link").getAttribute("target") === "_blank";
    }),
  },
  {
    name: "menu: the other tools' and groups' pictures are the app's own files, all drawn",
    path: "/",
    init: HELPERS,
    expect: inPage(async () => {
      const { menuIconSrc } = await import("/js/pictures.js");
      const slots = [...document.querySelectorAll("#menu [data-menu-icon]")];
      return slots.length === 8 && slots.every((slot) => {
        const img = slot.querySelector("img");
        return img && img.getAttribute("src") === menuIconSrc(slot.dataset.menuIcon) && img.complete &&
          img.naturalWidth > 0 && img.alt === "";
      }) && document.querySelector('#menu li[data-tool="show-card"] .tool-icon img').getBoundingClientRect().width >= 40;
    }),
  },
  {
    name: "menu: in an iPad or iPhone home-screen app the guide opens in the app's own window",
    path: "/",
    init: HELPERS + `Object.defineProperty(Navigator.prototype, "standalone", { configurable: true, get: () => true });`,
    expect: inPage(() => shown("#menu") && !document.getElementById("guide-link").hasAttribute("target")),
  },
  {
    name: "address: inherited names (#toString, #__proto__ …) show the menu, no exception",
    path: "/#toString",
    init: HELPERS,
    setup: run(async () => {
      if (!shown("#menu")) throw new Error("#toString did not show the menu");
      for (const name of ["__proto__", "constructor", "hasOwnProperty", "valueOf", "nowhere"]) {
        location.hash = `#${name}`;
        await pause(50);
        if (!shown("#menu")) throw new Error(`#${name} did not show the menu`);
      }
    }),
    expect: inPage(() => shown("#menu") && document.title === "Simplify" && !shown("#app-header")),
  },
  {
    name: "🏠 steps back to the menu a tool was opened from",
    path: "/",
    init: HELPERS,
    setup: run(async () => {
      document.querySelector('#menu a[href="#wait"]').click();
      await pause(50);
      if (!shown("#tool-wait")) throw new Error("Wait did not open from the menu");
      document.getElementById("to-menu").click();
    }),
    expect: inPage(() => shown("#menu") && location.hash === "" && !shown("#app-header")),
  },
  {
    name: "🏠 swaps a shared link's tool for the menu",
    path: "/#steps",
    init: HELPERS,
    setup: run(() => document.getElementById("to-menu").click()),
    expect: inPage(() => shown("#menu") && location.hash === "" && !shown("#app-header")),
  },

  // ---------- the money tools: the guide's scenes, unchanged ----------
  ...Object.entries(GUIDE)
    .filter(([name]) => name !== "menu") // the menu grew groups; the guide reshoots it later
    .map(([name, scene]) => ({
      name: `money: guide scene "${name}"`,
      path: scene.path,
      viewport: { width: scene.width, height: scene.height },
      setup: scene.setup,
      expect: scene.expect,
    })),
  {
    name: "money: each tool saves under its old key (Can I buy? afford-it-v1, others simplify-<id>-v1)",
    path: "/#can-i-buy",
    init: HELPERS,
    setup: filled("can-i-buy", { money: "50" }, ["4.50"]) + run(async () => {
      location.hash = "#change";
      await pause(50);
    }) + filled("change", { money: "5.00", spend: "2.30" }),
    expect: inPage(() => {
      const saved = (key) => JSON.parse(localStorage.getItem(key) || "null");
      return saved("afford-it-v1")?.moneyValue === "50" &&
        saved("afford-it-v1")?.items?.[0]?.value === "4.50" &&
        saved("simplify-change-v1")?.spendValue === "2.30" &&
        saved("simplify-can-i-buy-v1") === null;
    }),
  },
  {
    name: "money: numbers saved by the version before come back",
    path: "/#can-i-buy",
    init: `localStorage.setItem("afford-it-v1", JSON.stringify({ moneyValue: "10", moneySource: "typed",
      pickedNotes: [], items: [{ value: "4.50" }, { value: "12.90" }] }));`,
    expect: panel("Cannot buy | You need $7.40 more"),
  },
  {
    name: "money: ✕ clears the tool, Put it back brings it all back",
    path: "/#change",
    init: HELPERS,
    setup: filled("change", { money: "5.00", spend: "2.30" }) + run(() => {
      document.getElementById("clear-all").click();
      if (shown("#result") || shown("#clear-all-wrap")) throw new Error("✕ left the answer or itself");
      if (document.getElementById("toast-text").textContent !== "Everything cleared") throw new Error("no toast");
      document.getElementById("toast-undo").click();
    }),
    expect: panel("Change: $2.70 | The money you get back") + " && shown('#clear-all-wrap')",
  },

  // ---------- the other tools ----------
  {
    name: "a tool without an answer shows no answer, pill or ✕ left from the last tool",
    path: "/#can-i-buy",
    init: HELPERS,
    setup: filled("can-i-buy", { money: "10" }, ["4.50", "12.90"]) + run(() => {
      if (!shown("#result") || !shown("#result-float") || !shown("#clear-all-wrap")) {
        throw new Error("nothing on screen to leave behind");
      }
      location.hash = "#wait";
    }),
    expect: inPage(() => shown("#tool-wait") && !shown("#tool-can-i-buy") &&
      !shown("#result") && !shown("#result-float") && !shown("#clear-all-wrap") &&
      document.getElementById("screen-title").textContent === "Wait"),
  },
  ...STUBS.map(([id, title]) => ({
    name: `${title} opens at #${id}`,
    path: `/#${id}`,
    init: HELPERS,
    expect: `shown('#tool-${id}') && !shown('#menu') && shown('#app-header') &&
      document.getElementById('screen-title').textContent === ${JSON.stringify(title)} &&
      document.title === ${JSON.stringify(`${title} — Simplify`)} &&
      document.activeElement === document.getElementById('screen-title') &&
      document.getElementById('guide-link').getAttribute('href') === '/guide'`,
  })),
  {
    name: "an address with params (#wait?m=2) opens its tool",
    path: "/#wait?m=2",
    init: HELPERS,
    expect: inPage(() => shown("#tool-wait") && document.getElementById("screen-title").textContent === "Wait"),
  },

  // ---------- set up this device ----------
  {
    name: "set-up: opens on the hold button, with no ✕ and no menu",
    path: "/#setup",
    init: HELPERS,
    expect: inPage(() => shown("#tool-setup .hold-btn") && !shown("#tool-setup .setup-settings") &&
      document.title === "Set up this device — Simplify" && !shown("#clear-all-wrap") && !shown("#menu")),
  },
  {
    name: "set-up: a short press opens nothing",
    path: "/#setup",
    init: HELPERS,
    setup: run(async () => {
      const btn = document.querySelector("#tool-setup .hold-btn");
      const finger = { bubbles: true, pointerId: 7, button: 0, isPrimary: true, pointerType: "touch" };
      btn.dispatchEvent(new PointerEvent("pointerdown", finger));
      await pause(500);
      btn.dispatchEvent(new PointerEvent("pointerup", finger));
      await pause(1500);
    }),
    expect: inPage(() => shown("#tool-setup .hold-btn") && !shown("#tool-setup .setup-settings")),
  },
  {
    name: "set-up: holding opens a switch per tool, grouped like the menu, plus words and class",
    path: "/#setup",
    init: HELPERS,
    setup: HOLD,
    expect: inPage(async () => {
      const { TOOLS } = await import("/js/tools.js");
      const onMenu = TOOLS.filter((t) => t.group);
      const names = [...document.querySelectorAll("#tool-setup .setup-switch-name")].map((n) => n.textContent);
      return !shown("#tool-setup .hold-btn") &&
        names.join("|") === [...onMenu.map((t) => t.title), "Pictures only (hide words)", "Speak button on cards"].join("|") &&
        [...document.querySelectorAll("#tool-setup .setup-switch")].every((b) => b.getAttribute("aria-checked") ===
          (b === byName("Pictures only (hide words)") ? "false" : "true")) &&
        document.querySelectorAll("#tool-setup .setup-group-label").length === 3 &&
        shown("#class-setup-slot") && !shown("#clear-all-wrap") &&
        document.activeElement?.id === "setup-menu-h";
    }),
  },
  {
    name: "set-up: Space held down opens it too",
    path: "/#setup",
    init: HELPERS,
    setup: run(async () => {
      const btn = document.querySelector("#tool-setup .hold-btn");
      btn.focus();
      btn.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
      await pause(1700);
      btn.dispatchEvent(new KeyboardEvent("keyup", { key: " ", bubbles: true }));
    }),
    expect: inPage(() => shown("#tool-setup .setup-settings")),
  },
  {
    name: "set-up: under reduced motion, no ring — the hold still opens it",
    path: "/#setup",
    media: [{ name: "prefers-reduced-motion", value: "reduce" }],
    init: HELPERS,
    setup: run(() => {
      const fill = document.querySelector("#tool-setup .hold-ring-fill");
      if (getComputedStyle(fill).display !== "none") throw new Error("the ring still shows");
    }) + HOLD,
    expect: inPage(() => shown("#tool-setup .setup-settings")),
  },
  {
    name: "set-up: the tap that ends the hold can't switch anything",
    path: "/#setup",
    init: HELPERS,
    setup: run(async () => {
      const btn = document.querySelector("#tool-setup .hold-btn");
      const finger = { bubbles: true, pointerId: 7, button: 0, isPrimary: true, pointerType: "touch" };
      btn.dispatchEvent(new PointerEvent("pointerdown", finger));
      await pause(1700);
      byName("Can I buy?").click(); // the finger is still down
      btn.dispatchEvent(new PointerEvent("pointerup", finger));
      byName("Can I buy?").click(); // the click that follows the lift
    }),
    expect: inPage(() => byName("Can I buy?").getAttribute("aria-checked") === "true" &&
      localStorage.getItem("simplify-device-v1") === null),
  },
  {
    name: "set-up: switching a tool off takes it off the menu",
    path: "/#setup",
    init: HELPERS,
    setup: HOLD + run(() => {
      byName("Wait").click();
      if (byName("Wait").getAttribute("aria-checked") !== "false") throw new Error("the switch did not turn off");
      if (document.getElementById("toast-text").textContent !== "Wait: off the menu") throw new Error("no toast");
      location.hash = "";
    }),
    expect: inPage(() => shown("#menu") && !shown('#menu li[data-tool="wait"]') &&
      shown('#menu li[data-tool="now-next"]') && shown('#menu h2[data-group="my-day"]') &&
      JSON.parse(localStorage.getItem("simplify-device-v1")).hidden.join() === "wait"),
  },
  {
    name: "set-up: Put it back undoes a switch",
    path: "/#setup",
    init: HELPERS,
    setup: HOLD + run(() => {
      byName("Steps").click();
      document.getElementById("toast-undo").click();
    }),
    expect: inPage(() => byName("Steps").getAttribute("aria-checked") === "true" &&
      JSON.parse(localStorage.getItem("simplify-device-v1")).hidden.length === 0),
  },
  {
    name: "set-up: a group with every tool off loses its heading",
    path: "/#setup",
    init: HELPERS,
    setup: HOLD + run(() => {
      for (const name of ["Now and next", "Wait", "Steps"]) byName(name).click();
      location.hash = "";
    }),
    expect: inPage(() => shown("#menu") && !shown('#menu h2[data-group="my-day"]') &&
      !shown('#menu ul[data-group="my-day"]') && shown('#menu h2[data-group="talk"]') &&
      shown('#menu h2[data-group="money"]')),
  },
  {
    name: "set-up: pictures only hides the menu's words, not the set-up page's",
    path: "/#setup",
    init: HELPERS,
    setup: HOLD + run(async () => {
      byName("Pictures only (hide words)").click();
      if (!document.documentElement.hasAttribute("data-pictures-only")) throw new Error("no data-pictures-only");
      const setupTitle = document.getElementById("screen-title").getBoundingClientRect();
      if (setupTitle.width < 50) throw new Error("the set-up page's title was hidden");
      if (byName("Wait").getBoundingClientRect().height < 56) throw new Error("the set-up page lost its words");
      location.hash = "";
      await pause(50);
    }),
    expect: inPage(() => {
      const words = document.querySelector('#menu li[data-tool="wait"] .pic-words');
      const heading = document.querySelector('#menu h2[data-group="money"] .pic-words');
      return shown("#menu") && words.getBoundingClientRect().width <= 1 &&
        heading.getBoundingClientRect().width <= 1 && words.textContent === "Wait" &&
        document.getElementById("screen-title").getBoundingClientRect().width <= 1 &&
        shown('#menu li[data-tool="wait"] .tool-icon');
    }),
  },
  {
    name: "device settings saved earlier apply at boot: hidden tools, My class tile on top",
    path: "/",
    init: HELPERS + `localStorage.setItem("simplify-device-v1", JSON.stringify({
      hidden: ["wait", "change"], picturesOnly: false, speak: true, classCode: "K7M3RQP9T" }));`,
    expect: inPage(() => {
      const first = [...document.querySelectorAll("#menu li[data-tool]")].find((li) => li.getClientRects().length);
      return first?.dataset.tool === "my-class" && !shown('#menu li[data-tool="wait"]') &&
        !shown('#menu li[data-tool="change"]') && shown('#menu li[data-tool="now-next"]') &&
        !document.documentElement.hasAttribute("data-pictures-only");
    }),
  },
  {
    name: "device settings that are junk fall back to the defaults",
    path: "/",
    init: HELPERS + `localStorage.setItem("simplify-device-v1", '{"hidden":"wait","picturesOnly":"yes","classCode":7,' +
      '"className":"3 Kindness","tools":{"__proto__":{"x":1},"i-need":{"cards":["help"]},"Bad id":{},"steps":5}}');`,
    expect: inPage(async () => {
      const { getDevice, toolSettings } = await import("/js/device.js");
      const d = getDevice();
      return shown('#menu li[data-tool="wait"]') && !shown('#menu li[data-tool="my-class"]') &&
        d.hidden.length === 0 && d.picturesOnly === false && d.speak === true && d.classCode === null &&
        d.className === null && Object.keys(d.tools).join() === "i-need" &&
        toolSettings("i-need").cards.join() === "help" && Object.isFrozen(toolSettings("i-need").cards) &&
        Object.keys(toolSettings("steps")).length === 0 && Object.keys(toolSettings("toString")).length === 0 &&
        Object.getPrototypeOf(d.tools) === Object.prototype && d.tools.x === undefined;
    }),
  },
  {
    name: "a class QR code (#join=CODE) opens the set-up page at the class section, no hold",
    path: "/#join=K7M3RQP9T",
    init: HELPERS,
    expect: inPage(() => document.title === "Set up this device — Simplify" &&
      !shown("#tool-setup .hold-btn") && shown("#class-setup-slot") && !shown("#setup-menu-h") &&
      !shown("#setup-words-h")),
  },

  // ---------- history, and what the shell tells a tool ----------
  {
    name: "🏠 after go() from a shared link's screen: the menu takes that screen's place, nothing behind it",
    path: "/#i-need",
    init: HELPERS,
    stubs: { ...recorders("i-need", "wait"), "/js/tools/my-class.js": recorder("my-class", { screens: true }) },
    setup: run(() => {
      shells["i-need"].go("wait", { m: 2 });
      if (location.hash !== "#wait?m=2" || !shown("#tool-wait")) throw new Error("go() did not open Wait");
    }) + TO_MENU,
    expect: AT_MENU_FIRST + ` && calls().join() === ${JSON.stringify([
      "i-need show fresh", "screen i-need", "i-need hide", "wait show m=2 fresh", "screen wait", "wait hide",
      "screen null"].join())}`,
  },
  {
    name: "🏠 after go() from a tool opened on the menu: back to that menu, nothing behind it",
    path: "/",
    init: HELPERS,
    stubs: recorders("i-need", "wait"),
    setup: run(async () => {
      document.querySelector('#menu a[href="#i-need"]').click();
      await pause(100);
      shells["i-need"].go("wait", { m: 2 });
    }) + TO_MENU,
    expect: AT_MENU_FIRST + ` && calls().join() === "i-need show fresh,i-need hide,wait show m=2 fresh,wait hide"`,
  },
  {
    name: "Back after go(): the screen before, not fresh — and 🏠 from there still reaches the menu",
    path: "/",
    init: HELPERS,
    stubs: recorders("i-need", "wait"),
    setup: run(async () => {
      document.querySelector('#menu a[href="#i-need"]').click();
      await pause(100);
      shells["i-need"].go("wait", { m: 2 });
      history.back();
      await pause(300);
      if (!shown("#tool-i-need") || calls().at(-1) !== "i-need show") throw new Error(`Back: ${calls().join()}`);
    }) + TO_MENU,
    expect: AT_MENU_FIRST,
  },
  {
    name: "🏠 when the visit's first screen and its last have the same address",
    path: "/#wait",
    init: HELPERS,
    stubs: recorders("i-need", "wait"),
    setup: run(() => {
      shells.wait.go("i-need");
      shells["i-need"].go("wait");
    }) + TO_MENU,
    expect: AT_MENU_FIRST + ` && document.title === "Simplify"`,
  },
  {
    name: "shell.back(): one screen back — and from the visit's first screen, the menu, not out of the app",
    path: "/#i-need",
    init: HELPERS,
    stubs: recorders("i-need", "wait"),
    setup: run(async () => {
      shells["i-need"].go("wait", { m: 5 });
      shells.wait.back();
      await pause(300);
      if (!shown("#tool-i-need") || calls().at(-1) !== "i-need show") throw new Error(`back(): ${calls().join()}`);
      shells["i-need"].back();
      await pause(100);
    }),
    expect: AT_MENU_FIRST,
  },
  {
    name: "a reload shows the same screen again, not fresh — a params instruction isn't carried out twice",
    path: "/#wait?m=2",
    init: HELPERS,
    stubs: recorders("wait"),
    setup: run(() => {
      setTimeout(() => location.reload(), 50); // once this setup is over
    }),
    expect: inPage(() => calls().join() === "wait show m=2 fresh,wait show m=2" && shown("#tool-wait") &&
      history.state?.steps === 0 && history.state?.seen === true),
  },
  {
    name: "new params on the screen on show: show() again, no hide(); go() to the same address is fresh",
    path: "/#wait?m=2",
    init: HELPERS,
    stubs: recorders("wait"),
    setup: run(async () => {
      location.hash = "#wait?m=5";
      await pause(100);
      shells.wait.go("wait", { m: 5 });
    }),
    expect: inPage(() => calls().join() === "wait show m=2 fresh,wait show m=5 fresh,wait show m=5 fresh"),
  },
  {
    name: "go() ends a card or picture pick the last screen opened; its promise settles with null",
    path: "/#i-need",
    init: HELPERS,
    stubs: recorders("i-need", "wait", "steps"),
    setup: run(async () => {
      const { openCard } = await import("/js/show-card.js");
      const { pickPicture } = await import("/js/picture-picker.js");
      const card = openCard({ words: "Break" });
      shells["i-need"].go("wait", { m: 2 });
      window.cardGave = await card;
      const pick = pickPicture({ title: "Now" });
      shells.wait.go("steps");
      window.pickGave = await pick;
    }),
    expect: inPage(() => cardGave === null && pickGave === null && !document.querySelector("dialog[open]") &&
      shown("#tool-steps") && document.activeElement === document.getElementById("screen-title")),
  },
  {
    name: "go() from inside show() moves straight on; onScreenChange hears the screen it lands on last",
    path: "/#i-need?then=wait",
    init: HELPERS,
    stubs: {
      "/js/tools/i-need.js": `
        export function mount(block, shell) {
          return { show(params) { if (params.get("then")) shell.go(params.get("then")); } };
        }`,
      ...recorders("wait"),
      "/js/tools/my-class.js": recorder("my-class", { screens: true }),
    },
    expect: inPage(() => shown("#tool-wait") && location.hash === "#wait" &&
      calls().join() === "wait show fresh,screen wait" && document.title === "Wait — Simplify"),
  },
  {
    name: "go() and back() from a tool that isn't on screen do nothing",
    path: "/#i-need",
    init: HELPERS,
    stubs: recorders("i-need", "wait"),
    setup: run(async () => {
      shells.wait.go("steps");
      shells.wait.back();
      await pause(200);
    }),
    expect: inPage(() => shown("#tool-i-need") && location.hash === "#i-need" && calls().join() === "i-need show fresh"),
  },
  {
    name: "a tool's own set-up section: after Words and sound, its settings saved per device, undone from the toast",
    path: "/#setup",
    init: HELPERS,
    stubs: {
      "/js/tools/i-need.js": `
        export function mount(block, shell) {
          window.iNeedShell = shell;
          return { show() {} };
        }
        export function setup(section, shell) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "stub-setting";
          const render = () => { btn.textContent = shell.settings.fewer ? "Fewer: on" : "Fewer: off"; };
          btn.addEventListener("click", () => {
            const before = shell.settings;
            shell.saveSettings({ ...before, fewer: !before.fewer });
            shell.showToast("Fewer cards", () => shell.saveSettings(before));
          });
          shell.onDeviceChange(render);
          render();
          section.append(btn);
          window.setups = (window.setups ?? 0) + 1;
        }`,
    },
    setup: HOLD + run(async () => {
      const headings = [...document.querySelectorAll("#tool-setup .setup-section > h2")].map((h) => h.textContent.trim());
      if (headings.join("|") !== "Show on the menu|Words and sound|I need|My class") throw new Error(headings.join("|"));
      if (!document.querySelector("#tool-setup .setup-tool-heading .tool-icon img")) throw new Error("no picture");
      document.querySelector(".stub-setting").click();
      const saved = JSON.parse(localStorage.getItem("simplify-device-v1")).tools["i-need"];
      if (saved?.fewer !== true || iNeedShell.settings.fewer !== true) throw new Error("not saved");
      if (document.querySelector(".stub-setting").textContent !== "Fewer: on") throw new Error("not shown");
      if (document.getElementById("toast-text").textContent !== "Fewer cards") throw new Error("no toast");
      document.getElementById("toast-undo").click();
      location.hash = "";
      await pause(100);
      location.hash = "#setup"; // behind the hold again: its section is only shown again, not built
      await pause(100);
    }) + HOLD,
    expect: inPage(() => document.querySelector(".stub-setting").textContent === "Fewer: off" &&
      JSON.stringify(JSON.parse(localStorage.getItem("simplify-device-v1")).tools["i-need"]) === "{}" &&
      window.setups === 1),
  },
  {
    name: "the undo toast: read out with its undo, a 56 px ↩ button, kept while in use, focus back after",
    path: "/#setup",
    init: HELPERS,
    setup: HOLD + run(async () => {
      const wait = byName("Wait");
      wait.focus();
      wait.click();
      await pause(300);
      const said = document.getElementById("toast-status").textContent;
      if (said !== "Wait: off the menu. Put it back.") throw new Error(`read out: ${said}`);
      const undo = document.getElementById("toast-undo");
      if (undo.getBoundingClientRect().height < 56) throw new Error("the button is under 56 px");
      if (!undo.textContent.includes("↩")) throw new Error("no ↩");
      undo.focus();
      await pause(8500); // longer than a toast stays on its own
      if (!shown("#toast")) throw new Error("the toast went while its button had focus");
      undo.click();
    }),
    expect: inPage(() => !shown("#toast") && document.activeElement === byName("Wait") &&
      byName("Wait").getAttribute("aria-checked") === "true" &&
      document.getElementById("toast-status").textContent === ""),
  },

  // ---------- updates ----------
  {
    name: "update: a new version waits while a tool is busy, then reloads in the background",
    path: "/",
    // a stand-in service worker (the real one is off in smoke runs), and a
    // document.hidden the scene can flip
    init: HELPERS + `
      const sw = new EventTarget();
      sw.controller = {}; // already controlled: the next controllerchange is an update
      sw.register = () => Promise.resolve({});
      sw.getRegistration = () => Promise.resolve(undefined);
      Object.defineProperty(Navigator.prototype, "serviceWorker", { configurable: true, get: () => sw });
      window.pageHidden = false;
      Object.defineProperty(Document.prototype, "hidden", { configurable: true, get: () => window.pageHidden });
    `,
    setup: run(async () => {
      const { setBusy } = await import("/js/update.js");
      const toBackground = (hidden) => {
        window.pageHidden = hidden;
        document.dispatchEvent(new Event("visibilitychange"));
      };
      window.samePage = true;
      setBusy("wait", true);
      navigator.serviceWorker.dispatchEvent(new Event("controllerchange")); // the new version is in
      toBackground(true); // would reload now — but a timer is running
      await pause(300);
      toBackground(false);
      setBusy("wait", false); // idle again: still no reload in front of the user
      await pause(300);
      if (!window.samePage) throw new Error("reloaded");
      setTimeout(() => toBackground(true), 50); // after this setup returns: now it may reload
    }),
    expect: inPage(() => window.samePage === undefined && shown("#menu")),
  },
];
