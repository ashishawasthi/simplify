// The answer panel: always visible inside a tool, recomputed on every change.
// Colour + icon + plain words together, so no single channel carries the
// message. What to say comes from answers.js (or a new tool); this only
// shows it.

import { DEFAULT_CURRENCY, moneySvg } from "./currency-data.js";
import { MARKUP } from "./answers.js";

let panel, icon, headline, subline, float, floatIcon, floatAmount, actionWrap, action;
let current = null;

export function initResult(els, { onShowMe }) {
  ({ panel, icon, headline, subline, float, floatIcon, floatAmount, actionWrap, action } = els);
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
// Also applied directly whenever the panel shows or hides: a size observer
// can miss a hidden-attribute toggle made in the same tick as other changes.
function applyPanelHeight() {
  const h = panel.hidden ? 0 : panel.offsetHeight;
  document.documentElement.style.setProperty("--panel-h", `${h}px`);
}

function trackPanelHeight() {
  if ("ResizeObserver" in window) new ResizeObserver(applyPanelHeight).observe(panel);
  applyPanelHeight();
}

// The menu has no question, so no panel
export function setResultVisible(visible) {
  panel.hidden = !visible;
  if (!visible) float.hidden = true;
  applyPanelHeight();
}

const TONES = ["is-yes", "is-no", "is-answer"];

// answer: { tone, icon, headline, subline?, badge?, showMe? } — see answers.js.
//   icon     an emoji, { picture: cents } for a note or coin, or an element
//            (a picture from pictures.js)
//   subline  plain text, unless the answer carries answers.js's MARKUP mark
export function renderResult(answer) {
  current = answer;
  // nothing to judge yet: no panel at all. A line saying "type your money
  // at the top" is one more thing to read, and the empty boxes already say it.
  if (answer.tone === "neutral") {
    panel.hidden = true;
    float.hidden = true;
    applyPanelHeight();
    return;
  }
  panel.hidden = false;
  panel.classList.remove(...TONES);
  panel.classList.add(`is-${answer.tone}`);

  if (typeof answer.icon === "string") {
    icon.classList.remove("is-picture");
    icon.textContent = answer.icon;
  } else if (answer.icon instanceof Node) {
    icon.classList.add("is-picture");
    icon.replaceChildren(answer.icon);
  } else if (typeof answer.icon?.picture === "number") {
    icon.classList.add("is-picture");
    icon.innerHTML = moneySvg(DEFAULT_CURRENCY, answer.icon.picture);
  } else {
    icon.classList.remove("is-picture");
    icon.textContent = "";
  }
  headline.textContent = answer.headline ?? "";
  // Only answers.js's own markup (formatted amounts in <strong>) goes in as
  // HTML; anything else is text, so words a person typed stay words.
  if (answer[MARKUP]) subline.innerHTML = answer.subline ?? "";
  else subline.textContent = answer.subline ?? "";
  actionWrap.hidden = !answer.showMe;

  // mirror a real yes/no at the top of the screen, with its short amount —
  // an "answer" tone (change, next dollar …) stays bottom-only because a
  // bare icon can't carry that meaning on its own
  const verdict = answer.tone === "yes" || answer.tone === "no";
  float.hidden = !verdict;
  if (verdict) {
    float.classList.remove("is-yes", "is-no");
    float.classList.add(`is-${answer.tone}`);
    floatIcon.textContent = typeof answer.icon === "string" ? answer.icon : "";
    floatAmount.textContent = answer.badge ?? "";
    // the pill only has the gap between 🏠 and ✕: if "$1234.56 more"
    // doesn't fit, drop the word rather than let "…" eat the digits — the
    // number is the part that matters, and the colour still says more/left
    if (floatAmount.scrollWidth > floatAmount.clientWidth) {
      floatAmount.textContent = (answer.badge ?? "").split(" ")[0];
    }
  }
  applyPanelHeight();
}
