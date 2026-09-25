// Stop and check: every ask and every word its card says
// (public/js/tools/stop-check-cards.js). No dependencies, no runner:
//
//   node tools/test-stop-check.mjs
//
// The words are pinned word for word: they tell a young person what to do
// when someone asks for a code, money or photos. 1799 is the ScamShield
// Helpline (checked on scamshield.gov.sg, 2026-09-26).

import { ASKS, CALL_LINE, STOP_WORDS, cardFor } from "../public/js/tools/stop-check-cards.js";
import { pictureSrc } from "../public/js/pictures.js";

const json = (v) => JSON.stringify(v);
const WORDS = {
  code: ["A code (OTP)", "Never tell anyone a code sent to your phone. Not the bank. Not the police."],
  singpass: ["Singpass or IC", "Never give anyone your Singpass, your password or your IC number."],
  password: ["My password", "Never tell anyone your password."],
  card: ["My card number", "Never give anyone the numbers on your bank card."],
  money: ["Send money", "Do not send money or gift cards. Do not use PayNow for them."],
  link: ["Tap a link", "Do not tap the link. Do not download the app."],
  photos: ["Photos of me", "Never send photos of your body."],
  meet: ["Meet up", "Never meet someone you know only from your phone."],
  secret: ["Keep a secret", "Do not keep it secret. Tell your family."],
  prize: ["I won a prize", "A real prize never asks for money or a code."],
};

const cases = [
  ["the asks, in order", ASKS.map((a) => a.id).join(" "), Object.keys(WORDS).join(" ")],
  ...ASKS.map((a) => [`${a.id}: label and rule`, json([a.label, a.rule]), json(WORDS[a.id])]),
  ["every ask has a picture", ASKS.filter((a) => !pictureSrc(a.picture)).map((a) => a.id).join(" "), ""],
  ["labels are 1–4 words (design principles)", ASKS.filter((a) => a.label.split(" ").length > 4).map((a) => a.id).join(" "), ""],
  ["the card's words", STOP_WORDS, "STOP. Show a trusted adult."],
  ["who to call", CALL_LINE, "No adult near? Call 1799, the ScamShield Helpline."],
  ["a card", json(cardFor("code")), json({ picture: "stop", words: STOP_WORDS, lines: [WORDS.code[1], CALL_LINE] })],
  ["the stop picture is there", pictureSrc("stop"), "/img/pic/stop.svg"],
  ["not an ask", cardFor("bus"), null],
  ["an inherited name is not an ask", cardFor("__proto__"), null],
];

let failed = 0;
for (const [name, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name.padEnd(44)} → ${String(got)}` + (ok ? "" : `\n      expected ${want}`));
}
console.log(failed ? `\n${failed} of ${cases.length} failed` : `\nall ${cases.length} passed`);
process.exit(failed ? 1 : 0);
