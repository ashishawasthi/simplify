// The coach app's Firebase project (simplify-special), from
//   firebase apps:sdkconfig WEB 1:908084220716:web:37672d0f4b52add9779289 --project simplify-special
// The web API key only names the project to Google's servers; what anyone
// may read or write is decided by firestore.rules and storage.rules.
// (No measurementId: the coach app has no analytics.)

export const FIREBASE_CONFIG = Object.freeze({
  apiKey: "AIzaSyB3KmmNk2gjwO9qXYqA685A1J779brx7iU",
  authDomain: "simplify-special.firebaseapp.com",
  projectId: "simplify-special",
  storageBucket: "simplify-special.firebasestorage.app",
  messagingSenderId: "908084220716",
  appId: "1:908084220716:web:37672d0f4b52add9779289",
});

// The Cloud Functions' region (functions/index.js)
export const FUNCTIONS_REGION = "asia-southeast1";

// On localhost and 127.0.0.1 only, the app talks to the Firebase emulators
// instead (`firebase emulators:start`), on the ports in firebase.json. A test
// that runs the emulators on ports of its own puts them in localStorage
// "simplify-coach-emulators" first, e.g. {"auth":9699,"firestore":8685,…}.
export const EMULATOR_PORTS = Object.freeze({ auth: 9099, firestore: 8085, storage: 9199, functions: 5001 });

export function emulators(location = globalThis.location) {
  if (!["localhost", "127.0.0.1"].includes(location?.hostname)) return null;
  let own = {};
  try {
    own = JSON.parse(localStorage.getItem("simplify-coach-emulators") ?? "{}") ?? {};
  } catch {
    own = {};
  }
  const ports = { ...EMULATOR_PORTS };
  for (const key of Object.keys(ports)) {
    if (Number.isInteger(own[key]) && own[key] > 0) ports[key] = own[key];
  }
  return { host: "127.0.0.1", ...ports };
}
