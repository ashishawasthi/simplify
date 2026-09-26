// The guide's short videos live on Google's servers (the public
// simplify-guide-videos bucket), not in the app: too big to keep on every
// device. Nothing is fetched from there — not even the poster picture — until
// someone opens a "Watch" fold, so reading the guide still asks nobody else
// for anything. Closing the fold stops the video.

for (const fold of document.querySelectorAll("details.tour")) {
  const video = fold.querySelector("video");
  fold.addEventListener("toggle", () => {
    if (!fold.open) return void video.pause();
    if (!video.getAttribute("src")) {
      video.poster = video.dataset.poster;
      video.src = video.dataset.src;
    }
  });
}
