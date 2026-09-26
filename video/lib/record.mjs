// Records one shot: the real app, driven by the shot's steps the way a finger
// would (taps, typing a character at a time, a press-and-hold), filmed with
// Chrome's screencast. What the video shows is what the shipped markup does:
// nothing is drawn over the app here — the stage adds the finger and the
// captions later, from the events this returns.
//
// A shot: { path, viewport?, prep?, expect?, steps: [...] }
//   prep    JS run before filming (the state to start from; not shown)
//   expect  JS that is true once prep has landed
//   intercept (page, origin) → undo: stands in for the network while filming
//   steps   { tap: sel } | { type: sel, text } | { hold: sel, ms } |
//           { overlay: sel, shapes } |
//           { js: code } | { wait: ms } | { until: expr } | { focus: sel } | { scroll: sel }
//           (tap/type/focus/scroll take `has: "words"` to pick by text;
//           type takes `atEnd` to add to what a box already holds)
// Returns { width, height, duration, frames: [{ t, data }], events: [...] }.

import { sleep } from "./chrome.mjs";

export const PHONE = { width: 375, height: 812 };

// the element a step means: the first match of sel, or with `has`, the first
// match whose words include it ("Publish this page")
const find = (sel, has) => has
  ? `[...document.querySelectorAll(${JSON.stringify(sel)})].find((el) => el.textContent.includes(${JSON.stringify(has)}))`
  : `document.querySelector(${JSON.stringify(sel)})`;

const rectOf = (sel, has) => `(() => {
  const el = ${find(sel, has)};
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
})()`;

export async function recordShot(page, origin, shot, helpers = "") {
  const { width, height } = shot.viewport ?? PHONE;
  await page.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 2, mobile: true });
  // a shot may stand in for the network (the coach app's cloud); it hands
  // back how to undo that, so the next shot starts clean
  const undo = shot.intercept ? await shot.intercept(page, origin) : null;
  // a clean device for every shot: nothing saved by the one before
  await page.goto(`${origin}/video-blank.html`);
  await page.evaluate(`localStorage.clear(); sessionStorage.clear(); true`);
  await page.goto(new URL(shot.path ?? "/", origin).href);
  if (shot.prep) await page.evaluate(`(async () => { ${helpers}\n${shot.prep} })()`);
  if (shot.expect) await page.until(shot.expect);
  await page.evaluate(`document.fonts.ready.then(() => true)`);
  await page.evaluate(`document.activeElement?.blur?.(), true`);
  await sleep(400); // emoji and webfonts settle before the first frame

  const frames = [];
  const events = [];
  let t0 = null;
  const now = () => (t0 == null ? 0 : performance.now() / 1000 - t0);
  const off = page.on("Page.screencastFrame", ({ data, sessionId }) => {
    frames.push({ t: now(), data: Buffer.from(data, "base64") });
    page.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  t0 = performance.now() / 1000;
  await page.send("Page.startScreencast", { format: "jpeg", quality: 90, maxWidth: width * 2, maxHeight: height * 2 });
  await sleep(350);

  const mouse = (type, x, y) => page.send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1, pointerType: "mouse" });
  const centre = async (sel, has) => {
    await page.evaluate(`${find(sel, has)}?.scrollIntoView({ block: "nearest" }), true`);
    // where it is once it has stopped moving (a smooth scroll, a panel opening)
    let r = await page.evaluate(rectOf(sel, has));
    for (let i = 0; i < 30 && r; i++) {
      await sleep(60);
      const again = await page.evaluate(rectOf(sel, has));
      if (again && again.x === r.x && again.y === r.y) break;
      r = again;
    }
    if (!r) throw new Error(`no element for ${sel}${has ? ` with "${has}"` : ""}`);
    return { ...r, cx: r.x + r.w / 2, cy: r.y + r.h / 2 };
  };

  for (const step of shot.steps ?? []) {
    if (step.tap) {
      const r = await centre(step.tap, step.has);
      events.push({ t: now(), type: "tap", x: r.cx, y: r.cy });
      await mouse("mousePressed", r.cx, r.cy);
      await sleep(70);
      await mouse("mouseReleased", r.cx, r.cy);
      await sleep(step.after ?? 450);
    } else if (step.type) {
      const r = await centre(step.type, step.has);
      if (step.atEnd) {
        // typing goes on after what is there: no tap, which would move the caret
        await page.evaluate(`(() => { const el = ${find(step.type, step.has)}; el.focus(); el.setSelectionRange(el.value.length, el.value.length); return true; })()`);
      } else {
        events.push({ t: now(), type: "tap", x: r.cx, y: r.cy });
        await mouse("mousePressed", r.cx, r.cy);
        await mouse("mouseReleased", r.cx, r.cy);
        await page.evaluate(`${find(step.type, step.has)}.focus(), true`);
      }
      await sleep(180);
      for (const ch of step.text) {
        if (ch === "\n") await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" }).then(() => page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }));
        else await page.send("Input.insertText", { text: ch });
        await sleep(step.every ?? 90);
      }
      events.push({ t: now(), type: "focus", ...r, zoom: step.zoom ?? 1.12 });
      await sleep(step.after ?? 250);
    } else if (step.hold) {
      const r = await centre(step.hold);
      events.push({ t: now(), type: "hold", x: r.cx, y: r.cy, ms: step.ms ?? 1700 });
      // a pointer held down, as tools/guide-scenes.mjs's hold() does
      await page.evaluate(`(() => {
        const btn = document.querySelector(${JSON.stringify(step.hold)});
        window.__held = btn;
        btn.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 7, button: 0, isPrimary: true, pointerType: "touch" }));
        return true;
      })()`);
      await sleep(step.ms ?? 1700);
      await page.evaluate(`window.__held.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 7, button: 0, isPrimary: true, pointerType: "touch" })), true`);
      await sleep(step.after ?? 700);
    } else if (step.js) {
      await page.evaluate(`(async () => { ${helpers}\n${step.js} })()`);
      await sleep(step.after ?? 400);
    } else if (step.wait) {
      await sleep(step.wait);
    } else if (step.until) {
      await page.until(step.until, step.ms ?? 8000);
      await sleep(step.after ?? 200);
    } else if (step.focus) {
      const r = await page.evaluate(rectOf(step.focus, step.has));
      if (!r) throw new Error(`no element for ${step.focus}`);
      events.push({ t: now(), type: "focus", ...r, zoom: step.zoom });
      await sleep(step.after ?? 600);
    } else if (step.overlay) {
      // marks drawn over a picture (the stage draws them, from these shapes)
      await page.evaluate(`${find(step.overlay)}?.scrollIntoView({ block: "center" }), true`);
      await sleep(150);
      // the picture itself, not its frame: an image shown with object-fit:
      // contain has bands beside or above it, and the marks are the picture's
      const r = await page.evaluate(`(() => {
        const img = ${find(step.overlay)};
        if (!img) return null;
        const b = img.getBoundingClientRect();
        const nw = img.naturalWidth || b.width;
        const nh = img.naturalHeight || b.height;
        const k = getComputedStyle(img).objectFit === "contain" ? Math.min(b.width / nw, b.height / nh) : null;
        const w = k ? nw * k : b.width;
        const h = k ? nh * k : b.height;
        return { x: b.x + (b.width - w) / 2, y: b.y + (b.height - h) / 2, w, h };
      })()`);
      if (!r) throw new Error(`no element for ${step.overlay}`);
      events.push({ t: now(), type: "overlay", ...r, shapes: step.shapes, zoom: step.zoom ?? 1 });
      await sleep(step.after ?? 1200);
    } else if (step.scroll) {
      await page.evaluate(`${find(step.scroll, step.has)}?.scrollIntoView({ behavior: "smooth", block: ${JSON.stringify(step.block ?? "center")} }), true`);
      await sleep(step.after ?? 700);
    }
    if (step.blur !== false) await page.evaluate(`(document.activeElement?.tagName === "INPUT" ? 0 : document.activeElement?.blur?.()), true`);
  }
  await sleep(shot.tail ?? 500);
  await page.send("Page.stopScreencast");
  off();
  await undo?.();
  const duration = now();
  if (!frames.length) throw new Error("the screencast sent no frames");
  frames[0].t = 0; // the first frame stands for the state filming began in
  return { width, height, duration, frames, events };
}
