// The coach app's pure parts: class codes, the editor's toolbar, dates and
// the Singapore month, picture sizes, spotting an app's built-in browser,
// and institutions (finding, grouping, naming, and which screen a coach
// gets from their profile). No dependencies, no runner:
//
//   node tools/test-coach.mjs

process.env.TZ = "Asia/Singapore"; // dates are shown in the device's time: pin it

const { ALPHABET, normaliseCode, isClassCode, formatCode, newClassCode, joinUrl } =
  await import("../public/coach/js/class-code.js");
const { whenText, sgMonthKey, fitWithin, looksLikeInAppBrowser, number, plural } =
  await import("../public/coach/js/format.js");
const {
  cleanWords, pictureMarkdown, videoMarkdown, youtubeMarkdown, youtubeId,
  insertBlock, toggleHeading, toggleList, toggleBold,
} = await import("../public/coach/js/edit.js");
const {
  MAX_INSTITUTIONS, fold, matches, groupByOrg, placeLine, namesOf, sameList, coachGate, changedAfterApproval, workPlaces,
} = await import("../public/coach/js/institutions.js");

// tools/seed/institutions.json as seeded, plus a retired place and another organisation
const PLACES = [
  { id: "awwa-school-napiri", name: "AWWA School @ Napiri", org: "AWWA", type: "SPED school", area: "Hougang", active: true },
  { id: "awwa-school-bedok", name: "AWWA School @ Bedok", org: "AWWA", type: "SPED school", area: "Bedok", active: true },
  { id: "awwa-eic-hougang", name: "AWWA Early Intervention Centre @ Hougang", org: "AWWA", type: "Early intervention", area: "Hougang", active: true },
  { id: "awwa-eic-fernvale-link", name: "AWWA Early Intervention Centre @ Fernvale Link", org: "AWWA", type: "Early intervention", area: "Sengkang", active: true },
  { id: "old", name: "AWWA Old Centre", org: "AWWA", type: "", area: "", active: false },
  { id: "cafe", name: "Café Élan", org: "Another Society", type: "Day activity centre", area: "Tampines", active: true },
];
const groups = (query, chosen) => JSON.stringify(groupByOrg(PLACES, query, chosen).map((g) => [g.org, g.items.map((i) => i.id)]));
const at = (s) => new Date(s);

// A selection written into the text: [ and ] mark it, | a caret
function sel(marked) {
  const start = marked.search(/[[|]/);
  if (marked[start] === "|") return { text: marked.replace("|", ""), start, end: start };
  const end = marked.indexOf("]") - 1;
  return { text: marked.replace("[", "").replace("]", ""), start, end };
}
function show({ text, start, end }) {
  if (start === end) return `${text.slice(0, start)}|${text.slice(start)}`;
  return `${text.slice(0, start)}[${text.slice(start, end)}]${text.slice(end)}`;
}

// a stand-in for crypto.getRandomValues: the given bytes, over and over
const bytes = (list) => {
  let i = 0;
  return (n) => Uint8Array.from({ length: n }, () => list[i++ % list.length]);
};

// how many of each character, over many codes: every one should be about even
function spread() {
  const counts = new Map([...ALPHABET].map((c) => [c, 0]));
  for (let i = 0; i < 4000; i++) for (const c of newClassCode()) counts.set(c, counts.get(c) + 1);
  const values = [...counts.values()];
  return Math.min(...values) / Math.max(...values) > 0.75;
}

const IPHONE_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.7339.101 Mobile/15E148 Safari/604.1";
const IPHONE_WEBVIEW = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const IPAD_DESKTOP_SAFARI = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15";
const IPAD_DESKTOP_WEBVIEW = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)";
const ANDROID_CHROME = "Mozilla/5.0 (Linux; Android 15; SM-A556E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";
const ANDROID_WEBVIEW = "Mozilla/5.0 (Linux; Android 15; SM-A556E; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36";
const INSTAGRAM = `${IPHONE_WEBVIEW} Instagram 300.0.0.0`;
const WHATSAPP_ANDROID = `${ANDROID_WEBVIEW} WhatsApp/2.25.1`;
const MAC_CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

const tue805 = new Date(2026, 8, 22, 8, 5); // Tue 22 Sep 2026, 8:05 am
const now = new Date(2026, 8, 23, 18, 30); // Wed 23 Sep 2026, 6:30 pm

const cases = [
  // ---- class codes ----
  ["alphabet: 31, no look-alikes", ALPHABET.length === 31 && !/[01ILO]/.test(ALPHABET), true],
  ["normalise: case, dashes, spaces", normaliseCode(" k7m-3rq p9t "), "K7M3RQP9T"],
  ["normalise: look-alikes dropped", normaliseCode("O0I1L K7M"), "K7M"],
  ["normalise: nothing", normaliseCode(undefined), ""],
  ["is a code", isClassCode("K7M3RQP9T"), true],
  ["too short", isClassCode("K7M3RQP9"), false],
  ["lower case is not stored form", isClassCode("k7m3rqp9t"), false],
  ["with an O", isClassCode("K7M3RQP9O"), false],
  ["format", formatCode("K7M3RQP9T"), "K7M-3RQ-P9T"],
  ["format while typing", formatCode("K7M3"), "K7M-3"],
  ["format nothing", formatCode(""), ""],
  ["new code: 9 from the alphabet", isClassCode(newClassCode()), true],
  ["new code: bytes from 248 up are drawn again", newClassCode(bytes([248, 255, 0, 30, 31, 247])),
    `${ALPHABET[0]}${ALPHABET[30]}${ALPHABET[0]}${ALPHABET[30]}${ALPHABET[0]}${ALPHABET[30]}${ALPHABET[0]}${ALPHABET[30]}${ALPHABET[0]}`],
  ["new code: characters evenly spread", spread(), true],
  ["join link", joinUrl("K7M3RQP9T"), "https://simplify.whiz.coach/#join=K7M3RQP9T"],

  // ---- dates and months ----
  ["when: yesterday", whenText(tue805, now), "Tue 8:05 am"],
  ["when: today, afternoon", whenText(new Date(2026, 8, 23, 12, 0), now), "Wed 12:00 pm"],
  ["when: midnight", whenText(new Date(2026, 8, 23, 0, 7), now), "Wed 12:07 am"],
  ["when: 6 days ago", whenText(new Date(2026, 8, 17, 9, 0), now), "Thu 9:00 am"],
  ["when: a week ago", whenText(new Date(2026, 8, 16, 9, 0), now), "16 Sep 9:00 am"],
  ["when: last year", whenText(new Date(2025, 11, 30, 9, 0), now), "30 Dec 2025"],
  ["when: the server's clock a little ahead", whenText(new Date(2026, 8, 23, 18, 31), now), "Wed 6:31 pm"],
  ["when: no date", whenText("not a date", now), ""],
  ["month: Singapore, not UTC", sgMonthKey(new Date(Date.UTC(2026, 8, 30, 16, 30))), "2026-10"],
  ["month: still September in Singapore", sgMonthKey(new Date(Date.UTC(2026, 8, 30, 15, 59))), "2026-09"],
  ["month: new year", sgMonthKey(new Date(Date.UTC(2026, 11, 31, 16, 0))), "2027-01"],
  ["number", number(20000), "20,000"],
  ["plural 1", plural(1, "video"), "1 video"],
  ["plural 5", plural(5, "video"), "5 videos"],

  // ---- picture sizes ----
  ["fit: a phone photo", JSON.stringify(fitWithin(4032, 3024, 1600)), JSON.stringify({ width: 1600, height: 1200 })],
  ["fit: portrait", JSON.stringify(fitWithin(3024, 4032, 1600)), JSON.stringify({ width: 1200, height: 1600 })],
  ["fit: small, never enlarged", JSON.stringify(fitWithin(800, 600, 1600)), JSON.stringify({ width: 800, height: 600 })],
  ["fit: a thin strip keeps 1 px", JSON.stringify(fitWithin(10000, 2, 1600)), JSON.stringify({ width: 1600, height: 1 })],

  // ---- an app's own browser ----
  ["browser: Safari on iPhone", looksLikeInAppBrowser(IPHONE_SAFARI, 5), false],
  ["browser: Chrome on iPhone", looksLikeInAppBrowser(IPHONE_CHROME, 5), false],
  ["browser: an iPhone app's web view", looksLikeInAppBrowser(IPHONE_WEBVIEW, 5), true],
  ["browser: Instagram", looksLikeInAppBrowser(INSTAGRAM, 5), true],
  ["browser: iPad Safari (desktop pages)", looksLikeInAppBrowser(IPAD_DESKTOP_SAFARI, 5), false],
  ["browser: an iPad app's web view", looksLikeInAppBrowser(IPAD_DESKTOP_WEBVIEW, 5), true],
  ["browser: a Mac app's web view (no touch)", looksLikeInAppBrowser(IPAD_DESKTOP_WEBVIEW, 0), false],
  ["browser: Chrome on Android", looksLikeInAppBrowser(ANDROID_CHROME, 5), false],
  ["browser: an Android app's web view", looksLikeInAppBrowser(ANDROID_WEBVIEW, 5), true],
  ["browser: WhatsApp on Android", looksLikeInAppBrowser(WHATSAPP_ANDROID, 5), true],
  ["browser: Chrome on a Mac", looksLikeInAppBrowser(MAC_CHROME, 0), false],

  // ---- institutions ----
  ["institutions: at most 10, as the rules", MAX_INSTITUTIONS, 10],
  ["fold: case, accents, dashes, spaces", fold("  Café–Élan   Centre "), "cafe-elan centre"],
  ["match: every word, anywhere", matches(PLACES[0], "napiri awwa"), true],
  ["match: the area counts", matches(PLACES[0], "hougang"), true],
  ["match: the type counts", matches(PLACES[2], "early"), true],
  ["match: accents forgiven", matches(PLACES[5], "cafe elan"), true],
  ["match: a word that is not there", matches(PLACES[0], "napiri bedok"), false],
  ["match: nothing typed", matches(PLACES[0], "  "), true],
  ["groups: by organisation A–Z, places A–Z, no retired",
    groups(""), JSON.stringify([["Another Society", ["cafe"]], ["AWWA", ["awwa-eic-fernvale-link", "awwa-eic-hougang", "awwa-school-bedok", "awwa-school-napiri"]]])],
  ["groups: a retired place stays while chosen", groups("old", ["old"]), JSON.stringify([["AWWA", ["old"]]])],
  ["groups: searching", groups("school"), JSON.stringify([["AWWA", ["awwa-school-bedok", "awwa-school-napiri"]]])],
  ["groups: nothing matches", groups("zoo"), "[]"],
  ["place line: area · type", placeLine(PLACES[0]), "Hougang · SPED school"],
  ["place line: nothing to say", placeLine(PLACES[4]), ""],
  ["names: in the coach's order", JSON.stringify(namesOf(["awwa-school-bedok", "awwa-school-napiri"], PLACES)), JSON.stringify(["AWWA School @ Bedok", "AWWA School @ Napiri"])],
  ["names: retired and gone still show", JSON.stringify(namesOf(["old", "gone"], PLACES)), JSON.stringify(["AWWA Old Centre (retired)", "An institution no longer listed"])],
  ["names: none", JSON.stringify(namesOf(undefined, PLACES)), "[]"],
  ["same list", sameList(["a", "b"], ["a", "b"]), true],
  ["same list: order matters", sameList(["a", "b"], ["b", "a"]), false],
  ["same list: none and empty", sameList(undefined, []), true],
  ["gate: no profile", coachGate(null), "about"],
  ["gate: a profile from before institutions", coachGate({ name: "A", org: "AWWA School @ Napiri", status: "approved" }), "about"],
  ["gate: waiting", coachGate({ institutions: ["a"], status: "pending" }), "pending"],
  ["gate: waiting, with only a place not in the list", coachGate({ institutions: [], otherPlace: "Rainbow Centre", status: "pending" }), "pending"],
  ["gate: no place at all", coachGate({ institutions: [], otherPlace: "  ", status: "pending" }), "about"],
  ["work places: listed, then the one not in the list",
    JSON.stringify(workPlaces({ institutions: ["a"], otherPlace: " Rainbow Centre " }, [{ id: "a", name: "A School", active: true }])),
    JSON.stringify(["A School", "Rainbow Centre (not in the list yet)"])],
  ["work places: none", JSON.stringify(workPlaces(null, [])), "[]"],
  ["gate: no status yet counts as waiting", coachGate({ institutions: ["a"] }), "pending"],
  ["gate: declined", coachGate({ institutions: ["a"], status: "declined" }), "declined"],
  ["gate: approved (suspended is said on My classes)", coachGate({ institutions: ["a"], status: "approved", suspended: true }), "approved"],
  ["changed after approval", changedAfterApproval({ status: "approved", decidedAt: at("2026-09-01"), institutionsChangedAt: at("2026-09-20") }), true],
  ["changed before approval", changedAfterApproval({ status: "approved", decidedAt: at("2026-09-20"), institutionsChangedAt: at("2026-09-01") }), false],
  ["never changed", changedAfterApproval({ status: "approved", decidedAt: at("2026-09-20") }), false],
  ["changed, still waiting (nothing to flag)", changedAfterApproval({ status: "pending", institutionsChangedAt: at("2026-09-20") }), false],
  ["changed, approved by the migration (no date)", changedAfterApproval({ status: "approved", institutionsChangedAt: at("2026-09-20") }), true],

  // ---- words and media lines ----
  ["words: one line, no brackets", cleanWords("  Hands [at]\nthe   sink "), "Hands at the sink"],
  ["words: at most 80", cleanWords("a".repeat(100)).length, 80],
  ["picture line", pictureMarkdown("abc123", "Hands under the tap"), "![Hands under the tap](pictures/abc123.jpg)"],
  ["video line", videoMarkdown("v1", "Washing hands"), "![Washing hands](videos/v1.mp4)"],
  ["youtube line", youtubeMarkdown("dQw4w9WgXcQ", "How to wash hands"), "[How to wash hands](https://youtu.be/dQw4w9WgXcQ)"],
  ["youtube line, no words", youtubeMarkdown("dQw4w9WgXcQ", " "), "[Video](https://youtu.be/dQw4w9WgXcQ)"],

  // ---- YouTube links ----
  ["yt: watch", youtubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s"), "dQw4w9WgXcQ"],
  ["yt: watch, v not first", youtubeId("https://www.youtube.com/watch?feature=share&v=dQw4w9WgXcQ"), "dQw4w9WgXcQ"],
  ["yt: short link with ?si", youtubeId("https://youtu.be/dQw4w9WgXcQ?si=abcdEFGH"), "dQw4w9WgXcQ"],
  ["yt: no https", youtubeId("youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ"],
  ["yt: mobile", youtubeId("https://m.youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ"],
  ["yt: shorts", youtubeId("https://youtube.com/shorts/dQw4w9WgXcQ?feature=share"), "dQw4w9WgXcQ"],
  ["yt: embed", youtubeId("https://www.youtube.com/embed/dQw4w9WgXcQ"), "dQw4w9WgXcQ"],
  ["yt: nocookie embed", youtubeId("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0"), "dQw4w9WgXcQ"],
  ["yt: live", youtubeId("https://www.youtube.com/live/dQw4w9WgXcQ"), "dQw4w9WgXcQ"],
  ["yt: a channel", youtubeId("https://www.youtube.com/@SomeChannel"), null],
  ["yt: a playlist", youtubeId("https://www.youtube.com/playlist?list=PL123"), null],
  ["yt: id too short", youtubeId("https://youtu.be/dQw4w9WgXc"), null],
  ["yt: another site", youtubeId("https://vimeo.com/123456789"), null],
  ["yt: look-alike host", youtubeId("https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ"), null],
  ["yt: not a link", youtubeId("dQw4w9WgXcQ"), null],
  ["yt: javascript:", youtubeId("javascript:alert(1)//youtu.be/dQw4w9WgXcQ"), null],

  // ---- insert a block (picture, video, YouTube, next screen) ----
  ["block into nothing", show(insertBlock(sel("|"), "---")), "---\n\n|"],
  ["block at the end of a line", show(insertBlock(sel("Hello|"), "---")), "Hello\n\n---\n\n|"],
  ["block mid-sentence splits it", show(insertBlock(sel("Hello |world"), "X")), "Hello\n\nX\n\n|world"],
  ["block between paragraphs", show(insertBlock(sel("One\n\n|Two"), "X")), "One\n\nX\n\n|Two"],
  ["block on an empty line", show(insertBlock(sel("One\n|\nTwo"), "X")), "One\n\nX\n\n|Two"],
  ["block replaces a selection", show(insertBlock(sel("One [old] two"), "X")), "One\n\nX\n\n|two"],
  ["block: extra blank lines kept tidy", show(insertBlock(sel("One\n\n\n|"), "X")), "One\n\nX\n\n|"],

  // ---- heading ----
  ["heading on", show(toggleHeading(sel("Going to the |dentist"))), "## Going to the |dentist"],
  ["heading off", show(toggleHeading(sel("## Going to the |dentist"))), "Going to the |dentist"],
  ["heading from #", show(toggleHeading(sel("# Big|"))), "## Big|"],
  ["heading, caret in the stars", show(toggleHeading(sel("#|# Title"))), "|Title"],
  ["heading on the second line", show(toggleHeading(sel("One\nT|wo\nThree"))), "One\n## T|wo\nThree"],

  // ---- list ----
  ["list: two lines", show(toggleList(sel("[Soap\nWater]"))), "[- Soap\n- Water]"],
  ["list: off again", show(toggleList(sel("[- Soap\n- Water]"))), "[Soap\nWater]"],
  ["list: blank lines left alone", show(toggleList(sel("[Soap\n\nWater]"))), "[- Soap\n\n- Water]"],
  ["list: numbers become bullets", show(toggleList(sel("[1. Soap\n2. Water]"))), "[- Soap\n- Water]"],
  ["list: selection ending on a newline", show(toggleList(sel("[Soap\n]Water"))), "[- Soap]\nWater"],
  ["list: caret", show(toggleList(sel("So|ap"))), "- So|ap"],

  // ---- bold ----
  ["bold: nothing selected", show(toggleBold(sel("I |go"))), "I **[bold words]**go"],
  ["bold: a word", show(toggleBold(sel("I [go] home"))), "I [**go**] home"],
  ["bold: spaces stay outside", show(toggleBold(sel("I[ go ]home"))), "I[ **go** ]home"],
  ["bold: off, stars selected", show(toggleBold(sel("I [**go**] home"))), "I [go] home"],
  ["bold: off, stars outside", show(toggleBold(sel("I **[go]** home"))), "I [go] home"],
  ["bold: two lines, each bold", show(toggleBold(sel("[One\nTwo]"))), "[**One**\n**Two**]"],
];

let failed = 0;
for (const [name, got, want] of cases) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name.padEnd(44)} → ${JSON.stringify(got)}` +
    (ok ? "" : `\n      expected ${JSON.stringify(want)}`));
}

console.log(failed ? `\n${failed} of ${cases.length} failed` : `\nall ${cases.length} passed`);
process.exit(failed ? 1 : 0);
