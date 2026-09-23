// Small pure helpers for the coach app: dates in words, the Singapore month
// the usage limits count in, picture sizes, and whether this browser is an
// app's built-in one (where Google sign-in fails). No DOM:
// node tools/test-coach.mjs.

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function clock(d) {
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h % 12 || 12}:${m} ${h < 12 ? "am" : "pm"}`;
}

const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

// When something happened, in the device's own time, as short as it can be
// and still be clear: "Tue 8:05 am" within the last week (today included),
// "12 Sep 8:05 am" earlier this year, "12 Sep 2025" before that. A time a
// little ahead of this device's clock (the server's) reads the same way.
export function whenText(date, now = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const days = Math.round((dayStart(now) - dayStart(d)) / 86400000);
  if (days <= 6) return `${DAYS[d.getDay()]} ${clock(d)}`;
  if (d.getFullYear() === now.getFullYear()) return `${d.getDate()} ${MONTHS[d.getMonth()]} ${clock(d)}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// The month the monthly limits count in: Singapore's (UTC+8, no daylight
// saving), whatever the device's own time zone — "2026-09".
export function sgMonthKey(date = new Date()) {
  const sg = new Date(date.getTime() + 8 * 3600000);
  return `${sg.getUTCFullYear()}-${String(sg.getUTCMonth() + 1).padStart(2, "0")}`;
}

// A picture's size once its long side is at most max pixels (never enlarged)
export function fitWithin(width, height, max) {
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

// Google refuses to sign anyone in inside an app's own browser (WhatsApp,
// Telegram, Instagram, Facebook, LINE, WeChat …). Those show the page in an
// Android WebView ("; wv)" in the user agent) or, on an iPhone or iPad, in a
// web view without "Safari/" in it — Chrome, Firefox and Edge on iOS all
// keep it. An iPad asking for desktop pages says "Macintosh", with touch.
export function looksLikeInAppBrowser(ua = "", maxTouchPoints = 0) {
  if (/\b(FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|WhatsApp|Telegram|Snapchat|musical_ly|TikTok|LinkedInApp)\b/i.test(ua)) {
    return true;
  }
  if (/Android/.test(ua) && /; wv\)/.test(ua)) return true;
  const apple = /\b(iPhone|iPad|iPod)\b/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
  return apple && /AppleWebKit/.test(ua) && !/Safari\//.test(ua);
}

// "12,345" — thousands with commas, as Singapore writes them
export function number(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// "1 video" / "3 videos"
export function plural(n, one, many = `${one}s`) {
  return `${number(n)} ${n === 1 ? one : many}`;
}
