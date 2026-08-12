// Currency definitions. Adding another currency = add an entry here plus
// nothing else: the picker renders whatever notes/coins it finds.
// Colors follow the real notes/coins so users can match by color + number.

export const CURRENCIES = {
  SGD: {
    code: "SGD",
    symbol: "$",
    notes: [
      { valueCents: 200,   label: "$2",   speech: "2 dollars",   color: "#7b4fa6" },
      { valueCents: 500,   label: "$5",   speech: "5 dollars",   color: "#2e7d32" },
      { valueCents: 1000,  label: "$10",  speech: "10 dollars",  color: "#c62828" },
      { valueCents: 5000,  label: "$50",  speech: "50 dollars",  color: "#1565c0" },
      { valueCents: 10000, label: "$100", speech: "100 dollars", color: "#e65100" },
    ],
    coins: [
      { valueCents: 5,   label: "5¢",  speech: "5 cents",  color: "#8d99a6" },
      { valueCents: 10,  label: "10¢", speech: "10 cents", color: "#8d99a6" },
      { valueCents: 20,  label: "20¢", speech: "20 cents", color: "#8d99a6" },
      { valueCents: 50,  label: "50¢", speech: "50 cents", color: "#8d99a6" },
      { valueCents: 100, label: "$1",  speech: "1 dollar", color: "#b08d2f" },
    ],
  },
};

export const DEFAULT_CURRENCY = "SGD";

// Look up a denomination (note or coin) by its cents value.
export function findDenomination(currency, valueCents) {
  const c = CURRENCIES[currency];
  return (
    c.notes.find((n) => n.valueCents === valueCents) ||
    c.coins.find((n) => n.valueCents === valueCents) ||
    null
  );
}

export function isCoin(currency, valueCents) {
  return CURRENCIES[currency].coins.some((c) => c.valueCents === valueCents);
}

// Stylized SVG for a note: flat rectangle in the note's real-world dominant
// color with a huge denomination numeral. Deliberately not a reproduction of
// the actual note design (MAS restricts realistic currency images), and more
// legible than a photo for users who match money by color + number.
export function noteSvg(note) {
  return `
    <svg viewBox="0 0 240 110" role="img" aria-hidden="true" focusable="false">
      <rect x="2" y="2" width="236" height="106" rx="10"
            fill="${note.color}" stroke="rgba(0,0,0,0.35)" stroke-width="3"/>
      <rect x="10" y="10" width="220" height="90" rx="6"
            fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="2"/>
      <text x="120" y="66" text-anchor="middle" fill="#ffffff"
            font-family="system-ui, sans-serif" font-size="52" font-weight="800">${note.label}</text>
      <text x="120" y="94" text-anchor="middle" fill="rgba(255,255,255,0.85)"
            font-family="system-ui, sans-serif" font-size="16" font-weight="600">SGD</text>
    </svg>`;
}

export function coinSvg(coin) {
  return `
    <svg viewBox="0 0 100 100" role="img" aria-hidden="true" focusable="false">
      <circle cx="50" cy="50" r="47" fill="${coin.color}" stroke="rgba(0,0,0,0.35)" stroke-width="3"/>
      <circle cx="50" cy="50" r="38" fill="none" stroke="rgba(255,255,255,0.6)" stroke-width="2"/>
      <text x="50" y="62" text-anchor="middle" fill="#ffffff"
            font-family="system-ui, sans-serif" font-size="30" font-weight="800">${coin.label}</text>
    </svg>`;
}
