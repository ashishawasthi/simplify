// Smoke scenes for the coach guide (/coach/guide.html) — node tools/smoke.mjs coach-guide
//
// The page itself: it loads with no console or Content-Security-Policy error,
// every link and #anchor on it leads somewhere real (a link into another page
// is fetched, and its #anchor looked for there), every screenshot loads at the
// size its <img> declares, the public warning is quoted word for word from
// the app, and it fits a phone. The coach app's "Help for coaches" link finds
// it. Then every screenshot scene of tools/shoot-coach-guide.mjs is run
// against the real app, so a screen the guide shows that has changed fails
// here before a stale picture ships.

import { SCENES, smokeScene } from "../shoot-coach-guide.mjs";

const inPage = (fn) => `(${fn})()`;

// every link and picture on the page, checked; returns the problems in words
function checkGuide() {
  return (async () => {
    const problems = [];
    const pics = [...document.querySelectorAll("img")];
    for (const img of pics) img.loading = "eager";
    await Promise.all(pics.map((img) => img.decode().catch(() => problems.push(`picture did not load: ${img.getAttribute("src")}`))));
    for (const img of pics) {
      const w = Number(img.getAttribute("width"));
      const h = Number(img.getAttribute("height"));
      if (img.naturalWidth !== w || img.naturalHeight !== h) {
        problems.push(`${img.getAttribute("src")} is ${img.naturalWidth}×${img.naturalHeight}, the page says ${w}×${h}`);
      }
      if (!img.alt.trim()) problems.push(`${img.getAttribute("src")} has no alt text`);
    }
    const ids = new Set([...document.querySelectorAll("[id]")].map((el) => el.id));
    if (ids.size !== document.querySelectorAll("[id]").length) problems.push("an id is used twice");
    const pages = new Map(); // path → its HTML (fetched once)
    for (const a of document.querySelectorAll("a[href]")) {
      const href = a.getAttribute("href");
      const url = new URL(href, location.href);
      if (url.origin !== location.origin) {
        problems.push(`a link leaves the site: ${href}`);
        continue;
      }
      if (!a.textContent.trim() && !a.getAttribute("aria-label") && !a.querySelector("img[alt]:not([alt=''])")) problems.push(`a link with no words: ${href}`);
      if (url.pathname === location.pathname) {
        if (url.hash && !ids.has(decodeURIComponent(url.hash.slice(1)))) problems.push(`no #${url.hash.slice(1)} on this page`);
        continue;
      }
      if (!pages.has(url.pathname)) {
        const res = await fetch(url.pathname);
        pages.set(url.pathname, res.ok ? await res.text() : null);
      }
      const html = pages.get(url.pathname);
      if (html == null) problems.push(`${href}: not found`);
      else if (url.hash && !html.includes(`id="${url.hash.slice(1)}"`)) problems.push(`${href}: no such anchor there`);
    }
    // the contents list every section, in order
    const listed = [...document.querySelectorAll("#contents a")].map((a) => a.getAttribute("href").slice(1));
    const sections = [...document.querySelectorAll("section.topic")].map((s) => s.id);
    if (listed.join() !== sections.join()) problems.push(`contents ${listed} ≠ sections ${sections}`);
    // the warning, exactly as the app shows it
    const { PUBLIC_WARNING } = await import("/coach/js/publish.js");
    const quoted = document.querySelector("blockquote.words").textContent.replace(/\s+/g, " ").trim();
    if (quoted !== PUBLIC_WARNING) problems.push(`the warning is not word for word: “${quoted}”`);
    return problems;
  })();
}

export default [
  {
    name: "the guide: no errors; every link, anchor and picture resolves; the warning is word for word",
    path: "/coach/guide.html",
    viewport: { width: 1280, height: 800 },
    setup: `window.problems = await (${checkGuide})();`,
    expect: inPage(() => {
      if (window.problems.length) throw new Error(window.problems.join(" | "));
      return document.querySelectorAll("section.topic").length === 12 && document.title.startsWith("Help for coaches") &&
        document.documentElement.scrollWidth <= innerWidth;
    }),
  },
  {
    name: "the guide on a phone, reduced motion: fits the width; a contents link goes to its section",
    path: "/coach/guide.html",
    viewport: { width: 390, height: 844 },
    media: [{ name: "prefers-reduced-motion", value: "reduce" }],
    setup: `
      document.querySelector('#contents a[href="#helper"]').click();
      await new Promise((r) => setTimeout(r, 100));`,
    expect: inPage(() => document.documentElement.scrollWidth <= innerWidth && location.hash === "#helper" &&
      Math.abs(document.getElementById("helper").getBoundingClientRect().top) < 40 &&
      getComputedStyle(document.documentElement).scrollBehavior === "auto" &&
      [...document.querySelectorAll("figure img")].every((img) => img.getBoundingClientRect().right <= innerWidth)),
  },
  {
    name: "the coach app's Help for coaches link opens the guide",
    path: "/coach/",
    viewport: { width: 1280, height: 800 },
    stubs: smokeScene("signin").stubs,
    init: "window.FAKE = { user: null };",
    setup: `
      const link = [...document.querySelectorAll(".coach-footer a")].find((a) => a.textContent.includes("Help for coaches"));
      window.helpOk = link && (await fetch(link.href)).ok && (await (await fetch(link.href)).text()).includes("<h1>Help for coaches</h1>");`,
    expect: "window.helpOk === true",
  },
  ...Object.keys(SCENES).map(smokeScene),
];
