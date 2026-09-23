// The answer panel: always visible inside a tool, recomputed on every change.
// Colour + icon + plain words together, so no single channel carries the
// message. What to say comes from answers.js; this only shows it.

import { DEFAULT_CURRENCY, moneySvg } from "./currency-data.js";

let panel, icon, headline, subline, float, floatIcon, floatAmount, actionWrap, action;
let header, title;
let current = null;

export function initResult(els, { onShowMe }) {
  ({
    panel, icon, headline, subline, float, floatIcon, floatAmount, actionWrap, action,
    header, title,
  } = els);
  action.addEventListener("click", () => {
    if (current?.showMe) onShowMe(current.showMe);
  });
  pinFloatToVisualViewport();
  trackPanelHeight();
  addEventListener("resize", applyHeaderShelf); // e.g. rotating the phone
  applyHeaderShelf();
}

// position:fixed anchors to the *layout* viewport, which on iOS is not what
// the user is looking at: with the keyboard up, or mid rubber-band scroll, the
// visual viewport pans around inside it and a "fixed" badge slides off screen.
// Re-offsetting by the gap between the two keeps it against the real top edge.
function pinFloatToVisualViewport() {
  const vv = window.visualViewport;
  if (!vv) return;
  const place = () => {
    float.style.transform = `translateX(-50%) translateY(${Math.max(0, vv.offsetTop)}px)`;
  };
  vv.addEventListener("scroll", place);
  vv.addEventListener("resize", place);
  place();
}

// A longer answer makes the panel taller. The page's bottom padding and the
// undo toast follow its real height, so nothing ends up hidden behind it.
function trackPanelHeight() {
  const apply = () => {
    const h = panel.hidden ? 0 : panel.offsetHeight;
    document.documentElement.style.setProperty("--panel-h", `${h}px`);
  };
  if ("ResizeObserver" in window) new ResizeObserver(apply).observe(panel);
  apply();
}

// The floating badge sits below the "🏠 Menu / Start over" row and the
// tool's own name, not on top of them — offsetTop/offsetHeight are relative
// to the page, not the current scroll position, so this is the height of
// everything above the zones at scroll 0, not wherever the header has
// scrolled to right now. Called on every render rather than left to a
// ResizeObserver: header.hidden and title's text both change in the same
// tick a screen switches, and a size-change observer on those two elements
// was missing that first transition more often than it caught it.
function applyHeaderShelf() {
  const h = header.hidden ? 0 : title.offsetTop + title.offsetHeight;
  document.documentElement.style.setProperty("--header-h", `${h}px`);
}

// The menu has no question, so no panel
export function setResultVisible(visible) {
  panel.hidden = !visible;
  if (!visible) float.hidden = true;
}

const TONES = ["is-yes", "is-no", "is-answer", "is-neutral"];

// answer: { tone, icon, headline, subline?, badge?, showMe? } — see answers.js
export function renderResult(answer) {
  current = answer;
  applyHeaderShelf();
  panel.classList.remove(...TONES);
  panel.classList.add(`is-${answer.tone}`);

  if (typeof answer.icon === "string") {
    icon.classList.remove("is-picture");
    icon.textContent = answer.icon;
  } else {
    icon.classList.add("is-picture");
    icon.innerHTML = moneySvg(DEFAULT_CURRENCY, answer.icon.picture);
  }
  headline.textContent = answer.headline;
  subline.innerHTML = answer.subline ?? "";
  actionWrap.hidden = !answer.showMe;

  // mirror a real yes/no at the top of the screen, with its short amount —
  // an "answer" tone (change, next dollar …) stays bottom-only because a
  // bare icon can't carry that meaning on its own
  const verdict = answer.tone === "yes" || answer.tone === "no";
  float.hidden = !verdict || panel.hidden;
  if (verdict) {
    float.classList.remove("is-yes", "is-no");
    float.classList.add(`is-${answer.tone}`);
    floatIcon.textContent = answer.icon;
    floatAmount.textContent = answer.badge ?? "";
  }
}
