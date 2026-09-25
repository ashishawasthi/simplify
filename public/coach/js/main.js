// Simplify for coaches (/coach/): sign in with Google, say who you are and
// where you work, wait for the admin to approve you; then make classes (or
// join a colleague's), write each class's page with pictures, videos and an
// AI helper, and publish it to the class's learners. The admin approves
// coaches here too. docs/coach/coach-app.md.
//
// One page; the address says which screen:
//   #classes        My classes (the start) — or, until the admin approves
//                   the coach, Waiting for approval (or Not approved)
//   #class/<CODE>   a class: its pages, the editor and preview, the helper,
//                   the picture and video shelves, Publish
//   #poster/<CODE>  the class's QR poster, to print
//   #admin[/<tab>]  the admin's screen (only for an admin): waiting,
//                   coaches, classes, places, history or limits
//   #about          About you
// Signed out, every address shows Sign in; signed in with no profile yet (or
// one from before institutions), About you comes first. The profile is
// watched live, so the admin's decision changes the screen as it happens.

import * as cloud from "./cloud.js";
import { h, notice } from "./dom.js";
import { createToast } from "./toast.js";
import { isClassCode, normaliseCode } from "./class-code.js";
import { signInScreen } from "./screen-signin.js";
import { profileScreen } from "./screen-profile.js";
import { classesScreen } from "./screen-classes.js";
import { classScreen } from "./screen-class.js";
import { posterScreen } from "./screen-poster.js";
import { adminScreen } from "./screen-admin.js";
import { waitingScreen, declinedScreen } from "./screen-waiting.js";
import { coachGate } from "./institutions.js";

const $ = (id) => document.getElementById(id);
const main = $("main");
const nav = $("nav");
const account = $("account");
const accountEmail = $("account-email");

const toast = createToast({ box: $("toast"), text: $("toast-text"), undo: $("toast-undo"), status: $("toast-status") });

let user; // undefined until Firebase knows; null when signed out
let ready = false; // the signed-in coach's profile and admin status are known
let profile = null; // coaches/{uid}, or null before About you is filled in
let admin = false;
let leave = null; // the screen on show's clean-up
let shown = null; // the screen on show
let stopProfile = null; // stops watching coaches/{uid}
let latestProfile = null; // the profile as last heard, even before the screen is ready
let turn = 0; // bumped at every sign-in change, so a late answer for an earlier one is dropped
let stopWaiting = null; // stops watching how many wait for an admin
let waiting = 0; // coaches and join requests waiting for an admin (the Admin link says so)

const ctx = Object.freeze({
  cloud,
  toast,
  get user() { return user; },
  get profile() { return profile; },
  get admin() { return admin; },
  setProfile(next) {
    profile = next;
    renderHeader();
  },
  get gate() { return coachGate(profile); },
  // open a screen by its address (again, if it is the one on show)
  go(hash) {
    if (location.hash === hash) route();
    else location.hash = hash;
  },
});

function renderHeader() {
  const signedIn = Boolean(user);
  account.hidden = !signedIn;
  accountEmail.textContent = signedIn ? user.email : "";
  // who is signed in, for the widths that hide the email (css/coach.css)
  $("sign-out").title = signedIn ? `Signed in as ${user.email}` : "";
  nav.hidden = !(signedIn && ready && profile);
  const adminLink = nav.querySelector('[data-route="admin"]');
  adminLink.hidden = !admin;
  const count = adminLink.querySelector(".nav-count");
  count.hidden = !(admin && waiting > 0);
  count.textContent = String(waiting);
  adminLink.setAttribute("aria-label", admin && waiting > 0 ? `Admin, ${waiting} waiting` : "Admin");
}

function markNav(name) {
  for (const link of nav.querySelectorAll("a")) {
    if (link.dataset.route === name) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
}

function clear() {
  try {
    leave?.();
  } catch (err) {
    console.error("leaving the screen", err);
  }
  leave = null;
  shown = null;
  main.replaceChildren();
}

function show(screen, ...args) {
  clear();
  let result;
  try {
    result = screen(main, ctx, ...args);
  } catch (err) {
    console.error(err);
    main.replaceChildren(h("h1", null, "Something went wrong"),
      notice("This screen could not open. Reload the page to try again.", { tone: "problem" }));
  }
  leave = typeof result === "function" ? result : null;
  shown = screen;
  const title = main.querySelector("h1");
  // the sign-in screen's own heading is the app's name: don't say it twice
  const name = title?.textContent.trim();
  document.title = name && name !== "Simplify for coaches" ? `${name} · Simplify for coaches` : "Simplify for coaches";
  if (title) {
    title.tabIndex = -1; // focus lands on the new screen's title, for screen readers
    title.focus({ preventScroll: true });
  }
  window.scrollTo(0, 0);
}

function showLoading(text = "Loading…") {
  clear();
  main.append(h("p", { class: "loading", role: "status" }, text));
}

function route() {
  if (user === undefined || (user && !ready)) return;
  if (!user) {
    markNav(null);
    return show(signInScreen);
  }
  if (!profile) {
    markNav("about");
    return show(profileScreen, { isNew: true });
  }
  const gate = coachGate(profile);
  const [name = "", arg = ""] = decodeURIComponent(location.hash.slice(1)).split("/");
  // an admin's screen needs no coach approval: an admin may approve themself
  if (name === "admin" && admin) {
    markNav("admin");
    return show(adminScreen, arg);
  }
  if (name === "about" || gate === "about") {
    markNav("about");
    return show(profileScreen, { isNew: false });
  }
  if (gate === "pending" || gate === "declined") {
    markNav("classes");
    return show(gate === "pending" ? waitingScreen : declinedScreen);
  }
  const code = normaliseCode(arg);
  if (name === "class" && isClassCode(code)) {
    markNav(null);
    return show(classScreen, code);
  }
  if (name === "poster" && isClassCode(code)) {
    markNav(null);
    return show(posterScreen, code);
  }
  markNav("classes");
  return show(classesScreen);
}

addEventListener("hashchange", route);

// A change to the profile from elsewhere (the admin's decision, another tab):
// the screen changes only if what this person may do has changed, and never
// under someone typing in About you or working on the Admin screen.
function profileChanged(next) {
  const before = coachGate(profile);
  profile = next;
  renderHeader();
  if (coachGate(next) !== before && shown !== profileScreen && shown !== adminScreen) route();
}

// resolves with the profile (or null) the first time it is known; later
// changes go to profileChanged
function watchProfile(uid, mine) {
  return new Promise((resolve, reject) => {
    let first = true;
    stopProfile = cloud.watchProfile(uid, (found) => {
      if (mine !== turn) return;
      latestProfile = found;
      if (first) {
        first = false;
        resolve(found);
      } else if (ready) profileChanged(found);
    }, (err) => {
      if (first) reject(err);
      else console.warn("the profile stopped updating", err);
    });
  });
}

async function load(next) {
  const mine = ++turn;
  stopProfile?.();
  stopProfile = null;
  stopWaiting?.();
  stopWaiting = null;
  waiting = 0;
  latestProfile = null;
  ready = false;
  profile = null;
  admin = false;
  user = next;
  renderHeader();
  if (!next) return route();
  showLoading();
  try {
    const [found, isAdmin] = await Promise.all([watchProfile(next.uid, mine), cloud.isAdmin(next.uid)]);
    if (mine !== turn) return;
    profile = latestProfile ?? found;
    admin = isAdmin;
    ready = true;
    if (admin) {
      stopWaiting = cloud.watchWaiting((n) => {
        if (mine !== turn) return;
        waiting = n;
        renderHeader();
      });
    }
  } catch (err) {
    if (mine !== turn) return;
    clear();
    const retry = h("button", { class: "btn btn-primary", type: "button", onclick: () => load(next) }, "Try again");
    main.append(h("h1", null, "Simplify for coaches"), notice(err.message, { tone: "problem", action: retry }));
    return;
  }
  renderHeader();
  route();
}

cloud.onUserChange((next) => {
  toast.flush(); // anything waiting for its undo happens now, as the user it belongs to
  load(next);
});

$("sign-out").addEventListener("click", async () => {
  toast.flush();
  clear(); // stop listening to the class first, or its listeners fail once signed out
  stopProfile?.();
  stopProfile = null;
  stopWaiting?.();
  stopWaiting = null;
  showLoading("Signing out…");
  // a shared iPad: whoever signs in next starts at My classes, not in this class
  history.replaceState(null, "", "#classes");
  try {
    await cloud.signOut();
  } catch (err) {
    clear();
    main.append(h("h1", null, "Sign out"), notice(err.message, { tone: "problem" }));
  }
});

if (cloud.usingEmulators) document.documentElement.dataset.emulators = "";
