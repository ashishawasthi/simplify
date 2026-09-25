---
type: Product Contract
title: The Coach App
description: What the /coach/ app does and promises — how it is kept apart from the learner app, Google sign-in for the tab only, About you with its institution picker, waiting for the admin's approval, My classes (making a class, asking to join one), the class screen (pages, editor, toolbar, live preview, Publish and Unpublish with Undo), the picture shelf, the QR poster, routing and errors.
tags: [coach-app, sign-in, institutions, coach-approval, editor, preview, publish, picture-shelf, qr-poster, routing]
status: stable
---

This document owns the coach app at `https://simplify.whiz.coach/coach/` (`public/coach/`): who it is for, how it is kept apart from the learner app, and what each screen does. The markdown a page may hold is in [markdown pages](/coach/markdown-pages.md), the AI helper in [Write with AI](/coach/ai-helper.md), videos in [videos](/coach/videos.md), and the admin's screen in [admin and approvals](/coach/admin-and-approvals.md).

## Kept apart from the learner app

The coach app shares the learner app's origin but nothing else a learner touches.

| Promise | Where it is kept |
|---|---|
| Nothing a learner sees links to `/coach/` (not the menu, the learner guide or the QR poster) | the learner pages; the poster's QR opens the learner app (`joinUrl` in `public/coach/js/class-code.js`) |
| The learner service worker never caches or answers for it | `public/sw.js` returns early for `/coach` and `/coach/…` (and Firebase's `/__/`) — see [offline and updates](/platform/offline-and-updates.md) |
| Search engines are asked not to index it | `<meta name="robots" content="noindex">` in `public/coach/index.html` and `X-Robots-Tag: noindex` on `^/coach(/.*)?$` in `firebase.json` |
| Its own CSP: scripts from `'self'` plus `https://apis.google.com` (Google sign-in), connections to Firestore, Storage, Identity Toolkit, Secure Token and the functions in `asia-southeast1` | `firebase.json`; details in [security](/platform/security.md) |
| No HTML from data, ever: screens are built with `createElement` and `textContent` | `h()` in `public/coach/js/dom.js` |

The Firebase JS SDK **12.19.0** (app, auth, firestore, storage, functions) and **uqr 0.1.3** (the QR code) are vendored into `public/coach/vendor/` by `node tools/vendor-firebase.mjs`, which pins both versions, rewrites the SDK's gstatic import specifiers to relative ones, drops source-map comments and writes each folder's licence and a README with SHA-256 sums. Upgrading means changing the version there, running it, updating the import paths in `public/coach/js/cloud.js` or `public/coach/js/qr.js`, and deleting the old folder. The licences are listed in `THIRD_PARTY_NOTICES.md`. The learner app does not load the SDK; it reads a class with one plain HTTPS request (see [My class](/learner/my-class.md)).

`public/coach/js/cloud.js` is the only file that touches Firebase: sign-in, every Firestore and Storage call, and the callables. The screens never import the SDK, which is what lets `tools/smoke/coach.mjs` swap that one file for an in-memory stand-in. On `localhost` and `127.0.0.1` it connects to the emulators on the ports in `firebase.json` (or those in localStorage `simplify-coach-emulators`), and marks `<html data-emulators>`; see [local development](/operations/local-development.md).

## Screens and routing

`public/coach/js/main.js` is one page whose hash chooses the screen:

| Hash | Screen | File |
|---|---|---|
| `#classes` (and anything unknown) | My classes — or, until the admin approves the coach, Waiting for approval or Not approved | `screen-classes.js`, `screen-waiting.js` |
| `#class/<CODE>` | one class: pages, Write with AI, editor, preview, Publish, shelves | `screen-class.js` |
| `#poster/<CODE>` | the class's QR poster | `screen-poster.js` |
| `#admin` | the admin's screen (only when the signed-in user is an admin) | `screen-admin.js` |
| `#about` | About you | `screen-profile.js` |

Rules applied before the hash, from `coachGate()` in `public/coach/js/institutions.js`: signed out, every address shows Sign in; signed in with no `coaches/{uid}` profile, or one from before institutions (no `institutions`), About you comes first (the admin too). Then `#admin` opens for an admin whatever their own status (an admin may approve themself), and `#about` for anyone. A coach whose `status` is `pending` (or missing) sees **Waiting for approval** at every other address, and one whose status is `declined` sees **Not approved**; only an approved coach reaches My classes, a class or a poster. `<CODE>` is normalised with `normaliseCode` and must pass `isClassCode`, or the route falls through to My classes. Each screen returns a clean-up function that runs before the next one opens (the class screen stops its Firestore listeners there). On every screen change the new `<h1>` receives focus and becomes part of `document.title`. A screen that throws while opening shows "Something went wrong" instead of a blank page.

The header shows the signed-in email and **Sign out** whenever someone is signed in — the email only from 1024 px wide, so an iPad's header stays one row (Sign out's `title` says "Signed in as …", and About you shows it too) — and the nav (My classes, Admin, About you) once the profile is known; Admin appears only when `admins/{uid}` exists, which is read once at sign-in. The footer links to the coach guide, `/coach/guide.html`.

The profile is **watched live** (`cloud.watchProfile`, an `onSnapshot` of `coaches/{uid}`): when the admin's decision changes what the coach may do, the screen changes as it happens — Waiting for approval becomes My classes without a reload. It never re-routes under someone typing in About you or working on the Admin screen. A profile that is "not found" only in the device's cache is treated as no connection, so nobody is sent to About you by mistake.

## Sign in

- **Google only**, with `signInWithPopup` and `prompt: "select_account"`, so a shared iPad always asks whose account.
- **Session-only persistence** (`browserSessionPersistence`): closing the tab signs the coach out. Class iPads are shared, and the coach app shares an origin with the learner app.
- **Sign out** first settles any toast waiting for its Undo, closes the screen (stopping its listeners), and resets the address to `#classes` so the next person does not land in this class.
- In an app's built-in browser (WhatsApp, Telegram, Instagram, Facebook, LINE, WeChat, and Android or iOS web views — `looksLikeInAppBrowser` in `public/coach/js/format.js`), Google refuses to sign anyone in, so the Sign in screen says so up front and offers "Copy the link" for Chrome or Safari. It says it again if the popup is blocked or the browser lacks storage. Closing Google's window says nothing.

## About you

`coaches/{uid}`: **name** (required, 60 characters), **Where you work** — one to ten institutions from the admin's list (`institutions/{id}`, see [admin and approvals](/coach/admin-and-approvals.md#institutions)) — and "How can the admin check who you are?" (300), plus the sign-in email, which cannot be changed here. Only the coach and admins can read it. Save waits for a name and at least one institution.

- **The picker** (`public/coach/js/institution-picker.js`, pure parts in `institutions.js`): the active institutions grouped by organisation A–Z, each place a 56 px checkbox row with its area and type under the name; the chosen ones show above as chips that take themselves off with a tap. Only a list of more than 8 places (`SEARCH_FROM`) gets a search box — every word typed must appear in the name, organisation, area or type, ignoring case and accents — and a box that scrolls on its own. At 10 chosen the other boxes are disabled ("Take one off to choose another"). A retired institution stays shown while it is chosen, marked "(retired)", so it can be taken off; the rules do not check that an id exists, only its shape.
- **A first save** writes the profile with `status: "pending"` and `createdAt`, and goes on to Waiting for approval. The rules require that shape and the stored email to equal the token's email.
- **Later saves** may change only name, note and institutions — whatever the admin decided. Changing the institutions also writes `institutionsChangedAt` (the rules insist on it), and an approved coach stays approved: the admin trusts the person, and the admin's coach list says "Changed …, after approval". `status`, `decidedAt`, `decidedBy` and `suspended` belong to the admin.
- A profile from **before institutions** (it has the old free-text `org` and no `institutions`) opens About you first with "Simplify now asks where you work"; the old `org` stays in the document, and only the Admin screen shows it.

## Waiting for approval

`public/coach/js/screen-waiting.js`. Until an admin approves them, a coach can do nothing but read and change their own profile: the rules refuse every class, page, picture, request and upload, and every callable refuses with "The admin has not approved you yet." The screen is calm and says what happens next: the admin reads About you and may contact them; the page changes by itself when they are approved (they can close it and sign in again later with the same email); then they can make classes or join a colleague's. Below, **What the admin sees** (name, where they work, how to check them) and **Change About you**.

A declined coach sees **Not approved**: "The admin has not approved you as a coach. If you think this is a mistake, contact the admin." with the same summary and link. An admin can approve them later; nothing is deleted.

## My classes

Only for an approved coach.

- **The class list**: every class whose `classCoaches/{code}.uids` contains the coach, sorted by name, each with its code shown as `K7M-3RQ-P9T`, a Paused chip for a suspended class, and what learners see now ("Learners see “…”, published Tue 8:05 am" or "Nothing published yet"). A class the rules won't let this coach read shows as "A class … Can't be opened". A failure never hides the whole list because of one class.
- **Your requests**: requests to join a class still pending ("Waiting for the admin") or declined ("Not approved"). Approved ones disappear, because the class is now in the list. (An older "New class" request, from before coaches made their own, still shows the same way.)
- **New class**: class name (30 characters; learners see it when they join) and **Where is the class?** — a list of the coach's own institutions that are still active, the first chosen. **Make the class** makes it at once, with no admin step (`cloud.createClass`): in one transaction, a new random code (`newClassCode`, retried up to 5 times if the code is taken), `classes/{code}` = `{ name, institution, status: "active", latest: null, createdAt, updatedAt }` and `classCoaches/{code}` = `{ uids: [coach] }`. The rules allow exactly that shape, for one of the coach's active institutions, under a code nobody has. Toast: "Made “5 Joy”. Its code is K7M-3RQ-P9T.", and the new class opens, ready for its first page. If none of the coach's institutions is listed any more, the form says so and links to About you.
- **Join a colleague's class**: the class code, forgiven as it is typed (case, dashes and spaces don't matter), with an echo such as "K7M-3RQ — 3 more to go". Send stays disabled until nine valid characters are there. This writes `requests/{id}` = `{ uid, kind: "join-class", classCode, note, status: "pending", createdAt }`, which the admin decides.
- A suspended coach sees "The admin has paused your account" at the top, and the rules refuse all of the above (`isApprovedCoach` in `firestore.rules` needs `status == 'approved'` and not suspended).

What the admin does with a request is in [admin and approvals](/coach/admin-and-approvals.md). Codes are 9 characters from `23456789ABCDEFGHJKMNPQRSTUVWXYZ`, and the same rules apply as in the learner app's `public/js/class-data.js`.

## The class screen

`screen-class.js` opens four live Firestore listeners: the class document, `pages`, `pictures` and `videos`. That way another coach's upload or publish shows as it happens. The parts share one state object, `ws`, and talk through its events (`class`, `pages`, `pictures`, `videos`, `usage`, `text`, `page`, `cursor`). The top of the screen has the class name, its code and a link to the **QR poster to print**.

- If a listener is refused, the workspace is hidden and the screen says the coach may not be one of the class's coaches, or that the class or account is paused.
- A class the admin has paused shows a warning, and Publish is disabled. The rules let a listed coach read the paused class document itself, but not its pages or shelves (`isClassCoach` requires `status == 'active'`). So those lists stay empty and every write is refused, even though the warning says the class "can be read here".

### Pages

A class has any number of pages in `classes/{code}/pages/{id}` (`title` up to 80 characters, `markdown` up to 20,000, `createdAt/By`, `updatedAt/By`, and `publishedAt` once published). Learners see only the one copied into `classes/{code}.latest`. The others are drafts, and only coaches can read them.

- The pages bar lists them oldest first. "● Learners see this" marks the page whose id is `latest.pageId`. **+ New page** writes an empty page at once.
- On opening a class, the page this tab last had open comes back (sessionStorage `simplify-coach-page-<CODE>`), otherwise the most recently updated page.
- **Saving is automatic**: 1 second after the last keystroke (`SAVE_AFTER`), creating the page on its first save. The line under the box says "Saving…", "Saved Tue 8:05 am", "Not saved yet: no internet …", or "Not saved: … Try again". Leaving the tab with an unsent save triggers the browser's "leave?" prompt. Switching pages saves the one being left.
- **Page name** is for coaches only; learners don't see it (they see the markdown's own `#` heading).
- **Delete this page** removes it from the list at once and shows a toast with Undo. The Firestore delete runs only when the toast goes. A page deleted by someone else while open keeps its words here, and the next save writes it again.
- The character count appears from 18,000 of 20,000. A toolbar action that would pass the limit is refused with "the page is full".

### Editor and toolbar

A plain `<textarea>` with a toolbar above it and one line of help under it ("Each line shows as it is. A line with only --- starts the next screen. …") (`public/coach/js/editor.js`). The text changes are pure functions in `public/coach/js/edit.js`, tested by `tools/test-coach.mjs`:

| Button | Does |
|---|---|
| Heading | toggles `## ` on the touched lines (a `#` heading becomes `##`) |
| Bold (and Ctrl/Cmd+B) | wraps each selected line's words in `**…**`, keeping spaces outside the stars, or unwraps them. With nothing selected it inserts "bold words", selected |
| List | toggles `- ` on the touched lines (a numbered item becomes `- `) |
| Picture | opens the picture shelf in a dialog; a tap places `![words](pictures/<id>.jpg)` |
| Video | lists approved videos; a tap places `![words](videos/<id>.mp4)`, or "Make a short video" opens the maker |
| YouTube | a dialog that takes a pasted link and words and places `[words](https://youtu.be/<id>)` (see [markdown pages](/coach/markdown-pages.md#youtube)) |
| Next screen | places `---` |

Pictures, videos, YouTube lines and `---` go in as a paragraph of their own at the cursor (`insertBlock`), with blank lines around them. Changes are typed in with `execCommand("insertText")` where the browser allows, so the browser's own undo still works. Words for a picture, video or link are cleaned to one line of at most 80 characters with no square brackets (`cleanWords`).

### Live preview

`public/coach/js/preview.js` renders the page with the learner app's own module, `/js/class-markdown.js`, and styles it with `/css/tools/my-class.css` inside a phone-shaped `.class-page`. That is exactly the learner's look, one screen at a time. The module loads when the screen opens, so if it fails the editor still works and the preview says so.

- It redraws 150 ms after typing and follows the cursor: typing on the third screen shows the third screen. Back and Next page through the rest, and on the last screen Next reads "All done" and returns to the first.
- It shows pictures only if they are on the class's shelf, and videos only if approved, exactly as learners would. Below the phone, a warning says how many pictures or videos in the page learners won't see, and asks for any unapproved video to be approved.

### Publish and Unpublish

`public/coach/js/publish.js` sits beside the preview with the **public warning** always visible: "What you publish is public — anyone with the class code can see it. Never put pictures of students or any private or sensitive information in it." (`PUBLIC_WARNING`). There is no consent tick box.

- **Publish** first flushes the save. Then one batch writes the page (`publishedAt`) and `classes/{code}.latest = { pageId, title, markdown, publishedAt, publishedBy }`: both writes happen or neither does. The button reads "Publish this page", "Publish the changes" (this page is live but edited since) or "Published" (disabled, nothing to publish). It is also disabled for an empty page or a paused class.
- **Unpublish** sets `latest` to `null`: learners see "Nothing from your coach yet".
- Both show a toast with **Undo**, which restores what learners saw before. It re-publishes that content **now, by this coach** (the rules require `publishedAt == request.time` and `publishedBy == request.auth.uid` for a coach). The status line always says which page learners see and since when.

The rules allow a coach to change only `latest` and `updatedAt` on the class document, and only while the class is active and the coach is listed, approved and unsuspended.

## Picture shelf

`public/coach/js/pictures-shelf.js` and `public/coach/js/image.js`.

- **Add pictures** is a label around `<input type="file" accept="image/*" multiple>`, so the system's own photo picker or camera opens without a camera permission.
- Each photo is made small **in the coach's browser** (`toShelfJpeg`): decoded (the browser applies EXIF orientation), drawn onto a white canvas at most **1600 px** on its long side, and re-encoded as **JPEG** at quality 0.85. Drawing onto a canvas keeps only pixels, so EXIF, GPS, camera and time data never leave the device. If the result is not under 2 MB it steps down: 1600 px at 0.7, then 1200 px at 0.7, then 900 px at 0.6. A file the browser cannot open (a HEIC photo on Windows, a PDF) is refused with "Try a JPEG or PNG photo".
- The upload goes to Storage `classes/{code}/pictures/{id}.jpg` under a new Firestore id, with `Cache-Control: public, max-age=86400` (a picture never changes). It shows a progress bar. The shelf entry `classes/{code}/pictures/{id}` (`words`, `file`, `width`, `height`, `createdAt/By`) is written afterwards; if that write fails, the file is deleted again.
- Each picture has a words box (80 characters, saved 0.8 s after typing), which is the alt text learners' screen readers read. **Put in page** places it at the cursor, and **Delete** hides it at once with Undo, then removes the shelf entry and the file.
- `storage.rules` accept only `image/jpeg` under 2 MB, as a create that never overwrites, from a listed coach who is approved and not suspended. Anyone may GET an exact path, and nobody may list. The shelf entry needs `width` and `height` ≤ 1600.

## QR poster

`#poster/<CODE>` (`public/coach/js/screen-poster.js`) has **Print** beside its heading and the note about sharing it only with the class's families *under* the poster, so an iPad shows the whole poster, QR code first, without scrolling. The poster is an A4 sheet for printing (`@media print` in `public/coach/css/coach.css` hides everything else). It shows the class name, a QR code for `https://simplify.whiz.coach/#join=<CODE>`, the code in big letters, three set-up steps for the adult with the learner's device (the third spells out the way to the set-up page — ℹ️ How to use this app → Set up this device → Open set-up — for a device with no camera or a Home Screen app), and the site's address. The QR is an SVG drawn with DOM calls from uqr's modules (`qrSvg` in `public/coach/js/qr.js`), with error correction level Q and a 4-module quiet zone. The code is printed as well for an iPad whose camera opens Safari rather than the home-screen app. Nothing on the poster leads to the coach app. How a learner device joins is in [menu and setup](/learner/menu-and-setup.md), and the site's other QR card is in [share card](/operations/share-card.md).

## Errors and the toast

- Every error from `cloud.js` is a `CloudError` with a `code` and a plain `message` that is shown as it is. Firebase codes map to short sentences in `PLAIN`: offline, "You can't do this. The admin may have paused your account or this class.", "That took too long", popup blocked, and so on. A Cloud Function's own refusal message (for example "You have used all 200 AI requests for this month.") passes through unchanged, less the " [403]" the Functions SDK adds to it. A sign-in popup the coach closed is silent.
- Problems appear next to the button that caused them. A problem away from any button, such as a failed background delete, is said once in the toast.
- **The toast** (`public/coach/js/toast.js`) shows one line and, where it applies, **Undo**, for 8 seconds; it stays while pointed at or focused. Nothing asks "are you sure?". Deletes are shown as done at once and happen when the toast goes (timeout, the next toast, `pagehide`, sign-out or leaving the screen), so Undo costs no server work. Screen readers hear it from a status line that is always on the page.

## Tests

- `node tools/test-coach.mjs`: class codes (`newClassCode` rejection sampling), the toolbar functions, `youtubeId`, dates and the Singapore month, `fitWithin`, in-app browser detection, and the institutions (search, grouping, names, `coachGate`, "changed after approval").
- `node tools/smoke.mjs coach` (`tools/smoke/coach.mjs`): every screen and flow in real Chrome against a stand-in `cloud.js` — including About you's picker, Waiting for approval turning into My classes when the admin approves, Not approved, a profile from before institutions, making a class, and the admin's approvals and institutions.
- `node tools/test-rules.mjs`: the Firestore and Storage rules the app relies on.

How to run them is in [local development](/operations/local-development.md).
