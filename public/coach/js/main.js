// Simplify for coaches (/coach/): sign in with Google, say who you are, ask
// for a class; then write the class's page, with pictures, videos and an AI
// helper, and publish it to the class's learners. The admin approves
// coaches for classes here too. docs/coach/coach-app.md.
//
// One page; the address says which screen:
//   #classes        My classes (the start)
//   #class/<CODE>   a class: its pages, the editor and preview, the helper,
//                   the picture and video shelves, Publish
//   #poster/<CODE>  the class's QR poster, to print
//   #admin          the admin's screen (only for an admin)
//   #about          About you
// Signed out, every address shows Sign in; signed in with no profile yet,
// About you comes first.

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
let turn = 0; // bumped at every sign-in change, so a late answer for an earlier one is dropped

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
  nav.hidden = !(signedIn && ready && profile);
  nav.querySelector('[data-route="admin"]').hidden = !admin;
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
  const [name = "", arg = ""] = decodeURIComponent(location.hash.slice(1)).split("/");
  const code = normaliseCode(arg);
  if (name === "class" && isClassCode(code)) {
    markNav(null);
    return show(classScreen, code);
  }
  if (name === "poster" && isClassCode(code)) {
    markNav(null);
    return show(posterScreen, code);
  }
  if (name === "admin" && admin) {
    markNav("admin");
    return show(adminScreen);
  }
  if (name === "about") {
    markNav("about");
    return show(profileScreen, { isNew: false });
  }
  markNav("classes");
  return show(classesScreen);
}

addEventListener("hashchange", route);

async function load(next) {
  const mine = ++turn;
  ready = false;
  profile = null;
  admin = false;
  user = next;
  renderHeader();
  if (!next) return route();
  showLoading();
  try {
    const [found, isAdmin] = await Promise.all([cloud.getProfile(next.uid), cloud.isAdmin(next.uid)]);
    if (mine !== turn) return;
    profile = found;
    admin = isAdmin;
    ready = true;
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
