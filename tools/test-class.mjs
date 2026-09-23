// My class, the parts that need no browser: the class markdown parser
// (public/js/class-markdown.js — the coach preview and the Cloud Functions
// use the same file), the class code and the Firestore reading
// (public/js/class-data.js, with a stand-in fetch and localStorage), and
// public/sw.js's fetch handler leaving the class's files, the coach app and
// Firebase's /__/ alone. No dependencies, no runner:
//
//   node tools/test-class.mjs
//
// The rendering, the reader and the set-up section run in real Chrome:
// node tools/smoke.mjs my-class.

import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { parseClassMarkdown, pageMedia, plainText, youtubeId, youtubeEmbed } from "../public/js/class-markdown.js";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const results = [];
const check = (name, got, want) => {
  const g = typeof got === "string" ? got : JSON.stringify(got);
  const w = typeof want === "string" ? want : JSON.stringify(want);
  results.push({ name, ok: g === w, got: g, want: w });
};

// ---------- the markdown, compactly: one line per block ----------

const runs = (inline) => inline.map((r) => (r.bold && r.italic ? `***${r.text}***` : r.bold ? `**${r.text}**`
  : r.italic ? `*${r.text}*` : r.text)).join("");
const blockText = (b) => {
  switch (b.type) {
    case "heading": return `h${b.level} ${runs(b.inline)}`;
    case "paragraph": return `p ${runs(b.inline)}`;
    case "list": return `${b.ordered ? `ol@${b.start}` : "ul"} ${b.items.map(runs).join(" | ")}`;
    case "picture": case "video": return `${b.type} ${b.id} "${b.words}"`;
    case "link": return `link ${b.url} ${b.host} "${b.words}"`;
    case "youtube": return `youtube ${b.id} "${b.words}"`;
    default: return `?? ${JSON.stringify(b)}`;
  }
};
// screens joined by " // ", blocks by " ; "
const md = (text) => parseClassMarkdown(text).screens.map((s) => s.map(blockText).join(" ; ")).join(" // ");

const YT = "dQw4w9WgXcQ";

// ---- blocks ----
check("heading 1", md("# Going to the dentist"), "h1 Going to the dentist");
check("heading 2", md("## Steps"), "h2 Steps");
check("### counts as ##", md("### Small"), "h2 Small");
check("closing #s dropped", md("# Title ##"), "h1 Title");
check("C# keeps its #", md("## Learn C#"), "h2 Learn C#");
check("#hashtag is text", md("#hashtag"), "p #hashtag");
check("####### is text", md("####### seven"), "p ####### seven");
check("empty heading: nothing", md("#\n##   "), "");
check("every line its own paragraph", md("I wash my hands.\nI dry my hands."), "p I wash my hands. ; p I dry my hands.");
check("blank lines and spaces trimmed", md("\n\n   Hello   \n\n"), "p Hello");
check("CRLF", md("One\r\nTwo\rThree"), "p One ; p Two ; p Three");
check("not a string", md(null) + md(undefined) + md(42), "");
check("nothing at all", parseClassMarkdown(""), { screens: [] });

// ---- bold and italic ----
check("bold", md("I sit in the **big** chair."), "p I sit in the **big** chair.");
check("italic", md("Open *wide*"), "p Open *wide*");
check("both", md("***now***"), "p ***now***");
check("italic around bold", parseClassMarkdown("*a **b** c*").screens[0][0].inline,
  [{ text: "a ", bold: false, italic: true }, { text: "b", bold: true, italic: true }, { text: " c", bold: false, italic: true }]);
check("2 * 3 stays", md("2 * 3 = 6"), "p 2 * 3 = 6");
check("unclosed ** stays", md("**unclosed"), "p **unclosed");
check("stars inside bold", md("**a*b**"), "p **a*b**");
check("**** in a line is text", md("a **** b"), "p a **** b");
check("**** alone is a screen break", md("A\n****\nB"), "p A // p B");
check("run joins", parseClassMarkdown("a **b** c").screens[0][0].inline.length, 3);
check("plainText", plainText(parseClassMarkdown("I **really** *like* it").screens[0][0].inline), "I really like it");

// ---- lists ----
check("bullets", md("- a\n- b"), "ul a | b");
check("*, + and • bullets", md("* a\n+ b\n• c"), "ul a | b | c");
check("numbered from 1", md("1. a\n2. b"), "ol@1 a | b");
check("numbered from 3, 1) style", md("3) c\n4) d"), "ol@3 c | d");
check("blank line keeps the list", md("- a\n\n- b"), "ul a | b");
check("a paragraph ends it", md("- a\ntext\n- b"), "ul a ; p text ; ul b");
check("bullets then numbers: two lists", md("- a\n1. b"), "ul a ; ol@1 b");
check("nested items flatten", md("- a\n  - b"), "ul a | b");
check("emphasis in an item", md("- **Stop** here"), "ul **Stop** here");
check("-5 degrees is text", md("-5 degrees"), "p -5 degrees");
check("a picture in an item follows it, numbers go on",
  md("1. a\n2. b ![p](pictures/p1.jpg)\n3. c"), 'ol@1 a | b ; picture p1 "p" ; ol@3 c');
check("an item that is only a picture is the picture", md("- a\n- ![Bus](pictures/bus1.jpg)\n- c"),
  'ul a ; picture bus1 "Bus" ; ul c');
check("an item that is only a link is the button", md("- [Bus guide](https://www.lta.gov.sg/bus)"),
  'link https://www.lta.gov.sg/bus lta.gov.sg "Bus guide"');
check("an item with an image not on the shelf: dropped, list goes on", md("- a\n- ![x](https://e.com/x.jpg)\n- c"), "ul a | c");

// ---- screens ----
check("--- makes screens", md("One\n---\nTwo"), "p One // p Two");
check("***, ___, - - - too", md("A\n***\nB\n___\nC\n- - -\nD"), "p A // p B // p C // p D");
check("no empty screens", md("---\n\n---\nA\n---\n---\n"), "p A");
check("-- is text", md("--"), "p --");

// ---- pictures and videos ----
check("picture", md("![A dentist chair](pictures/abc123.jpg)"), 'picture abc123 "A dentist chair"');
check("video", md("![Washing hands](videos/v_9-X.mp4)"), 'video v_9-X "Washing hands"');
check("words may be empty", md("![](pictures/p.jpg)"), 'picture p ""');
check("emphasis in words is dropped", md("![a **big** bus](pictures/p.jpg)"), 'picture p "a big bus"');
check("a web image: nothing", md("![x](https://evil.example/a.jpg)"), "");
check("a picture as .mp4: nothing", md("![x](pictures/p.mp4)"), "");
check("a video as .jpg: nothing", md("![x](videos/v.jpg)"), "");
check("../ in the path: nothing", md("![x](pictures/../secret.jpg)"), "");
check("a leading ./ or /: nothing", md("![x](./pictures/p.jpg)\n![y](/pictures/p.jpg)"), "");
check("a picture splits a paragraph", md("Look ![bus](pictures/b.jpg) then go"), 'p Look ; picture b "bus" ; p then go');
check("a picture in a heading comes after it", md("# Park ![tree](pictures/t.jpg)"), 'h1 Park ; picture t "tree"');
check("two pictures on a line", md("![a](pictures/a.jpg) ![b](pictures/b.jpg)"), 'picture a "a" ; picture b "b"');
check("an image with a title", md('![a](pictures/a.jpg "The title")'), 'picture a "a"');

// ---- links ----
check("a link alone: a button", md("[Bus guide](https://www.lta.gov.sg/bus)"),
  'link https://www.lta.gov.sg/bus lta.gov.sg "Bus guide"');
check("a link in a sentence: words stay, button after", md("Read [the guide](https://example.com/g) today."),
  'p Read the guide today. ; link https://example.com/g example.com "the guide"');
check("http: words only", md("[site](http://example.com)"), "p site");
check("javascript: words only", md("[click](javascript:alert(1))"), "p click");
check("data: words only", md("[x](data:text/html,hi)"), "p x");
check("user:password@ trick: words only", md("[Bank](https://bank.example@evil.example/)"), "p Bank");
check("a bare https address alone: a button", md("https://www.nlb.gov.sg"), 'link https://www.nlb.gov.sg/ nlb.gov.sg ""');
check("a bare www. address alone: https", md("www.nlb.gov.sg/kids"), 'link https://www.nlb.gov.sg/kids nlb.gov.sg ""');
check("a bare http address: text", md("http://example.com"), "p http://example.com");
check("an address inside a sentence: text", md("Go to https://example.com now"), "p Go to https://example.com now");
check("brackets in an address", md("[Wiki](https://en.wikipedia.org/wiki/Bus_(disambiguation))"),
  'link https://en.wikipedia.org/wiki/Bus_(disambiguation) en.wikipedia.org "Wiki"');
check("<an address>", md("[a](<https://example.com/a b>)"), 'link https://example.com/a%20b example.com "a"');
check("[a [b](url)]: the inner one", md("[a [b](https://x.example/)"), 'p [a b ; link https://x.example/ x.example "b"');
check("brackets that make no link", md("[not a link] (really)"), "p [not a link] (really)");
check("two links on a line: two buttons", md("[A](https://a.example) [B](https://b.example)"),
  'link https://a.example/ a.example "A" ; link https://b.example/ b.example "B"');
check("a host is punycode", md("[x](https://пример.рф)"), 'link https://xn--e1afmkfd.xn--p1ai/ xn--e1afmkfd.xn--p1ai "x"');
check("a link in a heading: after it", md("# Buses [map](https://example.com/m)"),
  'h1 Buses map ; link https://example.com/m example.com "map"');

// ---- YouTube ----
check("[words](youtu.be)", md(`[How to wash hands](https://youtu.be/${YT})`), `youtube ${YT} "How to wash hands"`);
check("bare watch?v=", md(`https://www.youtube.com/watch?v=${YT}&t=30s`), `youtube ${YT} ""`);
check("shorts", md(`https://youtube.com/shorts/${YT}?feature=share`), `youtube ${YT} ""`);
check("embed", md(`[e](https://www.youtube.com/embed/${YT})`), `youtube ${YT} "e"`);
check("nocookie embed", md(`https://www.youtube-nocookie.com/embed/${YT}`), `youtube ${YT} ""`);
check("m. and no scheme", md(`m.youtube.com/watch?v=${YT}`), `youtube ${YT} ""`);
check("http is fine (only the id is used)", md(`[v](http://youtu.be/${YT})`), `youtube ${YT} "v"`);
check("in a list item alone", md(`- https://youtu.be/${YT}`), `youtube ${YT} ""`);
check("in a sentence: a plain link button", md(`Watch [this](https://youtu.be/${YT}) at home`),
  `p Watch this at home ; link https://youtu.be/${YT} youtu.be "this"`);
check("a wrong id length: a link", md("https://youtu.be/short"), 'link https://youtu.be/short youtu.be ""');
check("another site with ?v=: a link", md(`https://evil.example/watch?v=${YT}`),
  `link https://evil.example/watch?v=${YT} evil.example ""`);
check("the player's address", youtubeEmbed(YT), `https://www.youtube-nocookie.com/embed/${YT}?rel=0&playsinline=1`);

check("youtubeId: forms", [
  `https://youtu.be/${YT}`, `youtu.be/${YT}?si=abc`, `https://www.youtube.com/watch?v=${YT}`,
  `https://m.youtube.com/watch?v=${YT}&list=PL1`, `https://youtube.com/shorts/${YT}`,
  `https://www.youtube.com/embed/${YT}?start=5`, `https://www.youtube-nocookie.com/embed/${YT}`,
].map(youtubeId).every((id) => id === YT), true);
check("youtubeId: not YouTube", [
  `https://youtube.com.evil.example/watch?v=${YT}`, `https://evil.example/youtu.be/${YT}`,
  `https://www.youtube.com/watch?v=${YT}x`, `https://www.youtube.com/channel/${YT}`,
  `https://user@youtube.com/watch?v=${YT}`, `https://youtube.com:8080/watch?v=${YT}`,
  `javascript:youtu.be/${YT}`, `https://youtu.be/${YT}/extra`, "", null, 42,
].map(youtubeId), [null, null, null, null, null, null, null, null, null, null, null]);

// ---- plain text: never HTML ----
check("HTML is text", md('<img src=x onerror="alert(1)"> <script>alert(1)</script>'),
  'p <img src=x onerror="alert(1)"> <script>alert(1)</script>');
check("a quote and a table are text", md("> said\n| a | b |"), "p > said ; p | a | b |");

// ---- pageMedia ----
const page = parseClassMarkdown("![a](pictures/a.jpg)\n---\n![v](videos/v.mp4)\n![a again](pictures/a.jpg)\n![x](https://e.example/x.jpg)");
check("pageMedia: each once, in order", pageMedia(page), [{ kind: "picture", id: "a" }, { kind: "video", id: "v" }]);
check("pageMedia: none", pageMedia(parseClassMarkdown("text")), []);

// ---- a whole page, as a coach would write it ----
check("a picture story", md(`# Going to the dentist

![The waiting room](pictures/room1.jpg)
I wait in the waiting room.
---
## The big chair
![The chair](pictures/chair2.jpg)
I sit in the chair. The dentist looks at my teeth.
---
1. Open *wide*
2. Rinse
---
[How to brush teeth](https://youtu.be/${YT})
![Brushing](videos/brush3.mp4)`),
  'h1 Going to the dentist ; picture room1 "The waiting room" ; p I wait in the waiting room. // ' +
  'h2 The big chair ; picture chair2 "The chair" ; p I sit in the chair. The dentist looks at my teeth. // ' +
  "ol@1 Open *wide* | Rinse // " +
  `youtube ${YT} "How to brush teeth" ; video brush3 "Brushing"`);

// ---- nothing that takes long, whatever is typed (20 000 characters is the limit) ----
{
  const t0 = performance.now();
  for (const text of ["[".repeat(20000), "*a ".repeat(7000), `# a${" ".repeat(20000)}b`, "[a](<".repeat(4000),
    `![a](${"x".repeat(3000)} `.repeat(6), "[a](".repeat(5000), "![".repeat(10000), "- ".repeat(10000),
    `${"a".repeat(19990)}**`, "(".repeat(20000), "[x](https://e.example/" + "(".repeat(19000)]) {
    parseClassMarkdown(text);
  }
  const ms = performance.now() - t0;
  check(`pathological lines parse fast (${ms.toFixed(0)} ms)`, ms < 1500, true);
}

// ---------- class-data.js, with a stand-in browser ----------

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.addEventListener = () => {}; // device.js listens for other tabs
globalThis.location = new URL("https://simplify.whiz.coach/");
const data = await import("../public/js/class-data.js");
const { setDevice, getDevice } = await import("../public/js/device.js");

check("alphabet: 31, no 0 1 I L O", [data.ALPHABET.length, /[01ILO]/.test(data.ALPHABET)], [31, false]);
check("normalise", data.normalizeClassCode(" k7m-3rq p9t "), "K7M3RQP9T");
check("normalise drops look-alikes", data.normalizeClassCode("O0I1L-abc"), "ABC");
check("format", data.formatClassCode("k7m3rqp9t"), "K7M-3RQ-P9T");
check("format a part", data.formatClassCode("K7M3R"), "K7M-3R");
check("format nothing", data.formatClassCode(""), "");
check("isClassCode", ["K7M3RQP9T", "K7M-3RQ-P9T", "K7M3RQP9", "K7M3RQP9TX", "k7m3rqp9t", "K7M3RQP9O", null]
  .map(data.isClassCode), [true, false, false, false, false, false, false]);
check("codeFromText: a pasted link", data.codeFromText("https://simplify.whiz.coach/#join=K7M3RQP9T"), "K7M3RQP9T");
check("codeFromText: typed", data.codeFromText("k7m 3rq-p9t"), "K7M3RQP9T");
{
  // bytes 248–255 are thrown away, the rest taken mod 31
  const feed = [255, 248, 0, 30, 31, 61, 62, 247, 100, 200, 5, 6, 7, 8, 9, 10];
  const code = data.newClassCode((bytes) => bytes.set(feed.slice(0, bytes.length)) ?? bytes);
  check("newClassCode: rejection sampling", code, ["0", "30", "31", "61", "62", "247", "100", "200", "5"]
    .map((b) => data.ALPHABET[Number(b) % 31]).join(""));
  const counts = new Map([...data.ALPHABET].map((c) => [c, 0]));
  for (let i = 0; i < 20000; i++) for (const c of data.newClassCode()) counts.set(c, counts.get(c) + 1);
  const mean = (20000 * 9) / 31;
  const spread = Math.max(...[...counts.values()].map((n) => Math.abs(n - mean) / mean));
  check(`newClassCode: even over the alphabet (worst ${(spread * 100).toFixed(1)}% off)`, spread < 0.06, true);
  check("newClassCode: valid", data.isClassCode(data.newClassCode()), true);
}

check("endpoints: the live site asks Google", data.endpoints(new URL("https://simplify.whiz.coach/"), localStorage),
  { firestore: "https://firestore.googleapis.com", storage: "https://firebasestorage.googleapis.com" });
check("endpoints: a preview channel too", data.endpoints(new URL("https://simplify-special--pr7-x.web.app/"), localStorage).firestore,
  "https://firestore.googleapis.com");
const flag = (value) => ({ getItem: () => value });
check("endpoints: localhost asks nobody", data.endpoints(new URL("http://127.0.0.1:5050/"), flag(null)), null);
check("endpoints: localhost, emulators on", data.endpoints(new URL("http://localhost:5050/"), flag("on")),
  { firestore: "http://127.0.0.1:8085", storage: "http://127.0.0.1:9199" });
check("endpoints: localhost, other ports", data.endpoints(new URL("http://127.0.0.1:5050/"),
  flag('{"firestore":"http://127.0.0.1:8185","storage":"http://127.0.0.1:9299"}')),
{ firestore: "http://127.0.0.1:8185", storage: "http://127.0.0.1:9299" });
check("endpoints: only local servers", data.endpoints(new URL("http://127.0.0.1:5050/"),
  flag('{"firestore":"https://evil.example","storage":"http://127.0.0.1:9299"}')), null);
check("endpoints: the flag means nothing on the live site", data.endpoints(new URL("https://simplify.whiz.coach/"),
  flag("on")).storage, "https://firebasestorage.googleapis.com");

const GOOGLE = data.endpoints(new URL("https://simplify.whiz.coach/"));
check("the class's address", data.classDocUrl("K7M3RQP9T", GOOGLE),
  "https://firestore.googleapis.com/v1/projects/simplify-special/databases/(default)/documents/classes/K7M3RQP9T");
check("a picture's address", data.mediaFileUrl("K7M3RQP9T", "picture", "abc", GOOGLE),
  "https://firebasestorage.googleapis.com/v0/b/simplify-special.firebasestorage.app/o/classes%2FK7M3RQP9T%2Fpictures%2Fabc.jpg?alt=media");
check("a video's address", data.mediaFileUrl("K7M3RQP9T", "video", "v1", GOOGLE),
  "https://firebasestorage.googleapis.com/v0/b/simplify-special.firebasestorage.app/o/classes%2FK7M3RQP9T%2Fvideos%2Fv1.mp4?alt=media");

// Firestore's typed JSON, as the REST API sends it
const DOC = {
  name: "projects/simplify-special/databases/(default)/documents/classes/K7M3RQP9T",
  fields: {
    name: { stringValue: "3 Kindness" },
    institution: { stringValue: "awwa-school-napiri" },
    status: { stringValue: "active" },
    latest: { mapValue: { fields: {
      pageId: { stringValue: "p1" },
      title: { stringValue: "The dentist" },
      markdown: { stringValue: "# The dentist\n![Chair](pictures/c1.jpg)" },
      publishedAt: { timestampValue: "2026-09-22T00:05:00.123456Z" },
      publishedBy: { stringValue: "uid1" },
    } } },
    createdAt: { timestampValue: "2026-09-01T00:00:00Z" },
    updatedAt: { timestampValue: "2026-09-22T00:05:00Z" },
  },
  createTime: "2026-09-01T00:00:00Z",
  updateTime: "2026-09-22T00:05:00Z",
};
check("typed JSON: every kind", data.fromFields({
  s: { stringValue: "x" }, i: { integerValue: "42" }, d: { doubleValue: 1.5 }, b: { booleanValue: true },
  n: { nullValue: null }, t: { timestampValue: "2026-01-01T00:00:00Z" }, a: { arrayValue: { values: [{ integerValue: "1" }] } },
  e: { arrayValue: {} }, m: { mapValue: {} }, r: { referenceValue: "projects/p/x" }, u: { geoPointValue: {} },
}), { s: "x", i: 42, d: 1.5, b: true, n: null, t: "2026-01-01T00:00:00Z", a: [1], e: [], m: {}, r: "projects/p/x" });
check("typed JSON: __proto__ is just a key", (() => {
  const o = data.fromFields(JSON.parse('{"__proto__": {"stringValue": "x"}}'));
  return [Object.getPrototypeOf(o) === Object.prototype, Object.hasOwn(o, "__proto__")];
})(), [true, true]);
check("the class from its document", data.classFromDocument("K7M3RQP9T", DOC), {
  code: "K7M3RQP9T", name: "3 Kindness",
  latest: { pageId: "p1", title: "The dentist", markdown: "# The dentist\n![Chair](pictures/c1.jpg)", publishedAt: "2026-09-22T00:05:00.123456Z" },
  checkedAt: 0,
});
check("nothing published: latest null", data.classFromDocument("K7M3RQP9T",
  { fields: { ...DOC.fields, latest: { nullValue: null } } }).latest, null);
check("not active: no class", data.classFromDocument("K7M3RQP9T",
  { fields: { ...DOC.fields, status: { stringValue: "suspended" } } }), null);
check("junk: no class", [data.classFromDocument("K7M3RQP9T", null), data.classFromDocument("K7M3RQP9T", { fields: 5 })], [null, null]);
check("a bad time is no time", data.classFromDocument("K7M3RQP9T", { fields: { ...DOC.fields,
  latest: { mapValue: { fields: { markdown: { stringValue: "x" }, publishedAt: { stringValue: "soon" } } } } } }).latest,
{ pageId: "", title: "", markdown: "x", publishedAt: null });

// fetchClass and refreshClass, with a stand-in server
let asked = [];
let answer = () => new Response(JSON.stringify(DOC), { status: 200, headers: { "content-type": "application/json" } });
globalThis.fetch = async (url, options) => {
  asked.push({ url: String(url), credentials: options?.credentials });
  return answer(url);
};
const fetched = async (code) => {
  asked = [];
  const r = await data.fetchClass(code);
  return r.ok ? `ok ${r.cls.name}` : r.reason;
};
check("fetchClass: found", await fetched("K7M3RQP9T"), "ok 3 Kindness");
check("fetchClass: asks the class's address, no cookies", asked, [{ url: data.classDocUrl("K7M3RQP9T", GOOGLE), credentials: "omit" }]);
check("fetchClass: a bad code asks nobody", [await fetched("K7M3RQP9"), asked.length], ["missing", 0]);
answer = () => new Response("{}", { status: 403 });
check("fetchClass: 403 is missing", await fetched("K7M3RQP9T"), "missing");
answer = () => new Response("{}", { status: 404 });
check("fetchClass: 404 is missing", await fetched("K7M3RQP9T"), "missing");
answer = () => new Response("{}", { status: 503 });
check("fetchClass: 503 is offline (try again)", await fetched("K7M3RQP9T"), "offline");
answer = () => { throw new TypeError("Failed to fetch"); };
check("fetchClass: no network is offline", await fetched("K7M3RQP9T"), "offline");
answer = () => new Response("not json", { status: 200 });
check("fetchClass: junk is offline", await fetched("K7M3RQP9T"), "offline");
answer = () => new Response(JSON.stringify({ fields: { ...DOC.fields, status: { stringValue: "suspended" } } }), { status: 200 });
check("fetchClass: suspended is missing", await fetched("K7M3RQP9T"), "missing");
globalThis.location = new URL("http://127.0.0.1:5050/");
answer = () => { throw new Error("must not be asked"); };
check("fetchClass: localhost without the flag asks nobody", [await fetched("K7M3RQP9T"), asked.length], ["offline", 0]);
globalThis.location = new URL("https://simplify.whiz.coach/");

// refreshing: saved for the device's class only
const SAVED = "simplify-class-v1";
let docNow = DOC;
answer = () => new Response(JSON.stringify(docNow), { status: 200 });
check("refresh: no class, nothing asked", [await data.refreshClass({ force: true }), (asked = [], asked.length)], [{ changed: false }, 0]);
setDevice({ classCode: "K7M3RQP9T", className: "Old name" });
{
  const r = await data.refreshClass();
  check("refresh: first time is a change", [r.changed, r.cls.name, data.savedClass()?.latest?.pageId], [true, "3 Kindness", "p1"]);
  check("refresh: the tile's name follows the class", getDevice().className, "3 Kindness");
}
asked = [];
check("refresh: again at once is too soon", [(await data.refreshClass()).changed, asked.length], [false, 0]);
check("refresh: My class opening, too, just after", [(await data.refreshClass({ force: true })).changed, asked.length], [false, 0]);
{
  const saved = JSON.parse(store.get(SAVED));
  saved.checkedAt -= 60 * 1000; // a minute ago
  store.set(SAVED, JSON.stringify(saved));
}
asked = [];
check("refresh: My class opening a minute later asks", [(await data.refreshClass({ force: true })).changed, asked.length], [false, 1]);
check("refresh: the menu a minute later doesn't", [(await data.refreshClass()).changed, asked.length], [false, 1]);
const age = (ms) => {
  const saved = JSON.parse(store.get(SAVED));
  saved.checkedAt = Date.now() - ms;
  store.set(SAVED, JSON.stringify(saved));
};
age(11 * 60 * 1000);
docNow = { fields: { ...DOC.fields, latest: { mapValue: { fields: { ...DOC.fields.latest.mapValue.fields,
  pageId: { stringValue: "p2" }, markdown: { stringValue: "New page" } } } } } };
check("refresh: 11 minutes on, a new page", (await data.refreshClass()).changed, true);
check("refresh: saved", data.savedClass().latest.markdown, "New page");
age(11 * 60 * 1000);
answer = () => { throw new TypeError("offline"); };
check("refresh: offline keeps the copy", [(await data.refreshClass()).changed, data.savedClass().latest.markdown], [false, "New page"]);
answer = () => new Response("{}", { status: 403 });
age(11 * 60 * 1000);
check("refresh: taken away — nothing to show", [(await data.refreshClass()).changed, data.savedClass().latest, data.savedClass().name],
  [true, null, "3 Kindness"]);
{
  // two refreshes at once share one request
  answer = () => new Response(JSON.stringify(DOC), { status: 200 });
  age(11 * 60 * 1000);
  asked = [];
  const [a, b] = await Promise.all([data.refreshClass(), data.refreshClass({ force: true })]);
  check("refresh: one request for two askers", [asked.length, a.changed, b.changed], [1, true, true]);
}
setDevice({ classCode: "ABCDEFGHJ", className: "Other" });
check("savedClass: only the device's class", data.savedClass(), null);
{
  const snap = data.savedSnapshot();
  data.restoreSnapshot(null);
  check("snapshot: gone, then back", [store.has(SAVED), (data.restoreSnapshot(snap), store.get(SAVED) === snap)], [false, true]);
}
setDevice({ classCode: null, className: null });
await data.forgetClassIfNone();
check("no class: the copy is dropped", store.has(SAVED), false);
check("samePage", [data.samePage(null, null), data.samePage({ latest: null }, { latest: { pageId: "a" } }),
  data.samePage({ latest: { pageId: "a", publishedAt: "t", markdown: "m" } }, { latest: { pageId: "a", publishedAt: "t", markdown: "m" } })],
[true, false, true]);
check("classMedia", data.classMedia({ latest: { markdown: "![a](pictures/a.jpg)\n![v](videos/v.mp4)" } }),
  [{ kind: "picture", id: "a" }, { kind: "video", id: "v" }]);

// "Updated …", in Singapore time
{
  const now = new Date("2026-09-23T10:00:00+08:00"); // a Wednesday
  const words = (iso) => data.publishedWords(iso, now, "Asia/Singapore");
  check("updated: today", words("2026-09-23T08:05:00+08:00"), "today 8:05 am");
  check("updated: this week", words("2026-09-22T20:30:00+08:00"), "Tue 8:30 pm");
  check("updated: earlier", words("2026-09-10T08:05:00+08:00"), "10 Sept");
  check("updated: another year", words("2025-12-31T08:05:00+08:00"), "31 Dec 2025");
  check("updated: a clock behind is today", words("2026-09-23T11:00:00+08:00"), "today 11:00 am");
  check("updated: no time", [words(null), words("soon")], ["", ""]);
}

// ---------- public/sw.js: what its fetch handler leaves to the browser ----------

{
  const handlers = {};
  const sandbox = {
    self: { addEventListener: (type, fn) => { handlers[type] = fn; }, location: new URL("https://simplify.whiz.coach/sw.js") },
    caches: { open: async () => ({ match: async () => undefined }) },
    fetch: async () => new Response("net"),
    URL,
  };
  runInNewContext(readFileSync(join(ROOT, "public", "sw.js"), "utf8"), sandbox);
  const answers = (method, url) => {
    let answered = false;
    handlers.fetch({ request: { method, url }, respondWith: () => { answered = true; } });
    return answered;
  };
  check("sw: its own files, cache first", ["/", "/js/app.js", "/guide/speak", "/img/pic/bus.svg", "/coaching", "/#join=K7M3RQP9T"]
    .map((p) => answers("GET", `https://simplify.whiz.coach${p}`)), [true, true, true, true, true, true]);
  check("sw: not the coach app, not /__/", ["/coach", "/coach/", "/coach/index.html", "/coach/js/app.js", "/coach/guide.html",
    "/__/auth/handler", "/__/firebase/init.json"].map((p) => answers("GET", `https://simplify.whiz.coach${p}`)),
  [false, false, false, false, false, false, false]);
  check("sw: not other sites", [
    "https://firestore.googleapis.com/v1/projects/simplify-special/databases/(default)/documents/classes/K7M3RQP9T",
    "https://firebasestorage.googleapis.com/v0/b/simplify-special.firebasestorage.app/o/x?alt=media",
    "https://www.youtube-nocookie.com/embed/x", "https://simplify-special.web.app/js/app.js",
  ].map((u) => answers("GET", u)), [false, false, false, false]);
  check("sw: never a POST", answers("POST", "https://simplify.whiz.coach/"), false);
}

// ---------- the report ----------

let failed = 0;
for (const r of results) {
  if (r.ok) continue;
  failed++;
  console.log(`FAIL  ${r.name}\n      got:  ${r.got}\n      want: ${r.want}`);
}
console.log(failed ? `\n${failed} of ${results.length} failed` : `all ${results.length} passed`);
process.exit(failed ? 1 : 0);
