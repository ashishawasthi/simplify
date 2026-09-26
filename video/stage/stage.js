// Draws the video one frame at a time: renderAt(t) sets every element for
// time t (seconds) and resolves once the frame is ready to capture. Nothing
// animates by itself, so a frame depends on t alone — the render is the same
// every run, however fast the machine.
//
// The timeline (from video/lib/compose.mjs) is a list of segments:
//   intro   { title, line, logo, icons }
//   chapter { title, line?, icon, color }
//   shot    { title, line, icon, screen: {w, h}, frames: [{t, src}], rec, events }
//   end     { title, line, logo }

import { overlaySvg } from "/coach/js/overlay.js";

const W = 720;
const H = 1280;
const SCREEN_W = 600; // the phone screen's width on the stage, before zoom
const TOP = 250; // where the phone's top sits, under the caption
const PAD = 14; // the frame around the screen

const $ = (id) => document.getElementById(id);
const isPicture = (icon) => typeof icon === "string" && icon.startsWith("/");
// an icon: a picture from the app, or an emoji drawn as text
function setIcon(el, icon) {
  if (el.dataset.icon === (icon ?? "")) return;
  el.dataset.icon = icon ?? "";
  if (isPicture(icon)) el.replaceChildren(Object.assign(document.createElement("img"), { src: icon, alt: "" }));
  else el.textContent = icon ?? "";
}
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const easeOut = (x) => 1 - (1 - clamp(x, 0, 1)) ** 3;
const easeInOut = (x) => { x = clamp(x, 0, 1); return x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2; };
// a pop: overshoots a little, then settles
const pop = (x) => { x = clamp(x, 0, 1); const c = 1.7; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2; };

let TL;
const images = new Map(); // src → decoded Image, so a frame never waits on the network

async function preload(src) {
  if (!isPicture(src) || images.has(src)) return;
  const img = new Image();
  img.src = src;
  images.set(src, img);
  await img.decode().catch(() => {});
}

window.loadTimeline = async (timeline) => {
  TL = timeline;
  const srcs = [];
  for (const s of TL.segments) {
    srcs.push(s.icon, s.logo, ...(s.icons ?? []));
    for (const f of s.frames ?? []) srcs.push(f.src);
  }
  for (let i = 0; i < srcs.length; i += 32) await Promise.all(srcs.slice(i, i + 32).map(preload));
  return true;
};

const segmentAt = (t) => {
  const i = TL.segments.findIndex((s) => t >= s.start && t < s.start + s.dur);
  return i === -1 ? TL.segments.length - 1 : i;
};

// ---------- a shot: the recorded screen, a camera, the finger ----------

// recording time for a shot's local time: the recording starts once the
// swipe in is done and plays at `speed` (faster when it runs long)
const recTime = (s, lt) => clamp((lt - s.rec.lead) * s.rec.speed, 0, s.rec.duration);

function frameAt(s, rt) {
  let pick = s.frames[0];
  for (const f of s.frames) { if (f.t <= rt) pick = f; else break; }
  return pick;
}

// where the camera is: scale and offset of the screen, following the last
// tap or focus before rt, eased over half a second (in recording time)
function camera(s, rt) {
  const { w, h } = s.screen;
  const base = SCREEN_W / w;
  const view = (cx, cy, zoom = 1) => {
    const sc = base * zoom;
    const tx = zoom > 1 ? clamp(W / 2 - sc * cx, W - 36 - sc * w, 36) : (W - sc * w) / 2;
    const ty = clamp((TOP + H) / 2 + 40 - sc * cy, H - 40 - sc * h, TOP);
    return { sc, tx, ty };
  };
  const keys = [{ t: 0, v: view(w / 2, 0) }];
  for (const e of s.events) {
    if (e.type === "tap" || e.type === "hold") keys.push({ t: e.t, v: view(e.x, e.y, 1) });
    if (e.type === "focus" || e.type === "overlay") keys.push({ t: e.t, v: view(e.x + e.w / 2, e.y + e.h / 2, e.zoom ?? 1.3) });
  }
  // each key starts a move from wherever the camera is at that moment
  let from = keys[0].v;
  let to = keys[0].v;
  let start = 0;
  for (let i = 1; i < keys.length && keys[i].t <= rt; i++) {
    from = interpolate(from, to, easeInOut((keys[i].t - start) / MOVE));
    to = keys[i].v;
    start = keys[i].t;
  }
  return interpolate(from, to, easeInOut((rt - start) / MOVE));
}
const MOVE = 0.55; // seconds of recording time a camera move takes
const interpolate = (a, b, k) => ({ sc: a.sc + (b.sc - a.sc) * k, tx: a.tx + (b.tx - a.tx) * k, ty: a.ty + (b.ty - a.ty) * k });

function drawPhone(el, s, lt, { dx = 0, dy = 0, opacity = 1 } = {}) {
  const rt = recTime(s, lt);
  const cam = camera(s, rt);
  const screen = el.querySelector(".screen");
  const shot = el.querySelector(".shot");
  screen.style.width = `${s.screen.w}px`;
  screen.style.height = `${s.screen.h}px`;
  shot.style.width = `${s.screen.w}px`;
  shot.style.height = `${s.screen.h}px`;
  const src = frameAt(s, rt).src;
  if (shot.getAttribute("src") !== src) shot.src = src;
  el.style.display = "block";
  el.style.opacity = opacity;
  el.style.transform = `translate(${cam.tx - PAD * cam.sc + dx}px, ${cam.ty - PAD * cam.sc + dy}px) scale(${cam.sc})`;
  // the finger: a ring where it taps, a filling ring while it holds
  const fx = el.querySelector(".fx");
  fx.replaceChildren();
  for (const e of s.events) {
    const since = rt - e.t;
    if (e.type === "tap" && since > -0.12 && since < 0.55) {
      const k = clamp((since + 0.12) / 0.67, 0, 1);
      const dot = document.createElement("div");
      dot.className = "tap";
      const r = 18 + 26 * easeOut(k);
      Object.assign(dot.style, { left: `${e.x}px`, top: `${e.y}px`, width: `${r * 2}px`, height: `${r * 2}px`, opacity: String(1 - k * k) });
      fx.append(dot);
    }
    // a coach's marks over a picture, drawn in over most of a second
    // (until the next tap: Next takes the picture away)
    const gone = e.type === "overlay" && s.events.some((x) => x.type === "tap" && x.t > e.t && x.t <= rt);
    if (e.type === "overlay" && since >= 0 && !gone) {
      const box = document.createElement("div");
      Object.assign(box.style, { position: "absolute", left: `${e.x}px`, top: `${e.y}px`, width: `${e.w}px`, height: `${e.h}px` });
      box.innerHTML = overlaySvg(e.shapes, e.w, e.h, easeOut(since / 0.9));
      fx.append(box);
    }
    if (e.type === "hold" && since > -0.1 && since < e.ms / 1000 + 0.4) {
      const k = clamp(since / (e.ms / 1000), 0, 1);
      const size = 120;
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "hold-ring");
      svg.setAttribute("width", size);
      svg.setAttribute("height", size);
      svg.style.left = `${e.x}px`;
      svg.style.top = `${e.y}px`;
      svg.style.opacity = since > e.ms / 1000 ? String(1 - (since - e.ms / 1000) / 0.4) : "1";
      const c = 2 * Math.PI * 48;
      svg.innerHTML = `<circle cx="60" cy="60" r="30" fill="rgb(21 101 192 / 0.35)" stroke="#fff" stroke-width="3"/>
        <circle cx="60" cy="60" r="48" fill="none" stroke="rgb(255 255 255 / 0.4)" stroke-width="8"/>
        <circle cx="60" cy="60" r="48" fill="none" stroke="#ffca28" stroke-width="8" stroke-linecap="round"
          stroke-dasharray="${c * k} ${c}" transform="rotate(-90 60 60)"/>`;
      fx.append(svg);
    }
  }
}

function drawCaption(s, lt, prevSameCaption) {
  $("caption").style.display = "flex";
  setIcon($("cap-icon"), s.icon);
  $("cap-icon").style.visibility = s.icon ? "visible" : "hidden";
  $("cap-title").textContent = s.title;
  $("cap-line").textContent = s.line ?? "";
  const k = prevSameCaption ? 1 : easeOut(lt / 0.35);
  $("caption").style.opacity = String(k);
  $("caption").style.transform = `translateY(${(1 - k) * 24}px)`;
}

// ---------- the cards ----------

function drawCard(s, lt) {
  const card = $("card");
  card.style.display = "flex";
  card.style.background = s.color ?? "transparent";
  const out = s.kind === "end" ? 1 : clamp((s.dur - lt) / 0.25, 0, 1); // fades as the next shot swipes in
  card.style.opacity = String(out);
  const logo = $("card-logo");
  const icon = $("card-icon");
  logo.style.display = s.logo ? "block" : "none";
  icon.style.display = s.icon ? "block" : "none";
  if (s.logo && logo.getAttribute("src") !== s.logo) logo.src = s.logo;
  if (s.icon) setIcon(icon, s.icon);
  const p = pop(lt / 0.5);
  logo.style.transform = icon.style.transform = `scale(${0.4 + 0.6 * p})`;
  logo.style.opacity = icon.style.opacity = String(clamp(lt / 0.2, 0, 1));
  const tk = easeOut((lt - 0.2) / 0.35);
  $("card-title").textContent = s.title ?? "";
  $("card-title").style.opacity = String(tk);
  $("card-title").style.transform = `translateY(${(1 - tk) * 30}px)`;
  const lk = easeOut((lt - 0.4) / 0.35);
  $("card-line").textContent = s.line ?? "";
  $("card-line").style.opacity = String(lk);
  $("card-line").style.transform = `translateY(${(1 - lk) * 24}px)`;
  const row = $("card-icons");
  const icons = s.icons ?? [];
  if (row.childElementCount !== icons.length) {
    row.replaceChildren(...icons.map((src) => Object.assign(document.createElement("img"), { src, alt: "" })));
  }
  [...row.children].forEach((img, i) => {
    const k = pop((lt - 0.7 - i * 0.1) / 0.4);
    img.style.opacity = String(clamp((lt - 0.7 - i * 0.1) / 0.15, 0, 1));
    img.style.transform = `scale(${Math.max(0, k)})`;
  });
}

// ---------- one frame ----------

window.renderAt = async (t) => {
  const i = segmentAt(t);
  const s = TL.segments[i];
  const lt = t - s.start;
  const prev = TL.segments[i - 1];
  const a = $("phone-a");
  const b = $("phone-b");
  a.style.display = b.style.display = "none";
  $("card").style.display = "none";
  $("caption").style.display = "none";
  $("caption-band").style.display = s.kind === "shot" ? "block" : "none";

  if (s.kind === "shot") {
    const swipe = easeOut(lt / 0.4);
    if (s.joined) {
      // the same screen going on (a page read aloud, Next tapped): no swipe
      drawPhone(a, s, lt);
    } else if (prev?.kind === "shot" && lt < 0.4) {
      // the last screen slides away left as this one comes in from the right
      drawPhone(b, prev, prev.dur, { dx: -W * swipe });
      drawPhone(a, s, lt, { dx: W * (1 - swipe) });
    } else if (lt < 0.4) {
      drawPhone(a, s, lt, { dy: 260 * (1 - swipe), opacity: swipe });
      if (prev?.kind !== "shot") { drawCard(prev, prev.dur - 0.25 + Math.min(lt, 0.25)); $("card").style.opacity = String(1 - clamp(lt / 0.25, 0, 1)); }
    } else {
      drawPhone(a, s, lt);
    }
    drawCaption(s, lt, prev?.kind === "shot" && prev.title === s.title);
  } else {
    drawCard(s, lt);
  }

  $("progress-fill").style.width = `${(100 * t) / TL.duration}%`;
  await Promise.all([...document.images].filter((img) => img.src && !img.complete).map((img) => img.decode().catch(() => {})));
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return true;
};
