// Class codes (docs/platform/data-model.md): 9 characters from a set
// of 31 with no look-alikes (no 0, 1, I, L or O), stored without dashes and
// shown in threes, "K7M-3RQ-P9T". A typed code is forgiven, never refused:
// upper-cased, then every character outside the set is dropped, so
// "k7m-3rq p9t" is K7M3RQP9T. Pure, no DOM: node tools/test-coach.mjs.

export const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const CODE_LENGTH = 9;

export function normaliseCode(input) {
  let code = "";
  for (const ch of String(input ?? "").toUpperCase()) {
    if (ALPHABET.includes(ch)) code += ch;
  }
  return code;
}

export function isClassCode(code) {
  return typeof code === "string" && code.length === CODE_LENGTH && normaliseCode(code) === code;
}

// "K7M3RQP9T" → "K7M-3RQ-P9T" (a shorter code, while it is being typed, in
// as many threes as it has)
export function formatCode(code) {
  return String(code ?? "").match(/.{1,3}/g)?.join("-") ?? "";
}

// A new random code, for the admin approving a new class. Rejection
// sampling, so every character is equally likely: 248 = 8 × 31, so a random
// byte below 248 maps evenly onto the 31 characters (byte % 31); the 8 bytes
// from 248 up would favour the first 8 characters, so they are drawn again.
// randomBytes(n) gives n random bytes (crypto.getRandomValues; a test passes
// its own).
export function newClassCode(randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  let code = "";
  while (code.length < CODE_LENGTH) {
    for (const byte of randomBytes(16)) {
      if (byte < 248 && code.length < CODE_LENGTH) code += ALPHABET[byte % ALPHABET.length];
    }
  }
  return code;
}

// What a class's QR code opens: the learner app, straight at "Is this your
// class?". The fragment never reaches a server.
export function joinUrl(code) {
  return `https://simplify.whiz.coach/#join=${code}`;
}
