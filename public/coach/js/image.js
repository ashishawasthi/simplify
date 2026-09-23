// A photo made ready for the class's shelf, in the coach's own browser:
// at most 1600 px on its long side, re-encoded as JPEG (quality 0.85). Drawing
// it onto a canvas keeps only the pixels, so the camera's EXIF data — the
// GPS position, the phone's name, the time — never leaves the device.
// Transparent parts of a PNG become white, not black.
//
//   const { blob, width, height } = await toShelfJpeg(file)
// Throws a CloudError-like { code: "unreadable" } when the browser cannot
// open the file (a HEIC photo on a Windows PC, a PDF …).

import { fitWithin } from "./format.js";

export const MAX_SIDE = 1600;
const MAX_BYTES = 2 * 1024 * 1024 - 1; // storage.rules: under 2 MB

function unreadable() {
  const err = new Error("This file could not be opened as a picture. Try a JPEG or PNG photo.");
  err.code = "unreadable";
  return err;
}

async function decode(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode(); // the browser turns it the way the camera held it (EXIF orientation)
    if (!img.naturalWidth || !img.naturalHeight) throw unreadable();
    return img;
  } catch {
    throw unreadable();
  } finally {
    URL.revokeObjectURL(url);
  }
}

const toBlob = (canvas, quality) =>
  new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));

export async function toShelfJpeg(file) {
  const img = await decode(file);
  // a very detailed photo can be over 2 MB even at 1600 px: step down
  for (const [side, quality] of [[MAX_SIDE, 0.85], [MAX_SIDE, 0.7], [1200, 0.7], [900, 0.6]]) {
    const { width, height } = fitWithin(img.naturalWidth, img.naturalHeight, side);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const g = canvas.getContext("2d");
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, width, height);
    g.imageSmoothingQuality = "high";
    g.drawImage(img, 0, 0, width, height);
    const blob = await toBlob(canvas, quality);
    if (!blob) throw unreadable();
    if (blob.size <= MAX_BYTES) return { blob, width, height };
  }
  throw unreadable();
}
