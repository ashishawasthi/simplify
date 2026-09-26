// Puts a finished file in Cloud Storage through the JSON API: a guide video
// (or its poster) in the public guide-videos bucket, or a coach's page video
// as a private draft in the class bucket. The guide bucket is public to read
// and holds nothing else — never the class bucket, which stays private.

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { token } from "./auth.mjs";

export const BUCKET = process.env.GUIDE_VIDEO_BUCKET || "simplify-guide-videos";
export const CLASS_BUCKET = process.env.SIMPLIFY_BUCKET || "simplify-special.firebasestorage.app";
export const publicUrl = (name) => `https://storage.googleapis.com/${BUCKET}/${name}`;

// an hour's cache by default: a re-rendered guide video reaches everyone within the hour
export async function upload(file, contentType, name = basename(file), { bucket = BUCKET, cacheControl = "public, max-age=3600" } = {}) {
  const boundary = `simplify-${Date.now()}`;
  const meta = JSON.stringify({ name, contentType, cacheControl });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`),
    readFileSync(file),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const res = await fetch(`https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=multipart`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await token()}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!res.ok) throw new Error(`upload of ${name} failed: ${res.status} ${await res.text()}`);
  return bucket === BUCKET ? publicUrl(name) : `gs://${bucket}/${name}`;
}
