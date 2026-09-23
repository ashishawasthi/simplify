// Smoke scenes for Now and next and its My day view — node tools/smoke.mjs now-next
//
// Scene code is written as real functions, so Node checks their syntax when
// it loads this file, and sent to the page as source, as in app.mjs. A day is
// seeded into localStorage once per scene (sessionStorage remembers it was),
// so a reload inside a scene shows what the tool saved, not the seed again.
// Taps in My day are spaced by pause(500) and Done's by pause(700): the tool
// ignores a second tap that comes sooner (a bounce).

const inPage = (fn) => `(${fn})()`;
const run = (fn) => `await (${fn})();`;

const HELPERS = `
  window.shown = (sel) => { const el = document.querySelector(sel); return !!el && el.getClientRects().length > 0; };
  window.pause = (ms) => new Promise((r) => setTimeout(r, ms));
  window.nn = (sel) => document.querySelector("#tool-now-next " + sel);
  window.nnAll = (sel) => [...document.querySelectorAll("#tool-now-next " + sel)];
  window.nnShown = (sel) => shown("#tool-now-next " + sel);
  window.saved = () => JSON.parse(localStorage.getItem("simplify-now-next-v1") ?? "null");
  window.visibleWidth = (el) => el.getBoundingClientRect().width;
  // the strip, as "✔Brush teeth, [Bus], School …": ✔ done, [ ] Now
  window.strip = () => nnAll(".nn-item").map((li) => {
    const done = li.classList.contains("is-done");
    const words = li.querySelector(done ? ".nn-back .nn-words" : ".nn-face .nn-words").textContent;
    return done ? "✔" + words : li.classList.contains("is-now") ? "[" + words + "]" : words;
  }).join(", ");
  window.nowWords = () => nn(".nn-now .nn-words").textContent;
  window.nextWords = () => nn(".nn-next .nn-words").textContent;
  window.item = (words) => nnAll(".nn-item").find((li) =>
    li.querySelector(".nn-face .nn-words")?.textContent === words ||
    (li.classList.contains("is-done") && li.querySelector(".nn-back .nn-words")?.textContent === words));
  window.toast = () => shown("#toast") ? document.getElementById("toast-text").textContent : null;
  window.pick = async (picture) => {
    await pause(50);
    const dialog = document.querySelector(".picture-picker");
    if (!dialog?.open) throw new Error("the picture picker did not open");
    document.querySelector('.pp-pic[data-picture="' + picture + '"]').click();
    document.querySelector(".pp-done").click();
    await pause(50);
  };
`;

// cards as the picker makes them: a picture and its words
const card = (id, picture, words, changed = false) => ({ id, picture, words, changed });
const DAY = [
  card(1, "brush-teeth", "Brush teeth"),
  card(2, "bus", "Bus"),
  card(3, "school", "School"),
  card(4, "home", "Home"),
];
const seed = (state, device) => `
  if (!sessionStorage.getItem("seeded")) {
    ${state ? `localStorage.setItem("simplify-now-next-v1", ${JSON.stringify(JSON.stringify(state))});` : ""}
    ${device ? `localStorage.setItem("simplify-device-v1", ${JSON.stringify(JSON.stringify(device))});` : ""}
    sessionStorage.setItem("seeded", "1");
  }
`;
const day = (done, view = "now-next", cards = DAY) => HELPERS + seed({ cards, done, view });

const REDUCED = [{ name: "prefers-reduced-motion", value: "reduce" }];

export default [
  // ---------- Now and next ----------
  {
    name: "no cards: one big ＋ Add, no Now, no Done, no ✕; the title has focus",
    path: "/#now-next",
    init: HELPERS,
    expect: inPage(() => nnShown(".nn-add-first") && !nnShown(".nn-now") && !nnShown(".nn-done") &&
      !nnShown(".nn-next") && !nnShown(".nn-all-done") && !shown("#clear-all-wrap") &&
      nn(".nn-add-first").getAttribute("aria-label") === "Add a card" &&
      nnAll(".nn-view").map((b) => b.getAttribute("aria-pressed")).join() === "true,false" &&
      document.activeElement === document.getElementById("screen-title")),
  },
  {
    name: "＋ Add: the picker, titled Now → that card is Now, with focus; Next is All done; saved",
    path: "/#now-next",
    init: HELPERS,
    setup: run(async () => {
      nn(".nn-add-first").click();
      await pause(50);
      if (document.querySelector(".pp-title").textContent !== "Now") throw new Error("the picker is not titled Now");
      await pick("bus");
    }),
    expect: inPage(() => nnShown(".nn-now") && nowWords() === "Bus" &&
      nn(".nn-now .nn-pic img").getAttribute("src") === "/img/pic/bus.svg" && nn(".nn-now .nn-pic img").complete &&
      !nnShown(".nn-add-first") && nnShown(".nn-done") && nextWords() === "All done" &&
      nn(".nn-next .nn-pic img").getAttribute("src") === "/img/pic/all-done.svg" &&
      document.activeElement === nn(".nn-now") && !shown("#clear-all-wrap") &&
      saved()?.cards.length === 1 && saved().cards[0].picture === "bus" && saved().cards[0].words === "Bus"),
  },
  {
    name: "Done: Next moves up to Now, screen readers hear it, the ✕ comes, it is saved",
    path: "/#now-next",
    init: day(0),
    setup: run(() => {
      if (nowWords() !== "Brush teeth" || nextWords() !== "Bus") throw new Error(`${nowWords()} / ${nextWords()}`);
      if (nn(".nn-done").getAttribute("aria-label") !== "Done: Brush teeth") throw new Error("Done's name");
      nn(".nn-done").focus(); // as a tap does
      nn(".nn-done").click();
    }),
    expect: inPage(() => nowWords() === "Bus" && nextWords() === "School" &&
      nn('[role="status"]').textContent === "Now: Bus" && shown("#clear-all-wrap") &&
      document.activeElement === nn(".nn-done") && saved()?.done === 1),
  },
  {
    name: "a double tap on Done moves one card, not two; a tap after a moment moves on",
    path: "/#now-next",
    init: day(0),
    setup: run(async () => {
      nn(".nn-done").click();
      nn(".nn-done").click(); // the bounce
      await pause(300);
      if (nowWords() !== "Bus") throw new Error(`a double tap went to ${nowWords()}`);
      await pause(400);
      nn(".nn-done").click();
    }),
    expect: inPage(() => nowWords() === "School" && saved()?.done === 2),
  },
  {
    name: "the last card: Next is All done; Done → the green All done card, with focus, and no Done",
    path: "/#now-next",
    init: day(3),
    setup: run(() => {
      if (nowWords() !== "Home" || nextWords() !== "All done") throw new Error(`${nowWords()} / ${nextWords()}`);
      nn(".nn-done").click();
    }),
    expect: inPage(() => nnShown(".nn-all-done") && !nnShown(".nn-now") && !nnShown(".nn-done") &&
      !nnShown(".nn-next") && nn(".nn-all-done").textContent === "All done" &&
      document.activeElement === nn(".nn-all-done") && saved()?.done === 4 && shown("#clear-all-wrap")),
  },
  {
    name: "Changed: said on Next and on Now, in words and picture, and to screen readers",
    path: "/#now-next",
    init: day(0, "now-next", [DAY[0], card(2, "library", "Library", true), DAY[2]]),
    setup: run(() => {
      if (!nnShown(".nn-next .nn-badge") || nnShown(".nn-now .nn-badge")) throw new Error("the mark is on the wrong card");
      nn(".nn-done").click();
    }),
    expect: inPage(() => nnShown(".nn-now .nn-badge") && !nnShown(".nn-next .nn-badge") &&
      nn(".nn-now .nn-badge").textContent === "Changed" &&
      nn(".nn-now .nn-badge img").getAttribute("src") === "/img/pic/changed.svg" &&
      nn('[role="status"]').textContent === "Now: Library. Changed"),
  },
  {
    name: "⏳ on Now opens Wait; Back comes back to Now and next",
    path: "/#now-next",
    init: day(1),
    setup: run(async () => {
      if (nn(".nn-wait").getAttribute("aria-label") !== "Wait: open the timer") throw new Error("⏳'s name");
      nn(".nn-wait").click();
      await pause(100);
      if (location.hash !== "#wait" || !shown("#tool-wait")) throw new Error(`at ${location.hash}`);
      history.back();
    }),
    expect: inPage(() => shown("#tool-now-next") && location.hash === "#now-next" && nowWords() === "Bus"),
  },
  {
    name: "the header ✕ starts the day again, the cards kept; Put it back",
    path: "/#now-next",
    init: day(2),
    setup: run(async () => {
      document.getElementById("clear-all").click();
      if (nowWords() !== "Brush teeth" || toast() !== "Back to the start") throw new Error(`${nowWords()} / ${toast()}`);
      if (shown("#clear-all-wrap")) throw new Error("the ✕ stayed with nothing done");
      await pause(300);
      if (saved()?.done !== 0 || saved().cards.length !== 4) throw new Error("not saved");
      document.getElementById("toast-undo").click();
    }),
    expect: inPage(() => nowWords() === "School" && shown("#clear-all-wrap") && saved()?.done === 2),
  },
  {
    name: "a reload shows the same Now; nothing is done again",
    path: "/#now-next",
    init: day(0),
    setup: run(() => {
      nn(".nn-done").click();
      window.before = true;
      setTimeout(() => location.reload(), 50);
    }),
    expect: inPage(() => !window.before && nowWords() === "Bus" && saved()?.done === 1),
  },
  {
    name: "words someone typed are shown as words, never as markup",
    path: "/#now-next",
    init: day(0, "now-next", [card(1, null, "<img src=x onerror=alert(1)>"), card(2, "bus", "<b>Bus</b>")]),
    setup: run(async () => {
      nnAll(".nn-view")[1].click();
      await pause(50);
    }),
    expect: inPage(() => {
      nnAll(".nn-view")[0].click();
      return nowWords() === "<img src=x onerror=alert(1)>" && nextWords() === "<b>Bus</b>" &&
        !document.querySelector('#tool-now-next img[src="x"], #tool-now-next b');
    }),
  },
  {
    name: "saved junk: no error, a usable day",
    path: "/#now-next",
    init: HELPERS + `localStorage.setItem("simplify-now-next-v1", '{"cards":[{"picture":"nope"},7,{"id":"x","words":"Swim"}],"done":"all","view":9}');`,
    expect: inPage(() => nowWords() === "Swim" && nextWords() === "All done" &&
      nnAll(".nn-view")[0].getAttribute("aria-pressed") === "true"),
  },

  // ---------- My day ----------
  {
    name: "My day: done small with ✔, Now big and blue, the rest outlined; kept after a reload",
    path: "/#now-next",
    init: day(1),
    setup: run(() => {
      nnAll(".nn-view")[1].click();
      window.before = true;
      setTimeout(() => location.reload(), 300);
    }),
    expect: inPage(() => {
      const [done, now, later] = nnAll(".nn-item");
      const height = (el) => el.getBoundingClientRect().height;
      return !window.before && nnShown(".nn-my-day") && !nnShown(".nn-now-next") &&
        nnAll(".nn-view").map((b) => b.getAttribute("aria-pressed")).join() === "false,true" &&
        strip() === "✔Brush teeth, [Bus], School, Home" &&
        done.querySelector(".nn-back").getAttribute("aria-label") === "Done: Brush teeth. Go back to it" &&
        done.querySelector(".nn-tick").textContent === "✔" && height(done) < height(later) && height(now) > height(later) &&
        getComputedStyle(now.querySelector(".nn-live")).borderTopColor === "rgb(21, 101, 192)" &&
        now.querySelector(".nn-tag").textContent === "Now" && !later.querySelector(".nn-tag").getClientRects().length &&
        now.querySelector(".nn-up").disabled && !now.querySelector(".nn-down").disabled &&
        item("Home").querySelector(".nn-down").disabled && !item("Home").querySelector(".nn-up").disabled &&
        saved()?.view === "my-day";
    }),
  },
  {
    name: "My day: a done card tapped is Now again; Put it back",
    path: "/#now-next",
    init: day(3, "my-day"),
    setup: run(async () => {
      item("Bus").querySelector(".nn-back").click();
      if (strip() !== "✔Brush teeth, [Bus], School, Home") throw new Error(strip());
      if (toast() !== "Back to Bus") throw new Error(`toast: ${toast()}`);
      if (document.activeElement !== item("Bus").querySelector(".nn-face")) throw new Error("focus is not on Bus");
      document.getElementById("toast-undo").click();
    }),
    expect: inPage(() => strip() === "✔Brush teeth, ✔Bus, ✔School, [Home]" && saved()?.done === 3),
  },
  {
    name: "My day: ↓ and ↑ move a card among those not done; focus goes with it; up past Now it is Now",
    path: "/#now-next",
    init: day(1, "my-day"),
    setup: run(async () => {
      item("School").querySelector(".nn-down").click();
      if (strip() !== "✔Brush teeth, [Bus], Home, School") throw new Error(strip());
      if (document.activeElement !== item("School").querySelector(".nn-up")) throw new Error("focus did not follow (↓ at the end)");
      await pause(500);
      item("Home").querySelector(".nn-up").click();
    }),
    expect: inPage(() => strip() === "✔Brush teeth, [Home], Bus, School" &&
      document.activeElement === item("Home").querySelector(".nn-down") &&
      nn('[role="status"]').textContent === "Moved up: Home. Now: Home" &&
      saved()?.cards.map((c) => c.words).join() === "Brush teeth,Home,Bus,School" && saved().done === 1),
  },
  {
    name: "My day: a double tap on ↑ moves the card once",
    path: "/#now-next",
    init: day(0, "my-day"),
    setup: run(async () => {
      const up = item("Home").querySelector(".nn-up");
      up.click();
      nnAll(".nn-item")[3].querySelector(".nn-up").click(); // the same spot, now School's ↑
      await pause(100);
    }),
    expect: inPage(() => strip() === "[Brush teeth], Bus, Home, School"),
  },
  {
    name: "My day: ✕ takes a card away; Put it back puts it where it was",
    path: "/#now-next",
    init: day(1, "my-day"),
    setup: run(async () => {
      if (item("School").querySelector(".nn-remove").getAttribute("aria-label") !== "Take away: School") throw new Error("✕'s name");
      item("School").querySelector(".nn-remove").click();
      if (strip() !== "✔Brush teeth, [Bus], Home") throw new Error(strip());
      if (toast() !== "Took away School") throw new Error(`toast: ${toast()}`);
      if (document.activeElement !== item("Home").querySelector(".nn-face")) throw new Error("focus did not go to Home");
      await pause(300);
      if (saved()?.cards.length !== 3) throw new Error("not saved");
      document.getElementById("toast-undo").click();
    }),
    expect: inPage(() => strip() === "✔Brush teeth, [Bus], School, Home" &&
      saved()?.cards.map((c) => c.id).join() === "1,2,3,4"),
  },
  {
    name: "My day: ✕ on Now — the next card is Now",
    path: "/#now-next",
    init: day(1, "my-day"),
    setup: run(() => {
      item("Bus").querySelector(".nn-remove").click();
    }),
    expect: inPage(() => strip() === "✔Brush teeth, [School], Home" && toast() === "Took away Bus"),
  },
  {
    name: "My day: Changed on a card — pressed, saved, and shown on Next",
    path: "/#now-next",
    init: day(1, "my-day"),
    setup: run(async () => {
      const toggle = item("School").querySelector(".nn-toggle");
      if (toggle.getAttribute("aria-label") !== "Changed: School") throw new Error("the toggle's name");
      toggle.click();
      if (toggle.getAttribute("aria-pressed") !== "true") throw new Error("not pressed");
      await pause(500);
      nnAll(".nn-view")[0].click();
    }),
    expect: inPage(() => nextWords() === "School" && nnShown(".nn-next .nn-badge") &&
      saved()?.cards[2].changed === true && saved().view === "now-next"),
  },
  {
    name: "My day: a tap on a card's picture picks another; it keeps its place and its Changed",
    path: "/#now-next",
    init: day(1, "my-day", [DAY[0], DAY[1], card(3, "swim", "Swim", true), DAY[3]]),
    setup: run(async () => {
      item("Swim").querySelector(".nn-face").click();
      await pause(50);
      if (document.querySelector(".pp-title").textContent !== "Next") throw new Error("the picker is not titled Next");
      if (!document.querySelector('.pp-pic[data-picture="swim"][aria-pressed="true"]')) throw new Error("Swim not shown picked");
      await pick("library");
    }),
    expect: inPage(() => strip() === "✔Brush teeth, [Bus], Library, Home" &&
      item("Library").querySelector(".nn-toggle").getAttribute("aria-pressed") === "true" &&
      item("Library").querySelector(".nn-face img").getAttribute("src") === "/img/pic/library.svg" &&
      saved()?.cards[2].picture === "library" && saved().cards[2].id === 3 && saved().cards[2].changed === true),
  },
  {
    name: "My day: ＋ Add puts a card at the end; at 12 there is no more ＋ Add, just 'Full'",
    path: "/#now-next",
    init: day(0, "my-day", Array.from({ length: 10 }, (_, i) => card(i + 1, "eat", `Eat ${i + 1}`))),
    setup: run(async () => {
      if (nnShown(".nn-full")) throw new Error("Full with room left");
      nn(".nn-add").click();
      await pause(50);
      if (document.querySelector(".pp-title").textContent !== "Later") throw new Error("the picker is not titled Later");
      await pick("sleep");
      await pause(500);
      nn(".nn-add").focus(); // as a tap does: then ＋ Add goes from under it
      nn(".nn-add").click();
      await pick("home");
    }),
    expect: inPage(() => nnAll(".nn-item").length === 12 && strip().endsWith("Eat 10, Sleep, Home") &&
      !nnShown(".nn-add") && nnShown(".nn-full") && nn(".nn-full").textContent === "Full: 12 cards" &&
      document.activeElement === item("Home").querySelector(".nn-face") && saved()?.cards.length === 12),
  },
  {
    name: "My day: Remove all, then Put it back — the cards and what was done",
    path: "/#now-next",
    init: day(2, "my-day"),
    setup: run(async () => {
      nn(".nn-remove-all").click();
      if (nnAll(".nn-item").length || nnShown(".nn-remove-all")) throw new Error("cards left");
      if (toast() !== "Took away 4 cards") throw new Error(`toast: ${toast()}`);
      if (document.activeElement !== nn(".nn-add")) throw new Error("focus is not on ＋ Add");
      await pause(300);
      if (saved()?.cards.length !== 0) throw new Error("not saved");
      document.getElementById("toast-undo").click();
    }),
    expect: inPage(() => strip() === "✔Brush teeth, ✔Bus, [School], Home" && saved()?.done === 2),
  },
  {
    name: "My day: every button is a 56 px target or more, and each has a name",
    path: "/#now-next",
    init: day(1, "my-day", [DAY[0], DAY[1], card(3, "swim", "Swim", true), DAY[3]]),
    expect: inPage(() => {
      const buttons = nnAll("button").filter((b) => b.getClientRects().length);
      return buttons.length > 10 && buttons.every((b) => {
        const r = b.getBoundingClientRect();
        const name = b.getAttribute("aria-label") || b.textContent.trim();
        return r.width >= 56 && r.height >= 56 && name.length > 0;
      });
    }),
  },

  // ---------- pictures only, motion, size ----------
  {
    name: "pictures only: the pictures say it — words gone from sight, not from screen readers",
    path: "/#now-next",
    init: HELPERS + seed({ cards: [DAY[0], card(2, null, "Grandma"), DAY[2]], done: 0, view: "now-next" },
      { picturesOnly: true }),
    setup: run(async () => {
      const gone = (el) => visibleWidth(el) <= 1;
      const problems = [];
      if (!gone(nn(".nn-now .nn-words")) || nowWords() !== "Brush teeth") problems.push("Now's words");
      if (!gone(nn(".nn-now .nn-tag"))) problems.push("the Now tag");
      if (gone(nn(".nn-next .nn-words")) || nextWords() !== "Grandma") problems.push("a card of words lost them");
      if (!nnAll(".nn-view .pic-words").every(gone) || !nnAll(".nn-view img").every((i) => visibleWidth(i) >= 32)) {
        problems.push("the switches");
      }
      if (!gone(nn(".nn-done .pic-words")) || visibleWidth(nn(".nn-done [aria-hidden]")) < 10) problems.push("Done's ✔");
      nnAll(".nn-view")[1].click();
      await pause(50);
      if (!gone(item("Brush teeth").querySelector(".nn-face .nn-words"))) problems.push("strip words");
      if (!gone(item("Brush teeth").querySelector(".nn-toggle .pic-words"))) problems.push("Changed's word");
      if (gone(nn(".nn-remove-all"))) problems.push("Remove all is for adults: it keeps its words");
      window.problems = problems;
    }),
    expect: inPage(() => window.problems?.length === 0 &&
      item("Brush teeth").querySelector(".nn-face").getAttribute("aria-label") === "Change: Brush teeth"),
  },
  {
    name: "motion: Next slides up into Now after Done",
    path: "/#now-next",
    init: day(0),
    setup: run(() => {
      nn(".nn-done").click();
      window.moving = nn(".nn-now").getAnimations().length > 0 && nn(".nn-next").getAnimations().length > 0;
    }),
    expect: inPage(() => window.moving === true && nowWords() === "Bus"),
  },
  {
    name: "reduced motion: nothing slides — the new Now is simply there",
    path: "/#now-next",
    media: REDUCED,
    init: day(0),
    setup: run(() => {
      nn(".nn-done").click();
      window.moving = document.getAnimations().length > 0;
    }),
    expect: inPage(() => window.moving === false && nowWords() === "Bus"),
  },
  {
    name: "phone: Now, Done and Next all fit on the screen, even with two lines of words",
    path: "/#now-next",
    init: day(0, "now-next", [card(1, "home", "Grandma and Grandpa's house"), card(2, "mrt-train", "MRT to Grandma's")]),
    expect: inPage(() => {
      const bottom = nn(".nn-next").getBoundingClientRect().bottom;
      return bottom <= innerHeight && document.documentElement.scrollWidth <= innerWidth &&
        nn(".nn-now .nn-pic img").getBoundingClientRect().width >= 140;
    }),
  },
  {
    name: "iPad: Now and next fits the screen, the picture bigger; no sideways scroll in My day",
    path: "/#now-next",
    viewport: { width: 768, height: 1024 },
    init: day(1),
    setup: run(async () => {
      if (nn(".nn-next").getBoundingClientRect().bottom > innerHeight) throw new Error("Next is off the screen");
      if (nn(".nn-now .nn-pic img").getBoundingClientRect().width < 240) throw new Error("Now's picture is small");
      nnAll(".nn-view")[1].click();
      await pause(50);
    }),
    expect: inPage(() => document.documentElement.scrollWidth <= innerWidth && strip() === "✔Brush teeth, [Bus], School, Home"),
  },
  {
    name: "iPad on its side: Now, Done and Next still fit",
    path: "/#now-next",
    viewport: { width: 1024, height: 768 },
    init: day(0, "now-next", [card(1, "library", "Library", true), card(2, "mrt-train", "MRT to Grandma's")]),
    expect: inPage(() => nn(".nn-next").getBoundingClientRect().bottom <= innerHeight),
  },
];
