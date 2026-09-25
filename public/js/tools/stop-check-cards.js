// Stop and check's asks and what the card says: plain data and pure
// functions, no DOM, so node tools/test-stop-check.mjs can pin every word.
// The screen is in stop-check.js, beside this file (docs/learner/stop-check.md).
//
// The screen asks "Someone asked me for:" and shows ASKS, in this order, in
// places that never move. A tap puts one card over the whole screen: STOP,
// what to do (show a trusted adult), the one plain rule for that ask, and
// who to call when no adult is near. The words follow the Singapore Police
// Force's and ScamShield's advice (checked 2026-09-26: scamshield.gov.sg —
// the 24-hour ScamShield Helpline is 1799; government officers never ask you
// to transfer money or give bank log-in details). Literal words only: no
// "scammer", no "trick" — the rule, said plainly.
//
//   id       stable
//   picture  a picture id from ../pictures.js (TOOL_PICTURES, or the set)
//   label    the few words on the screen (1–4)
//   rule     the line under STOP on the card: never … / do not …

const ask = (id, picture, label, rule) => Object.freeze({ id, picture, label, rule });

export const ASKS = Object.freeze([
  ask("code", "code", "A code (OTP)", "Never tell anyone a code sent to your phone. Not the bank. Not the police."),
  ask("singpass", "id-card", "Singpass or IC", "Never give anyone your Singpass, your password or your IC number."),
  ask("password", "password", "My password", "Never tell anyone your password."),
  ask("card", "bank-card", "My card number", "Never give anyone the numbers on your bank card."),
  ask("money", "send-money", "Send money", "Do not send money or gift cards. Do not use PayNow for them."),
  ask("link", "link", "Tap a link", "Do not tap the link. Do not download the app."),
  ask("photos", "photo", "Photos of me", "Never send photos of your body."),
  ask("meet", "meet-up", "Meet up", "Never meet someone you know only from your phone."),
  ask("secret", "secret", "Keep a secret", "Do not keep it secret. Tell your family."),
  ask("prize", "prize", "I won a prize", "A real prize never asks for money or a code."),
]);

export const STOP_WORDS = "STOP. Show a trusted adult.";
export const CALL_LINE = "No adult near? Call 1799, the ScamShield Helpline.";

const BY_ID = new Map(ASKS.map((a) => [a.id, a]));

// What the card shows for one ask (the shape openCard() takes), or null
export function cardFor(id) {
  const a = BY_ID.get(id);
  if (!a) return null;
  return { picture: "stop", words: STOP_WORDS, lines: [a.rule, CALL_LINE] };
}
