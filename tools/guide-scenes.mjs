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

// ---------- the daily-life tools ----------
// Their setups may await (a tap, then the card it opens) and change the
// device's settings the way the set-up page in another tab would: saved,
// then a "storage" event, which device.js listens for — so a scene needs no
// reload, here or in the smoke run (tools/smoke/app.mjs), which runs every
// scene below as well.

// page helpers, for the setups below
const HELPERS = `
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];
  const shown = (sel) => { const el = $(sel); return !!el && el.getClientRects().length > 0; };
  const deviceSettings = (settings) => {
    localStorage.setItem("simplify-device-v1", JSON.stringify({
      hidden: [], picturesOnly: false, speak: true, classCode: null, className: null, tools: {}, ...settings,
    }));
    dispatchEvent(new StorageEvent("storage", { key: "simplify-device-v1" }));
  };
  // pick a picture in the picture picker, as a finger would
  const pickPicture = async (id) => {
    await pause(100);
    $('.pp-pic[data-picture="' + id + '"]').click();
    $(".pp-done").click();
    await pause(300);
  };
  // press and hold "Hold to open set-up", then lift the finger
  const hold = async () => {
    const btn = $("#tool-setup .hold-btn");
    const finger = { bubbles: true, pointerId: 7, button: 0, isPrimary: true, pointerType: "touch" };
    btn.dispatchEvent(new PointerEvent("pointerdown", finger));
    await pause(1700);
    btn.dispatchEvent(new PointerEvent("pointerup", finger));
    await pause(700);
  };
`;
// Now and next, filled in the way an adult does it: ＋ Add and a picture,
// then more in My day; then Done on the first card.
const MORNING = `
  $("#tool-now-next .nn-add-first").click();
  await pickPicture("brush-teeth");
  $$("#tool-now-next .nn-view")[1].click();
  await pause(500);
  for (const id of ["bus", "school", "home"]) {
    $("#tool-now-next .nn-add").click();
    await pickPicture(id);
    await pause(300);
  }
  $$("#tool-now-next .nn-view")[0].click();
  await pause(500);
  $("#tool-now-next .nn-done").click();
  await pause(800);
`;

// My class: this device follows 3 Kindness, and has its latest page saved
const CODE = "K7M3RQP9T";
const CLASS_PAGE = `# Washing hands
We wash our hands before we eat.

[How to wash hands](https://youtu.be/dQw4w9WgXcQ)
---
## At the sink
1. Wet your hands
2. Put on soap
3. Rub and rinse
---
All done. Now we can eat.`;
const CLASS = `
  localStorage.setItem("simplify-class-v1", JSON.stringify({
    code: "${CODE}", name: "3 Kindness", checkedAt: Date.now(),
    latest: { pageId: "p1", title: "Washing hands", markdown: ${JSON.stringify(CLASS_PAGE)},
      publishedAt: new Date(Date.now() - 3600e3).toISOString() },
  }));
  deviceSettings({ classCode: "${CODE}", className: "3 Kindness" });
  await pause(200);
`;

const scene = (out, path, setup, expect) => ({ ...SCREEN, out: `img/guide/${out}.png`, path, setup: HELPERS + setup, expect });

Object.assign(SCENES, {
  // the minute buttons, with one "While I wait" picture an adult added
  "wait-pick": scene("screen-wait-pick", "/#wait", `
    $("#tool-wait .wait-while-add").click();
    await pickPicture("read");
    document.activeElement.blur();
    scrollTo(0, 0);
  `, `document.querySelectorAll('#tool-wait .wait-min').length === 5 &&
    document.querySelectorAll('#tool-wait .wait-while-list li').length === 1`),

  // a 5-minute wait, two minutes in: the clock is moved on, not waited for
  wait: scene("screen-wait", "/#wait", `
    $("#tool-wait .wait-while-add").click();
    await pickPicture("read");
    $('#tool-wait .wait-min[data-minutes="5"]').click();
    const realNow = Date.now;
    Date.now = () => realNow.call(Date) + 2 * 60 * 1000 + 5000;
    await pause(1500);
    document.activeElement.blur();
  `, `document.querySelector('#tool-wait .wait-words').textContent.startsWith('3 minutes')`),

  "i-need": scene("screen-i-need", "/#i-need", ``,
    `[...document.querySelectorAll('#tool-i-need .need-card')].filter((c) => c.getClientRects().length).length === 7`),

  "i-need-card": scene("screen-i-need-card", "/#i-need", `
    $('#tool-i-need .need-card[data-card="break"]').click();
    await pause(400);
    document.activeElement.blur();
  `, `document.querySelector('.card-sheet')?.open && document.querySelector('.card-words').textContent === 'I need a break'`),

  "i-need-hurts": scene("screen-i-need-hurts", "/#i-need", `
    $('#tool-i-need .need-card[data-card="hurts"]').click();
    await pause(500);
    document.activeElement.blur();
  `, `!!document.querySelector('#tool-i-need .hurts-spot[data-region="tummy"]')`),

  "show-card": scene("screen-show-card", "/#show-card", ``,
    `document.querySelectorAll('#tool-show-card .sc-card').length === 6`),

  "show-card-stop": scene("screen-show-card-stop", "/#show-card", `
    deviceSettings({ tools: { "show-card": { stop: "Bishan Interchange" } } });
    await pause(100);
    $('#tool-show-card .sc-card[data-card="bell"]').click();
    await pause(400);
    document.activeElement.blur();
  `, `document.querySelector('.card-sheet')?.open && document.querySelector('.card-sheet').textContent.includes('My stop: Bishan Interchange')`),

  // a morning of four cards, the first one done
  "now-next": scene("screen-now-next", "/#now-next", MORNING + `
    document.activeElement.blur();
  `, `document.querySelector('#tool-now-next .nn-now .nn-words').textContent === 'Bus' &&
    document.querySelector('#tool-now-next .nn-next .nn-words').textContent === 'School'`),

  // the same morning as My day, with a change said on one card
  "my-day": scene("screen-my-day", "/#now-next", MORNING + `
    $$("#tool-now-next .nn-view")[1].click();
    await pause(500);
    const school = $$("#tool-now-next .nn-item").find((li) => li.querySelector(".nn-face .nn-words")?.textContent === "School");
    school.querySelector(".nn-toggle").click();
    await pause(500);
    document.activeElement.blur();
    scrollTo(0, 0);
  `, `document.querySelectorAll('#tool-now-next .nn-item').length === 4 &&
    document.querySelector('#tool-now-next .nn-item.is-now .nn-face .nn-words')?.textContent === 'Bus'`),

  // the rest of the menu: My day and Talk
  "menu-more": scene("screen-menu-more", "/", `
    $('#menu h2[data-group="my-day"]').scrollIntoView({ block: "start" });
    scrollBy(0, -12);
  `, `!document.getElementById('menu').hidden`),

  // a device that follows a class: My class comes first on the menu
  "menu-class": scene("screen-menu-class", "/", CLASS + `
    await pause(300);
  `, `document.querySelector('#menu li[data-tool="my-class"]')?.getClientRects().length > 0`),

  // the class this device follows, as the coach published it: no internet
  // needed, the device's copy
  "my-class": scene("screen-my-class", "/", CLASS + `
    location.hash = "#my-class";
    await pause(600);
    document.activeElement.blur();
  `, `document.querySelector('#tool-my-class .mc-screen h2')?.textContent === 'Washing hands'`),

  // a class's QR code opens the app at #join=<code>: "Is this your class?".
  // The class is looked up from a stand-in for Google's server (on
  // 127.0.0.1 the app asks nobody else).
  "class-join": scene("screen-class-join", "/", `
    localStorage.setItem("simplify-class-emulator", "on");
    const realFetch = window.fetch.bind(window);
    window.fetch = async (input, options) => {
      const url = String(input?.url ?? input);
      if (!url.startsWith("http://127.0.0.1:8085/")) return realFetch(input, options);
      return new Response(JSON.stringify({ fields: {
        name: { stringValue: "3 Kindness" }, status: { stringValue: "active" }, latest: { nullValue: null },
      } }), { status: 200, headers: { "content-type": "application/json" } });
    };
    location.hash = "#join=${CODE}";
    await pause(800);
    document.activeElement.blur();
  `, `document.querySelector('#tool-setup .cs-question')?.getClientRects().length > 0 &&
    document.querySelector('#tool-setup .cs-ask .cs-name').textContent === '3 Kindness'`),

  // Steps: the routines to choose from, then one step at a time
  steps: scene("screen-steps", "/#steps", ``,
    `document.querySelectorAll('#tool-steps .steps-choose').length >= 3`),

  // Wash hands, on its third step
  "steps-step": scene("screen-steps-step", "/#steps?deck=wash-hands", `
    await pause(300);
    for (let i = 0; i < 2; i++) {
      $("#tool-steps .steps-next").click();
      await pause(500);
    }
    document.activeElement.blur();
  `, `document.querySelector('#tool-steps .steps-picture img')?.getAttribute('src') === '/img/pic/soap.svg'`),

  "setup-hold": scene("screen-setup-hold", "/#setup", ``, `!!document.querySelector('#tool-setup .hold-btn')`),

  setup: scene("screen-setup", "/#setup", `
    await hold();
    document.activeElement.blur();
    scrollTo(0, 0);
  `, `document.querySelector('#tool-setup .setup-settings')?.hidden === false`),
});
