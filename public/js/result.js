// The answer panel: always visible inside a tool, recomputed on every change.
// Colour + icon + plain words together, so no single channel carries the
// message. What to say comes from answers.js; this only shows it.

import { DEFAULT_CURRENCY, moneySvg } from "./currency-data.js";

let panel, icon, headline, subline, float, actionWrap, action;
let current = null;

export function initResult(els, { onShowMe }) {
  ({ panel, icon, headline, subline, float, actionWrap, action } = els);
  action.addEventListener("click", () => {
    if (current?.showMe) onShowMe(current.showMe);
  });
  pinFloatToVisualViewport();
  trackPanelHeight();
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

// The menu has no question, so no panel
export function setResultVisible(visible) {
  panel.hidden = !visible;
  if (!visible) float.hidden = true;
}

const TONES = ["is-yes", "is-no", "is-answer", "is-neutral"];

// answer: { tone, icon, headline, subline?, showMe? } — see answers.js
export function renderResult(answer) {
  current = answer;
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

  // mirror a real yes/no at the top of the screen; hints and amounts stay
  // bottom-only because a bare icon can't carry their meaning
  const verdict = answer.tone === "yes" || answer.tone === "no";
  float.hidden = !verdict || panel.hidden;
  if (verdict) {
    float.classList.remove("is-yes", "is-no");
    float.classList.add(`is-${answer.tone}`);
    float.textContent = answer.icon;
  }
}
