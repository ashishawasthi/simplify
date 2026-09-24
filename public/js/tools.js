// The tools: which there are, their groups on the menu, and how each one
// plugs into the app. app.js mounts every tool once at boot and shows one at
// a time as the address changes (#can-i-buy, #wait …).
//
// ---- Adding a tool ----
// 1. public/js/tools/<id>.js exporting mount(block, shell) — the contract
//    below — and, if an adult sets anything up for it, setup(section, shell)
// 2. its entry in TOOLS, in menu order
// 3. index.html: an <li data-tool="<id>"> in its group's list on the menu,
//    its picture a <span class="tool-icon" aria-hidden="true"
//    data-menu-icon="<id>"> that app.js fills from MENU_ICONS in pictures.js;
//    and an empty <div id="tool-<id>" class="tool" hidden></div>
// 4. public/css/tools/<id>.css, linked from index.html; style only inside
//    #tool-<id> (the shared parts are styled in styles.css)
// 5. node tools/stamp.mjs: the new files into sw.js's ASSETS and the new
//    modules into index.html's modulepreload list — node tools/test-assets.mjs
//    catches a forgotten run
// 6. its smoke scenes in tools/smoke/<id>.mjs — node tools/smoke.mjs <id>
//
// ---- The contract ----
// mount(block, shell) is called once, at boot, with the tool's hidden
// div#tool-<id>. It builds the tool inside block and returns
//   { show(params, { fresh }), hide?(), clearAll?(), hasAnything?() }
//   show(params, { fresh })
//                   the tool is on screen now. params is a URLSearchParams
//                   from the address: "#wait?m=2" → params.get("m") === "2".
//                   fresh is true when this address has just been opened — a
//                   tap on the menu, go(), a shared link or a class's QR
//                   code — and false when the same step of the history is
//                   shown again: Back, Forward, or a reload (an update
//                   reloads the app; Android reloads a tab it had put away).
//                   Act on a one-off instruction in params only when fresh
//                   (Wait's m: start a 2-minute wait), or a reload would do
//                   it again; otherwise show what the tool has saved.
//                   Called on every visit, and again — with no hide() in
//                   between — when only the params change or go() names the
//                   address already on screen. The answer panel, the ✕ and
//                   any open card or picture pick are gone before show(), so
//                   a tool never inherits a stale one.
//   hide()          the tool is leaving the screen (the next one's show()
//                   comes after): stop sounds and moving things.
//   clearAll()      the header ✕ was tapped: clear everything, and offer it
//                   back — shell.showToast("Everything cleared", undo).
//                   Never an "are you sure?".
//   hasAnything()   whether there is anything to clear; when present, the
//                   shell sets the ✕ from it after show() and after clearAll().
// If any of these throws, the error is logged and the rest of the app carries
// on; a tool whose mount() throws, or returns no show(), is taken off the menu.
//
// shell — one per tool, frozen:
//   id                     the tool's id
//   load() / save(state)   the tool's own saved state: localStorage key
//                          "simplify-<id>-v1" (Can I buy? keeps its old
//                          "afford-it-v1"). save() is debounced, and flushed
//                          before a reload or when the app goes to the background.
//   showToast(text, undo)  the undo toast: text, and "↩ Put it back", which
//                          runs undo()
//   setClearAll(visible)   show or hide the header ✕ (only for a tool with
//                          clearAll). mount() may also return clearLabel, the
//                          ✕'s spoken name when it doesn't clear everything
//   result.render(answer)  the answer panel at the bottom (see result.js):
//                          { tone: "yes"|"no"|"answer"|"neutral", icon,
//                          headline, subline?, badge? } — icon an emoji or an
//                          <img> from pictureImg(); badge the few words the
//                          floating pill repeats for a yes/no. Text only, so
//                          words someone typed are safe; "neutral" hides it.
//   result.setVisible(on)  hide the panel, or bring back this tool's last answer
//   device                 this device's settings, read-only — see device.js
//   settings               this tool's own device settings, read-only: what
//                          its setup() section saved, {} until then
//   onDeviceChange(fn)     fn(device) after the device's settings (or this
//                          tool's) change; returns a function that stops listening
//   onScreenChange(fn)     fn(id) each time a screen is put on show: its id, or
//                          null for the menu (My class refreshes while the
//                          menu shows); returns a function that stops listening
//   setBusy(on)            true while a reload would disrupt (a Wait timer
//                          running): a new version then waits until the app
//                          next goes to the background. false once it stops.
//   go(id, params)         open another screen: go("wait", { m: 2 }). Adds a
//                          step to the history, so Back comes back here, and
//                          🏠 still returns to the menu; the new screen's
//                          show() gets fresh: true. An id with no screen is
//                          an error in the console, and nothing happens.
//   back()                 return to the screen before this one, as Back
//                          does — or to the menu, if this is the first screen
//                          of the visit (a shared link), rather than out of
//                          the app. Use it for "Back to I need", not go().
// Use go() and back() rather than setting location.hash or calling history
// yourself: the shell keeps its own notes in history.state.
// setClearAll, result, showToast, go and back only work while this tool is
// the one on screen, so a tool can call them from anywhere (a timer, a
// promise) without checking.
//
// Words a person typed go on screen with textContent, never innerHTML.
//
// ---- The set-up page: setup(section, shell) ----
// A tool whose module also exports setup() gets its own section on the
// set-up page (#setup, for the adult looking after the device), under the
// tool's name and picture, in menu order after "Words and sound": which
// cards I need shows, fewer steps … setup(section, shell) runs once, the
// first time an adult opens the settings, and may return { show?(), hide?() }
// for every later opening and leaving. section is an empty <div> to build in.
// Its shell:
//   id, title              the tool's
//   settings               the tool's settings, read-only ({} at first)
//   saveSettings(next)     replace them, saved at once — then offer it back:
//                          showToast("Toilet: off", () => saveSettings(before))
//   device                 the whole device's settings, read-only
//   onDeviceChange(fn)     as above: an undo, or a change made in another tab
//   showToast(text, undo)  the set-up page's toast
// If setup() throws, its section is left out and the rest of the page works.
// Plain words, and no pic-words: this page is for adults, who need to read it.
//
// ---- Shared parts: import what a tool needs ----
//   show-card.js       openCard({ picture, words, lang, lines, actions }): one
//                      message over the whole screen, to show someone, with
//                      optional choices; closeCard()
//   say-aloud.js       canSpeak(), say(text or [{ text, lang }]), stop(): the
//                      recorded voice for a card's fixed words, the device's
//                      own for anything else, started from a tap
//   picture-picker.js  pickPicture({ title, allowWords, current }): choose a
//                      picture and a few words for a card
//   pictures.js        the bundled pictures: PICTURES, PICTURE_GROUPS,
//                      pictureImg(id), pictureSrc(id)
//   device.js          the device settings behind shell.device
//
// ---- Pictures only ----
// On a device set to "pictures only" (the set-up page, for students who don't
// read), <html> has data-pictures-only, and every element with class
// "pic-words" is hidden from sight but not from screen readers, so a control
// whose words are pic-words keeps its name (an aria-label on the control does
// the same). Mark the words a picture already says; never numbers, and never
// anything an adult has to read.
//
// Tools are imported statically, never with import(): after an update the
// service worker takes over the running page (skipWaiting + clients.claim),
// so a module fetched later could come from a newer version than the page.
// Each module is imported whole, so its optional setup export needs no
// change here.

import { mountMoneyTool } from "./money-tool.js";
import * as myClass from "./tools/my-class.js";
import * as nowNext from "./tools/now-next.js";
import * as wait from "./tools/wait.js";
import * as steps from "./tools/steps.js";
import * as iNeed from "./tools/i-need.js";
import * as showCard from "./tools/show-card.js";

// Menu order. Money comes first, so the buttons people already know stay
// where they were.
export const GROUPS = Object.freeze([
  { id: "money", icon: "💰", label: "Money" },
  { id: "my-day", icon: "📅", label: "My day" },
  { id: "talk", icon: "💬", label: "Talk" },
].map(Object.freeze));

// Menu order. guide: the tool's page in the user guide, once it has one —
// the footer's "How to use this tool" (without it, the guide's own menu).
// My class has no group: its tile sits above them all, and only once the
// set-up page has a class for this device. Its set-up section is
// class-setup.js, which a class's QR code opens on its own (#join=).
export const TOOLS = Object.freeze([
  { id: "my-class", title: "My class", group: null, mount: myClass.mount, guide: "/guide/my-class" },

  { id: "can-i-buy", title: "Can I buy?", group: "money", guide: "/guide/can-i-buy", mount: mountMoneyTool },
  { id: "change", title: "What is the change?", group: "money", guide: "/guide/change", mount: mountMoneyTool },
  { id: "next-dollar", title: "Next dollar", group: "money", guide: "/guide/next-dollar", mount: mountMoneyTool },
  { id: "next-note", title: "Next note", group: "money", guide: "/guide/next-note", mount: mountMoneyTool },
  { id: "make-amount", title: "Make the amount", group: "money", guide: "/guide/make-amount", mount: mountMoneyTool },
  { id: "shopping-list", title: "Make a shopping list", group: "money", guide: "/guide/shopping-list", mount: mountMoneyTool },

  { id: "now-next", title: "Now and next", group: "my-day", mount: nowNext.mount, setup: nowNext.setup, guide: "/guide/now-next" },
  { id: "wait", title: "Wait", group: "my-day", mount: wait.mount, setup: wait.setup, guide: "/guide/wait" },
  { id: "steps", title: "Steps", group: "my-day", mount: steps.mount, setup: steps.setup, guide: "/guide/steps" },

  { id: "i-need", title: "I need", group: "talk", mount: iNeed.mount, setup: iNeed.setup, guide: "/guide/i-need" },
  { id: "show-card", title: "Show a card", group: "talk", mount: showCard.mount, setup: showCard.setup, guide: "/guide/show-card" },
].map(Object.freeze));
