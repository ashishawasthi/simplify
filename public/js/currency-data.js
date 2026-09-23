// Currency definitions. Adding another currency = add an entry here plus
// nothing else: the picker renders whatever notes/coins it finds.
//
// The pictures are drawn to be recognised, not copied. Singapore's Currency
// Act (s.20, Gazette Notification 2078 of 2006) covers "any photograph,
// drawing or design resembling" a note or coin, and putting any design used
// on one into a product always needs MAS permission. So these borrow only
// physical facts from MAS's own descriptions — the colour, the metal, the
// size, the value — and never the artwork: no portrait, coat of arms, lion,
// cowrie shells, landmarks, orchid, "SINGAPORE" lettering, signatures,
// serial numbers, security features, octagon frame or bead ring.

export const CURRENCIES = {
  SGD: {
    code: "SGD",
    symbol: "$",
    // Portrait series. sizeMm is [length, height] from MAS; bigger notes are
    // longer, and the pictures keep that. color/deep: the note's own colour,
    // dark enough that its white numerals stay above 4.5:1. ink: text on it.
    notes: [
      { valueCents: 200,   label: "$2",   speech: "2 dollars",   sizeMm: [126, 63],
        color: "#7b4fa6", deep: "#4f2d75", ink: "#ffffff" },
      { valueCents: 500,   label: "$5",   speech: "5 dollars",   sizeMm: [133, 66],
        color: "#2e7d32", deep: "#1b5e20", ink: "#ffffff" },
      { valueCents: 1000,  label: "$10",  speech: "10 dollars",  sizeMm: [141, 69],
        color: "#c62828", deep: "#8e1b1b", ink: "#ffffff" },
      { valueCents: 5000,  label: "$50",  speech: "50 dollars",  sizeMm: [156, 74],
        color: "#1565c0", deep: "#0b3d7a", ink: "#ffffff" },
      { valueCents: 10000, label: "$100", speech: "100 dollars", sizeMm: [162, 77],
        color: "#c64a00", deep: "#8a3300", ink: "#ffffff" },
    ],
    // Third series, the current issue. sizeMm is the diameter from MAS: the
    // 5¢ is the smallest and the $1 the biggest. The 5¢ is brass-plated
    // (gold), 10¢–50¢ nickel-plated (silver), and the $1 has a silver centre
    // inside a gold ring. color/ink are for the small tray chips.
    coins: [
      { valueCents: 5,   label: "5¢",  speech: "5 cents",  sizeMm: 16.75, metal: "gold",
        color: "#d9b25c", ink: "#3a2a00" },
      { valueCents: 10,  label: "10¢", speech: "10 cents", sizeMm: 18.5,  metal: "silver",
        color: "#c9d0d6", ink: "#1a1a1a" },
      { valueCents: 20,  label: "20¢", speech: "20 cents", sizeMm: 21,    metal: "silver",
        color: "#c9d0d6", ink: "#1a1a1a" },
      { valueCents: 50,  label: "50¢", speech: "50 cents", sizeMm: 23,    metal: "silver",
        color: "#c9d0d6", ink: "#1a1a1a" },
      { valueCents: 100, label: "$1",  speech: "1 dollar", sizeMm: 24.65, metal: "bimetal",
        color: "#d9b25c", ink: "#3a2a00" },
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

// How big to draw a note or coin next to the biggest of its kind (0–1), so
// money on screen keeps the real size order.
export function pictureScale(currency, denom) {
  const c = CURRENCIES[currency];
  if (isCoin(currency, denom.valueCents)) {
    return denom.sizeMm / Math.max(...c.coins.map((k) => k.sizeMm));
  }
  return denom.sizeMm[0] / Math.max(...c.notes.map((n) => n.sizeMm[0]));
}

// Gradient ids must be unique on the page: the same note can be drawn in the
// picker, "Show me" and an answer at once, and a url(#id) that resolves into
// a closed dialog paints nothing.
let uid = 0;

// A note: its real proportions, two tones of its real colour, a light oval
// where every banknote has its watermark, and the value — large, and small
// in two corners, as notes print it.
export function noteSvg(note) {
  const id = `note${++uid}`;
  const [w, h] = note.sizeMm.map((mm) => mm * 2); // 1 unit = 0.5 mm
  const big = Math.round(h * 0.44);
  const small = Math.round(h * 0.15);
  return `
    <svg class="note-svg" viewBox="0 0 ${w} ${h}" role="img" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${note.color}"/>
          <stop offset="1" stop-color="${note.deep}"/>
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="${w - 4}" height="${h - 4}" rx="10"
            fill="url(#${id})" stroke="rgba(0,0,0,0.35)" stroke-width="3"/>
      <ellipse cx="${Math.round(w * 0.2)}" cy="${h / 2}" rx="${Math.round(h * 0.22)}"
               ry="${Math.round(h * 0.22)}" fill="#ffffff" fill-opacity="0.3"/>
      <rect x="10" y="10" width="${w - 20}" height="${h - 20}" rx="6"
            fill="none" stroke="#ffffff" stroke-opacity="0.55" stroke-width="2"/>
      <g fill="${note.ink}" font-family="system-ui, sans-serif" font-weight="800"
         stroke="rgba(0,0,0,0.3)" stroke-width="2" paint-order="stroke">
        <text x="${Math.round(w * 0.62)}" y="${Math.round(h / 2 + big * 0.36)}"
              text-anchor="middle" font-size="${big}">${note.label}</text>
        <text x="20" y="${Math.round(h * 0.25)}" font-size="${small}">${note.label}</text>
        <text x="${w - 20}" y="${h - 18}" text-anchor="end"
              font-size="${small}">${note.label}</text>
      </g>
    </svg>`;
}

// Metal colours: a light highlight, the body, the shaded edge, and dark ink
// for the value — real coins show it as raised metal, not as white print.
const METALS = {
  gold:   { light: "#f6e3a1", mid: "#d9b25c", dark: "#a8801f", edge: "#7a5c14", ink: "#3a2a00" },
  silver: { light: "#fbfcfd", mid: "#c9d0d6", dark: "#8e98a2", edge: "#5f6973", ink: "#1a1a1a" },
};

function metalGradient(id, m) {
  return `
    <radialGradient id="${id}" cx="0.38" cy="0.32" r="0.8">
      <stop offset="0" stop-color="${m.light}"/>
      <stop offset="0.55" stop-color="${m.mid}"/>
      <stop offset="1" stop-color="${m.dark}"/>
    </radialGradient>`;
}

// A coin: its metal, a raised rim, and the value. The $1 is two metals — a
// silver centre inside a gold ring, the centre 16 mm of its 24.65.
export function coinSvg(coin) {
  const id = `coin${++uid}`;
  const two = coin.metal === "bimetal";
  const outer = METALS[two ? "gold" : coin.metal];
  const face = two ? METALS.silver : outer;
  const size = coin.label.length > 2 ? 30 : 34;
  return `
    <svg class="coin-svg" viewBox="0 0 100 100" role="img" aria-hidden="true" focusable="false">
      <defs>${metalGradient(id, outer)}${two ? metalGradient(`${id}c`, face) : ""}</defs>
      <circle cx="50" cy="50" r="48" fill="url(#${id})" stroke="${outer.edge}" stroke-width="2.5"/>
      <circle cx="50" cy="50" r="42" fill="none" stroke="${outer.edge}" stroke-opacity="0.45"
              stroke-width="1.5"/>
      ${two ? `<circle cx="50" cy="50" r="31" fill="url(#${id}c)" stroke="${face.edge}"
              stroke-opacity="0.7" stroke-width="1.5"/>` : ""}
      <text x="50" y="${Math.round(50 + size * 0.36)}" text-anchor="middle" fill="${face.ink}"
            font-family="system-ui, sans-serif" font-size="${size}"
            font-weight="800">${coin.label}</text>
    </svg>`;
}

// Either picture, for places that show "a piece of money" of any kind.
export function moneySvg(currency, valueCents) {
  const denom = findDenomination(currency, valueCents);
  return isCoin(currency, valueCents) ? coinSvg(denom) : noteSvg(denom);
}
