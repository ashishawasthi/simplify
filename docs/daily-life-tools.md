# Daily-life tools for autistic learners — research and roadmap

Research done on 2026-09-23 to decide which tools Simplify should add beyond money, for autistic children and
teens in Singapore. It is kept here so future features can start from it instead of from scratch: the needs, what
already exists, the evidence, Singapore facts that must be right, a scored catalogue of candidate tools (including the
ones deliberately **not** built, and why), the coach platform design, and the decisions taken.

Every Singapore fact below was checked on 2026-09-23 against the source linked in [Sources](#sources). Numbers,
schemes and services change — re-check before relying on one in the app or guide.

## 1. Who and where

- Autistic children and teens across support levels — from minimally-speaking picture users to teens who read and
  speak but freeze under stress — reached through a special-needs organisation in Singapore.
- Mostly Android phones (the family's or the student's own) and iPads (often shared in class). MOE secondary schools
  ban smartphones for the whole school day from January 2026, so in class the tools run on class iPads or school
  devices; personal phones matter most outside school.
- Singapore puts students daily in loud, fast, crowded places — MRT, buses, hawker centres, polyclinic queues — where
  quick speech is expected.
- SPED schools already teach Daily Living Skills (one of the seven domains of MOE's SPED curriculum framework) and
  practise them in real places. A phone carries that teaching into the moment it is needed.

## 2. What already exists

**Paid apps that do many things:** Choiceworks, First Then Visual Schedule HD ($14.99, Apple only), Goally (a
$199–249 device plus a monthly fee), Brili, Tiimo, Otsimo (subscriptions), Proloquo2Go ($299.99, iOS only).

**Free tools that each do one thing:** Cboard (open-source AAC in the browser, works offline), Jellow, MagnusCards,
Accessible Chef, ABA Token Board, First Then Board, Breathe Think Do.

**Made in or for Singapore:** very little, and mostly unmaintained (a 2019 emotions app, 2020 camera-based emotion
games used in one school group, hackathon prototypes marked "not active"). Singapore's own supports are physical: LTA's
Helping Hand cards and lanyard (over 15,000 given out by Nov 2024) and the sensory kits (earmuffs, visual timers,
fidgets) lent at 7 SBS Transit stations and interchanges since Feb 2025.

**What parents, teachers and therapists complain about:** subscriptions and paywalls; Apple-only apps; long set-up and
too many settings; parent and child apps not syncing; ticking, knocking or alarm sounds that make children anxious;
designs aimed at 2–5-year-olds; buying a curriculum as well; services closing and taking the family's data with them;
needing internet.

**What the good ones share:** one kind of board per screen, pictures plus a few words, a clear "done" tick, offline,
no account — which is already how Simplify works.

## 3. Evidence

The NCAEP 2020 review (Steinbrenner et al.; 972 studies, 28 evidence-based practices) is the reference. The practices
that fit a one-screen phone tool:

| Practice (NCAEP 2020) | Tools that deliver it |
|---|---|
| Visual supports | Now and next, My day, Wait, Show a card |
| Task analysis | Steps |
| Functional communication training (asking for a break or help) | I need |
| Social narratives | What will happen (picture stories) |
| Self-management | Steps with fading, Pack my bag |
| Antecedent-based intervention (warnings before a change) | Wait, My day's "Changed" card |
| Prompting and time delay (fading help) | "Fewer steps", hiding mastered pictures |
| AAC | Only small fixed jobs (I need, Say it) — full AAC is left to dedicated apps |
| Technology-aided instruction | The delivery of all of the above |

**Caveat.** A tool inherits the evidence of the practice it delivers; it is only as good as the adult teaching around
it, and it should let help fade. Say "based on visual supports (NCAEP 2020)", never "evidence-based app". Digital
schedule research is mostly in young children (a 2025 review: 17 studies, 58 participants), and only about 11% of
NCAEP studies targeted self-help skills — so new tools are trials, and teacher feedback matters.

**Why these needs matter** (corrected figures):
- About half of autistic teens with average IQ have below-average daily-living skills (Duncan & Bishop 2015).
- Intolerance of uncertainty correlates with anxiety (r = 0.62; Jenkinson 2020) — the same strength as in
  non-autistic samples, but uncertainty is everywhere in a changing school day.
- About half of autistic people have alexithymia — difficulty naming their own feelings (Kinnaird 2019: 49.9% vs 4.9%).
- Time perception differences are widely reported (Casassus 2019).
- 49% of autistic children have tried to wander from a safe place (Anderson 2012).

## 4. Needs a simple phone tool can meet

| Theme | The need | Why a phone helps | Tools |
|---|---|---|---|
| Time, routine, change | What now and next; how long this wait is; what is different today | Always to hand; changed in seconds (paper can't be); time as a shrinking shape | Now and next, My day, Wait, Days until, What will happen |
| Asking for what I need | Help, a break, the toilet, water, too loud, stop, it hurts, I want — when speech fails under stress | The same card in the same place every time; full-screen to show; less stigmatising for a teen than a lanyard | I need, Choose, Say it |
| Feelings and body | Naming a feeling and its size; noticing hunger, heat, pain; choosing what helps | Private, discreet, nothing logged | How I feel, Break |
| Talking to people in public | Bus captain, station staff, cashier, onlookers during a meltdown; ordering in kopitiam words | Huge text; optional second-language line; speak on tap; hands over to the money tools | Show a card, Order food, Say it, About me |
| Getting around safely | Travel training on a known MRT or bus route; what to do when lost or the train stops | Travels with them; no GPS or signal needed. A training aid, **never** a safety device | My trip, Show a card, Emergency (practice) |
| Doing daily tasks alone | Wash hands, return the tray, pay by card or QR, top up the travel card, pack the bag | One step per screen, repeatable without nagging, steps drop away as skills grow | Steps, Pack my bag |
| Carrying class learning home | Today's schedule, a story before an outing, what I did today | Posted once by the coach, shown on every device in the class | My class (coach platform) |

## 5. Design rules for new tools

These extend the principles in the [README](../README.md#design-principles-for-special-needs-users):

- **Positions never move.** Fixed cards stay in the same place on every visit (the AAC motor-planning principle);
  hiding a card leaves a gap rather than shifting the others.
- **Picture + colour + 1–4 plain words**, one bundled picture set (emoji look different on Android and iPad), and an
  adult-set "pictures only" switch per device for students who don't read.
- **Age-neutral.** Many users are teens: no mascots, confetti, streaks, points or "good boy" praise. Neutral names
  (Wait, Steps, Show a card).
- **Silent by default.** No ticking or alarm sounds; any sound is soft, optional and starts from a tap. Speech only on
  a tap, using the device's own voice (`speechSynthesis`, output only — the microphone stays off).
- **Literal language.** No idioms or figures of speech; buttons say exactly what happens next.
- **Short, purposeful use.** Each tool ends by pointing back to the real task (MOH 2025: under 2 hours a day of
  non-school screens for ages 7–12).
- **No logs of feelings, behaviour or location.** Nothing a student taps is recorded or sent; no health claims
  ("reduces anxiety", "treats").
- **The student's own supports, not compliance tools.** A break is a right, not a reward; the feelings tool is for the
  student, not for adults to monitor; never "calm down" as an instruction. Communication tools are the student's voice
  and are never taken away as a consequence (standard AAC practice) — the guide says so.
- **Fading built in**: "fewer steps", hide pictures the student knows.
- **Adult set-up out of the child's way**: a set-up page reached from the guide (press-and-hold to enter, no PIN, no
  errors), never on the menu.
- **Disclosure is the student's choice.** Cards default to no diagnosis label; "autistic" or "hidden disability" is
  opt-in.
- **Personal details only on personal devices.** A family phone number or About me never lives on a shared iPad.
- **Local, respectful pictures**: multiracial people (including hijab), halal-safe food by default, no operator,
  government or brand logos (LTA card design, Sunflower logo, EZ-Link, SimplyGo, Milo packaging) — drawn generic
  versions, as with the money pictures.

## 6. Tool catalogue

Impact (1–5) = need × evidence × how often it's needed in Singapore daily life. Fit (1–5) = offline, one screen, no
accounts, small. Effort: S (days), M (a week or two), L (more — usually drawings).

### First release (decided 2026-09-23)

| Tool | One screen | Impact / Fit | Effort |
|---|---|---|---|
| **Wait** | Tap 1, 2, 5, 10 or 15 minutes; a coloured disc shrinks, with the time left in words; tap to pause; at zero a calm green "Done". Silent by default; keeps the screen awake (Wake Lock); saves the end time so reopening shows the right time left; reduced motion shows only the number. Optional "while I wait" pictures. | 5 / 5 | S |
| **I need** | A fixed grid of big cards — Help, Break, Toilet, Water, Too loud, Stop, Hurts, I want, More time, I don't understand, All done. An adult picks which show on a device (positions stay fixed). Tap a card → it fills the screen to show an adult, with speak-on-tap. Break offers 2 or 5 minutes of Wait; Hurts asks where (a body outline) and how much (3 sizes). | 5 / 5 | S |
| **Now and next** | NOW big on top, NEXT below, each a picture + 1–3 words; an adult queues up to 8 cards. The student taps Done; NEXT moves up. The same list shows as **My day** (a strip of the whole day), with a "Changed" card so a change is announced, not hidden. | 5 / 5 | M |
| **Show a card** | Big cards to show someone: LTA's own wording ("May I have a seat please?", "Please alert me when I am approaching my stop"), "I cannot talk now, I can point or type", and a card for the parent ("My child is overwhelmed. Please give us space. We are OK."). Full-screen, flip to face the person opposite, landscape-friendly, speak on tap. | 5 / 4 | M |
| **Steps** | One step per screen: a picture, 2–4 words, progress dots, a big Next, Back to undo, "All done" pointing back to the task. Starts with 2–3 decks (wash hands, return the tray, pay by card or QR); "fewer steps" merges mastered ones. | 5 / 4 | M engine + L drawings |
| **My class** | The coach's latest published page, one screen at a time (markdown with pictures, Next) — the coach platform, [section 8](#8-coach-platform-my-class) | 4 / 3 | L |

### Next

| Tool | One screen | Impact / Fit | Effort | Note |
|---|---|---|---|---|
| **Say it** | Type (or dictate) one sentence; show it huge or speak it; last 5 phrases as buttons | 3 / 4 | S | Reuses Show a card; not a replacement for prescribed AAC |
| **How I feel** | Five bands (colour, size, one word; faces optional) → the student's own "what helps me" pictures | 4 / 5 | S | Words must match the school's own programme (Zones or a 5-point scale); no branding; nothing saved |
| **Order food** | Drink (kopi, teh, Milo, water + O, C, kosong, siew dai, peng), food row (halal by default), here or tapau/dabao/bungkus → one big sentence to show; then Can I buy? and "return the tray" | 4 / 4 | M + L drawings | Builds the words, not a menu; device voices may mispronounce kopi terms |
| **My trip** | MRT first (trains stop at every station): line colour, station code, "towards …", stops to go, where to get off; "Something is wrong" scripts | 4 / 4 | M | Buses skip stops unless someone presses the bell, so a tap-per-stop counter miscounts — use the stop name and the bus's own next-stop display where there is one |
| **Time sums** | "How long until 3:30?", "What time will it be in 20 minutes?" — two boxes and the answer panel, like the money tools | 3 / 5 | S | SPED functional numeracy teaches money and time together |
| **Stop and check** | Someone asks for an OTP, Singpass, a PayNow transfer, photos or a meet-up → "Stop. Show a trusted adult." | 3 / 5 | S | Teens with phones; very Singapore-specific scam risk |
| **Break** | Breathe (optional, never the default), Move, Quiet — each short, ending on "Back to …" | 3 / 5 | S | Some interoception-sensitive children find breathing exercises distressing |
| **About me** | One card, written by the student with support: how I communicate, what helps, what upsets me, Call my family | 3 / 3 | S | Personal phones only; show and flip, hand the phone only to uniformed staff, teachers or clinicians; back it with the phone's lock-screen emergency info |
| **Print view** | Paper copies of I need, Show a card, Now and next and each Steps deck | 3 / 5 | S | Batteries die; phones are banned in school |

### Later

What will happen (picture stories — "Social Stories" is Carol Gray's term), Choose, Pack my bag, Days until (days, not
"sleeps", for teens), Emergency (practice mode by default: 999 police, 995 ambulance/fire, SMS 70999 for people who
cannot speak; tel:/sms: only on a personal phone, never auto-dial). More Steps decks: pay by NETS/PayNow QR,
puberty and hygiene for teens, body safety, water safety, cross the road (Green Man+).

### Not building (and why)

| Idea | Why not |
|---|---|
| Full AAC talk board | Needs a speech therapist, vocabulary design and motor-planning consistency; a half-built one could clash with a student's prescribed system. The guide points to Cboard or Jellow (free) and SG Enable's Assistive Technology Fund (up to 90% for eligible applicants, means-tested, lifetime cap). |
| Video modelling | Heavy offline storage, bystanders' faces, hosting cost. Coaches can share an approved video link through My class. |
| Timed self-monitoring prompts | A web app cannot notify in the background; unreliable prompts teach the wrong habit. |
| Live weather or bus arrivals | Needs network (and an LTA key for buses); weakens offline-first; could suggest the app keeps a child safe. A "rain" Steps deck works offline. |
| Calm-places directory | Goes stale on a safety-adjacent topic; the guide links to maintained directories instead. |
| Queue number ("6 before you") | Polyclinic numbers are called across rooms and prefixes; a count that looks exact will often be wrong and upsetting. |
| Stars / token board | Adult-awarded, reads young for teens, the pick self-advocates object to most; paper boards already work. |
| Mood or behaviour logs | Sensitive children's data (PDPC 2024); the best-known tracker app shut down and took families' data. |

## 7. Singapore facts to get right

| Topic | Fact (checked 2026-09-23) |
|---|---|
| Emergency | 999 police; 995 ambulance/fire; **SMS 70999** police for anyone who cannot speak, no registration (replaced 71999 on 1 Oct 2024 — old worksheets still say 71999); SMS 70995 (SCDF) only for registered deaf, hard-of-hearing and speech-impaired users; **1777 ends on 1 Jan 2027** (NurseFirst 6262 6262 for advice) |
| LTA Helping Hand cards | Real wording: "May I have a seat please?", "Please alert me when I am approaching my stop", "This is a wheelchair", and "Your care is greatly appreciated. Thank you!" (write your own on the back). No card names a diagnosis. Use the wording, not the card's design. |
| Tray return | Enforced at hawker centres from 1 Sep 2021, coffeeshops and food courts from late 2021; exceptions for elderly and disabled diners and accompanied children under 12. Teach the routine; never mention fines. |
| Buses | Stop only when someone presses the bell or waits at the stop; newer buses (since Dec 2018) show and announce the next stop, not all do. |
| Green Man+ | Tapping a PWD concession card at the crossing gives more crossing time. |
| Sensory kits | 7 SBS Transit sites (North East and Downtown lines, bus interchanges), trial from 5 Feb 2025. |
| Phones in school | MOE secondary schools ban smartphones and smartwatches for all school hours from Jan 2026 (exceptions possible). |
| Screen time | MOH (Jan 2025): ages 7–12 under 2 hours a day unless for schoolwork; no screens at meals or the hour before bed. |
| Language | Lessons are in English; Mother Tongue exemption is "only in exceptional circumstances" (MOE, Mar 2026). Hawkers, taxi drivers and older people may read 中文 (Simplified), Melayu or தமிழ் more easily. |
| Hawker words | kopi, teh, Milo; O (no milk), C (evaporated milk), kosong (no sugar), siew dai (less sugar), peng (iced); tapau / dabao / bungkus (takeaway); chope |
| Travel card top-ups | Channels change (AXS stopped EZ-Link and SimplyGo top-ups from 29 Aug 2026 — secondary sources only). Don't hard-code channels. |
| Data protection | PDPA applies to SSA/VWO-run SPED schools; MOE (government) schools fall under public-sector rules instead. PDPC's 2024 guidelines treat children's data as sensitive, want geolocation off by default, and encourage a DPIA. |

## 8. Coach platform (My class)

whiz.coach is a platform for coaches and learners, and its content pipeline is deliberately large (dozens of agents,
narrated storyboards, question banks, validation — see its whitepaper, *From Syllabus to Course*). simplify.whiz.coach
gets the opposite: a coach writes **one simple page in markdown**, uploads pictures and places them in the page, and
can type an instruction ("make this simpler", "write a picture story about going to the dentist with my 4 pictures")
for AI to create or update the markdown. Every learner in the class sees the latest published page on their own phone
or the class iPad, offline too.

### Roles and flows

| Who | Signs in? | Can do |
|---|---|---|
| **Admin** (the owner) | Yes (Google) | Approve or decline each coach **for each class**, after checking they really are a trustworthy coach of that class; suspend a coach; take down a page; set monthly limits |
| **Coach** | Yes (Google, any Google account — Gmail or a Google account made on a school address) | Ask for a new class, or ask to join a colleague's class; once approved, write and publish that class's page, upload pictures, give AI instructions, print the class QR code |
| **Learner** | **Never** | Subscribe once by scanning the class QR code (or typing its code on the set-up page); open **My class** to see the **latest published page only** |

1. A coach signs in, fills in who they are (name, organisation, how the admin can check), and asks for a class
   ("3 Kindness") or to join one by its code.
2. The admin approves the request. A new class gets a random code (9 characters from a 31-character set with no
   look-alikes, shown as `K7M-3RQ-P9T`); the class name is only a label, because names collide across schools and are
   easy to guess.
3. The coach prints the class's QR poster. The QR opens `https://simplify.whiz.coach/#join=K7M3RQP9T`; the app asks
   "Is this your class?" with the class name, and remembers it. The fragment never reaches a server.
4. The coach writes in a **markdown editor**: a plain text box, a live preview in exactly the learners' look, and a few
   buttons for the handful of formats that are allowed. **Pictures** are uploaded to the class's picture shelf
   (resized in the coach's browser to at most 1600 px, which also drops EXIF and GPS) and placed in the page as
   `![words](pictures/<id>.jpg)`.
5. **AI instructions.** A box under the editor — "Tell the helper what to write or change" — sends the instruction, the
   current markdown and the shelf's picture list to a server function, which returns a new version of the markdown. It
   replaces the editor's text as a draft (Undo brings the old text back). The helper writes to the rules in section 5
   (short literal sentences, plain Singapore English, one idea per screen, pictures only from the shelf, no names of
   learners). **Nothing reaches learners until the coach presses Publish.**
6. **Publish** makes the page the class's latest content; learners see only that one. The coach keeps other pages as
   drafts to publish later.

Every editor screen carries the warning: **what you publish is public — anyone with the class code can see it, so
never put pictures of students or any private or sensitive information in it.** Coaches are the experts for their
learners and decide what to publish; there is no consent tick box.

### The markdown learners see

| Write | Learners see |
|---|---|
| `# Title`, `## Heading` | Big headings |
| Plain lines, `**bold**`, `*italic*` | Large, short paragraphs |
| `- item`, `1. item` | Lists with big bullets or numbers |
| `![words](pictures/<id>.jpg)` | A picture from the class's shelf, full width (the words are its description for screen readers) |
| `[words](https://…)` | One big button naming the site; opens only on a tap; https only |
| `---` | **Next screen**: the page is shown one screen at a time with big Next and Back buttons |

Anything else is shown as plain text. The learner app renders this subset with its own small parser straight into
page elements (text only, never HTML), so a page can't run a script or load anything from anywhere else; a picture
that isn't on the class's shelf is simply not shown.

### Where things live

- Firebase project `simplify-special`, on the **Blaze** plan (Cloud Storage for Firebase needs Blaze since
  3 Feb 2026, and so do Cloud Functions), with a budget alert. Firestore in **asia-southeast1** (Singapore) and a
  Storage bucket in the same region. Firebase Authentication itself runs in US data centres (coaches' and the admin's
  sign-in data only).
- **AI instructions** go through one Cloud Function in asia-southeast1. It checks that the caller is an approved,
  unsuspended coach of that class, counts their instructions for the month against a limit the admin sets (default 200
  a month — each is a fraction of a cent, the limit is there to stop misuse), calls Gemini (`gemini-3.7-flash`, the
  model whiz.coach uses, through Vertex AI with the `@google/genai` SDK), and checks the answer before returning it
  (only the allowed markdown, only pictures on the shelf, a length limit). Like whiz.coach, it uses Gemini's `global`
  endpoint, so the model may run outside Singapore; what it sees is the coach's instruction and page, never anything
  about learners.
- A second Hosting site for the coach app (`simplify-coach`, to be served at coach.simplify.whiz.coach). The coach site
  loads the Firebase SDK; the learner app does not — it reads the class with one plain HTTPS request.
- Built on its own, not inside the whiz.coach platform: that platform's data is in the US, its classes need signed-in
  learners, its coach role can read the user directory, and its security rules deploy as one large shared file.
  Ideas reused from it: Google sign-in, admin-switched roles, browser-side photo resizing, image URLs restricted to the
  project's own bucket, the Gemini model and SDK conventions, and — for the future videos — its Gemini Omni wiring.

| Data | Readable by | Written by |
|---|---|---|
| `admins/{uid}` | that admin | the owner, in the console |
| `coaches/{uid}` — name, organisation, note | that coach, admins | that coach (own profile only); admins suspend |
| `requests/{id}` — new class or join class, pending / approved / declined | that coach, admins | coach creates; admin decides |
| `classes/{code}` — name, the latest published page (title, markdown, when, by whom) | **anyone with the exact code** (get only, no listing), while active | that class's approved coaches (publish); admins (create, suspend, take down) |
| `classCoaches/{code}` — the class's coach uids | its coaches, admins | admins |
| `classes/{code}/pages/{id}` — drafts and older pages | its coaches, admins | its coaches |
| `classes/{code}/pictures/{id}` — the picture shelf (words, file) | its coaches, admins | its coaches |
| `usage/{uid}_{month}` — AI instructions used this month | that coach, admins | the Cloud Function only |
| `config/limits` — monthly limits | admins, the Cloud Function | admins |
| Storage `classes/{code}/pictures/{id}.jpg` | anyone with the exact path (no listing) | that class's approved coaches; images only, size-capped |

### Learner app changes

- **My class** tile at the top of the menu once a class is set; the latest page one screen at a time; "Updated Tue
  8:05"; offline shows the saved copy (pictures included); nothing yet shows "Nothing from your coach yet" — never an
  error.
- The app sends only the class code (and, like any website, the device's internet address) — nothing a learner types
  or taps. The CSP gains `connect-src` for Firestore and Storage and `img-src blob:`; everything else stays offline.
- The privacy page and README change from "nothing is sent anywhere" to "nothing leaves the device unless My class is
  set up, and then only the class code".

### Risks and what limits them

| Risk | Mitigation |
|---|---|
| A coach account is taken over and publishes something harmful | Admin approval per class; a coach reaches only their own classes; admin can suspend a coach and take a page down; learners see only the latest page, so a bad page is replaced by the next one; coaches asked to turn on 2-Step Verification |
| The AI writes something wrong or unsuitable | It only ever produces a draft in the coach's editor; the coach reads it and presses Publish; the function strips anything outside the markdown subset and any picture not on the shelf |
| AI or storage costs on Blaze | A monthly AI limit per coach, checked on the server; learner devices check for a new page at most on opening and every 10 minutes; pictures cached on the device; a budget alert (it warns, it does not cap) |
| The QR code is photographed and shared | A new code can be issued (devices set up again); the public warning keeps private information out of pages |
| iPad: the QR opens Safari, whose data is separate from the home-screen app | The code is printed under the QR and can be typed on the set-up page inside the app |
| School-managed devices block Google's APIs | Ask the school to allow `firestore.googleapis.com` and `firebasestorage.googleapis.com` |
| Google sign-in fails inside WhatsApp or Telegram's built-in browser | The coach guide says to open the coach link in Chrome or Safari |
| PDPA | Holding a school's content makes the owner its data intermediary: a short written agreement with each organisation (purpose, Singapore storage, retention, deletion on request, breach notice). Pilot with an SSA-run SPED school (MOE schools follow public-sector rules). |

### Future: short educational videos with Gemini Omni

Planned, not built. A coach asks for a short clip ("hands being washed at a sink, step by step") and places it in a
page like a picture, `![words](videos/<id>.mp4)`.

- **Model.** Gemini Omni Flash (`gemini-omni-flash-preview`, a preview model) through the Vertex AI Interactions API
  in `@google/genai`, the way whiz.coach has wired it (`functions/src/services/omni-video.ts` there): 3–10-second
  clips, about US$0.10 per second of video (so about US$1 a clip), `background` mode so no function waits on a
  render. As a preview it is served from `us-central1` only: generation runs in the US, and the finished clip is
  stored in the class's Singapore bucket. whiz.coach uses Omni for *edits* and keeps it switched off, so whether it
  generates a clip from text alone on this project must be checked before building; Veo 3.1 Fast is the fallback for
  longer clips (US$6–18 a render in whiz.coach's measurements).
- **Credits.** Each coach gets a monthly allowance of video seconds set by the admin (for example 60 seconds — about
  six clips, about US$6). The function reserves the seconds before it starts a render and returns them if it fails;
  a ledger per coach per month (`credits/{uid}_{month}`); the coach sees what is left before asking.
- **Two checks before learners see anything**, borrowed from whiz.coach and made simpler: the coach sees the exact
  request and its cost in credits before spending them, and a finished clip stays private until the coach approves
  it; only then can it go on a published page.
- **For learners.** No autoplay and no sound until tapped; big play and replay buttons; clips cached for offline use
  like pictures; the CSP gains `media-src` for the bucket. People in clips are generic, never a real learner's
  likeness, and the same public warning applies.

### Put off

Microsoft sign-in (if a school needs it), App Check, several classes per device, content for one learner, read
receipts or analytics, learner replies, push notifications, a parent view, a class-wide tool list that sets each
device's menu, and the videos above.

## 9. Technical notes for adding tools

- **Tools as modules.** Replace `TITLES` in `public/js/app.js` with a registry (id → title, icon, group, mount). Use
  `Object.hasOwn`/`Map.has` — `id in TITLES` accepts inherited names, so `/#toString` throws in `route()` today. Keep
  static imports (not `import()`): with `skipWaiting` + `clients.claim`, a page lazily importing after an update would
  get the new module into the old page.
- **Menu.** Group headings on the one menu; an adult hides tools per device on a set-up page reached from the guide.
- **Shared parts to build once:** a picture set and picker, a full-screen show-card view (CSS overlay and rotation —
  no Fullscreen API or orientation lock on iPhone), speak-on-tap, a timer that stores its end time, a generic
  add/remove/undo list (today's `items.js` is tied to prices), a text-only answer path (`result.js` writes the subline
  with `innerHTML`).
- **Offline tools need no header change.** Wake Lock and `speechSynthesis` are allowed; camera, microphone and
  geolocation stay off. `<input type=file accept="image/*">` opens the system camera/photo picker without the camera
  permission; showing a picked photo only needs CSP `img-src blob:`.
- **Storage.** Small per-tool JSON stays in localStorage; photos and pictures go to IndexedDB as Blobs, with
  `navigator.storage.persist()`. iPad Safari deletes site data after 7 days of Safari use without visiting the site,
  unless the app is on the home screen.
- **PWA limits.** No scheduled local notifications; Web Push needs a server; no `navigator.vibrate` on iOS; the first
  `speechSynthesis.speak()` and any `AudioContext` sound must start from a tap; voices load asynchronously and en-SG is
  usually absent; Wake Lock is released when the page is hidden and must be re-requested (reliable in iPad home-screen
  apps from iPadOS 18.4); Android throttles hidden timers, so a timer keeps its end time, not a countdown.
- **Service worker and Hosting quota.** `public/sw.js` fetches every asset with `cache: "reload"` on each release,
  so every device re-downloads ~1.85 MB (1.6 MB of guide PNGs). On the free Spark plan an exhausted Hosting quota
  disables the site until the next month. `cache: "no-cache"` revalidates with ETags (unchanged files return 304 with
  no body); also check `r.ok` so a typo in `ASSETS` is not cached as a 404.
- **`update.js`** reloads into a new version when the screen is idle; it must also wait while a Wait timer runs.
- **Per new tool** (existing conventions): a hidden `div#tool-<id>` in `index.html`, a guide page
  `public/guide/<id>.html` (same id as the route), a button on the guide menu, a scene in `tools/shoot-guide.mjs`, an
  `ASSETS` entry and a `CACHE` bump, a README row, and pure logic pinned by a `tools/test-*.mjs` test. Guide text and
  screenshots only after the tool has been tested on an Android phone and an iPad.

## 10. Decisions

| Date | Decision | Why |
|---|---|---|
| 2026-09-23 | First release adds **Wait, I need, Now and next (My day), Show a card, Steps** | One tool per core need; all offline with no security-header change; builds the shared parts later tools reuse |
| 2026-09-23 | Design for **both** picture users and readers: pictures + 1–3 words by default, an adult can set a device to pictures-only | Covers minimally-speaking children and teens who read |
| 2026-09-23 | Menu: **group headings + an adult hides unused tools per device** | Keeps each child's menu short and one level deep |
| 2026-09-23 | **Coach platform pilot with photos**: coaches approved by an admin for each class; only coaches upload; learners subscribe once by QR code and see only the latest content of their class | whiz.coach is a coaches-and-learners platform; simplify.whiz.coach mirrors it for coaches of autistic learners (section 8) |
| 2026-09-23 | **Blaze plan with a Cloud Storage bucket** in Singapore for photos, Firestore in Singapore for classes and pages | Full-size photos; pilot cost is cents a month; a budget alert warns (it does not cap) |
| 2026-09-23 | **Trust coaches** with what they post; show a clear warning that posts are public — never pictures of students or private or sensitive information | Coaches are responsible for their learners and are the experts |
| 2026-09-23 | Sign in with **Google, any Google account** (Gmail or one made on a school address); Microsoft later if a school needs it | Most Singapore SPED operators checked use Microsoft 365, so Gmail-only would shut many coaches out |
| 2026-09-23 | A **random class code** in the QR, the class name only a label | Learners read without signing in, so the code is the only lock; names collide and are guessable |
| 2026-09-23 | **Standalone** in `simplify-special`, not inside the whiz.coach platform | Singapore data location, learners without accounts, narrow coach permissions, separate rules and deploys |
| 2026-09-23 | Coach content is **one simple markdown page**: a markdown editor, pictures uploaded to the class and placed in the page, `---` for the next screen; learners see the latest published page | The coach interface stays very simple — the opposite of whiz.coach's generation pipeline |
| 2026-09-23 | **AI instructions** create or update the markdown (Gemini through a Cloud Function that checks the coach and a monthly limit); the coach reviews every draft and publishes | Coaches say what they want in their own words; nothing reaches learners without the coach |
| Future | **Short educational videos with Gemini Omni**, with a monthly video-credit allowance per coach | Section 8, "Future" |

## Sources

_Checked 2026-09-23._

**Evidence and design**
- NCAEP 2020, Evidence-Based Practices for Children, Youth, and Young Adults with Autism — https://ncaep.fpg.unc.edu/wp-content/uploads/EBP-Report-2020.pdf
- AFIRM, Visual Supports brief — https://afirm.fpg.unc.edu/wp-content/uploads/Visual-Supports-Brief-Packet.pdf
- AFIRM, Technology-Aided Instruction and Intervention brief (2025) — https://afirm.fpg.unc.edu/wp-content/uploads/Technology-Aided-Instruction-Intervention-Brief-Packet-Hedges-AFIRM-Team-Updated-2025.pdf
- Jenkinson, Milne & Thompson 2020, intolerance of uncertainty and anxiety — https://pmc.ncbi.nlm.nih.gov/articles/PMC7539603/
- Kinnaird et al. 2019, alexithymia in autism — https://pubmed.ncbi.nlm.nih.gov/30399531/
- Casassus et al. 2019, time perception and autism — https://onlinelibrary.wiley.com/doi/full/10.1002/aur.2170
- Duncan & Bishop 2015, daily living skills in adolescents — https://pubmed.ncbi.nlm.nih.gov/24275020/
- Anderson et al. 2012, wandering — https://pubmed.ncbi.nlm.nih.gov/23045563/
- Digital activity schedules, systematic review (2025) — https://pubmed.ncbi.nlm.nih.gov/40392102/
- Groba et al. 2021, interface design for children with ASD — https://pmc.ncbi.nlm.nih.gov/articles/PMC8123795/
- Uitdenbogerd et al. 2022, animated UI and autistic users — https://arxiv.org/abs/2211.11993
- W3C, Making Content Usable for People with Cognitive and Learning Disabilities — https://www.w3.org/TR/coga-usable/
- UK Home Office, designing for users on the autistic spectrum — https://ukhomeoffice.github.io/accessibility-posters/autism
- Lerner, Gurba & Gassner 2023, neurodiversity-affirming interventions — https://pmc.ncbi.nlm.nih.gov/articles/PMC10430771/
- LAMP FAQ (AAC motor planning) — https://www.aacandautism.com/lamp/faq

**Existing apps**
- Spectrum Unlocked, visual schedule apps compared — https://www.spectrumunlocked.com/blog/best-visual-schedule-apps
- Choiceworks — https://www.beevisual.com/
- First Then Visual Schedule HD — https://www.goodkarmaapplications.com/ftvshd-first-then-hd.html
- Time Timer — https://www.timetimer.com/pages/autism
- Cboard — https://www.cboard.io/en/
- MagnusCards — https://magnusmode.com/en/products/magnuscards
- Accessible Chef — https://accessiblechef.com/
- Proloquo2Go — https://www.assistiveware.com/products/proloquo2go
- Seesaw student sign-in modes (class codes and QR) — https://help.seesaw.me/hc/en-us/articles/203495019-Student-sign-in-modes

**Singapore**
- MOE, curriculum in SPED schools — https://www.moe.gov.sg/special-educational-needs/curriculum
- MOE, new SPED syllabuses (Nov 2023) — https://www.moe.gov.sg/news/press-releases/20231103-enhancing-the-quality-of-special-education-launch-of-new-syllabuses-for-communication-and-language-and-social-emotional-learning-and-masters-scholarships-in-sped
- MOE, Mother Tongue exemption (Mar 2026) — https://www.moe.gov.sg/news/parliamentary-replies/20260303-mother-tongue-exemption-or-replacement-for-students-with-conditions-such-as-autism-spectrum-disorder-or-dyslexia
- MOE, device management application — https://www.moe.gov.sg/news/forum-letter-replies/20240416-schools-parents-can-guide-usage-of-digital-devices-by-students-with-app
- Caring SG Commuters, Helping Hand cards — https://www.caringcommuters.gov.sg/our-initiatives/helping-hand-cards/
- MOT, reply on the Caring SG Commuters lanyard and card — https://www.mot.gov.sg/news/details/written-reply-to-parliamentary-question-on-effectiveness-of-caring-sg-commuter-lanyard-and-card-campaign-to-cultivate-kinder-public-transport-culture
- LTA and SBS Transit sensory kits (Feb 2025) — https://mothership.sg/2025/02/sbs-lta-sensory-tool-kits-passengers/
- NEA, mandatory tray return — https://www.nea.gov.sg/media/news/news/index/mandatory-for-diners-to-return-dirty-trays-crockery-and-clean-table-litter-at-hawker-centres-coffeeshops-and-food-courts
- SPF, SMS 70999 — https://www.police.gov.sg/SMS-70999
- MOH, 1777 ends 1 Jan 2027 — https://www.moh.gov.sg/newsroom/1777-non-emergency-ambulance-hotline-to-cease--from-1-january-2027/
- MOH, guidance on screen use (Jan 2025) — https://www.moh.gov.sg/others/resources-and-statistics/guidance-on-screen-use/
- SG Enable, Assistive Technology Fund — https://www.enablingguide.sg/im-looking-for-disability-support/assistive-technology/assistive-technology-fund
- Changi Airport, invisible disabilities — https://www.changiairport.com/en/at-changi/special-assistance/invisible-disability.html
- PDPC, children's personal data in the digital environment (Mar 2024) — https://www.pdpc.gov.sg/organisations/regulations-decisions/regulatory-guidance/advisory-guidelines-on-the-pdpa-for-childrens-personal-data-in-the-digital-environment
- PDPC, advisory guidelines for the education sector (Apr 2024) — https://www.pdpc.gov.sg/-/media/files/pdpc/pdf-files/advisory-guidelines/advisory-guidelines-for-education-sector_25-apr-2024.pdf

**whiz.coach (internal documentation in the whiz.coach repository, not public)**
- *From Syllabus to Course: Multi-Agent Generation and Validation at whiz.coach* (whitepaper)
- *AI Model Configuration* — Gemini model ids, `@google/genai`, thinking levels, `global` location
- *Coach-Initiated Topic Video* — Veo 3.1 and Gemini Omni Flash (`gemini-omni-flash-preview`), costs, `us-central1`, review gates

**Platform**
- Firebase pricing — https://firebase.google.com/pricing
- Firebase Hosting usage and quotas — https://firebase.google.com/docs/hosting/usage-quotas-pricing
- Cloud Firestore pricing and quotas — https://firebase.google.com/docs/firestore/pricing
- Cloud Storage for Firebase: Blaze requirement — https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024
- Firebase Authentication limits — https://firebase.google.com/docs/auth/limits
- Firebase privacy and data location — https://firebase.google.com/support/privacy
- Firestore security rules and queries ("rules are not filters") — https://firebase.google.com/docs/firestore/security/rules-query
- Firebase Hosting, multiple sites — https://firebase.google.com/docs/hosting/multisites
- Google OAuth blocked in embedded webviews — https://developers.googleblog.com/2021/06/upcoming-security-changes-to-googles-oauth-2.0-authorization-endpoint.html
- WebKit, home-screen web apps don't share storage with Safari — https://bugs.webkit.org/show_bug.cgi?id=181849
- WebKit, Safari 18.4 (Wake Lock in home-screen apps) — https://webkit.org/blog/16574/webkit-features-in-safari-18-4/
- WebKit, storage policy — https://webkit.org/blog/14403/updates-to-storage-policy/
- Noto Emoji (images Apache-2.0) — https://github.com/googlefonts/noto-emoji
- Apple Assistive Access — https://support.apple.com/en-sg/guide/assistive-access-ipad/welcome/ipados
- Android app pinning — https://support.google.com/android/answer/9455138
