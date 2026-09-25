---
type: Product Contract
title: Decision Log
description: Dated log of the product and technical decisions that shape Simplify — from the static offline money app and keyboard dictation to the daily-life tools, the coach platform, its AI limits and the OKF docs — each with the reason, so a change can see what it would reverse.
tags: [decisions, adr, history, product, coach-platform, daily-life-tools]
status: stable
---

One row per decision, oldest first, with the reason it was taken. A change that reverses one should add a new row
rather than edit the old one. The research behind the 2026-09-23 decisions is in
[daily-life research](/product/daily-life-research.md); the rules they produced are in
[design principles](/product/design-principles.md).

## The money app

| Date | Decision | Why |
|---|---|---|
| 2026-08-12 | A **static PWA** in `public/`: no framework, no build step, no account, no analytics, offline once opened | Special-needs learners need something that opens instantly, works in a shop with no signal and keeps nothing about them |
| 2026-08-12 | **Firebase Hosting** in project `simplify-special`, deployed by GitHub Actions on every push to `main`, preview channels for pull requests | Free static hosting with a CDN and previews for review |
| 2026-08-12 | **https://simplify.whiz.coach/** is the one address to share; `simplify-special.web.app` serves the same files but is a separate origin with its own storage | People's saved numbers live per origin, so everyone must use the same one |
| 2026-08-12 | Voice entry through the **keyboard's own dictation** in a plain-text dialog, parsed on the device; the **Web Speech API is rejected** | The API doesn't work in installed home-screen PWAs on iOS and prompts for the microphone. See [voice input](/learner/voice-input.md) |
| 2026-08-12 | HTML is served `no-cache` and the precache bypasses HTTP caches | A stale CDN edge was baked into the service-worker cache |
| 2026-09-23 | The app opens on a **menu titled "Simplify"** of six money tools, each one screen answering one question, each with its own address | A teacher can share one tool; one question per screen |
| 2026-09-23 | "Can buy / Cannot buy", "Add item", tap counts on notes and coins, and **an empty money box counts as $0** | From the original change requests: plainer words, and an answer without waiting |
| 2026-09-23 | **Next note** shows the next note plus one backup ("No $5? Use $10") | The learner may not have the exact note |
| 2026-09-23 | **No real images of notes and coins** — drawings that take only physical facts (colour, proportions, metal, size) | Singapore's Currency Act s.20 and MAS rules on reproducing currency |
| 2026-09-23 | **Fewer words on screen**: no labels beside 🏠 and ✕, no hint before there is an answer; the yes/no pill moves up beside them | Every word is one more thing to read |
| 2026-09-23 | An installed app shows a **new version on the next open** (`update.js`), with `no-cache` for code and a Content-Security-Policy, `nosniff`, `no-referrer` and a Permissions-Policy on every response | Updates used to take two opens; resuming from the app switcher never checked |
| 2026-09-23 | The guide is a **topic menu with one small page per topic**, and is updated **only after a change is tested locally**, never alongside it | Nobody reads a long page to find one answer; screenshots must show what ships |

## Daily-life tools

| Date | Decision | Why |
|---|---|---|
| 2026-09-23 | The first release adds **Wait, I need, Now and next (with My day), Show a card and Steps** | One tool per core need; all offline with no security-header change; builds the shared parts later tools reuse |
| 2026-09-23 | Design for **both picture users and readers**: pictures + 1–3 words by default; an adult can set a device to pictures only | Covers minimally-speaking children and teens who read |
| 2026-09-23 | The menu gets **group headings (Money, My day, Talk)**, and an adult **hides unused tools per device** on a set-up page reached from the guide with a press-and-hold | Keeps each child's menu short and one level deep, with adult settings out of the child's way |
| 2026-09-23 | A **tool registry** (`public/js/tools.js`) with a shell contract replaces the app's hard-coded titles; tools are imported statically, never with `import()` | New tools plug in the same way; a lazy import after an update could load a new module into an old page |
| 2026-09-23 | A **bundled picture set** (Noto Emoji, Apache-2.0, plus own drawings of Singapore things), not system emoji | The same picture on every device, offline and same-origin |
| 2026-09-23 | The service worker **revalidates** (ETags) instead of re-downloading every file on each release | Each release re-downloaded about 1.85 MB per device |
| 2026-09-23 | Wait is **silent**, with one soft chime only if an adult turns it on | Ticking and alarm sounds make many children anxious |
| 2026-09-23 | I need and Show a card keep **fixed positions**; a switched-off card leaves a gap | AAC motor planning: a card is always where the hand expects it |
| 2026-09-23 | Show a card uses **LTA's Helping Hand wording word for word**, with our own design; a diagnosis line is opt-in | Staff recognise the wording; disclosure is the student's choice |
| 2026-09-23 | A Steps deck **untouched for 30 minutes opens at step 1** | The next student on a shared class iPad shouldn't land in someone else's routine |
| 2026-09-24 | **Speak plays pre-recorded clips** in one Google Cloud Chirp 3 HD female voice (`en-IN-Chirp3-HD-Erinome`, "clear"), kept on the device; the device's own voice reads only words someone typed (a stop name, I want words). **Indian English**, the closest Google offers, because it has no Singapore English (`en-SG`) Chirp 3 HD voice — the owner: "if Singlish accent not available, clear India accent will work too"; a British voice tried first said "halal" so it was heard as "hillside" | The owner asked for a clear female voice close to Singapore accents, the same on every device: the device voices differ per phone, Singapore English is rarely installed, and a network voice fails offline. Clips of fixed sentences (137, 1.5 MB) are made once by `tools/make-voice.mjs`, so they cost nothing per tap and work offline. See [the recorded voice](/platform/voice.md) |
| 2026-09-26 | A tool taken off a device's menu is **tucked away, not removed**: a small **＋N** button in its group's heading row opens the tucked tools under the group's own (dashed edges), closed every time the menu comes back | The owner: instead of removing the links, put them in a collapsible panel, collapsed by default. A button in each heading row costs no height (the row already has room on its right) and keeps tools with their group; one shared panel would always take a row |
| 2026-09-26 | **Time sums** built (My day): How long until? and What time after?, answered in the answer panel; From follows the time now until changed; past midnight says "tomorrow" | The owner chose it from the roadmap; SPED numeracy teaches money and time together |
| 2026-09-26 | **Stop and check** built, in a new **Stay safe** group: ten things someone may ask for → a full-screen STOP card, one plain rule, and the 1799 ScamShield Helpline; nothing kept | The owner chose it from the roadmap; scams that ask teens for codes, Singpass or PayNow transfers are common in Singapore |
| 2026-09-26 | Pictures only one tool uses are **tool pictures** (`TOOL_PICTURES`), never offered in the picker | A picker picture's words need a recorded voice clip (I want); a tool's own pictures don't |

## Coach platform

| Date | Decision | Why |
|---|---|---|
| 2026-09-23 | **Coach platform pilot**: coaches approved by an admin for each class; only coaches upload; learners subscribe once by QR code and see only the latest content of their class | whiz.coach is a coaches-and-learners platform; simplify.whiz.coach mirrors it for coaches of autistic learners |
| 2026-09-23 | **Blaze plan with a Cloud Storage bucket** in Singapore for photos, Firestore in Singapore for classes and pages | Full-size photos; pilot cost is cents a month; a budget alert warns (it does not cap) |
| 2026-09-23 | **Trust coaches** with what they post, with a clear warning that posts are public — never pictures of students or private or sensitive information; no consent tick box | Coaches are responsible for their learners and are the experts |
| 2026-09-23 | Sign in with **Google, any Google account** (Gmail or one made on a school address); Microsoft later if a school needs it | Most Singapore SPED operators checked use Microsoft 365, so Gmail-only would shut many coaches out |
| 2026-09-23 | A **random class code** in the QR; the class name is only a label | Learners read without signing in, so the code is the only lock; names collide and are guessable |
| 2026-09-23 | **Standalone** in `simplify-special`, not inside the whiz.coach platform | Singapore data location, learners without accounts, narrow coach permissions, separate rules and deploys |
| 2026-09-23 | Coach content is **one simple markdown page**: a markdown editor, pictures uploaded to the class and placed in the page, `---` for the next screen; learners see the latest published page | The coach interface stays very simple — the opposite of whiz.coach's generation pipeline |
| 2026-09-23 | **AI instructions** create or update the markdown (Gemini through a Cloud Function that checks the coach and a monthly limit); the coach reviews every draft and publishes | Coaches say what they want in their own words; nothing reaches learners without the coach |
| 2026-09-23 | **Separate monthly AI limits per coach: 200 Gemini Flash requests and 5 Gemini Omni videos** (first set at 20 videos, lowered to 5) | Video costs about 100 times more than a markdown request |
| 2026-09-23 | **Short educational videos with Gemini Omni are built now**, planned by Flash and approved by the coach before a credit is spent, private until approved | Verified on the project: text-to-video works on the `global` endpoint |
| 2026-09-23 | **One Flash call decides** write / ask / decline, always starting "I understood: …"; no separate Flash-Lite router | Same protection with one call; a cheaper router saves under a cent, adds delay, and misjudges sensitive daily-living topics |
| 2026-09-23 | The coach app and coach guide live at **/coach/** and **/coach/guide.html** on the same site (a separate Hosting site was created, then deleted); **learners have no links to them** | Keep coach and learner interfaces separate on one domain |
| 2026-09-23 | A coach's sign-in lasts **only for the browser tab**, with a visible Sign out | Class iPads are shared, and the coach app shares an origin with the learner app |
| 2026-09-23 | The **Firebase JS SDK and the QR library are vendored** into `public/coach/vendor/` by a repeatable script | The coach CSP stays same-origin for scripts apart from Google's sign-in |
| 2026-09-23 | The learner app reads its class with **one plain HTTPS request**, no Firebase SDK | Keeps the learner app small, offline-first and free of third-party code |
| 2026-09-23 | **One markdown parser** (`public/js/class-markdown.js`) builds text nodes only and is shared by the learner reader, the coach preview and the Cloud Functions (a byte-identical copy) | What the coach previews and the server checks is exactly what learners see, and a page can never run a script |
| 2026-09-23 | Coaches can add **public and unlisted YouTube videos**, played inside the learner's page (tap to load, privacy-enhanced player, the frame sends the site's origin as referrer) | Lots of good teaching video already exists; nothing loads from YouTube before a tap |
| 2026-09-24 | **An admin approves each coach before they can use the platform at all** (`coaches/{uid}.status`: `pending` → `approved` \| `declined`); until then a coach can only fill in and change About you. Every rule, the Storage rules and all six callables need an approved, unsuspended coach. This replaces approving each coach for each class | The owner: the admin should approve the coach before they are allowed to upload content or define classes. Checking the person once is the check that matters; per-class approval of trusted coaches was busywork |
| 2026-09-24 | **Approved coaches make their own classes**, at once, for one of their institutions; **joining a colleague's class stays a request the admin approves** | A coach the admin trusts needs no second check to start a class; joining someone else's class gives access to that class's drafts, so the admin checks it |
| 2026-09-24 | Coaches choose **one or more institutions** (up to 10) from a list the admin keeps — one entry per place, grouped by organisation — instead of typing an organisation; classes carry an `institution` | The owner: coaches select from a set of Singapore institutions for persons with disabilities, e.g. several locations of one organisation. A list lets the admin check a coach against a known place and keeps names consistent |
| 2026-09-24 | A coach may **change their institutions after approval and stays approved**; the change is stamped and the admin's list says so | The admin trusts the person, not the place; blocking a coach who moved centre would stop their classes for no gain |
| 2026-09-24 | The list starts with **four AWWA places** (AWWA School @ Napiri, @ Bedok, and the Early Intervention Centres @ Hougang and @ Fernvale Link); a researched list of 120 is kept in the repository, unseeded, for the admin to add from; examples use **AWWA School @ Napiri** | The owner's choice: offer exactly the places in use, and grow the list as coaches need it |
| 2026-09-25 | **Every admin action is logged** in `adminLog` (append-only: who — uid and Google email — what, when, and a note); **approving a coach or a join request needs a note of how the admin checked** (at least 10 characters, e.g. "Seen taking classes at AWWA School @ Napiri"), and the rules refuse an approval, a decline or a suspension without its entry | The owner: an audit of which admin approved which coach, with a mandatory comment of how they verified the coach |
| 2026-09-25 | **Admins must sign in with Google**, like coaches; admins are still made only in the database (`admins/{uid}`), never from the app | The owner's instruction; the log names each admin by their Google email |
| 2026-09-25 | A coach whose school **isn't in the list** types its name on About you (`otherPlace`); the admin adds it to the list from the coach's card, and it goes on their profile in the same write | The owner: any Google user can apply, mentioning the school; a list-only picker shut out coaches of unlisted schools |
| 2026-09-25 | A **decline can carry a message the coach sees**, and a declined coach can **ask again** after changing About you | A declined coach was stuck with "contact the admin" and no way to know what was missing |
| 2026-09-25 | The Admin screen is **in tabs** (Waiting, Coaches, Classes, Institutions, History, Limits) with a live waiting count on the Admin link; admins can **take one coach off one class** | One long page grew with every section; a coach who moves school should lose that class without being suspended everywhere |

## Documentation

| Date | Decision | Why |
|---|---|---|
| 2026-09-23 | Project docs are an **Open Knowledge Format (OKF 0.2)** bundle, as in the whiz.coach repository, with generated indexes (`tools/build-docs-index.mjs`) | Future work starts from documents that describe what exists, one subject each |
| 2026-09-23 | The public repository never names the partner organisation, the volunteer or the requester | The repository is public (MIT) |
| 2026-09-24 | Exception, on the owner's instruction: the AWWA places coaches can choose (AWWA School @ Napiri, AWWA School @ Bedok, AWWA Early Intervention Centre @ Hougang and @ Fernvale Link) are named in the app, the seed data and the coach guide's examples; the volunteer and the requester still are not | The owner chose which institutions the app offers |
