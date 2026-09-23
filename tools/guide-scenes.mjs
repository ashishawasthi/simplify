// The app states the guide's screenshots show, one scene each. Shared by
// tools/shoot-guide.mjs (which captures them) and tools/smoke/app.mjs (which
// checks every one still reaches its expected state), so a change that
// breaks a guide scene fails the smoke run before anyone reshoots the guide.
//
// A scene: the viewport the guide's <img> declares, the path the app opens
// at, a setup expression that leaves the app in the state to capture, and an
// expect expression that is true once it is there.

// Fill a tool the way a user would: setting a box and firing "input" runs
// the same handler as a keystroke. `boxes` is { money, spend, need }; each
// row is a price, or [name, price] for a shopping list. Blur last, so no
// focus ring ends up in the picture.
export const fill = (tool, boxes, rows = []) => `
  const block = document.getElementById('tool-${tool}');
  const set = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
  for (const [box, value] of Object.entries(${JSON.stringify(boxes)})) {
    set(block.querySelector('[data-box="' + box + '"] input'), value);
  }
  ${JSON.stringify(rows)}.forEach((row, i) => {
    const [name, price] = Array.isArray(row) ? row : [null, row];
    if (i > 0) block.querySelector('[data-add-item]').click();
    if (name) set([...block.querySelectorAll('.name-field')].at(-1), name);
    set([...block.querySelectorAll('[data-list] .amount-field input')].at(-1), price);
  });
  document.activeElement.blur();
`;

export const panel = (text) =>
  `document.getElementById('result-headline').textContent + ' | ' + ` +
  `document.getElementById('result-subline').textContent === ${JSON.stringify(text)}`;

// 375x812 at 2x is the 750x1624 the guide's <img>s declare. `path` is where
// the app opens: "/" is the menu, "/#change" a tool.
export const SCREEN = { width: 375, height: 812 };

export const SCENES = {
  menu: {
    ...SCREEN,
    out: "img/guide/screen-menu.png",
    path: "/",
    setup: ``,
    expect: `!document.getElementById('menu').hidden`,
  },
  yes: {
    ...SCREEN,
    out: "img/guide/screen-yes.png",
    path: "/#can-i-buy",
    setup: fill("can-i-buy", { money: "50" }, ["4.50", "12.90"]),
    // Cheap guard against capturing a page that silently failed to set up.
    expect: panel("Can buy | Money left: $32.60"),
  },
  no: {
    ...SCREEN,
    out: "img/guide/screen-no.png",
    path: "/#can-i-buy",
    setup: fill("can-i-buy", { money: "10" }, ["4.50", "12.90"]),
    expect: panel("Cannot buy | You need $7.40 more"),
  },
  picker: {
    ...SCREEN,
    out: "img/guide/screen-picker.png",
    path: "/#can-i-buy",
    // two of one note, so a ×2 on its corner is in the picture
    setup: `
      document.querySelector('#tool-can-i-buy [data-picker-for="money"]').click();
      const tap = (what) => document.querySelector('#picker [aria-label^="Add ' + what + '"]').click();
      tap('5 dollars'); tap('5 dollars'); tap('10 dollars'); tap('5 cents');
      document.activeElement.blur(); // showModal() focused Done; no ring in the shot
    `,
    expect: `document.getElementById('picker-total').textContent === '$20.05'`,
  },
  // change request 6's own example: short by $1.30
  "show-me": {
    ...SCREEN,
    out: "img/guide/screen-show-me.png",
    path: "/#can-i-buy",
    setup: fill("can-i-buy", { money: "5" }, ["6.30"]) + `
      document.getElementById('result-action').click();
      document.activeElement.blur();
    `,
    expect: `document.getElementById('show-money-words').textContent === '$1 + 20¢ + 10¢'`,
  },
  // 7a–7e: the examples in the change-requests PDF
  change: {
    ...SCREEN,
    out: "img/guide/screen-change.png",
    path: "/#change",
    setup: fill("change", { money: "5.00", spend: "2.30" }),
    expect: panel("Change: $2.70 | The money you get back"),
  },
  "next-dollar": {
    ...SCREEN,
    out: "img/guide/screen-next-dollar.png",
    path: "/#next-dollar",
    setup: fill("next-dollar", {}, ["1.20", "0.80", "1.50"]),
    expect: panel("Next dollar: $4 | You get back $0.50"),
  },
  "next-note": {
    ...SCREEN,
    out: "img/guide/screen-next-note.png",
    path: "/#next-note",
    // scrolled so the drawn notes are in the shot as well as the answer
    setup: fill("next-note", {}, ["1.20", "0.80", "1.50"]) + `
      document.querySelector('#tool-next-note [data-pictures]').scrollIntoView({ block: 'end' });
      window.scrollBy(0, 150);
    `,
    expect: panel("Next note: $5 | No $5? Use $10"),
  },
  "make-amount": {
    ...SCREEN,
    out: "img/guide/screen-make-amount.png",
    path: "/#make-amount",
    setup: fill("make-amount", { need: "1.30" }),
    expect: panel("Make $1.30 | $1 + 20¢ + 10¢"),
  },
  "shopping-list": {
    ...SCREEN,
    out: "img/guide/screen-shopping-list.png",
    path: "/#shopping-list",
    setup: fill("shopping-list", { money: "5.00" },
      [["Flour", "1.20"], ["Chocolate chips", "0.80"], ["Milk", "1.50"]]),
    expect: panel("Yes! Within your budget | Money left: $1.50"),
  },
};
