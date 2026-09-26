// An access token for Google's APIs: the job's own service account on Cloud
// Run (the metadata server), or the developer's gcloud sign-in locally.

import { execFileSync } from "node:child_process";

export const PROJECT = process.env.GOOGLE_CLOUD_PROJECT || "simplify-special";
export const onCloudRun = () => !!(process.env.CLOUD_RUN_JOB || process.env.K_SERVICE);

let cached;
export async function token() {
  if (cached && cached.until > Date.now()) return cached.value;
  if (onCloudRun()) {
    const r = await fetch("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
      { headers: { "Metadata-Flavor": "Google" } });
    const body = await r.json();
    cached = { value: body.access_token, until: Date.now() + (body.expires_in - 60) * 1000 };
  } else {
    try {
      cached = { value: execFileSync("gcloud", ["auth", "print-access-token"], { encoding: "utf8" }).trim(), until: Date.now() + 30 * 60e3 };
    } catch {
      throw new Error("no access token from `gcloud auth print-access-token` — sign in with `gcloud auth login`");
    }
  }
  return cached.value;
}
