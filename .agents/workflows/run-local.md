---
description: Start Simplify's local servers (migrated from .claude/launch.json)
---

Pick what is needed:

1. Learner app (plain static): `python3 -m http.server -d public 8080` → http://localhost:8080
2. Firebase Hosting with real headers/CSP (offline testing): `firebase serve --only hosting --port 5050 --project simplify-special`
3. Emulators for the coach app and My class (run alongside option 1; ports: UI 4000):
   `firebase emulators:start --only auth,firestore,storage,database,functions --project simplify-special`

Tip: tick "Update on reload" under DevTools → Application → Service workers, or edits may not show.
(The old `update-sim` launch entry pointed at a throwaway scratch folder and was not migrated.)
