---
type: Operations Runbook
title: Cloud Project
description: What exists in the Firebase / Google Cloud project simplify-special (billing, APIs, Firestore, the Realtime Database for the push signal, the Storage bucket and its CORS, the functions' service account and IAM, the Storage service agent, the budget, Authentication, Cloud Functions and the three Firestore triggers, email — the Trigger Email from Firestore extension, its Gmail app-password secret and how to set it up, check it and replace the password — the video renderer — Cloud Run job simplify-video, its service account and roles, the Artifact Registry repository, the public guide-videos bucket — Hosting and the custom domain, the first admin), how each was set up (2026-09-23; the Realtime Database and the video renderer 2026-09-26) and how to recreate it, and the hosts a school network must allow.
tags: [firebase, google-cloud, iam, firestore, realtime-database, cloud-storage, cloud-functions, cloud-run, artifact-registry, eventarc, authentication, hosting, email, firebase-extensions, secret-manager, runbook]
status: stable
---

Everything Simplify runs on lives in one Firebase / Google Cloud project, `simplify-special` (project number `908084220716`). The project and its Hosting site date from 2026-08-12; the coach platform's pieces (Firestore, Storage, the functions' service account, Authentication, Cloud Functions, the budget) were set up on 2026-09-23. This document lists each piece as it is now, checked with read-only `gcloud` and REST calls on 2026-09-23, and the commands that would recreate it. Deploying code into it is in [release and deploy](/operations/release-and-deploy.md); what it costs is in [costs and limits](/operations/costs-and-limits.md).

## At a glance

| Piece | Now |
|---|---|
| Billing | Blaze (pay as you go), billing enabled |
| Firestore | `(default)`, Native mode, Standard edition, `asia-southeast1`, delete protection on, free tier applies, point-in-time recovery off |
| Realtime Database | `simplify-special-default-rtdb` (the default instance), `asia-southeast1`, rules from `database.rules.json`; holds only `signals/{code}` |
| Storage bucket | `gs://simplify-special.firebasestorage.app`, region `ASIA-SOUTHEAST1`, Standard class, read-only CORS from `storage-cors.json`, 7-day soft delete |
| Functions' identity | `simplify-functions@simplify-special.iam.gserviceaccount.com`: `roles/aiplatform.user`, `roles/datastore.user`, `roles/firebasedatabase.admin`, `roles/eventarc.eventReceiver` on the project; `roles/storage.objectAdmin` on the bucket only |
| Storage rules → Firestore | Firebase Storage service agent holds `roles/firebaserules.firestoreServiceAgent` |
| Budget | "simplify-special monthly (S$50)": S$50 a month, this project only, alerts at 50%, 90% and 100% of actual spend |
| Authentication | Google provider on; authorized domains `simplify.whiz.coach`, `simplify-special.web.app`, `simplify-special.firebaseapp.com`, `localhost` |
| Cloud Functions | six 2nd-gen callables in `asia-southeast1`, Node.js 22, 256 MiB, max 10 instances, running as `simplify-functions`, invokable by `allUsers`; three Firestore triggers, `classSignal`, `coachMail` and `requestMail` (the last two called by nothing until their invoker grants, below), through Eventarc; `simplify-functions` holds `roles/run.developer` on the job `simplify-video` and `roles/iam.serviceAccountUser` on `simplify-video@` |
| Email | **not live yet** (2026-09-27: see [Email](#email) for what is left). The extension Trigger Email from Firestore (instance `firestore-send-email`, `firebase/firestore-send-email@0.2.10`, installed by hand), `asia-southeast1`, running as `ext-firestore-send-email@simplify-special.iam.gserviceaccount.com`; sends `mail/` through Gmail as `ashish@whiz.coach`, from `Simplify <contact@whiz.coach>` |
| Secret Manager | **not set up yet** (the API is off): one secret, `ext-firestore-send-email-SMTP_PASSWORD` (the email extension's Gmail app password), replicated in `asia-southeast1` only |
| Video renderer | Cloud Run job `simplify-video`, `asia-southeast1`, 2 CPU, 4 GiB, 30-minute task timeout, no retries, running as `simplify-video@simplify-special.iam.gserviceaccount.com`; image in the Artifact Registry repository `simplify` (Docker, `asia-southeast1`) |
| Guide videos | `gs://simplify-guide-videos`, `asia-southeast1`, uniform access, public to read |
| Hosting | default site `simplify-special` (`simplify-special.web.app`), custom domain `simplify.whiz.coach` active with its certificate |
| AI and voice | Vertex AI API on; Gemini called on the `global` endpoint (see [AI models](/platform/ai-models.md)); Cloud Text-to-Speech for the recorded voice and the videos |

## Billing and APIs

The project is on the **Blaze** plan: Cloud Storage for Firebase needs it for a bucket since 3 February 2026, and so do Cloud Functions. The APIs the app depends on are enabled: `firestore`, `firebasestorage`, `storage`, `firebaserules`, `identitytoolkit`, `securetoken`, `firebasehosting`, `cloudfunctions`, `run`, `cloudbuild`, `artifactregistry`, `eventarc`, `aiplatform`, `billingbudgets`, `firebasedatabase` and `texttospeech`, and for email `firebaseextensions` and `secretmanager` (all `.googleapis.com`).

```sh
gcloud billing projects link simplify-special --billing-account=<BILLING_ACCOUNT_ID>
gcloud services enable firestore.googleapis.com firebasestorage.googleapis.com storage.googleapis.com \
  firebaserules.googleapis.com identitytoolkit.googleapis.com securetoken.googleapis.com \
  firebasehosting.googleapis.com cloudfunctions.googleapis.com run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com eventarc.googleapis.com aiplatform.googleapis.com \
  billingbudgets.googleapis.com firebasedatabase.googleapis.com texttospeech.googleapis.com \
  firebaseextensions.googleapis.com secretmanager.googleapis.com --project simplify-special
```

## Firestore

One database, `(default)`, in `asia-southeast1` (Singapore), Native mode, with delete protection so it cannot be removed by accident. It holds the classes, pages, coaches, requests, usage counters and `config/limits` (shapes in [data model](/platform/data-model.md)). Rules and indexes deploy from `firestore.rules` and `firestore.indexes.json`.

```sh
gcloud firestore databases create --database="(default)" --location=asia-southeast1 \
  --type=firestore-native --delete-protection --project simplify-special
firebase deploy --only firestore:rules,firestore:indexes
```

## Realtime Database

One instance, the project's default, `simplify-special-default-rtdb` in `asia-southeast1` (Singapore), at `https://simplify-special-default-rtdb.asia-southeast1.firebasedatabase.app`, created on 2026-09-26. It holds only the push signal learner devices stream (`signals/{code}` = `{ at, force }`, see [data model](/platform/data-model.md#realtime-database)); the `classSignal` function writes it and `database.rules.json` lets anyone read one class's node by its exact code and nothing else. The stream answers directly (no redirect) and with `Access-Control-Allow-Origin: *`.

`firebase database:instances:create` makes only extra instances, and `firebase init database` asks questions, so the default instance was made with the Realtime Database Management API:

```sh
gcloud services enable firebasedatabase.googleapis.com --project simplify-special
curl -X POST -H "Authorization: Bearer $(gcloud auth print-access-token)" -H "Content-Type: application/json" \
  -H "x-goog-user-project: simplify-special" \
  "https://firebasedatabase.googleapis.com/v1beta/projects/simplify-special/locations/asia-southeast1/instances?databaseId=simplify-special-default-rtdb" \
  -d '{"type":"DEFAULT_DATABASE"}'
firebase deploy --only database
```

## Storage bucket

The default Firebase bucket `simplify-special.firebasestorage.app`, in `asia-southeast1`, holds class pictures and videos under `classes/{code}/…`. Create it in the Firebase console (**Storage → Get started**, location `asia-southeast1`), which also links it to Firebase.

Learner devices download pictures and videos from another origin, so the bucket has a read-only CORS policy from `storage-cors.json`: any origin, `GET` and `HEAD` only, the range headers a video player needs, cached for an hour. What may be read at all is decided by `storage.rules` (exact paths only, never a listing).

```sh
gcloud storage buckets update gs://simplify-special.firebasestorage.app --cors-file=storage-cors.json
firebase deploy --only storage
```

Deleted objects are kept for 7 days (the bucket's default soft-delete policy).

`firebase.json` names the bucket through a deploy target (`"storage": [{ "target": "main", "rules": "storage.rules" }]`, with `main` → `simplify-special.firebasestorage.app` under `targets` in `.firebaserc`). Without it the CLI asks the Firebase Storage API for the default bucket, which the CI deploy account cannot see (it answers 404, reported as "Firebase Storage has not been set up"). The emulators resolve the same target, since `.firebaserc`'s default project is `simplify-special`.

## The functions' service account

The Cloud Functions run as `simplify-functions@simplify-special.iam.gserviceaccount.com` (`serviceAccount` in `setGlobalOptions` in `functions/index.js`), not as the default compute account, so they get only what they use: calling Gemini, reading and writing Firestore through the Admin SDK, reading and writing objects in the one bucket, writing the push signal to the Realtime Database (`roles/firebasedatabase.admin`: no narrower predefined role lets the Admin SDK write data), and receiving the triggers' Firestore events (`roles/eventarc.eventReceiver`).

```sh
gcloud iam service-accounts create simplify-functions --display-name="Simplify Cloud Functions" \
  --project simplify-special
SA=serviceAccount:simplify-functions@simplify-special.iam.gserviceaccount.com
gcloud projects add-iam-policy-binding simplify-special --member=$SA --role=roles/aiplatform.user
gcloud projects add-iam-policy-binding simplify-special --member=$SA --role=roles/datastore.user
gcloud projects add-iam-policy-binding simplify-special --member=$SA --role=roles/firebasedatabase.admin
gcloud projects add-iam-policy-binding simplify-special --member=$SA --role=roles/eventarc.eventReceiver
gcloud storage buckets add-iam-policy-binding gs://simplify-special.firebasestorage.app \
  --member=$SA --role=roles/storage.objectAdmin
```

Whoever deploys the functions must be allowed to act as this account (`roles/iam.serviceAccountUser` on it; project owners already are). The Firebase CLI also checks, before any functions deploy, that the deployer may act as the App Engine default account `simplify-special@appspot.gserviceaccount.com`, although nothing runs as it (there is no App Engine app or scheduled job, and the email extension runs as its own account). That account held the project-wide Editor role by Google's default; the owner removed it (2026-09-25), so it holds no roles, and the CI deploy account may act as it without gaining anything. If a Google service ever needs it again, it will fail with a permission error naming that account.

Function builds (Cloud Build) run as the default compute account `908084220716-compute@developer.gserviceaccount.com`, so a deployer must be allowed to act as it too. It also held Editor by default; the owner replaced that (2026-09-25) with **Cloud Build Builder** alone — read the uploaded source, write build logs, push the image to `gcf-artifacts` — which is all a build uses (nothing else runs as it: no VMs, and the Cloud Run job runs as its own account). The video renderer's image is built by Cloud Build as this account too. A build failing for a missing permission would name this account; put the permission (not Editor) back.

## Storage rules can read Firestore

`storage.rules` decides who is a class's coach with `firestore.get(…/classCoaches/$(code))` and `firestore.get(…/coaches/$(uid))`, and who is an admin with `firestore.exists(…/admins/$(uid))`. Those lookups need `roles/firebaserules.firestoreServiceAgent` on the Cloud Storage for Firebase service agent; without it every coach upload fails. An interactive `firebase deploy --only storage` offers to grant it; by hand:

```sh
gcloud projects add-iam-policy-binding simplify-special \
  --member=serviceAccount:service-908084220716@gcp-sa-firebasestorage.iam.gserviceaccount.com \
  --role=roles/firebaserules.firestoreServiceAgent
```

## Budget

A monthly budget of **S$50** on the billing account, filtered to this project, with alert thresholds at 50%, 90% and 100% of current spend, sent to the billing account's administrators by email (no Pub/Sub or channel). It warns; it does not stop spending (see [costs and limits](/operations/costs-and-limits.md)).

```sh
gcloud billing budgets create --billing-account=<BILLING_ACCOUNT_ID> \
  --display-name="simplify-special monthly (S\$50)" --budget-amount=50SGD \
  --filter-projects=projects/simplify-special --calendar-period=month \
  --threshold-rule=percent=0.5 --threshold-rule=percent=0.9 --threshold-rule=percent=1.0
```

## Firebase Authentication

Only coaches and the admin sign in (learners never do), with Google. In the Firebase console: **Authentication → Sign-in method → Google → Enable**, then **Settings → Authorized domains**: `simplify.whiz.coach`, `simplify-special.web.app`, `simplify-special.firebaseapp.com` and `localhost`. PR preview hosts are not listed, so sign-in is refused there. Authentication itself runs in Google's US data centres and holds only coaches' and the admin's sign-in data.

The coach app's web config (`public/coach/js/firebase-config.js`) comes from `firebase apps:sdkconfig WEB <appId> --project simplify-special`; the API key in it only names the project, and the rules decide access.

## Cloud Functions

Six 2nd-gen HTTPS callables, `writePage`, `planOverlay`, `makeVideo`, `checkVideo`, `approveVideo` and `discardVideo`, in `asia-southeast1`, on Node.js 22 (`runtime` in `firebase.json`), 256 MiB, at most 10 instances each (`maxInstances` in `functions/index.js`), running as `simplify-functions`. Each Cloud Run service grants `roles/run.invoker` to `allUsers`, as callables require; every handler checks the caller itself (`requireClassCoach` in `functions/lib.js`). **A new callable needs that grant by hand**: CI's deploy account may create a function but not set its IAM policy, so the first deploy of a new callable fails with "Failed to set invoker function …" (and then skips deleting removed ones). The owner grants it, deletes any removed function the failed run skipped, and re-runs the workflow — as on 2026-09-26 for `makeVideo` and `planOverlay` (with `planVideo` and `startVideo` deleted):

```sh
gcloud run services add-iam-policy-binding makevideo --region asia-southeast1 --project simplify-special \
  --member=allUsers --role=roles/run.invoker
gcloud functions delete planVideo --region asia-southeast1 --project simplify-special --gen2 --quiet
```
 Environment: `GCLOUD_PROJECT` (set by the platform) and the optional `SIMPLIFY_BUCKET`, defaulting to `simplify-special.firebasestorage.app`, and `SIMPLIFY_RENDER_JOB`, defaulting to `simplify-video`. The functions have no secrets: Gemini is reached through Vertex AI, and the video job through the Cloud Run Admin API, with the service account's own credentials. (The project's one secret is the email extension's, below.)

Three Firestore triggers run in the same region with the same identity: `classSignal` (`onDocumentWritten("classes/{code}")`) writes the push signal to the Realtime Database whenever a class's page changes (`functions/signal.js`), and `coachMail` (`coaches/{uid}`) and `requestMail` (`requests/{id}`) queue emails in `mail/` (`functions/mail.js`, see [Email](#email)). They are delivered through Eventarc: the Eventarc service agent (`service-908084220716@gcp-sa-eventarc.iam.gserviceaccount.com`, `roles/eventarc.serviceAgent`) and `simplify-functions`' `roles/eventarc.eventReceiver`. The very first deploy of a trigger in a project can fail with "Permission denied while using the Eventarc Service Agent" while those permissions spread; deploying again a few minutes later works. Eventarc delivers each event through a Pub/Sub push subscription that calls the function's Cloud Run service as `simplify-functions`, so that account needs `roles/run.invoker` on each trigger's service, granted service by service because the CLI does not grant it: on `classsignal` since 2026-09-26, and on `coachmail` and `requestmail` by the owner right after their first deploy. Without it the logs show 403 "lacks run.routes.invoke" and the trigger does nothing (no signal, no email). A function deleted and made again needs it again:

```sh
for service in classsignal coachmail requestmail; do
  gcloud run services add-iam-policy-binding $service --region asia-southeast1 --project simplify-special \
    --member=serviceAccount:simplify-functions@simplify-special.iam.gserviceaccount.com --role=roles/run.invoker
done
```

A merge to `main` deploys them, after the tests and before the website (see [release and deploy](/operations/release-and-deploy.md#ci-workflows)). By hand, only when CI is unavailable:

```sh
firebase deploy --only functions
```

The coach app's CSP names the functions' origin, `https://asia-southeast1-simplify-special.cloudfunctions.net`: moving region means changing `functions/index.js`, `FUNCTIONS_REGION` in `public/coach/js/firebase-config.js` and `firebase.json` together.

## Email

The functions email coaches and admins about approvals and requests ([security](/platform/security.md#email) says who and what) the way whiz.coach sends its own mail: `functions/mail.js` writes one document per email to `mail/{id}`, and the Firebase extension **Trigger Email from Firestore** (instance `firestore-send-email`, `firebase/firestore-send-email@0.2.10`, pinned under `extensions` in `firebase.json`) sends it and writes `delivery.state` back onto it. Its settings are `extensions/firestore-send-email.env`:

- **Transport**: Gmail submission, `smtps://ashish%40whiz.coach@smtp.gmail.com:465`, signed in as the Google Workspace user `ashish@whiz.coach` with an **app password of Simplify's own** (revoking whiz.coach's leaves Simplify's mail working, and the other way round), sending as its alias: `From: Simplify <contact@whiz.coach>`, `Reply-To: contact@whiz.coach`. Not `smtp-relay.gmail.com:587`: the relay admits servers by allowlisted IP, and a function's IP changes (it answers `421-4.7.0 Try again later` at EHLO). Never sign in as `contact@`: an alias has no app password.
- **DNS: nothing to do.** whiz.coach's SPF, DKIM and strict DMARC already authenticate mail from `contact@whiz.coach`, whichever project hands it to Gmail; they are kept with whiz.coach's own set-up.
- **The limit is shared**: the account may send to about 2,000 recipients a day, for every whiz.coach environment and Simplify together (the cap on Simplify's side is in [costs and limits](/operations/costs-and-limits.md#email)).
- **The extension's function**, `ext-firestore-send-email-processqueue` (2nd gen, `asia-southeast1`, beside the database), runs as its own account, `ext-firestore-send-email@simplify-special.iam.gserviceaccount.com`, which the extension creates with the roles it declares.
- **The secret**, `ext-firestore-send-email-SMTP_PASSWORD`, holds the app password, replicated in `asia-southeast1` only. It is made with `gcloud`, so it has no `firebase-extensions-managed` label, and uninstalling the extension should leave it alone (the Firebase CLI deletes only labelled secrets; whether the Extensions service itself would is not documented, hence the version check below). An extensions deploy that installs or changes the extension grants the Firebase Extensions service agent (`service-908084220716@gcp-sa-firebasemods.iam.gserviceaccount.com`) `roles/secretmanager.admin` on it, so the extension can let its own account read it.

**Status, 2026-09-27: not live yet.** The code is merged, so CI has deployed `coachMail` and `requestMail`, but nothing calls them until their `run.invoker` grants ([Cloud Functions](#cloud-functions)), so nothing is written to `mail/` and nobody is emailed. Still to do, in this order: steps 1 to 3 below, one test email to the owner's own address (its `delivery.state` and, in Gmail's "Show original", `spf=pass`, `dkim=pass` for `whiz.coach` and `dmarc=pass`), then the two grants. The grants come last: an email written before the extension is installed is never sent. Events from before the grants may still arrive once they are made (Pub/Sub keeps retrying them for up to a day). Once it is live, this paragraph and the "not live yet" notes above go.

Set up by hand (an email written while no extension is installed is never sent):

1. The owner makes the app password at <https://myaccount.google.com/apppasswords>, signed in as `ashish@whiz.coach` (check the account chip first; it needs 2-Step Verification), and names it for Simplify. Google shows it in four groups of four; the commands below drop the spaces.
2. The Secret Manager API, then the secret, pasted without echo so it stays out of the shell history:

   ```sh
   gcloud services enable secretmanager.googleapis.com --project simplify-special
   read -rs P && printf '%s' "${P// /}" | gcloud secrets create ext-firestore-send-email-SMTP_PASSWORD \
     --project simplify-special --replication-policy=user-managed --locations=asia-southeast1 --data-file=- ; unset P
   ```

3. The extension, after checking that nothing installed is missing from `firebase.json`:

   ```sh
   firebase ext:list --project simplify-special
   firebase deploy --only extensions --project simplify-special
   ```

**Never deployed by CI**, whose account has no Extensions role. CI's `--force` deletes only functions the CLI itself deployed (labelled `deployment-tool: cli-firebase…`), never the extension's (`firebase-extensions`). **An extensions deploy is all or nothing**: `--only extensions:<instance>` is refused, and an extension that is installed but missing from `firebase.json` is uninstalled, with its own secrets. So `firebase ext:list` comes first, every time; a bare `firebase deploy` would reconcile the extensions too.

**Checking it.** Every email leaves its document: `delivery.state` ends `SUCCESS`, or `ERROR` with the SMTP error in `delivery.error`; the function's logs are under `ext-firestore-send-email-processqueue`. Bounces go to `contact@whiz.coach`, often into the Spam folder of `ashish@whiz.coach`. After any extensions deploy, check that the secret still has an enabled version and that the live settings are the committed ones:

```sh
gcloud secrets versions list ext-firestore-send-email-SMTP_PASSWORD --project simplify-special --filter='state:ENABLED'
gcloud functions describe ext-firestore-send-email-processqueue --gen2 --region asia-southeast1 --project simplify-special \
  --format='value(serviceConfig.environmentVariables.DEFAULT_FROM,serviceConfig.secretEnvironmentVariables)'
```

| `delivery.error` | Cause | Fix |
|---|---|---|
| `534 5.7.9 Application-specific password required` | the secret holds the account's own password, or the address in the URI is `contact@` | an app password of `ashish@whiz.coach` |
| `535 5.7.8 Username and Password not accepted` | the app password was revoked, or 2-Step Verification was turned off | a new app password (below) |
| `421-4.7.0 Try again later` (at EHLO) | the URI names `smtp-relay.gmail.com` | `smtp.gmail.com:465`, as committed |

**A new app password** (after a revoke, or to change it): make one as in step 1, add it as a new version, deploy the extension again, check with the `describe` above that it uses the new version, then disable the old one (`gcloud secrets versions disable <n> --secret ext-firestore-send-email-SMTP_PASSWORD --project simplify-special`):

```sh
read -rs P && printf '%s' "${P// /}" | gcloud secrets versions add ext-firestore-send-email-SMTP_PASSWORD \
  --project simplify-special --data-file=- ; unset P
firebase ext:list --project simplify-special
firebase deploy --only extensions --project simplify-special
```

To stop all of Simplify's email at once, revoke its app password: every email then ends `ERROR` (535) and nothing else changes.

## The video renderer

Set up on 2026-09-26. The renderer in `video/` films the real app into videos: the coaches' page videos and the three guide videos ([guide videos](/operations/guide-videos.md), [videos](/coach/videos.md)). In the cloud it is one Cloud Run job, with its own account, image repository and a public bucket for the guide videos.

**The image.** An Artifact Registry Docker repository `simplify` in `asia-southeast1` holds `asia-southeast1-docker.pkg.dev/simplify-special/simplify/video:latest`, built by Cloud Build from `video/Dockerfile` (the upload is limited by `.gcloudignore`). No workflow builds it; rebuild it by hand when `video/` or the learner reader changes ([guide videos](/operations/guide-videos.md#the-cloud-run-job)).

```sh
gcloud artifacts repositories create simplify --repository-format=docker --location=asia-southeast1 \
  --project simplify-special
gcloud builds submit --config video/cloudbuild.yaml --project simplify-special --region asia-southeast1 .
```

**The renderer's account**, `simplify-video@simplify-special.iam.gserviceaccount.com`, holds only what the renderer uses: `roles/storage.objectAdmin` on `gs://simplify-guide-videos` (the guide videos) and on `gs://simplify-special.firebasestorage.app` (a page video's draft), `roles/datastore.user` (reading the video document and marking it ready) and `roles/serviceusage.serviceUsageConsumer` (Text-to-Speech, billed to the project).

```sh
gcloud iam service-accounts create simplify-video --display-name="Simplify video renderer" \
  --project simplify-special
V=serviceAccount:simplify-video@simplify-special.iam.gserviceaccount.com
gcloud storage buckets add-iam-policy-binding gs://simplify-guide-videos --member=$V --role=roles/storage.objectAdmin
gcloud storage buckets add-iam-policy-binding gs://simplify-special.firebasestorage.app \
  --member=$V --role=roles/storage.objectAdmin
gcloud projects add-iam-policy-binding simplify-special --member=$V --role=roles/datastore.user
gcloud projects add-iam-policy-binding simplify-special --member=$V --role=roles/serviceusage.serviceUsageConsumer
```

**The job**, `simplify-video` in `asia-southeast1`: 2 CPU, 4 GiB, one task, a 30-minute task timeout, no retries, running as that account. Its default arguments (`all --upload`) remake the guide videos; `makeVideo` runs it with `page <code> <videoId>`.

```sh
gcloud run jobs deploy simplify-video --region asia-southeast1 --project simplify-special \
  --image asia-southeast1-docker.pkg.dev/simplify-special/simplify/video:latest \
  --service-account simplify-video@simplify-special.iam.gserviceaccount.com \
  --cpu 2 --memory 4Gi --task-timeout 30m --max-retries 0 \
  --set-env-vars GOOGLE_CLOUD_PROJECT=simplify-special,GUIDE_VIDEO_BUCKET=simplify-guide-videos
```

**The functions may run it, and nothing else may.** `makeVideo` starts a run with its own arguments through the Cloud Run Admin API, which needs `roles/run.developer` on the job (running with overrides is not in `roles/run.invoker`), and acting as the job's account needs `roles/iam.serviceAccountUser` on it:

```sh
F=serviceAccount:simplify-functions@simplify-special.iam.gserviceaccount.com
gcloud run jobs add-iam-policy-binding simplify-video --region asia-southeast1 --project simplify-special \
  --member=$F --role=roles/run.developer
gcloud iam service-accounts add-iam-policy-binding simplify-video@simplify-special.iam.gserviceaccount.com \
  --member=$F --role=roles/iam.serviceAccountUser --project simplify-special
```

A job deleted and made again needs its grant again.

**The guide-videos bucket**, `gs://simplify-guide-videos`: `asia-southeast1`, uniform bucket-level access, and public to read, since the guides play from it. It holds only the three guide videos and their posters, never a class's file ([guide videos](/operations/guide-videos.md#the-guide-videos-bucket)).

```sh
gcloud storage buckets create gs://simplify-guide-videos --location=asia-southeast1 \
  --uniform-bucket-level-access --project simplify-special
gcloud storage buckets add-iam-policy-binding gs://simplify-guide-videos \
  --member=allUsers --role=roles/storage.objectViewer
```

## Hosting and the custom domain

The default Hosting site `simplify-special` serves `public/` at `https://simplify-special.web.app/`. The custom domain `simplify.whiz.coach` was added under **Hosting → Custom domains** in the Firebase console, with the DNS records it asks for at the `whiz.coach` DNS provider; it is active with a managed certificate. Deploys come from CI (see [release and deploy](/operations/release-and-deploy.md)).

## The first admin

There is no admin until the owner makes one, and no client can: `admins/{uid}` is created only in the console.

1. The person opens https://simplify.whiz.coach/coach/ and signs in with Google once.
2. In the Firebase console, **Authentication → Users**, copy their User UID.
3. In **Firestore**, create collection `admins`, document ID = that UID (any field, e.g. `name`).

From then on they approve coaches and set limits in the coach app ([admin and approvals](/coach/admin-and-approvals.md)).

## School networks

A school's filtered network must allow these hosts over HTTPS:

| For | Hosts |
|---|---|
| The learner app, including My class | `simplify.whiz.coach`, `firestore.googleapis.com`, `firebasestorage.googleapis.com`, `simplify-special-default-rtdb.asia-southeast1.firebasedatabase.app` (the push stream; without it a new page still arrives when My class opens); `www.youtube-nocookie.com` if pages embed YouTube; `storage.googleapis.com` for the guide's videos |
| The coach app, in addition | `apis.google.com`, `accounts.google.com`, `identitytoolkit.googleapis.com`, `securetoken.googleapis.com`, `simplify-special.firebaseapp.com`, `asia-southeast1-simplify-special.cloudfunctions.net`, `lh3.googleusercontent.com` |

The learner list is the learner CSP's `connect-src`, `frame-src` and (for the guide videos) `media-src`; the coach list follows the `/coach` CSP plus Google's sign-in page (see [security](/platform/security.md)).

## Checking it

Read-only commands that show the state above:

```sh
gcloud billing projects describe simplify-special
gcloud services list --enabled --project simplify-special
gcloud firestore databases list --project simplify-special
gcloud storage buckets describe gs://simplify-special.firebasestorage.app --format=json
gcloud storage buckets get-iam-policy gs://simplify-special.firebasestorage.app
gcloud projects get-iam-policy simplify-special --format=json
gcloud functions list --project simplify-special
firebase database:instances:list --project simplify-special
gcloud run jobs describe simplify-video --region asia-southeast1 --project simplify-special
gcloud run jobs get-iam-policy simplify-video --region asia-southeast1 --project simplify-special
gcloud artifacts repositories list --location=asia-southeast1 --project simplify-special
gcloud storage buckets get-iam-policy gs://simplify-guide-videos
gcloud billing budgets list --billing-account=<BILLING_ACCOUNT_ID> --billing-project=simplify-special
```
