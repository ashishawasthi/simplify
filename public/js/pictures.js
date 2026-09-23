// The app's own pictures — one bundled set, so a card looks the same on every
// device and works offline (emoji are drawn differently on Android and iPad,
// and a picture from the web would break the same-origin CSP). Now and next,
// My day, I need, Show a card and Steps use them, through the picture picker.
//
// Each picture: id (stable — saved cards keep it), file (under /img/pic/),
// words (its default label: plain Singapore English, 1–3 words, literal) and
// group (the picker's sections, PICTURE_GROUPS). A picture that belongs in two
// groups is listed once, under the first: toilet and all-done are in "day", so
// a tool picks its own cards by id, never by group.
// Two ids share a file when they are the same picture: drink-water and water,
// wait and more-time, wash-hands and rinse, card-reader and tap-card.
// Every file is square (viewBox 0 0 128 128); tools/test-pictures.mjs checks
// the list against the files.
//
// MENU_ICONS (below) are the menu's own icons. They are not in PICTURES, so
// the picker never offers them as cards.
//
// Where the files come from
// - Noto Emoji by Google (https://github.com/googlefonts/noto-emoji), whose
//   svg/ folder is licensed Apache-2.0 (its own svg/LICENSE; only the fonts
//   are OFL), taken from release v2.051 and minified. NOTO_FILES below maps
//   each of our files to its upstream file name, so an update can be repeated
//   with `node tools/make-pictures.mjs`. Each such file says so in a comment,
//   and public/img/pic/LICENSE.txt (served beside them) carries the licence;
//   the repository's notice is THIRD_PARTY_NOTICES.md.
// - Every other file is our own drawing, made by the same script (change one
//   there, not here): the Singapore things Noto has no picture of — an HDB
//   block for home, MRT train, bus, travel card, card reader, paying by QR,
//   hawker stall, kopi, food tray, tray return, the bus's stop bell, a recess
//   lunch box, a plate with a spoon and fork — and the tablet, a glass of
//   water, too loud, therapy, and the steps for washing hands (the tap on
//   and off), returning a tray (the halal side of the tray return) and
//   paying by card (the reader's green tick, a plain bank card). Some are
//   built around Noto parts (hands, faces, an apple, a spoon, bubbles); the
//   script and THIRD_PARTY_NOTICES.md list which.
// Like the money pictures, nothing copies an operator's or a brand's design:
// no logo, livery or card artwork; the only lettering is the bus's route
// number.

export const PICTURE_GROUPS = Object.freeze([
  { id: "day", label: "My day" },
  { id: "need", label: "I need" },
  { id: "out", label: "Going out" },
  { id: "steps", label: "Steps" },
].map(Object.freeze));

// file defaults to the id; pass another id's file to share it
const pic = (id, words, group, file = id) => Object.freeze({ id, file: `${file}.svg`, words, group });

// Picker order: related pictures next to each other.
export const PICTURES = Object.freeze([
  // ---- My day ----
  pic("school", "School", "day"),
  pic("home", "Home", "day"),
  pic("bus", "Bus", "day"),
  pic("mrt-train", "MRT", "day"),
  pic("walk", "Walk", "day"),
  pic("car", "Car", "day"),
  pic("taxi", "Taxi", "day"),
  pic("lift", "Lift", "day"),
  pic("eat", "Eat", "day"),
  pic("snack", "Snack", "day"),
  pic("drink-water", "Drink water", "day", "water"),
  pic("recess", "Recess", "day"),
  pic("hawker-stall", "Hawker centre", "day"),
  pic("kopi", "Kopi", "day"),
  pic("cook", "Cook", "day"),
  pic("play", "Play", "day"),
  pic("playground", "Playground", "day"),
  pic("park", "Park", "day"),
  pic("swim", "Swim", "day"),
  pic("exercise", "Exercise", "day"),
  pic("music", "Music", "day"),
  pic("draw", "Draw", "day"),
  pic("read", "Read", "day"),
  pic("homework", "Homework", "day"),
  pic("library", "Library", "day"),
  pic("computer", "Computer", "day"),
  pic("tablet", "Tablet", "day"),
  pic("tv", "TV", "day"),
  pic("game", "Game", "day"),
  pic("shop", "Shop", "day"),
  pic("quiet-time", "Quiet time", "day"),
  pic("therapy", "Therapy", "day"),
  pic("doctor", "Doctor", "day"),
  pic("haircut", "Haircut", "day"),
  pic("toilet", "Toilet", "day"),
  pic("wash-hands", "Wash hands", "day"),
  pic("brush-teeth", "Brush teeth", "day"),
  pic("shower", "Shower", "day"),
  pic("get-dressed", "Get dressed", "day"),
  pic("pack-bag", "Pack bag", "day"),
  pic("clean-up", "Clean up", "day"),
  pic("sleep", "Sleep", "day"),
  pic("wait", "Wait", "day", "more-time"),
  pic("changed", "Changed", "day"),
  pic("all-done", "All done", "day"),

  // ---- I need ---- (toilet and all-done are above, in My day)
  pic("help", "Help", "need"),
  pic("break", "Break", "need"),
  pic("water", "Water", "need"),
  pic("too-loud", "Too loud", "need"),
  pic("stop", "Stop", "need"),
  pic("hurts", "It hurts", "need"),
  pic("want", "I want", "need"),
  pic("more-time", "More time", "need"),
  pic("dont-understand", "I don't understand", "need"),
  pic("yes", "Yes", "need"),
  pic("no", "No", "need"),

  // ---- Going out ----
  pic("seat", "Seat", "out"),
  pic("bus-stop", "Bus stop", "out"),
  pic("bell", "Press the bell", "out"),
  pic("travel-card", "Travel card", "out"),
  pic("card-reader", "Pay by card", "out"),
  pic("pay-qr", "Pay by QR", "out"),
  pic("receipt", "Receipt", "out"),
  pic("tray", "Tray", "out"),
  pic("tray-return", "Tray return", "out"),
  pic("phone", "Phone", "out"),
  pic("cannot-talk", "I cannot talk", "out"),
  pic("please", "Please", "out"),
  pic("thank-you", "Thank you", "out"),
  pic("family", "Family", "out"),
  pic("space", "Give us space", "out"),

  // ---- Steps ----
  pic("tap-water", "Turn on tap", "steps"),
  pic("tap-off", "Turn off tap", "steps"),
  pic("soap", "Use soap", "steps"),
  pic("rub-hands", "Rub hands", "steps"),
  pic("rinse", "Rinse hands", "steps", "wash-hands"),
  pic("dry-hands", "Dry hands", "steps"),
  pic("carry-tray", "Carry tray", "steps"),
  pic("tray-return-halal", "Halal side", "steps"),
  pic("wipe-table", "Wipe table", "steps"),
  pic("check-amount", "Check amount", "steps"),
  pic("tap-card", "Tap card", "steps", "card-reader"),
  pic("reader-tick", "Wait for tick", "steps"),
  pic("bank-card", "My card", "steps"),
]);

// Our file → its upstream file in noto-emoji v2.051 (svg/), for the pictures
// and the menu icons. Files not here are our own drawings
// (tools/make-pictures.mjs).
export const NOTO_FILES = Object.freeze({
  "school.svg": "emoji_u1f3eb.svg",
  "walk.svg": "emoji_u1f6b6.svg",
  "car.svg": "emoji_u1f697.svg",
  "taxi.svg": "emoji_u1f695.svg",
  "lift.svg": "emoji_u1f6d7.svg",
  "snack.svg": "emoji_u1f36a.svg",
  "cook.svg": "emoji_u1f373.svg",
  "play.svg": "emoji_u26bd.svg",
  "playground.svg": "emoji_u1f6dd.svg",
  "park.svg": "emoji_u1f333.svg",
  "swim.svg": "emoji_u1f3ca.svg",
  "exercise.svg": "emoji_u1f3c3.svg",
  "music.svg": "emoji_u1f3b5.svg",
  "draw.svg": "emoji_u1f3a8.svg",
  "read.svg": "emoji_u1f4d6.svg",
  "homework.svg": "emoji_u1f4dd.svg",
  "library.svg": "emoji_u1f4da.svg",
  "computer.svg": "emoji_u1f4bb.svg",
  "tv.svg": "emoji_u1f4fa.svg",
  "game.svg": "emoji_u1f3ae.svg",
  "shop.svg": "emoji_u1f6d2.svg",
  "quiet-time.svg": "emoji_u1f3a7.svg",
  "doctor.svg": "emoji_u1fa7a.svg",
  "haircut.svg": "emoji_u1f487.svg",
  "toilet.svg": "emoji_u1f6bd.svg",
  "brush-teeth.svg": "emoji_u1faa5.svg",
  "shower.svg": "emoji_u1f6bf.svg",
  "get-dressed.svg": "emoji_u1f455.svg",
  "pack-bag.svg": "emoji_u1f392.svg",
  "clean-up.svg": "emoji_u1f9f9.svg",
  "sleep.svg": "emoji_u1f6cc.svg",
  "more-time.svg": "emoji_u23f3.svg",
  "changed.svg": "emoji_u1f500.svg",
  "all-done.svg": "emoji_u2705.svg",
  "help.svg": "emoji_u1f64b.svg",
  "break.svg": "emoji_u1f6cb.svg",
  "stop.svg": "emoji_u1f6d1.svg",
  "hurts.svg": "emoji_u1f915.svg",
  "want.svg": "emoji_u1f449.svg",
  "dont-understand.svg": "emoji_u2753.svg",
  "yes.svg": "emoji_u1f44d.svg",
  "no.svg": "emoji_u1f44e.svg",
  "seat.svg": "emoji_u1f4ba.svg",
  "bus-stop.svg": "emoji_u1f68f.svg",
  "receipt.svg": "emoji_u1f9fe.svg",
  "phone.svg": "emoji_u1f4f1.svg",
  "cannot-talk.svg": "emoji_u270d.svg",
  "please.svg": "emoji_u1f64f.svg",
  "thank-you.svg": "emoji_u1f60a.svg",
  "family.svg": "emoji_u1f46a.svg",
  "space.svg": "emoji_u2194.svg",
  "soap.svg": "emoji_u1f9fc.svg",
  "check-amount.svg": "emoji_u1f440.svg",
  // menu icons only (MENU_ICONS)
  "menu-now-next.svg": "emoji_u27a1.svg",
  "menu-steps.svg": "emoji_u1f463.svg",
  "menu-i-need.svg": "emoji_u270b.svg",
  "menu-show-card.svg": "emoji_u1faaa.svg",
  "menu-my-day.svg": "emoji_u1f5d3.svg",
  "menu-talk.svg": "emoji_u1f4ac.svg",
});

// The menu's icons, by tool id and group id (js/tools.js), so the menu looks
// the same on every device: system emoji differ between Android and iPad, and
// 🪪 (Emoji 14, 2021) is an empty box on older Android. A menu-only file is
// named menu-<id>.svg; Wait and My class reuse a picture (⏳ and 🏫 are the
// same Noto drawings). Not in PICTURES, so the picker never shows them.
export const MENU_ICONS = Object.freeze({
  "my-class": "school.svg",
  "my-day": "menu-my-day.svg", // group heading, 🗓 (no date on it)
  "now-next": "menu-now-next.svg", // ➡️
  wait: "more-time.svg", // ⏳
  steps: "menu-steps.svg", // 👣
  talk: "menu-talk.svg", // group heading, 💬
  "i-need": "menu-i-need.svg", // ✋
  "show-card": "menu-show-card.svg", // 🪪
});

const BY_ID = new Map(PICTURES.map((p) => [p.id, p]));

// "/img/pic/<file>", or null for an id that isn't a picture
export function pictureSrc(id) {
  const p = BY_ID.get(id);
  return p ? `/img/pic/${p.file}` : null;
}

// "/img/pic/<file>" for a tool's or group's menu icon, or null if it has none
export function menuIconSrc(id) {
  return typeof id === "string" && Object.hasOwn(MENU_ICONS, id) ? `/img/pic/${MENU_ICONS[id]}` : null;
}

// An <img> for a picture, or null for an unknown id. alt is "" by default:
// the picture's words are usually on screen beside it. width/height are the
// file's own square, so the space is kept before it loads; CSS sets the size.
export function pictureImg(id, { alt = "" } = {}) {
  const src = pictureSrc(id);
  if (!src) return null;
  const img = document.createElement("img");
  img.alt = alt;
  img.width = 128;
  img.height = 128;
  img.decoding = "async";
  img.draggable = false;
  img.src = src;
  return img;
}
