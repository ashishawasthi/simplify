---
type: Operations Runbook
title: Cloud Project
description: What exists in the Firebase / Google Cloud project simplify-special (billing, APIs, Firestore, the Storage bucket and its CORS, the functions' service account and IAM, the Storage service agent, the budget, Authentication, Cloud Functions, Hosting and the custom domain, the first admin), how each was set up on 2026-09-23 and how to recreate it, and the hosts a school network must allow.
tags: [firebase, google-cloud, iam, firestore, cloud-storage, cloud-functions, authentication, hosting, runbook]
status: stable
---

Everything Simplify runs on lives in one Firebase / Google Cloud project, `simplify-special` (project number `908084220716`). The project and its Hosting site date from 2026-08-12; the coach platform's pieces (Firestore, Storage, the functions' service account, Authentication, Cloud Functions, the budget) were set up on 2026-09-23. This document lists each piece as it is now, checked with read-only `gcloud` and REST calls on 2026-09-23, and the commands that would recreate it. Deploying code into it is in [release and deploy](/operations/release-and-deploy.md); what it costs is in [costs and limits](/operations/costs-and-limits.md).

## At a glance

| Piece | Now |
|---|---|
| Billing | Blaze (pay as you go), billing enabled |
| Firestore | `(default)`, Native mode, Standard edition, `asia-southeast1`, delete protection on, free tier applies, point-in-time recovery off |
| Storage bucket | `gs://simplify-special.firebasestorage.app`, region `ASIA-SOUTHEAST1`, Standard class, read-only CORS from `storage-cors.json`, 7-day soft delete |
| Functions' identity | `simplify-functions@simplify-special.iam.gserviceaccount.com`: `roles/aiplatform.user`, `roles/datastore.user` on the project; `roles/storage.objectAdmin` on the bucket only |
| Storage rules → Firestore | Firebase Storage service agent holds `roles/firebaserules.firestoreServiceAgent` |
| Budget | "simplify-special monthly (S$50)": S$50 a month, this project only, alerts at 50%, 90% and 100% of actual spend |
| Authentication | Google provider on; authorized domains `simplify.whiz.coach`, `simplify-special.web.app`, `simplify-special.firebaseapp.com`, `localhost` |
| Cloud Functions | six 2nd-gen callables in `asia-southeast1`, Node.js 22, 256 MiB, max 10 instances, running as `simplify-functions`, invokable by `allUsers` |
| Hosting | default site `simplify-special` (`simplify-special.web.app`), custom domain `simplify.whiz.coach` active with its certificate |
| AI | Vertex AI API on; Gemini called on the `global` endpoint (see [AI models](/platform/ai-models.md)) |

## Billing and APIs

The project is on the **Blaze** plan: Cloud Storage for Firebase needs it for a bucket since 3 February 2026, and so do Cloud Functions. The APIs the app depends on are enabled: `firestore`, `firebasestorage`, `storage`, `firebaserules`, `identitytoolkit`, `securetoken`, `firebasehosting`, `cloudfunctions`, `run`, `cloudbuild`, `artifactregistry`, `eventarc`, `aiplatform` and `billingbudgets` (all `.googleapis.com`).

```sh
gcloud billing projects link simplify-special --billing-account=<BILLING_ACCOUNT_ID>
gcloud services enable firestore.googleapis.com firebasestorage.googleapis.com storage.googleapis.com \
  firebaserules.googleapis.com identitytoolkit.googleapis.com securetoken.googleapis.com \
  firebasehosting.googleapis.com cloudfunctions.googleapis.com run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com eventarc.googleapis.com aiplatform.googleapis.com \
  billingbudgets.googleapis.com --project simplify-special
```

## Firestore

One database, `(default)`, in `asia-southeast1` (Singapore), Native mode, with delete protection so it cannot be removed by accident. It holds the classes, pages, coaches, requests, usage counters and `config/limits` (shapes in [data model](/platform/data-model.md)). Rules and indexes deploy from `firestore.rules` and `firestore.indexes.json`.

```sh
gcloud firestore databases create --database="(default)" --location=asia-southeast1 \
  --type=firestore-native --delete-protection --project simplify-special
firebase deploy --only firestore:rules,firestore:indexes
```

## Storage bucket

The default Firebase bucket `simplify-special.firebasestorage.app`, in `asia-southeast1`, holds class pictures and videos under `classes/{code}/…`. Create it in the Firebase console (**Storage → Get started**, location `asia-southeast1`), which also links it to Firebase.

Learner devices download pictures and videos from another origin, so the bucket has a read-only CORS policy from `storage-cors.json`: any origin, `GET` and `HEAD` only, the range headers a video player needs, cached for an hour. What may be read at all is decided by `storage.rules` (exact paths only, never a listing).

```sh
gcloud storage buckets update gs://simplify-special.firebasestorage.app --cors-file=storage-cors.json
firebase deploy --only storage
```

Deleted objects are kept for 7 days (the bucket's default soft-delete policy).

## The functions' service account

The Cloud Functions run as `simplify-functions@simplify-special.iam.gserviceaccount.com` (`serviceAccount` in `setGlobalOptions` in `functions/index.js`), not as the default compute account, so they get only what they use: calling Gemini, reading and writing Firestore through the Admin SDK, and reading and writing objects in the one bucket.

```sh
gcloud iam service-accounts create simplify-functions --display-name="Simplify Cloud Functions" \
  --project simplify-special
SA=serviceAccount:simplify-functions@simplify-special.iam.gserviceaccount.com
gcloud projects add-iam-policy-binding simplify-special --member=$SA --role=roles/aiplatform.user
gcloud projects add-iam-policy-binding simplify-special --member=$SA --role=roles/datastore.user
gcloud storage buckets add-iam-policy-binding gs://simplify-special.firebasestorage.app \
  --member=$SA --role=roles/storage.objectAdmin
```

Whoever deploys the functions must be allowed to act as this account (`roles/iam.serviceAccountUser` on it; project owners already are).

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

Six 2nd-gen HTTPS callables, `writePage`, `planVideo`, `startVideo`, `checkVideo`, `approveVideo` and `discardVideo`, in `asia-southeast1`, on Node.js 22 (`runtime` in `firebase.json`), 256 MiB, at most 10 instances each (`maxInstances` in `functions/index.js`), running as `simplify-functions`. Each Cloud Run service grants `roles/run.invoker` to `allUsers`, as callables require; every handler checks the caller itself (`requireClassCoach` in `functions/lib.js`). Environment: `GCLOUD_PROJECT` (set by the platform) and the optional `SIMPLIFY_BUCKET`, defaulting to `simplify-special.firebasestorage.app`. There are no secrets: Gemini is reached through Vertex AI with the service account's own credentials.

```sh
firebase deploy --only functions
```

The coach app's CSP names the functions' origin, `https://asia-southeast1-simplify-special.cloudfunctions.net`: moving region means changing `functions/index.js`, `FUNCTIONS_REGION` in `public/coach/js/firebase-config.js` and `firebase.json` together.

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
| The learner app, including My class | `simplify.whiz.coach`, `firestore.googleapis.com`, `firebasestorage.googleapis.com`; `www.youtube-nocookie.com` if pages embed YouTube |
| The coach app, in addition | `apis.google.com`, `accounts.google.com`, `identitytoolkit.googleapis.com`, `securetoken.googleapis.com`, `simplify-special.firebaseapp.com`, `asia-southeast1-simplify-special.cloudfunctions.net`, `lh3.googleusercontent.com` |

The learner list is the learner CSP's `connect-src` and `frame-src`; the coach list follows the `/coach` CSP plus Google's sign-in page (see [security](/platform/security.md)).

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
gcloud billing budgets list --billing-account=<BILLING_ACCOUNT_ID> --billing-project=simplify-special
```
